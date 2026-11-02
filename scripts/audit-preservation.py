#!/usr/bin/env python3
"""Read-only, pinned Git history + every tracked text line inventory.
Does not interpret code as safe, migrate SQL, change production, or approve releases.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from datetime import datetime, timezone
from urllib.request import Request, urlopen

REPO = "cesarspichencoff-cmyk/delviery-os"
REFS = {
    "main": "48288aed24ef2afbafe251fa406a257bb6bb5300",
    "candidate": "f915161a6d71d2292d957845df382fc3c1623a9e",
    "android_128": "3158d6a9386582b556b0b48302576c0dfe39aadf",
    "rider_129": "dbc7482a73377251d4482c9dca0b34f82cae7762",
    "prior_candidate": "08c3603c00d5f92cff9ce7846d2b35be842d23fc",
}
OUT = Path("audit-results")
OUT.mkdir(exist_ok=True)

def git(*args, checked=True):
    proc = subprocess.run(["git", *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if checked and proc.returncode:
        raise RuntimeError("git command failed (arguments suppressed): " + " ".join(args[:2]))
    return proc

def tree(ref):
    result = {}
    raw = git("ls-tree", "-r", "-z", "--long", ref).stdout
    for entry in raw.split(b"\x00"):
        if not entry:
            continue
        metadata, name = entry.split(b"\t", 1)
        fields = metadata.decode("ascii").split()
        if len(fields) != 4 or fields[1] != "blob":
            continue
        path = name.decode("utf-8", "surrogateescape")
        result[path] = {"blob": fields[2], "bytes": int(fields[3]) if fields[3].isdigit() else -1}
    return result

def differences(left, right):
    return {
        "only_left": sorted(set(left) - set(right)),
        "only_right": sorted(set(right) - set(left)),
        "modified": sorted(p for p in set(left) & set(right) if left[p]["blob"] != right[p]["blob"]),
    }

def github_prs():
    token = os.environ.get("GH_READ_TOKEN")
    if not token:
        return [], "GITHUB_TOKEN_MISSING"
    all_prs = []
    try:
        for page in range(1, 11):
            url = f"https://api.github.com/repos/{REPO}/pulls?state=all&per_page=100&page={page}"
            req = Request(url, headers={"Authorization": "Bearer " + token,
                                        "Accept": "application/vnd.github+json",
                                        "User-Agent": "deliveryos-audit-readonly"})
            with urlopen(req, timeout=25) as response:
                data = json.load(response)
            if not isinstance(data, list):
                return all_prs, "NON_ARRAY_PR_RESPONSE"
            all_prs.extend(data)
            if len(data) < 100:
                return all_prs, "COMPLETE"
    except Exception as exc:
        return all_prs, "PARTIAL_API_ERROR_" + type(exc).__name__
    return all_prs, "PAGINATION_LIMIT"

for label, sha in REFS.items():
    git("cat-file", "-e", sha + "^{commit}")

trees = {label: tree(sha) for label, sha in REFS.items()}
main_delta = differences(trees["main"], trees["candidate"])
old_to_new = differences(trees["prior_candidate"], trees["candidate"])
pr128_delta = differences(trees["prior_candidate"], trees["android_128"])
pr129_delta = differences(trees["prior_candidate"], trees["rider_129"])
p128 = set(pr128_delta["only_right"] + pr128_delta["modified"])
p129 = set(pr129_delta["only_right"] + pr129_delta["modified"])
candidate_changes_after_pr = set(old_to_new["modified"])
main_only = []
candidate_sha_to_paths = {}
for path, info in trees["candidate"].items():
    candidate_sha_to_paths.setdefault(info["blob"], []).append(path)
for path in main_delta["only_left"]:
    src = trees["main"][path]
    main_only.append({"path": path, "main_blob": src["blob"], "size": src["bytes"],
                      "identical_elsewhere_in_candidate": candidate_sha_to_paths.get(src["blob"], [])})

# Read every line of candidate tracked UTF-8 files; binaries and oversize are explicit.
ext_code = (".kt", ".kts", ".js", ".cjs", ".mjs", ".ts", ".tsx", ".json",
            ".sql", ".yml", ".yaml", ".xml", ".py", ".ps1", ".css", ".html", ".md")
file_inventory = []
all_lines = all_utf8 = code_lines = binary_count = skipped = 0
for path, info in trees["candidate"].items():
    record = {"path": path, "git_blob": info["blob"], "bytes": info["bytes"]}
    target = Path(path)
    if not target.is_file():
        record["scan"] = "MISSING_IN_AUDIT_WORKTREE"
        skipped += 1
    elif info["bytes"] > 12_000_000:
        record["scan"] = "SIZE_SKIPPED"
        skipped += 1
    else:
        data = target.read_bytes()
        if git("hash-object", "--", path).stdout.decode().strip() != info["blob"]:
            record["scan"] = "WORKTREE_DIFFERS_FROM_PINNED_CANDIDATE"
            skipped += 1
        elif b"\x00" in data[:8192]:
            record["scan"] = "BINARY"
            binary_count += 1
        else:
            try:
                decoded = data.decode("utf-8")
                lines = decoded.splitlines(keepends=True)
                h = hashlib.sha256()
                for i, line in enumerate(lines, 1):
                    h.update(i.to_bytes(8, "big"))
                    h.update(line.encode("utf-8"))
                record["scan"] = "EVERY_UTF8_LINE_HASHED"
                record["lines"] = len(lines)
                record["line_digest"] = h.hexdigest()
                if path.lower().endswith(ext_code):
                    record["review_markers"] = sum(bool(re.search(r"\b(TODO|FIXME)\b", l)) for l in lines)
                    code_lines += len(lines)
                all_lines += len(lines)
                all_utf8 += 1
            except UnicodeDecodeError:
                record["scan"] = "NON_UTF8"
                binary_count += 1
    file_inventory.append(record)

prs, api_status = github_prs()
pr_statuses = []
for pr in prs:
    number = pr["number"]
    actual_sha = pr["head"]["sha"]
    reachable = git("rev-parse", "--verify", f"refs/remotes/pr/{number}", checked=False)
    item = {"number": number, "title": pr.get("title"), "state": pr.get("state"),
            "draft": bool(pr.get("draft")), "head_sha": actual_sha,
            "merged": bool(pr.get("merged_at"))}
    if reachable.returncode:
        item["history"] = "HEAD_OBJECT_NOT_FETCHED"
    elif reachable.stdout.decode().strip() != actual_sha:
        item["history"] = "PR_HEAD_CHANGED_OR_FETCH_STALE"
    elif git("merge-base", "--is-ancestor", actual_sha, REFS["candidate"], checked=False).returncode == 0:
        item["history"] = "ANCESTOR_IN_CANDIDATE"
    else:
        item["history"] = "NOT_ANCESTOR_OF_CANDIDATE"
        count = git("rev-list", "--count", actual_sha, "--not", REFS["candidate"]).stdout
        item["unique_commit_count"] = int(count.decode().strip())
        merge_base = git("merge-base", actual_sha, REFS["candidate"], checked=False)
        if merge_base.returncode == 0:
            diff = git("diff", "--name-only", merge_base.stdout.decode().strip(),
                       actual_sha, "--").stdout.decode("utf-8", "replace").splitlines()
            item["unique_changed_path_count"] = len(diff)
            item["unique_changed_paths"] = diff[:80]
    pr_statuses.append(item)

report = {
    "kind": "STATIC_HISTORY_AND_LINE_INVENTORY_NOT_SEMANTIC_CERTIFICATION",
    "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    "pinned": REFS,
    "pr_list_status": api_status,
    "pr_count": len(prs),
    "pr_statuses": pr_statuses,
    "candidate_files": len(trees["candidate"]),
    "candidate_git_tree_bytes": sum(max(v["bytes"], 0) for v in trees["candidate"].values()),
    "all_text_files_line_scanned": all_utf8,
    "all_text_lines_scanned": all_lines,
    "extension_tagged_text_lines": code_lines,
    "binary_nonutf8": binary_count,
    "skipped_or_mismatch": skipped,
    "main_vs_candidate": {k: len(v) for k,v in main_delta.items()},
    "main_only_in_candidate": main_only,
    "main_modified": main_delta["modified"],
    "candidate_after_pr_base_changed": old_to_new["modified"],
    "pr128_path_count": len(p128),
    "pr129_path_count": len(p129),
    "pr128_pr129_overlap": sorted(p128 & p129),
    "pr128_overlaps_new_candidate": sorted(p128 & candidate_changes_after_pr),
    "pr129_overlaps_new_candidate": sorted(p129 & candidate_changes_after_pr),
    "limitations": [
        "Textual line-by-line hashing is not semantic code review or runtime proof.",
        "Files are compared at pinned SHAs, not assumed production state.",
        "PR branch ancestry alone does not prove that functionality was preserved, removed, or superseded.",
        "Old PRs may contain unsafe or obsolete code; do not blindly merge.",
        "No deployment, migration, secrets, network to shop, printing or GPS capture.",
    ],
}
(OUT / "inventory.json").write_text(json.dumps(file_inventory, ensure_ascii=False, indent=2))
(OUT / "summary.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
missing = [x for x in pr_statuses if x["history"] == "NOT_ANCESTOR_OF_CANDIDATE"]
unknown = [x for x in pr_statuses if x["history"] not in ("NOT_ANCESTOR_OF_CANDIDATE", "ANCESTOR_IN_CANDIDATE")]
summary = [
    "# DeliveryOS — auditoria de preservação (automática; SEM liberação)",
    "",
    f"HEAD candidato: `{REFS['candidate']}`",
    f"Arquivos: **{report['candidate_files']}**; arquivos UTF-8 lidos integralmente: **{all_utf8}**;",
    f"linhas examinadas por hash: **{all_lines}**; linhas nos arquivos classificados por extensão: **{code_lines}**.",
    f"Binários/não UTF-8: **{binary_count}**; ignorados, ausentes ou divergentes: **{skipped}**.",
    f"PRs recuperadas: **{len(prs)}** ({api_status}); não ancestrais: **{len(missing)}**; desconhecidas: **{len(unknown)}**.",
    f"Exclusivos da main: **{len(main_only)}**, listados em summary.json.",
    f"PR128 x PR129 sobreposição: {sorted(p128 & p129)}.",
    "",
    "## PRs com commits fora da candidata (REVISAR; NÃO MERGEAR AUTOMATICAMENTE)",
]
for p in sorted(missing, key=lambda x:x["number"], reverse=True):
    summary.append(f"- #{p['number']} — {p['unique_commit_count']} commits exclusivos; {p.get('unique_changed_path_count', 0)} caminhos: {p['title']}")
summary.extend(["","## Limite", "A varredura registra cada linha de texto sem analisar semanticamente todas elas. Revisão manual adversarial e testes integrados ainda são necessários."])
(OUT / "README.md").write_text("\n".join(summary)+"\n", encoding="utf-8")
print(json.dumps({"files":len(file_inventory),"line_scanned":all_lines,"skipped":skipped,
                  "prs":len(prs),"non_ancestor_prs":len(missing),"unknown_prs":len(unknown),
                  "main_only":len(main_only),"api_status":api_status}))
# Print a bounded decision queue for CI readers. It is NOT a merge recommendation.
def decision_lane(pr):
    title = str(pr.get("title") or "").lower()
    if "comanda" in title or "termic" in title or "térmic" in title or "epson" in title or "v7." in title:
        return "OTHER_PRODUCT_COMANDAS"
    if "q-026" in title or "q026" in title or "mvcc" in title or "cursor" in title:
        return "RESEARCH_Q026"
    if any(t in title for t in ("gps", "android", "entregas", "copiloto", "seguran", "autoriz", "rls", "piloto", "source", "gestor")):
        return "CORE_REVIEW"
    return "OTHER_REVIEW"

by_lane = {}
for pr in missing:
    lane = decision_lane(pr)
    by_lane[lane] = by_lane.get(lane, 0) + 1
print("NON_ANCESTOR_BY_LANE", json.dumps(by_lane, ensure_ascii=False))
print("CORE_REVIEW_QUEUE", json.dumps([
    {"pr":p["number"], "commits":p.get("unique_commit_count"), "title":p.get("title")}
    for p in sorted(missing, key=lambda x:x["number"], reverse=True)
    if decision_lane(p) == "CORE_REVIEW"
], ensure_ascii=False))
print("MAIN_ONLY_PATHS", json.dumps([x["path"] for x in main_only]))
if skipped or api_status != "COMPLETE" or unknown:
    print("INVENTORY_PARTIAL: review report; never declare COMPLETE.")
