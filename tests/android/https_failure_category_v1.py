#!/usr/bin/env python3
"""JUnit failure-only categories, never arbitrary test output or raw payload."""
from pathlib import Path
from xml.etree import ElementTree as ET
import sys

LABELS = {
    "LAB_JS_TIMED_OUT": "JS_TIMEOUT",
    "Real rider Cheguei button did not become available": "RIDER_BUTTON_NOT_READY",
    "Rider did not retrieve offline queue policy": "POLICY_NOT_LOADED",
    "LAB_REAL_RIDER_LOCAL_QUEUE_DISPLAY_NOT_PROVEN": "QUEUE_NOTICE_MISSING",
    "REAL_RIDER_CHEGUEI_DID_NOT_RECORD_IN_ROOM": "ROOM_PRODUCER_MISSING",
    "LAB_WORK_NOT_ENQUEUED": "WORK_NOT_ENQUEUED",
    "LAB_TEST_DRIVER_MISSING": "WORKMANAGER_DRIVER_MISSING",
    "Worker did not accept HTTPS event receipt": "HTTPS_RECEIPT_REJECTED",
    "Actual rider UI failed to show this server receipt": "RIDER_RECEIPT_NOT_SHOWN",
}

def diagnose(root):
    cases=failed=0
    categories=[]
    try:
        paths=sorted(root.rglob("*.xml"))[:50] if root.exists() else []
    except OSError:
        paths=[]
    for path in paths:
        try:
            if path.stat().st_size>2_000_000:continue
            tree=ET.parse(path)
            for case in tree.iter("testcase"):
                cases+=1
                elem=case.find("failure")
                if elem is None:elem=case.find("error")
                if elem is None:continue
                failed+=1
                text=(elem.get("message","") or "")[:4000]+"\n"+(elem.text or "")[:4000]
                category=next((v for k,v in LABELS.items() if k in text),"UNCLASSIFIED")
                categories.append(category)
        except (ET.ParseError, OSError, ValueError):continue
    return cases,failed,categories[:10]

def main(args):
    if len(args)!=1:
        print("ANDROID_HTTPS_JUNIT_SANITIZED unavailable")
        return 0
    cases,failed,categories=diagnose(Path(args[0]))
    print("ANDROID_HTTPS_JUNIT_SANITIZED cases="+str(cases)+" failed="+str(failed))
    for category in categories: print("ANDROID_HTTPS_FAILURE_CATEGORY "+category)
    if cases==0:print("ANDROID_HTTPS_JUNIT_REPORT_NOT_FOUND")
    # Diagnostic cannot mask Gradle failure. Caller exits nonzero.
    return 0

if __name__=="__main__":raise SystemExit(main(sys.argv[1:]))
