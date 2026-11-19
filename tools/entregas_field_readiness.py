#!/usr/bin/env python3
"""Read-only checks for the approved HTTPS field gateway and release settings."""
import argparse
import http.client
import json
import os
import ssl
from urllib.parse import urlsplit


EXISTING_OPERATOR_PROXY = "https://deliveryos-piloto.eu1.netbird.services"


def origin(raw):
    try:
        value = urlsplit(raw.strip())
        host = (value.hostname or "").lower()
        port = value.port or 443
    except ValueError:
        return None
    if (
        value.scheme != "https" or not host or value.username is not None
        or value.password is not None or value.query or value.fragment
        or value.path not in ("", "/") or value.port == 0 or host.endswith(".")
        or host.endswith((".invalid", ".example", ".localhost"))
        or host in {"localhost", "10.0.2.2"}
    ):
        return None
    return host, port


def request(target, method, path, payload=None):
    tls = http.client.HTTPSConnection(*target, timeout=7, context=ssl.create_default_context())
    try:
        headers = {"Content-Type": "application/json"} if payload is not None else {}
        tls.request(method, path, body=payload, headers=headers)
        reply = tls.getresponse()
        body = reply.read(262144)
        return reply.status, reply.getheader("WWW-Authenticate") is not None, body
    except (OSError, ValueError, http.client.HTTPException):
        return 0, False, b""
    finally:
        tls.close()


def record(body):
    try:
        data = json.loads(body)
        return data if isinstance(data, dict) else {}
    except (ValueError, UnicodeError):
        return {}


def gateway(target):
    page, _, html = request(target, "GET", "/rider-mobile/")
    gate, _, health = request(target, "GET", "/api/health")
    policies, proxy, policy_body = request(target, "GET", "/api/policies")
    # An empty request is rejected before looking up a device or issuing a session.
    device, _, session = request(target, "POST", "/api/device/session", b"{}")
    return {
        "rider_page": page == 200 and b"/rider-mobile/compat-classic.js" in html,
        "internal_health_blocked": gate == 404 and record(health).get("code") == "fora_do_campo",
        "pilot_auth": policies == 401 and not proxy and record(policy_body).get("ok") is False,
        "platform_device_auth": device == 400 and record(session).get("motivo") == "pedido_malformado",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-ready", action="store_true")
    args = parser.parse_args()
    signing_configured = os.environ.get("FIELD_SIGNING_CONFIGURED", "").lower() == "true"
    pilot = origin(os.environ.get("BASE", ""))
    platform = origin(os.environ.get("PLAT", ""))
    shared = pilot is not None and pilot == platform
    print("FIELD_SIGNING_CONFIG=" + ("PRESENT" if signing_configured else "MISSING"))
    print("FIELD_SHARED_HTTPS_ORIGIN=" + ("CONFIGURED" if shared else "MISSING_OR_MISMATCH"))
    results = gateway(pilot) if shared else {}
    for name, ok in results.items():
        print(f"FIELD_{name.upper()}={'PASS' if ok else 'UNVERIFIED'}")

    if not shared and not args.require_ready:
        status, challenged, _ = request(origin(EXISTING_OPERATOR_PROXY), "GET", "/api/health")
        print(f"EXISTING_OPERATOR_PROXY_HTTP={status or 'UNREACHABLE'}")
        print(f"EXISTING_OPERATOR_PROXY_AUTH_CHALLENGE={'YES' if challenged else 'NO'}")

    ready = signing_configured and bool(results) and all(results.values())
    print("FIELD_PREFLIGHT=" + ("READY" if ready else "BLOCKED"))
    return int(args.require_ready and not ready)


if __name__ == "__main__":
    raise SystemExit(main())
