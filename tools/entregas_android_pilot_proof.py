#!/usr/bin/env python3
"""Confere a variante pilot assinada antes de torná-la um artefato."""
import argparse
import os
from pathlib import Path
import re
import zipfile

from entregas_android_lab_package import inspect, package_name, signer_digest


def require(condition, reason):
    if not condition:
        raise SystemExit(reason)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apk", type=Path, required=True)
    parser.add_argument("--tools", type=Path, required=True)
    parser.add_argument("--signer-sha256", required=True)
    args = parser.parse_args()
    aapt = args.tools / "aapt"
    badging = inspect(aapt, ["dump", "badging", str(args.apk)])
    require(package_name(badging) == "br.com.tata.entregas.pilot", "APK_PILOT_ID_MISMATCH")
    require("application-debuggable" not in badging.splitlines(), "APK_PILOT_DEBUGGABLE")
    require("sdkVersion:'26'" in badging.splitlines(), "APK_PILOT_MIN_SDK_MISMATCH")
    manifest = inspect(aapt, ["dump", "xmltree", str(args.apk), "AndroidManifest.xml"])
    resources = inspect(aapt, ["dump", "resources", str(args.apk)])
    resource_id = re.search(r"android:networkSecurityConfig\([^)]*\)=@(0x[0-9a-f]+)", manifest)
    require(resource_id and re.search(
        r"\b" + re.escape(resource_id.group(1)) + r"\s+\S+:xml/network_security_config\b",
        resources,
    ), "APK_PILOT_TLS_CONFIG_NOT_REFERENCED")
    config = inspect(aapt, ["dump", "xmltree", str(args.apk), "res/xml/network_security_config.xml"])
    require(
        re.findall(r'^\s*A: src="([^"]+)"', config, re.M) == ["system"]
        and re.findall(r"^\s*E: ([\w-]+)", config, re.M)
        == ["network-security-config", "base-config", "trust-anchors", "certificates"]
        and re.search(r"\bcleartextTrafficPermitted=\(type 0x12\)0x0\s*$", config, re.M),
        "APK_PILOT_TLS_CONFIG_NOT_STRICT",
    )
    origins = [os.environ[name].encode() for name in ("BASE", "PLAT")]
    with zipfile.ZipFile(args.apk) as apk:
        dex = [apk.read(name) for name in apk.namelist() if re.fullmatch(r"classes\d*\.dex", name)]
    require(len(set(origins)) == 2 and all(any(url in unit for unit in dex) for url in origins),
            "APK_PILOT_ORIGINS_MISMATCH")
    signature = inspect(args.tools / "apksigner",
                        ["verify", "--min-sdk-version", "26", "--print-certs", str(args.apk)])
    require(signer_digest(signature) == args.signer_sha256.lower(), "APK_PILOT_SIGNER_MISMATCH")
    print("APK_PILOT_VERIFIED: package, SDK 26+, TLS system CA, endpoints, certificate SHA-256")
    print("APK_PILOT_SIGNER_SHA256=" + args.signer_sha256)


if __name__ == "__main__":
    main()
