#!/usr/bin/env python3
"""Emit ONE sanitized GitHub `::error title=...::` annotation when an Android
emulator lab fails, so the next failure is legible via the PUBLIC check-run
annotations API without any credential or authenticated log download.

It does NOT change what the test proves: it only reads artifacts the failing
lab already produced (JUnit XML, a tag-filtered logcat dump, a few /proc
facts) and prints a single annotation line. The caller still exits nonzero.

Sanitization is defense-in-depth: every emitted field is scrubbed of URLs,
IPs/ports, file paths, long hex/base64 runs and long digit runs, capped in
length, and stripped of `::`/newlines so nothing can inject a workflow command
or leak a token, address, GPS coordinate, request body or client datum. Test
class/method, exception CLASS and the fixed LAB_*/process-death labels are the
load-bearing signal; free-form exception text is reduced to one scrubbed line.

Usage:
  ci_lab_failure_annotation_v1.py --title T --results DIR \
      [--logcat FILE] [--facts FILE] [--max-chars 1500]
"""
import argparse
import os
import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

# Reuse the existing sanitized classifiers (fixed labels only, never raw text).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from https_process_death_signature_v1 import diagnose as death_diagnose
except Exception:  # pragma: no cover - helper absent
    death_diagnose = None
try:
    from https_failure_category_v1 import LABELS as CATEGORY_LABELS
except Exception:  # pragma: no cover
    CATEGORY_LABELS = {}

_URL = re.compile(r"https?://\S+")
_IP = re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b")
_WINPATH = re.compile(r"[A-Za-z]:\\[^\s]+")
_UNIXPATH = re.compile(r"/(?:[A-Za-z0-9_.\-]+/){2,}[A-Za-z0-9_.\-]+")
_HEX = re.compile(r"\b[0-9a-fA-F]{8,}\b")
_B64 = re.compile(r"\b[A-Za-z0-9+/]{20,}={0,2}\b")
# Redact the VALUE of any sensitive key=value / key: value pair (PII + secrets).
_KV = re.compile(
    r"(?i)\b(token|secret|secret[_-]?key|api[_-]?key|apikey|key|password|passwd|pwd|"
    r"auth|authorization|bearer|cookie|session|sessionid|credential|device[_-]?secret|"
    r"lat|lng|latitude|longitude|lon|coord|phone|telefone|cpf|cnpj|email|e-mail|"
    r"address|endereco|nome|name|user|usuario)\s*[=:]\s*[^\s,;)\]}]+")
_BEARER = re.compile(r"(?i)\bbearer\s+\S+")
# Bare decimal coordinate (>=4 decimal places): a precise lat/long.
_COORD = re.compile(r"-?\d{1,3}\.\d{4,}")
# Alnum run >=12 containing BOTH a letter and a digit: looks like a token/id.
_MIXED = re.compile(r"\b(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{12,}\b")
_DIGITS = re.compile(r"\d{6,}")


def scrub(text, max_len=200):
    """Reduce an arbitrary line to a short, de-identified token string."""
    if not text:
        return ""
    s = str(text).replace("\r", " ").replace("\n", " ")
    s = s.replace("::", ":")  # never let input forge a workflow command
    s = _URL.sub("[url]", s)
    s = _WINPATH.sub("[path]", s)
    s = _UNIXPATH.sub("[path]", s)
    s = _BEARER.sub("bearer [redacted]", s)
    s = _KV.sub(lambda m: m.group(1) + "=[redacted]", s)
    s = _IP.sub("[ip]", s)
    s = _COORD.sub("[coord]", s)
    s = _HEX.sub("[hex]", s)
    s = _B64.sub("[b64]", s)
    s = _MIXED.sub("[token]", s)
    s = _DIGITS.sub("[num]", s)
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) > max_len:
        s = s[:max_len] + "..."
    return s


def _is_identifier(v):
    return bool(v) and v.replace("_", "").replace(".", "").replace("$", "").isalnum()


def read_junit(results_dir):
    """Return (failed_cases, first_exc_line). Only fixed identifiers kept raw."""
    root = Path(results_dir)
    failed = []
    first_exc = ""
    try:
        paths = sorted(root.rglob("*.xml"))[:60] if root.exists() else []
    except OSError:
        paths = []
    for path in paths:
        try:
            if path.stat().st_size > 2_000_000:
                continue
            tree = ET.parse(path).getroot()
        except (ET.ParseError, OSError):
            continue
        for case in tree.findall(".//testcase"):
            elem = case.find("failure")
            if elem is None:
                elem = case.find("error")
            if elem is None:
                continue
            classname = case.attrib.get("classname", "")
            testname = case.attrib.get("name", "").split("[")[0]
            short = classname.rsplit(".", 1)[-1] if classname else "?"
            if _is_identifier(classname) and _is_identifier(testname):
                ident = short + "#" + testname
            else:
                ident = scrub(short + "#" + testname, 80)
            kind = elem.attrib.get("type", "")
            if kind and _is_identifier(kind):
                ident += " (" + kind.rsplit(".", 1)[-1] + ")"
            if ident not in failed:
                failed.append(ident)
            if not first_exc:
                raw = (elem.attrib.get("message", "") or elem.text or "").strip()
                first_line = raw.splitlines()[0] if raw else ""
                first_exc = scrub(first_line, 240)
    return failed[:8], first_exc


def read_facts(facts_file):
    out = {}
    if not facts_file:
        return out
    try:
        for line in Path(facts_file).read_text(errors="replace").splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                k = re.sub(r"[^A-Za-z0-9_]", "", k.strip())[:24]
                v = v.strip()
                # Facts come from our own /proc reads: keep a plain integer
                # (free memory, uptime) intact; scrub anything else.
                v = v if re.fullmatch(r"\d{1,12}", v) else scrub(v, 40)
                if k:
                    out[k] = v
    except OSError:
        pass
    return out


def read_logcat(logcat_file, max_lines=14):
    labels = []
    tail = []
    if not logcat_file or not Path(logcat_file).exists():
        return labels, tail
    try:
        lines = Path(logcat_file).read_text(errors="replace").splitlines()
    except OSError:
        return labels, tail
    if death_diagnose is not None:
        try:
            found, _ = death_diagnose(lines)
            labels = list(found)
        except Exception:
            labels = []
    # The plain tail was measured to be the test-APK teardown ("pkg removed",
    # obituary of the instrumentation process) and NOT the failure (run
    # 43683549834, 15/11). Failure lines come first: the instrumentation's own
    # verdict (TestRunner failed/exception), the assertion or exception class
    # line, and renderer death. Same scrubbing, same caps.
    _FAILURE = re.compile(
        r"TestRunner.*(failed|exception|error)|AssertionError|Exception:|"
        r"Process crashed|Instrumentation run failed|RenderProcessGone|renderer|"
        r"WEBVIEW_NEVER_BECAME_LIVE|DEAD_WEBVIEW|APP_PROCESS_WAS_REPLACED|"
        r"RECOVERED_WEBVIEW|RENDERER_",
        re.I,
    )
    chosen = []
    for line in lines:
        if _FAILURE.search(line):
            s = scrub(line, 160)
            if s and s not in chosen:
                chosen.append(s)
    chosen = chosen[-8:]
    for line in lines[-max(0, max_lines - len(chosen)):] if max_lines > len(chosen) else []:
        s = scrub(line, 160)
        if s and s not in chosen:
            chosen.append(s)
    tail = chosen
    return labels, tail


def gh_escape(message):
    # GitHub workflow-command data escaping.
    return message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def build(title, results, logcat, facts, max_chars):
    failed, first_exc = read_junit(results)
    fact_map = read_facts(facts)
    death_labels, tail = read_logcat(logcat)

    parts = []
    parts.append("FAILED_TEST=" + ("; ".join(failed) if failed else "none_in_junit"))
    if first_exc:
        parts.append("EXC_FIRST_LINE=" + first_exc)
    elif failed:
        # Measured on 15/11: a failed case with NO message in JUnit. Say so
        # explicitly instead of letting the absence read as "no exception".
        parts.append("EXC_FIRST_LINE=EMPTY_IN_JUNIT")
    if death_labels:
        parts.append("PROCESS_DEATH=" + " ".join(death_labels))
    boot = fact_map.get("emulator_uptime_s") or fact_map.get("boot_s")
    if boot:
        parts.append("EMULATOR_UPTIME_S=" + boot)
    mem = fact_map.get("mem_available_kb")
    if mem:
        parts.append("MEM_AVAILABLE_KB=" + mem)
    for k, v in fact_map.items():
        if k not in ("emulator_uptime_s", "boot_s", "mem_available_kb"):
            parts.append(k + "=" + v)
    if tail:
        parts.append("LOGCAT_TAIL:")
        parts.extend(tail)

    message = "\n".join(parts)
    if len(message) > max_chars:
        message = message[: max_chars - 3] + "..."
    return "::error title=" + title.replace("::", ":") + "::" + gh_escape(message)


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--title", default="DeliveryOS Android lab failure (sanitized)")
    ap.add_argument("--results", required=True)
    ap.add_argument("--logcat", default="")
    ap.add_argument("--facts", default="")
    ap.add_argument("--max-chars", type=int, default=1500)
    args = ap.parse_args(argv)
    try:
        print(build(args.title, args.results, args.logcat, args.facts, args.max_chars))
    except Exception as exc:  # never let the diagnostic itself break the lab
        print("::warning title=DeliveryOS lab annotation unavailable::"
              + gh_escape(scrub(type(exc).__name__, 60)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
