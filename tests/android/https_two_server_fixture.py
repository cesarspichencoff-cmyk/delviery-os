#!/usr/bin/env python3
"""Disposable two-origin HTTPS lab, RUNNER ONLY (not production).

Exposes only 127.0.0.1:8080 (platform) and 127.0.0.1:5193 (pilot).
Android emulator reaches both via 10.0.2.2 using a test-only CA and strict TLS.
Never logs body, authorization values, device_secret or customer data.

Pilot /api/events/batch: FIRST authentic UI-generated LAB action => 422 without
per-event receipt; second identical action => exact id-scoped HTTP 200
receipt. Dynamic event ID, command and idempotency key are compared.
All other routes fail closed.

--riders 2 (bench only, two emulators): TWO riders on TWO devices at once.
A device must be pre-bound by a human act (/lab/enroll: device_id + proof +
rider) before it gets a session; each rider has its own actor, trip, delivery,
tokens and attempt counter. A batch carrying the other rider's actor, trip or
delivery is refused and flagged. Without the flag, nothing changes.
"""
import argparse
import hashlib
import json
import re
import ssl
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PLATFORM_TOKEN = "LAB_PLATFORM_SESSION_NONPROD"
PILOT_TOKEN = "pt1.labwrite.signedfixture"
TRIP = "LAB_HTTPS_UI_TRIP_001"
DELIVERY = "LAB_HTTPS_UI_DELIVERY_001"
ACTOR = "rider-lab"
state = {"device": None, "event_attempts": 0, "identity": None}
lock = threading.Lock()

# Two-rider bench mode. Fixed, fictional identities; never a real person.
RIDERS = {
    r: {
        "actor": "rider-lab-" + r,
        "trip": "LAB_HTTPS_UI_TRIP_" + r.upper(),
        "delivery": "LAB_HTTPS_UI_DELIVERY_" + r.upper(),
        "platform_token": PLATFORM_TOKEN + "_" + r.upper(),
        "pilot_token": "pt1.labwrite" + r + ".signedfixture",
    } for r in ("a", "b")
}
multi = {"enabled": False, "devices": {}}

def rider_by(field, value):
    return next((r for r, spec in RIDERS.items() if spec[field] == value), None)

def device_of(rider):
    return next((d for d, e in multi["devices"].items() if e["rider"] == rider), None)

out_lock = threading.Lock()

def emit(line):
    # Two devices talk at the same instant: print() writes text and newline
    # separately, and two markers would land on one line.
    with out_lock:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()

def say(rider, what):
    emit("LAB_HTTPS_RIDER_" + rider.upper() + "_" + what)

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
        if multi["enabled"]:
            return self.handle_two_riders(platform, path, payload, auth)

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

    def handle_two_riders(self, platform, path, payload, auth):
        bearer = auth[7:] if isinstance(auth, str) and auth.startswith("Bearer ") else None

        if platform and path == "/lab/enroll":
            # The HUMAN act: this device, this proof, this rider. Nothing else binds.
            device = payload.get("device_id")
            proof = payload.get("device_proof_sha256")
            rider = payload.get("rider")
            if (not isinstance(device, str) or not re.fullmatch(r"[A-Za-z0-9_-]{8,128}", device) or
                not isinstance(proof, str) or not re.fullmatch(r"[a-f0-9]{64}", proof) or
                rider not in RIDERS):
                return self.send(400, {"error": "LAB_ENROLL_INVALID"})
            with lock:
                known = multi["devices"].get(device)
                if known is not None:
                    same = known["rider"] == rider and known["proof"] == proof
                    return self.send(200 if same else 409, {"ok": same})
                if device_of(rider) is not None:
                    emit("LAB_HTTPS_RIDER_ALREADY_HAS_A_DEVICE")
                    return self.send(409, {"error": "LAB_RIDER_ALREADY_BOUND"})
                multi["devices"][device] = {
                    "rider": rider, "proof": proof, "attempts": 0, "identity": None,
                }
                bound = len(multi["devices"])
            say(rider, "DEVICE_PREBOUND")
            emit("LAB_HTTPS_DEVICES_PREBOUND=" + str(bound))
            return self.send(200, {"ok": True})

        if platform and path == "/api/device/session":
            device = payload.get("device_id")
            secret = payload.get("device_secret")
            if not isinstance(device, str) or not isinstance(secret, str) or \
                    not re.fullmatch(r"[a-f0-9]{32}", secret):
                return self.send(401, {"motivo": "segredo_ausente", "instrucao": "corrigir_cliente"})
            with lock:
                known = multi["devices"].get(device)
            if known is None:
                emit("LAB_HTTPS_UNBOUND_DEVICE_REFUSED")
                return self.send(401, {"motivo": "dispositivo_desconhecido", "instrucao": "aguardar_humano"})
            if hashlib.sha256(secret.encode("utf-8")).hexdigest() != known["proof"]:
                emit("LAB_HTTPS_SECRET_MISMATCH_REFUSED")
                return self.send(403, {"motivo": "segredo_divergente", "instrucao": "parar_e_avisar"})
            spec = RIDERS[known["rider"]]
            say(known["rider"], "SESSION")
            return self.send(200, {
                "device_token": spec["platform_token"], "expires_in_s": 7200,
                "actor_id": spec["actor"],
            })

        if platform and path in ("/api/device/pilot-delegation", "/api/device/queue-depth"):
            rider = rider_by("platform_token", bearer)
            device = device_of(rider) if rider else None
            if device is None:
                return self.send(403, {"error": "LAB_PLATFORM_AUTH_REQUIRED"})
            if path.endswith("/queue-depth"):
                return self.send(200, {"ok": True})
            spec = RIDERS[rider]
            return self.send(200, {
                "ok": True, "pilot_token": spec["pilot_token"], "expires_in_s": 60,
                "audience": "deliveryos-pilot-event-write",
                "actor_id": spec["actor"], "unit_id": "ITAIM", "device_id": device,
            })

        if not platform and path == "/api/events/batch":
            rider = rider_by("pilot_token", bearer)
            device = device_of(rider) if rider else None
            if device is None:
                # Includes a platform bearer sent to the pilot origin.
                return self.send(403, {"error": "LAB_PILOT_DELEGATION_REQUIRED"})
            spec = RIDERS[rider]
            events = payload.get("events")
            if not isinstance(events, list) or len(events) != 1 or not isinstance(events[0], dict):
                return self.send(422, {"human": "LAB_BATCH_CARDINALITY"})
            item = events[0]
            event_id = item.get("event_id")
            command = item.get("command")
            if not isinstance(command, dict):
                return self.send(422, {"human": "LAB_IDENTITY_MISMATCH"})
            actor = command.get("actor")
            foreign = any(
                other != rider and (
                    command.get("trip_id") == o["trip"] or
                    command.get("delivery_id") == o["delivery"] or
                    (isinstance(actor, dict) and actor.get("actor_id") == o["actor"]))
                for other, o in RIDERS.items())
            if foreign:
                # One rider's device writing into the other rider's trip.
                emit("LAB_HTTPS_CROSS_RIDER_VIOLATION")
                return self.send(422, {"human": "LAB_CROSS_RIDER"})
            if (not isinstance(event_id, str) or
                not re.fullmatch(r"ev-[A-Za-z0-9_-]{16,120}", event_id) or
                item.get("idempotency_key") != event_id or
                item.get("kind") != "RecordArrivalReported" or
                command.get("type") != "RecordArrivalReported" or
                command.get("unit_id") != "ITAIM" or
                command.get("trip_id") != spec["trip"] or
                command.get("delivery_id") != spec["delivery"] or
                actor != {"actor_id": spec["actor"], "role": "motoboy_interno"} or
                not isinstance(command.get("command_id"), str) or
                not isinstance(command.get("occurred_at"), str)):
                return self.send(422, {"human": "LAB_IDENTITY_MISMATCH"})
            with lock:
                entry = multi["devices"][device]
                signature = (event_id, item.get("idempotency_key"),
                             item.get("sequence_local"), command)
                if entry["identity"] is None:
                    if any(e["identity"] is not None and e["identity"][0] == event_id
                           for e in multi["devices"].values()):
                        emit("LAB_HTTPS_EVENT_ID_SHARED_BY_TWO_DEVICES")
                        return self.send(422, {"human": "LAB_EVENT_ID_SHARED"})
                    entry["identity"] = signature
                elif entry["identity"] != signature:
                    return self.send(422, {"human": "LAB_RETRY_MUTATED"})
                entry["attempts"] += 1
                attempt = entry["attempts"]
            say(rider, "EVENT_BATCH_ATTEMPT=" + str(attempt))
            if attempt == 1:
                return self.send(422, {"human": "LAB_HTTP_422_WITHOUT_EVENT_RECEIPT"})
            return self.send(200, {"ok": True, "results": [
                {"event_id": event_id, "ok": True},
            ]})

        return self.send(404, {"error": "LAB_UNEXPECTED_ENDPOINT"})

    def do_GET(self): self.handle_one()
    def do_POST(self): self.handle_one()

class PerConnectionTlsServer(ThreadingHTTPServer):
    """TLS handshake in the connection's own thread, with a timeout.

    Wrapping the LISTENING socket makes accept() perform the handshake: one
    device that goes into airplane mode in the middle of it would freeze every
    other device on that origin. Two-rider bench mode only.
    """
    daemon_threads = True
    tls = None

    def get_request(self):
        sock, addr = self.socket.accept()
        sock.settimeout(20)
        return self.tls.wrap_socket(
            sock, server_side=True, do_handshake_on_connect=False), addr

    def handle_error(self, request, client_address):
        # A device that vanished mid-request is expected here; never a traceback
        # (it could echo request bytes into the log).
        return

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cert", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--riders", type=int, choices=(1, 2), default=1)
    args = parser.parse_args()
    multi["enabled"] = args.riders == 2
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(args.cert, args.key)
    servers = []
    for port in (8080, 5193):
        if multi["enabled"]:
            server = PerConnectionTlsServer(("127.0.0.1", port), LabHandler)
            server.tls = context
        else:
            server = ThreadingHTTPServer(("127.0.0.1", port), LabHandler)
            server.socket = context.wrap_socket(server.socket, server_side=True)
        servers.append(server)
    print("LAB_HTTPS_DUAL_ORIGINS_READY", flush=True)
    for server in servers:
        threading.Thread(target=server.serve_forever, daemon=True).start()
    threading.Event().wait()

if __name__ == "__main__":
    main()
