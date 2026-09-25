/* Ponte com o aplicativo Android — o lado da página (Q-018).
 *
 * Decisão do César (2026-09-25): a rider-mobile é dona da interação com o
 * motoboy e aciona a captura pela ponte `EntregasNative`; o Kotlin continua
 * dono das capacidades nativas — permissão, GPS, serviço em primeiro plano,
 * persistência e sincronização.
 *
 * Este módulo só traduz. Não decide quando capturar (isso é
 * `capture-rule.js`), não guarda ponto e não manda ponto ao servidor: quem
 * persiste e sincroniza é o Kotlin. Fora do aplicativo (navegador comum) não
 * existe ponte, e a página segue funcionando sem GPS nenhum — não há GPS de
 * navegador em paralelo.
 *
 * `NATIVE_METHODS` são os métodos `@JavascriptInterface` de
 * `android/app/src/main/java/br/com/tata/entregas/bridge/EntregasBridge.kt`;
 * `test:entregas:rider-capture` confere um contra o outro.
 */

export const NATIVE_METHODS = [
  "version",
  "startTripCapture",
  "stopTripCapture",
  "capabilities",
  "status",
  "requestLocationPermission",
  "openAppSettings",
  "recordTermAcknowledgement",
  "receipt",
  "syncNow",
  "applyServerPolicies",
];

/** O mínimo para a captura. Ponte sem isso é aplicativo antigo, não ponte. */
const REQUIRED = [
  "startTripCapture",
  "stopTripCapture",
  "capabilities",
  "status",
  "requestLocationPermission",
  "recordTermAcknowledgement",
  "applyServerPolicies",
];

function parse(text) {
  if (text && typeof text === "object") return text;
  try {
    return JSON.parse(String(text));
  } catch {
    return null;
  }
}

/**
 * `{ present, bridge }`. `present` sem `bridge` é o aplicativo desatualizado:
 * a ponte existe, mas não tem o que a captura precisa — e isso aparece, em
 * vez de a página fingir que está no navegador.
 */
export function detectNativeBridge(win = globalThis) {
  const n = win && win.EntregasNative;
  if (!n) return { present: false, bridge: null };
  if (!REQUIRED.every((m) => typeof n[m] === "function")) return { present: true, bridge: null };
  return {
    present: true,
    bridge: {
      capabilities: () => parse(n.capabilities()),
      status: () => parse(n.status()),
      /** Repassa o corpo de `/api/policies` como o servidor deu. */
      applyServerPolicies: (text) => parse(n.applyServerPolicies(String(text))),
      /** O registro montado pelo SERVIDOR; o Kotlin confere o aparelho. */
      recordTermAcknowledgement: (record) => parse(n.recordTermAcknowledgement(JSON.stringify(record))),
      requestLocationPermission: () => n.requestLocationPermission(),
      openAppSettings: () => (typeof n.openAppSettings === "function" ? n.openAppSettings() : undefined),
      startTripCapture: (tripId) => n.startTripCapture(String(tripId)),
      stopTripCapture: () => n.stopTripCapture(),
    },
  };
}

/** Recebe as mensagens do Kotlin (`window.__entregasNativeMessage('<json>')`). */
export function listenNative(win, handler) {
  win.__entregasNativeMessage = (text) => {
    const m = parse(text);
    if (m && typeof m.type === "string") handler(m);
  };
}

/** `permission_state` do Kotlin → o que a regra de captura entende. */
export function permissionFromNative(state) {
  if (state === "granted_precise" || state === "granted_approximate") return "granted";
  if (state === "denied" || state === "revoked") return "denied";
  return "needs";
}

/**
 * Permissão lida do portão nativo (`status().blocks`). O Android não separa
 * "nunca pediu" de "negou" na leitura, então o bloqueio vira "precisa pedir":
 * pedir de novo é inofensivo, e o resultado real chega por `service_state`.
 */
export function permissionFromStatus(status) {
  if (!status) return "unknown";
  const blocks = String(status.blocks || "")
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks.some((b) => b.startsWith("permission_")) ? "needs" : "granted";
}

/**
 * Um `navigator.geolocation` que só ESCUTA o serviço nativo, para o status de
 * GPS que já existe (`gps-status.js`) funcionar sem saber de Android.
 * `watchPosition` não liga nada e `clearWatch` não desliga nada: ligar e
 * desligar a captura são atos da página pela ponte, depois da regra.
 */
export function createNativeGeolocation() {
  let seq = 0;
  const watchers = new Map();
  return {
    watchPosition(onPosition, onError) {
      seq += 1;
      watchers.set(seq, { onPosition, onError });
      return seq;
    },
    clearWatch(id) {
      watchers.delete(id);
    },
    feed(m) {
      for (const w of watchers.values()) {
        if (m.type === "location" && w.onPosition) {
          w.onPosition({
            coords: {
              latitude: m.latitude,
              longitude: m.longitude,
              accuracy: m.accuracy_m,
              speed: m.speed_mps == null ? null : m.speed_mps,
              heading: m.bearing_deg == null ? null : m.bearing_deg,
              altitude: m.altitude_m == null ? null : m.altitude_m,
            },
            timestamp: m.time_ms,
          });
        } else if (m.type === "error" && w.onError) {
          w.onError({ code: m.error === "permission_denied" ? 1 : 2, message: String(m.detail || m.error) });
        }
      }
    },
  };
}
