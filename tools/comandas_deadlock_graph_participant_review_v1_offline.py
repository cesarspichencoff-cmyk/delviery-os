#!/usr/bin/env python3
"""Review a copied/exported *XML* deadlock graph. Never parse XEL on a host.

No SQL Server connection, shell invocation, network, log persistence, identifiers,
SQL text, hostnames or credentials in output. All classifications are HOLD:
XML and a timestamp string cannot authenticate the native event's provenance.
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET

SCHEMA = "tata.comandas.deadlock-graph-participant-review.v1.offline"
MAX_BYTES = 1_048_576
READER_CLIENT_APP_EXACT = "TataReaderContinuousWatchV1"
TARGET_UTC = datetime(2026, 11, 7, 0, 12, 59, tzinfo=timezone.utc)
TARGET_TOLERANCE_S = 10
EFFECTS = {"sql": False, "host_command": False, "service": False,
           "network": False, "file_write": False, "print": False,
           "spooler": False, "deploy": False, "cutover": False}


def _tag(element):
    return element.tag.rsplit('}', 1)[-1] if isinstance(element.tag, str) else ""


def _direct(parent, tag):
    return [e for e in parent if _tag(e) == tag]


def _result(reason, **values):
    result = {
        "schema": SCHEMA, "status": "HOLD", "reason": reason,
        "scope": "COPIED_XML_OR_XDL_OFFLINE_ONLY",
        "expected_event": "xml_deadlock_report",
        "target_event_time_utc": "2026-11-07T00:12:59Z",
        "event_timestamp_in_target_window_reported": False,
        "event_time_independently_attested": False,
        "graph_integrity_checked": False,
        "exact_reader_clientapp_match_count": 0,
        "reader_is_victim_in_graph": False,
        "reader_owner_occurrences_in_graph": 0,
        "reader_waiter_occurrences_in_graph": 0,
        "other_process_count": 0,
        "process_with_missing_clientapp_count": 0,
        "reader_participation_world_proven": False,
        "reader_cause_of_ifood_ingestion_failure_proven": False,
        "native_software_source_attested": False,
        "operational_change_authorized": False,
        "effects": EFFECTS,
    }
    result.update(values)
    return result


def _time(raw):
    if not isinstance(raw, str) or not re.fullmatch(
            r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?(?:Z|[+-]\d\d:\d\d)", raw):
        return None
    try:
        stamp = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return stamp.astimezone(timezone.utc)
    except (ValueError, OverflowError):
        return None


def review_xml_bytes(payload):
    """Return only safe aggregated labels, never any original XML/attributes."""
    if not isinstance(payload, bytes) or not 0 < len(payload) <= MAX_BYTES:
        return _result("INVALID_OR_OVERSIZE_XML")
    if re.search(br"<!\s*(?:DOCTYPE|ENTITY)\b", payload, flags=re.I):
        return _result("DTD_OR_ENTITY_DECLARATION_REJECTED")
    try:
        root = ET.fromstring(payload)
    except (ET.ParseError, ValueError, RecursionError):
        return _result("XML_SYNTAX_INVALID")
    event_timestamp_target = False
    if _tag(root) == "event":
        if root.attrib.get("name") != "xml_deadlock_report":
            return _result("UNEXPECTED_EVENT_KIND")
        t = _time(root.attrib.get("timestamp"))
        if t is None:
            return _result("EVENT_TIMESTAMP_INVALID_OR_ABSENT")
        event_timestamp_target = abs((t - TARGET_UTC).total_seconds()) <= TARGET_TOLERANCE_S
        graphs = [el for el in root.iter() if _tag(el) == "deadlock"]
        if len(graphs) != 1:
            return _result("EXPECTED_ONE_DEADLOCK_GRAPH")
        graph = graphs[0]
    elif _tag(root) == "deadlock":
        graph = root  # .xdl can lack event timestamp: never bind to incident.
    else:
        return _result("UNEXPECTED_XML_ROOT")
    pl = _direct(graph, "process-list")
    vl = _direct(graph, "victim-list")
    rl = _direct(graph, "resource-list")
    if len(pl) != 1 or len(vl) != 1 or len(rl) != 1:
        return _result("GRAPH_SECTION_MISSING_OR_DUPLICATED")
    processes = _direct(pl[0], "process")
    if not 2 <= len(processes) <= 100 or not _direct(vl[0], "victimProcess"):
        return _result("PROCESS_OR_VICTIM_SHAPE_INVALID")
    identities = [el.attrib.get("id") for el in processes]
    if any(not x or len(x) > 200 for x in identities) or len(set(identities)) != len(identities):
        return _result("PROCESS_IDENTITY_NOT_UNIQUE")
    known = set(identities)
    victims = [v.attrib.get("id") for v in _direct(vl[0], "victimProcess")]
    if any(v not in known for v in victims):
        return _result("VICTIM_NOT_IN_PROCESS_LIST")
    role_count = {pid: {"owners": 0, "waiters": 0} for pid in identities}
    all_owners, all_waiters = set(), set()
    for resource in rl[0]:
        owners, waiters = _direct(resource, "owner-list"), _direct(resource, "waiter-list")
        if len(owners) != 1 or len(waiters) != 1:
            return _result("RESOURCE_OWNER_WAITER_LISTS_INVALID")
        o = _direct(owners[0], "owner")
        w = _direct(waiters[0], "waiter")
        if not o or not w:
            return _result("RESOURCE_OWNER_WAITER_ENTRIES_EMPTY")
        for entry, key, seen in [(e, "owners", all_owners) for e in o] + [
                (e, "waiters", all_waiters) for e in w]:
            pid = entry.attrib.get("id")
            if pid not in known:
                return _result("RESOURCE_REFERS_TO_UNKNOWN_PROCESS")
            role_count[pid][key] += 1
            seen.add(pid)
    if not all_owners or not all_waiters:
        return _result("GRAPH_HAS_NO_LOCK_RELATIONSHIP")
    matched = [p for p in processes if p.attrib.get("clientapp") == READER_CLIENT_APP_EXACT]
    mids = [p.attrib["id"] for p in matched]
    nonmatching = len(processes) - len(matched)
    missing = sum(1 for p in processes if not p.attrib.get("clientapp"))
    details = dict(event_timestamp_in_target_window_reported=event_timestamp_target,
                   graph_integrity_checked=True,
                   exact_reader_clientapp_match_count=len(mids),
                   reader_is_victim_in_graph=any(pid in victims for pid in mids),
                   reader_owner_occurrences_in_graph=sum(role_count[x]["owners"] for x in mids),
                   reader_waiter_occurrences_in_graph=sum(role_count[x]["waiters"] for x in mids),
                   other_process_count=nonmatching,
                   process_with_missing_clientapp_count=missing)
    if not event_timestamp_target:
        return _result("GRAPH_TIME_NOT_BOUND_TO_TARGET_INCIDENT", **details)
    if not matched:
        return _result("NO_EXACT_READER_APP_MATCH_NOT_EXCLUSION_PROOF", **details)
    return _result("EXACT_READER_APP_IN_UNATTESTED_GRAPH_NOT_CAUSAL_PROOF", **details)


def main(args):
    if len(args) != 1:
        print(json.dumps(_result("EXACTLY_ONE_OFFLINE_XML_PATH_REQUIRED")))
        return 2
    path = Path(args[0])
    # The remote binary must never be passed to this XML-only utility.
    if path.suffix.lower() not in (".xdl", ".xml"):
        print(json.dumps(_result("ONLY_EXPORTED_XML_OR_XDL_SUPPORTED")))
        return 2
    try:
        if not path.is_file() or path.stat().st_size > MAX_BYTES:
            result = _result("OFFLINE_INPUT_MISSING_OR_TOO_LARGE")
        else:
            result = review_xml_bytes(path.read_bytes())
    except (OSError, PermissionError):
        result = _result("OFFLINE_FILE_NOT_READABLE")
    print(json.dumps(result, ensure_ascii=True, sort_keys=True))
    return 0 if result["graph_integrity_checked"] else 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
