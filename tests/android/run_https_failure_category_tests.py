#!/usr/bin/env python3
"""3 synthetic privacy regressions; never operates on actual lab results."""
from pathlib import Path
from tempfile import TemporaryDirectory
def check():
    with TemporaryDirectory() as t:
        p=Path(t)/"sample.xml"
        p.write_text('<testsuite><testcase><failure message="Real rider Cheguei button did not become available CUSTOMER 11999998888">secret payload</failure></testcase></testsuite>',encoding="utf-8")
        assert diagnose(Path(t))==(1,1,["RIDER_BUTTON_NOT_READY"])
        assert "11999998888" not in str(diagnose(Path(t)))
        p.write_text('<testsuites><testsuite><testcase><failure message="secret TOKEN 11999998888"/></testcase></testsuite></testsuites>',encoding="utf-8")
        assert diagnose(Path(t))==(1,1,["UNCLASSIFIED"])
        p.write_text("<broken>",encoding="utf-8")
        assert diagnose(Path(t))==(0,0,[])
    print("ANDROID_HTTPS_JUNIT_SANITIZED_LAB_PASS 3/3")
check()
