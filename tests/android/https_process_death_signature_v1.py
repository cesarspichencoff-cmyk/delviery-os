#!/usr/bin/env python3
"""Fixed labels for HOW the app process died; never raw logcat.

A WebView renderer killed by the system makes an app that does not handle
onRenderProcessGone SIGKILL itself: no Java exception, no tombstone, nothing
in the crash buffer. The only signature is in the main/system buffers, which
the AndroidRuntime and crash-buffer filters never read. Reads logcat text on
stdin and prints labels and counters only — no message, pid, payload or path.
"""
import sys

APP = "br.com.tata.entregas"
RENDERER = "webview:sandboxed_process"
ORDER = (
    "LAB_HTTPS_RENDERER_GONE_DETECTED",
    "LAB_HTTPS_RENDERER_KILL_UNHANDLED_APP_SELF_KILLED",
    "LAB_HTTPS_RENDERER_CRASH_UNHANDLED_APP_ABORTED",
    "LAB_HTTPS_LMKD_KILLED_RENDERER",
    "LAB_HTTPS_LMKD_KILLED_APP",
    "LAB_HTTPS_APP_ANR",
    "LAB_HTTPS_APP_PROCESS_DIED",
)

def classify(line):
    # As duas frases sao do WebView (sic: "handed"); o arquivo que as emite
    # muda entre versoes, entao a frase decide, nao o nome do arquivo.
    if "kill (OOM or update) wasn't handed by all associated" in line:
        return "LAB_HTTPS_RENDERER_KILL_UNHANDLED_APP_SELF_KILLED"
    if "crash wasn't handled by all associated" in line:
        return "LAB_HTTPS_RENDERER_CRASH_UNHANDLED_APP_ABORTED"
    if "aw_browser_terminator" in line and "crash detected" in line:
        return "LAB_HTTPS_RENDERER_GONE_DETECTED"
    if "lowmemorykiller" in line and "Kill '" in line:
        if RENDERER in line:
            return "LAB_HTTPS_LMKD_KILLED_RENDERER"
        if "Kill '" + APP in line:
            return "LAB_HTTPS_LMKD_KILLED_APP"
        return "LMKD_OTHER"
    if "ANR in " + APP in line:
        return "LAB_HTTPS_APP_ANR"
    if "ActivityManager" in line and "Process " + APP in line and "has died" in line:
        return "LAB_HTTPS_APP_PROCESS_DIED"
    return None

def diagnose(lines):
    seen = set()
    lmkd = 0
    for line in lines:
        label = classify(line[:2000])
        if label is None:
            continue
        if label.startswith("LAB_HTTPS_LMKD") or label == "LMKD_OTHER":
            lmkd += 1
        if label != "LMKD_OTHER":
            seen.add(label)
    return [label for label in ORDER if label in seen], min(lmkd, 9999)

def main():
    labels, lmkd = diagnose(sys.stdin)
    for label in labels:
        print(label)
    print("LAB_HTTPS_LMKD_KILLS " + str(lmkd))
    print("LAB_HTTPS_PROCESS_DEATH_LABELS_ONLY " + str(len(labels)))
    # Diagnostic cannot mask the Gradle failure. Caller exits nonzero.
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
