#!/usr/bin/env python3
"""Disposable two-origin HTTPS lab, RUNNER ONLY (not production).

Exposes only 127.0.0.1:8080 (platform) and 127.0.0.1:5193 (pilot).
Android emulator reaches both via 10.0.2.2 using a test-only CA and strict TLS.
Never logs body, authorization values, device_secret or customer data.

Pilot /api/events/batch: FIRST authentic UI-generated LAB action => 422 without
per-event receipt; second identical action => exact id-scoped HTTP 200
receipt. Dynamic event ID, command and idempotency key are compared.
All other routes fail closed.
"""
import argparse
import json
import re
import ssl
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PLATFORM_TOKEN = "LAB_PLATFORM_SESSION_NONPROD"
PILOT_TOKEN = "pt1.labwrite.signedfixture"
TRIP = "LAB_HTTPS_UI_TRIP_001"
DELIVERY = "LAB_HTTPS_UI_DELIVERY_001"
ACTOR = "rider-lab"
state = {"device": None, "event_attempts": 0, "identity": None}
lock = threading.Lock()

class LabHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_):
        # Critical: no HTTP header/body or actor/device secret in CI log.
        return

    def send(self, status, result):
        raw = json.dumps(result, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(raw)

    def handle_one(self):
        port = self.server.server_port
        path = self.path.split("?", 1)[0]
        platform = port == 8080
        if port not in (8080, 5193):
            return self.send(404, {"error": "LAB_ORIGIN_UNKNOWN"})
        if self.command == "GET":
            if not platform and path == "/api/policies":
                return self.send(200, {
                    "flags": {"offline_queue_enabled": True, "gps_capture_enabled": False},
                    "term": {"publishable": False},
                })
            if not platform and path == "/api/session":
                return self.send(200, {"actor": {"actor_id": ACTOR, "role": "motoboy_interno"}})
            if not platform and path == "/api/snapshot":
                return self.send(200, {
                    "unit_id": "ITAIM",
                    "actor": {"actor_id": ACTOR, "role": "motoboy_interno"},
                    "connection": "online", "pending_sync": 0,
                    "ready_orders": [],
                    "trips": [{
                        "trip_id": TRIP, "state": "em_rota",
                        "courier_actor_id": ACTOR,
                        "deliveries": [{
                            "delivery_id": DELIVERY,
                            "order_ref": "LAB_HTTPS_UI_ORDER_001",
                            "state": "em_rota", "active": True,
                            "planned_stop_order": 1,
                        }],
                    }],
                })
            return self.send(404, {"error": "LAB_ROUTE_NOT_FOUND"})
        if self.command != "POST":
            return self.send(405, {"error": "LAB_METHOD_DENIED"})
        try:
            size = int(self.headers.get("Content-Length", "-1"))
            if not (0 <= size <= 8192):
                return self.send(413, {"error": "LAB_SIZE_REJECTED"})
            payload = json.loads(self.rfile.read(size) or b"{}")
            if not isinstance(payload, dict):
                raise ValueError("not_object")
        except (ValueError, json.JSONDecodeError):
            return self.send(400, {"error": "LAB_JSON_REJECTED"})
        auth = self.headers.get("Authorization")

        if platform and path == "/api/device/session":
            device = payload.get("device_id")
            secret = payload.get("device_secret")
            if not isinstance(device, str) or not device or not isinstance(secret, str):
                return self.send(403, {"error": "LAB_DEVICE_INVALID"})
            if not re.fullmatch(r"[a-f0-9]{32}", secret):
                return self.send(403, {"error": "LAB_SECRET_SHAPE_INVALID"})
            with lock:
                state["device"] = device
            return self.send(200, {
                "device_token": PLATFORM_TOKEN, "expires_in_s": 7200,
                "actor_id": ACTOR,
            })

        if platform and path == "/api/device/pilot-delegation":
            if auth != "Bearer " + PLATFORM_TOKEN:
                return self.send(403, {"error": "LAB_PLATFORM_AUTH_REQUIRED"})
            with lock:
                device = state["device"]
            if not device:
                return self.send(403, {"error": "LAB_MISSING_DEVICE"})
            return self.send(200, {
                "ok": True, "pilot_token": PILOT_TOKEN, "expires_in_s": 60,
                "audience": "deliveryos-pilot-event-write",
                "actor_id": ACTOR, "unit_id": "ITAIM", "device_id": device,
            })

        if platform and path == "/api/device/queue-depth":
            if auth != "Bearer " + PLATFORM_TOKEN:
                return self.send(403, {"error": "LAB_PLATFORM_AUTH_REQUIRED"})
            return self.send(200, {"ok": True})

        if not platform and path == "/api/events/batch":
            # A platform bearer must NEVER leak to the distinct pilot origin.
            if auth != "Bearer " + PILOT_TOKEN:
                return self.send(403, {"error": "LAB_PILOT_DELEGATION_REQUIRED"})
            events = payload.get("events")
            if not isinstance(events, list) or len(events) != 1:
                return self.send(422, {"human": "LAB_BATCH_CARDINALITY"})
            item = events[0]
            event_id = item.get("event_id")
            command = item.get("command")
            if (not isinstance(event_id, str) or
                not re.fullmatch(r"ev-[A-Za-z0-9_-]{16,120}", event_id) or
                item.get("idempotency_key") != event_id or
                item.get("kind") != "RecordArrivalReported" or
                not isinstance(command, dict) or
                command.get("type") != "RecordArrivalReported" or
                command.get("unit_id") != "ITAIM" or
                command.get("trip_id") != TRIP or
                command.get("delivery_id") != DELIVERY or
                command.get("actor") != {
                    "actor_id": ACTOR, "role": "motoboy_interno",
                } or
                not isinstance(command.get("command_id"), str) or
                not re.fullmatch(r"arr-[A-Za-z0-9_-]{16,120}",
                                 command["command_id"]) or
                not isinstance(command.get("occurred_at"), str)):
                return self.send(422, {"human": "LAB_IDENTITY_MISMATCH"})
            with lock:
                # An HTTP retry is the SAME intention, not merely the same
                # event ID. A changed payload is an integrity violation.
                signature = (event_id, item.get("idempotency_key"),
                             item.get("sequence_local"), command)
                if state["identity"] is None:
                    state["identity"] = signature
                elif state["identity"] != signature:
                    return self.send(422, {"human": "LAB_RETRY_MUTATED"})
                state["event_attempts"] += 1
                attempt = state["event_attempts"]
            print("LAB_HTTPS_EVENT_BATCH_ATTEMPT=" + str(attempt), flush=True)
            if attempt == 1:
                return self.send(422, {"human": "LAB_HTTP_422_WITHOUT_EVENT_RECEIPT"})
            return self.send(200, {"ok": True, "results": [
                {"event_id": event_id, "ok": True},
            ]})

        return self.send(404, {"error": "LAB_UNEXPECTED_ENDPOINT"})

    def do_GET(self): self.handle_one()
    def do_POST(self): self.handle_one()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cert", required=True)
    parser.add_argument("--key", required=True)
    args = parser.parse_args()
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(args.cert, args.key)
    servers = []
    for port in (8080, 5193):
        server = ThreadingHTTPServer(("127.0.0.1", port), LabHandler)
        server.socket = context.wrap_socket(server.socket, server_side=True)
        servers.append(server)
    print("LAB_HTTPS_DUAL_ORIGINS_READY", flush=True)
    for server in servers:
        threading.Thread(target=server.serve_forever, daemon=True).start()
    threading.Event().wait()

if __name__ == "__main__":
    main()
