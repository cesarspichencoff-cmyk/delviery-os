/**
 * Servidor PILOTO CONTROLADO — ENTREGAS
 * - FileUnitOfWork single-instance
 * - Sessão por token (não nome livre para ações)
 * - Sem seed de demo
 * - Banner de piloto
 * Não é produção multi-unidade.
 */
import http from "node:http";
import https from "node:https";
import { readFileSync, existsSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join, extname } from "node:path";
import { loadPilotConfig, resolveBanner, findUserByToken } from "../src/entregas/pilot/pilot-config";
import { createPilotLogger } from "../src/entregas/pilot/pilot-log";
import { PilotApplicationFacade } from "../src/entregas/pilot/pilot-facade";
import {
  createBackup,
  restoreBackup,
  listBackups,
} from "../src/entregas/pilot/pilot-backup";
import { asInternalRiderActorId, asExternalCourierRef } from "../src/entregas/foundation/brands";
import { resolveHttps, resolveBind, startupSummary } from "../src/entregas/pilot/https-config";
import {
  handleDeviceSession,
  buildPolicies,
  ingestGpsBatch,
  handleTermAcknowledge,
  authorizeRouteAccess,
  buildRouteAudit,
  DEVICE_API_VERSION,
  type AuthorizedDevice,
} from "../src/entregas/pilot/device-api";
import { loadFlags } from "../src/entregas/gps/flags";
import { TERM_ITAIM_V1, type LocationTerm } from "../src/entregas/consent/term";
import {
  AcknowledgementStore,
  type AckStorage,
} from "../src/entregas/consent/acknowledgement";
import { loadUnitConfig, type UnitConfig } from "../src/entregas/gps/unit-config";
import { buildOperationalTrack, buildRawTrack } from "../src/entregas/gps/track-projection";
import {
  buildTripTimeline,
  summarizeArrival,
  timelineIsClean,
} from "../src/entregas/pilot/trip-timeline";
import { freshnessOf } from "../src/entregas/pilot/dispatch-projection";
import type { GPSPoint } from "../src/entregas/gps/types";

const configPath = process.env.ENTREGAS_PILOT_CONFIG;
const cfg = loadPilotConfig(configPath);
const dataDir = join(process.cwd(), cfg.data_dir);
mkdirSync(dataDir, { recursive: true });
const log = createPilotLogger(dataDir);
const facade = new PilotApplicationFacade(cfg, log);
const backupDir = join(dataDir, cfg.backup.dir || "backups");
const PORT = Number(process.env.ENTREGAS_UI_PORT || cfg.port || 5193);

/*
 * TLS e bind. Falha fechada: pedir HTTPS e não ter certificado derruba o
 * boot em vez de cair para HTTP em silêncio — cair calado faria o GPS falhar
 * no celular sem ninguém entender por quê.
 */
const httpsResolution = resolveHttps(process.env, { existsSync });
if (httpsResolution.fatal) {
  console.error(`[piloto] ${httpsResolution.reason}`);
  process.exit(1);
}
const bindResolution = resolveBind(process.env, httpsResolution.enabled);
if (bindResolution.fatal) {
  console.error(`[piloto] ${bindResolution.reason}`);
  process.exit(1);
}
const BIND = bindResolution.host;

/* Configuração externa da unidade e do termo — ambas fora do Git. */
function readJsonIfPresent<T>(file: string): T | null {
  const p = join(process.cwd(), file);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

const unitRaw = readJsonIfPresent<Partial<UnitConfig>>(
  process.env.ENTREGAS_UNIT_CONFIG || "config/entregas-unit-itaim.json",
);
const unitConfig = loadUnitConfig(unitRaw);

const termOverride = readJsonIfPresent<Partial<LocationTerm>>(
  process.env.ENTREGAS_TERM_CONFIG || "config/entregas-term.json",
);
/* Sem o arquivo do responsável, o termo continua o modelo — não publicável. */
const activeTerm: LocationTerm = { ...TERM_ITAIM_V1, ...(termOverride ?? {}) };

const gpsFlags = loadFlags(readJsonIfPresent("config/entregas-gps-flags.json") ?? undefined);

const authorizedDevices: AuthorizedDevice[] =
  readJsonIfPresent<AuthorizedDevice[]>("config/entregas-devices.json") ?? [];

/* Aceites do termo: arquivo append-only, ao lado dos dados do piloto. */
const ackFile = join(dataDir, "term-acks.jsonl");
const ackStorage: AckStorage = {
  appendLine: (line) => appendFileSync(ackFile, line + "\n", "utf8"),
  readLines: () => (existsSync(ackFile) ? readFileSync(ackFile, "utf8").split("\n") : []),
};
const ackStore = new AcknowledgementStore(ackStorage);

/**
 * Autenticacao POR REQUISICAO para a API do aparelho.
 *
 * Nao usa `facade.getActor()`: a facade guarda o ultimo ator que fez login e
 * responderia por uma requisicao sem token nenhum. Para o console isso e
 * comportamento antigo; para um aparelho que fala pela rede, seria um furo.
 * Aqui o token e resolvido a cada chamada, ou nao ha ator.
 */
function requestActor(tok: string): { actor_id: string; role: string } | null {
  const user = findUserByToken(cfg, tok);
  return user ? { actor_id: user.actor_id, role: user.role } : null;
}

/** O termo so e apresentavel depois que o responsavel preenche os campos. */
function termPublishable(): boolean {
  const body = buildPolicies({ flags: gpsFlags, term: activeTerm, unit: unitConfig }).body;
  return (body.term as { publishable: boolean }).publishable;
}

/* Pontos aceitos, por viagem. Memória de sessão para a projeção do console;
   a verdade durável do lote é a fila do aparelho + o outbox. */
const pointsByTrip = new Map<string, GPSPoint[]>();
const knownPointIds = new Set<string>();
const routeAuditFile = join(dataDir, "route-access.jsonl");
const ROOT = join(process.cwd(), "src", "entregas", "ui");
const banner = resolveBanner(cfg);

// sessions: token -> ok (token revalidated each request from config)
function extractToken(req: http.IncomingMessage, url: URL): string {
  const h = req.headers["authorization"] || "";
  if (typeof h === "string" && h.toLowerCase().startsWith("bearer ")) {
    return h.slice(7).trim();
  }
  return (url.searchParams.get("token") || "").trim();
}

const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function json(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** Injeta banner de piloto e esconde demo dock via snippet no HTML */
function transformHtml(html: string, pathname: string): string {
  let out = html.replace(
    /AMBIENTE DE DEMONSTRAÇÃO[^<]*/g,
    banner,
  );
  // esconder dock de demo na expedição iFood (id ou class; operação: ausente no HTML)
  if (pathname.includes("ifood-handoff") && !cfg.features?.demo_controls) {
    out = out.replace(
      /<aside\b[^>]*(?:id=["']demoDock["']|class=["'][^"']*demo-dock[^"']*["'])[^>]*>[\s\S]*?<\/aside>/i,
      "<!-- demo dock desabilitado no piloto -->",
    );
  }
  // esconder link mapa experimental
  if (!cfg.features.map_poc) {
    out = out.replace(/·\s*<a href="\/map-poc\/">[^<]*<\/a>/g, "");
  }
  // snippet de login se não houver sessão (UI legada ainda usa role select — piloto usa token via localStorage)
  if (!out.includes("pilot-session-boot")) {
    const boot = `<script type="module">
/* pilot-session-boot */
const TOKEN_KEY = "entregas_pilot_token";
const origFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const t = localStorage.getItem(TOKEN_KEY);
  const headers = new Headers(init.headers || {});
  if (t && !headers.has("Authorization")) headers.set("Authorization", "Bearer " + t);
  return origFetch(input, { ...init, headers });
};
window.entregasPilotLogin = async (token) => {
  const r = await origFetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const data = await r.json();
  if (data.ok) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  return data;
};
// banner já substituído no HTML
</script>`;
    out = out.replace("</body>", boot + "\n</body>");
  }
  return out;
}

let autoBackupTimer: ReturnType<typeof setInterval> | null = null;

const handler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    return res.end();
  }

  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname === "/api/health") {
      // Operação/piloto: nunca é "ambiente de demonstração"; controles default ausentes
      const demoControls =
        process.env.ENTREGAS_DEMO_CONTROLS === "true" ||
        process.env.ENTREGAS_DEMO_CONTROLS === "1" ||
        !!cfg.features?.demo_controls;
      const envBanner =
        banner && !/demonstra/i.test(banner)
          ? banner
          : "AMBIENTE OPERACIONAL · EXPEDIÇÃO IFOOD";
      return json(res, 200, {
        ok: true,
        module: "ENTREGAS",
        mode: "operational",
        unit: cfg.unit_name,
        banner: envBanner,
        demo: false,
        demo_controls: demoControls,
        features: { ...(cfg.features || {}), demo_controls: demoControls },
        shell: false,
        copiloto: false,
        gps_production: gpsFlags.gps_capture_enabled,
        multi_instance: false,
        api_version: DEVICE_API_VERSION,
        https: httpsResolution.enabled,
        lan: bindResolution.exposedToLan,
        term_publishable: termPublishable(),
        unit_configured: unitConfig.ok,
        devices_authorized: authorizedDevices.length,
      });
    }

    if (url.pathname === "/api/session" && req.method === "POST") {
      const body = JSON.parse(await readBody(req)) as { token?: string };
      const result = facade.login(body.token || "");
      return json(res, result.ok ? 200 : 401, result);
    }

    if (url.pathname === "/api/session" && req.method === "GET") {
      const token = extractToken(req, url);
      if (token) facade.login(token);
      return json(res, 200, {
        actor: facade.getActor(),
        banner,
        unit_name: cfg.unit_name,
      });
    }

    // Autenticar se token presente
    const token = extractToken(req, url);
    if (token) {
      const u = facade.login(token);
      if (!u.ok && url.pathname.startsWith("/api/") && url.pathname !== "/api/health") {
        // allow health only
      }
    }

    /* ---------------- API do aparelho Android ---------------- */

    if (url.pathname === "/api/device/session" && req.method === "POST") {
      const actor = requestActor(token);
      const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
      const r = handleDeviceSession({
        input: body as never,
        actorRole: actor?.role,
        actorId: actor?.actor_id,
        authorizedDevices,
      });
      log.info(
        "device_session",
        r.body.ok ? "Aparelho autenticado." : "Aparelho recusado.",
        String(r.body.code ?? ""),
      );
      return json(res, r.status, { ...r.body, unit_id: cfg.unit_id });
    }

    if (url.pathname === "/api/policies" && req.method === "GET") {
      if (!requestActor(token)) {
        return json(res, 401, { ok: false, human: "Acesso nao autorizado." });
      }
      const r = buildPolicies({ flags: gpsFlags, term: activeTerm, unit: unitConfig });
      return json(res, r.status, r.body);
    }

    if (url.pathname === "/api/term/acknowledge" && req.method === "POST") {
      if (!requestActor(token)) {
        return json(res, 401, { ok: false, human: "Acesso nao autorizado." });
      }
      const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
      const r = handleTermAcknowledge({
        input: body,
        term: activeTerm,
        store: ackStore,
        now: new Date(),
      });
      return json(res, r.status, r.body);
    }

    if (url.pathname === "/api/gps/batch" && req.method === "POST") {
      const actor = requestActor(token);
      if (!actor) return json(res, 401, { ok: false, human: "Acesso nao autorizado." });
      if (!gpsFlags.gps_capture_enabled) {
        return json(res, 409, {
          ok: false,
          code: "capture_disabled",
          human: "A captura de localizacao esta desligada na configuracao.",
        });
      }
      const body = JSON.parse(await readBody(req)) as {
        points?: unknown[];
        device_id?: string;
      };
      const snap = (await facade.snapshot()) as { trips?: Array<{ trip_id: string; state: string }> };
      const activeTripIds = new Set<string>(
        (snap.trips ?? [])
          .filter((t) => t.state !== "encerrada" && t.state !== "cancelada")
          .map((t) => t.trip_id),
      );
      const first = (body.points ?? [])[0] as Record<string, unknown> | undefined;
      const deviceId = String(body.device_id ?? first?.device_id ?? "");
      const r = ingestGpsBatch({
        points: body.points ?? [],
        activeTripIds,
        knownPointIds,
        sessionDeviceId: deviceId,
        now: new Date(),
      });
      for (const pt of r.accepted_points) {
        const list = pointsByTrip.get(pt.trip_id) ?? [];
        list.push(pt);
        pointsByTrip.set(pt.trip_id, list);
      }
      // Log sem coordenada: apenas contagens e motivos.
      log.info(
        "gps_batch",
        "Lote de localizacao recebido.",
        JSON.stringify({ aceitos: r.accepted, repetidos: r.duplicated, recusados: r.rejected, motivos: r.reasons }),
      );
      return json(res, 200, {
        ok: true,
        accepted: r.accepted,
        duplicated: r.duplicated,
        rejected: r.rejected,
        reasons: r.reasons,
      });
    }

    if (url.pathname === "/api/events/batch" && req.method === "POST") {
      const actor = requestActor(token);
      if (!actor) return json(res, 401, { ok: false, human: "Acesso nao autorizado." });
      const body = JSON.parse(await readBody(req)) as {
        events?: Array<{ event_id: string; command: Record<string, unknown> }>;
      };
      const results: Array<{ event_id: string; ok: boolean; error?: string }> = [];
      for (const ev of body.events ?? []) {
        // O aparelho propoe; o dominio dispoe. Nenhuma regra e reavaliada aqui.
        const cmd = { ...ev.command } as Record<string, unknown>;
        if (typeof cmd.courier_actor_id === "string") {
          cmd.courier_actor_id = asInternalRiderActorId(cmd.courier_actor_id);
        }
        if (typeof cmd.rider_id === "string") {
          cmd.rider_id = asInternalRiderActorId(cmd.rider_id);
        }
        const r = await facade.execute(cmd as never);
        results.push({ event_id: ev.event_id, ok: r.ok, error: r.ok ? undefined : r.error });
      }
      return json(res, 200, { ok: true, results });
    }

    if (url.pathname === "/api/trip/timeline" && req.method === "GET") {
      const actor = requestActor(token);
      if (!actor) return json(res, 401, { ok: false, human: "Acesso nao autorizado." });
      const tripId = (url.searchParams.get("trip_id") || "").trim();
      const events = await facade.listTripEvents(tripId);
      const timeline = buildTripTimeline(events);
      // Trava de runtime, nao so' de teste: timeline suja nao vai para a tela.
      if (!timelineIsClean(timeline)) {
        log.warn("route_access", "Timeline bloqueada por conteudo inesperado.", tripId);
        return json(res, 500, { ok: false, human: "Nao foi possivel montar a linha do tempo." });
      }
      const snap = (await facade.snapshot()) as {
        trips?: Array<{ trip_id: string; deliveries: Array<{ delivery_id: string }> }>;
      };
      const trip = (snap.trips ?? []).find((t) => t.trip_id === tripId);
      return json(res, 200, {
        ok: true,
        trip_id: tripId,
        timeline,
        arrivals: (trip?.deliveries ?? []).map((d) => summarizeArrival(d.delivery_id, timeline)),
      });
    }

    if (url.pathname === "/api/trip/location" && req.method === "GET") {
      const actor = requestActor(token);
      if (!actor) return json(res, 401, { ok: false, human: "Acesso nao autorizado." });
      const tripId = (url.searchParams.get("trip_id") || "").trim();
      const points = pointsByTrip.get(tripId) ?? [];
      const last = points[points.length - 1];
      const auth = authorizeRouteAccess(actor.role);
      // Freshness e' honesto para todo mundo; coordenada, so' para papel
      // autorizado. Saber "esta' sem sinal ha' 10 minutos" nao expoe ninguem.
      return json(res, 200, {
        ok: true,
        trip_id: tripId,
        ...freshnessOf(last, points.length, new Date()),
        coordinates_visible: auth.allowed,
        last_point:
          auth.allowed && last
            ? { latitude: last.latitude, longitude: last.longitude, accuracy_m: last.accuracy_m }
            : undefined,
      });
    }

    if (url.pathname === "/api/trip/route" && req.method === "GET") {
      const actor = requestActor(token);
      const tripId = (url.searchParams.get("trip_id") || "").trim();
      const auth = authorizeRouteAccess(actor?.role);
      const points = pointsByTrip.get(tripId) ?? [];
      // Toda consulta de rota e auditavel, inclusive as negadas.
      const audit = buildRouteAudit({
        actor_id: actor?.actor_id ?? "anonimo",
        role: actor?.role ?? "nenhum",
        trip_id: tripId,
        granted: auth.allowed,
        point_count: points.length,
        now: new Date(),
      });
      appendFileSync(routeAuditFile, JSON.stringify(audit) + "\n", "utf8");
      if (!auth.allowed) {
        return json(res, 403, { ok: false, human: auth.human });
      }
      return json(res, 200, {
        ok: true,
        trip_id: tripId,
        bruto: buildRawTrack(tripId, points),
        operacional: buildOperationalTrack(tripId, points),
      });
    }

    if (url.pathname === "/api/snapshot" && req.method === "GET") {
      if (token) facade.login(token);
      return json(res, 200, await facade.snapshot());
    }

    if (url.pathname === "/api/ready-order" && req.method === "POST") {
      if (token) facade.login(token);
      const body = JSON.parse(await readBody(req)) as {
        order_ref: string;
        label: string;
        channel?: string;
      };
      return json(res, 200, facade.registerReadyOrder(body.order_ref, body.label, body.channel));
    }

    if (url.pathname === "/api/command" && req.method === "POST") {
      if (token) facade.login(token);
      const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
      if (typeof body.courier_actor_id === "string") {
        body.courier_actor_id = asInternalRiderActorId(body.courier_actor_id);
      }
      if (typeof body.rider_id === "string") {
        body.rider_id = asInternalRiderActorId(body.rider_id);
      }
      if (typeof body.external_courier_ref === "string") {
        body.external_courier_ref = asExternalCourierRef(body.external_courier_ref);
      }
      const result = await facade.execute(body as never);
      const snap = await facade.snapshot();
      return json(res, 200, { result, snapshot: snap });
    }

    if (url.pathname === "/api/backup" && req.method === "POST") {
      if (token) facade.login(token);
      const actor = facade.getActor();
      if (!actor || !["gerente", "lider_delivery"].includes(actor.role)) {
        return json(res, 403, {
          ok: false,
          human: "Só o responsável pelo piloto pode gerar backup.",
        });
      }
      const r = createBackup(facade.dataPath, backupDir, cfg.backup.retain_count, log);
      return json(res, r.ok ? 200 : 500, r);
    }

    if (url.pathname === "/api/backups" && req.method === "GET") {
      return json(res, 200, { backups: listBackups(backupDir) });
    }

    if (url.pathname === "/api/restore" && req.method === "POST") {
      if (token) facade.login(token);
      const actor = facade.getActor();
      if (!actor || actor.role !== "gerente") {
        return json(res, 403, {
          ok: false,
          human: "Só o administrador do piloto pode restaurar.",
        });
      }
      const body = JSON.parse(await readBody(req)) as { file: string };
      const full = join(backupDir, body.file);
      if (!full.startsWith(backupDir)) {
        return json(res, 400, { ok: false, human: "Arquivo inválido." });
      }
      const r = restoreBackup(full, facade.dataPath, backupDir, log);
      if (r.ok) facade.reloadStore();
      return json(res, r.ok ? 200 : 500, r);
    }

    // static UI
    let path = url.pathname === "/" ? "/console/index.html" : url.pathname;
    if (path === "/map-poc" || path.startsWith("/map-poc/")) {
      if (!cfg.features.map_poc) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Mapa experimental desabilitado no piloto.");
      }
    }
    let rel = path.replace(/^\//, "");
    let file = join(ROOT, rel);
    if (existsSync(file) && !extname(file)) file = join(file, "index.html");
    else if (path.endsWith("/")) file = join(ROOT, rel, "index.html");
    const rootNorm = ROOT.replace(/\\/g, "/").toLowerCase();
    const fileNorm = file.replace(/\\/g, "/").toLowerCase();
    if (!fileNorm.startsWith(rootNorm) || !existsSync(file)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(`Not found: ${path}`);
    }
    const ext = extname(file);
    let body: string | Buffer = readFileSync(file);
    if (ext === ".html") {
      body = transformHtml(body.toString("utf8"), path);
    }
    res.writeHead(200, { "Content-Type": mime[ext] || "text/plain" });
    res.end(body);
  } catch (e) {
    const technical = e instanceof Error ? e.message : String(e);
    log.error("command_failed", "Erro interno do servidor.", technical);
    json(res, 500, {
      error: "Algo deu errado. Avise o responsável pelo piloto.",
      // technical only in logs
    });
  }
};

/*
 * HTTPS quando configurado. O certificado e a chave sao lidos de caminhos
 * vindos do ambiente e nunca moram no repositorio.
 */
const server = httpsResolution.enabled
  ? https.createServer(
      {
        cert: readFileSync(httpsResolution.cert_path as string),
        key: readFileSync(httpsResolution.key_path as string),
      },
      handler,
    )
  : http.createServer(handler);

server.listen(PORT, BIND, () => {
  log.info(
    "server_started",
    `Piloto iniciado na unidade ${cfg.unit_name}.`,
    `http://${BIND}:${PORT}/console/`,
  );
  const scheme = httpsResolution.enabled ? "https" : "http";
  console.log(startupSummary(httpsResolution, bindResolution, PORT));
  console.log(`ENTREGAS PILOTO ${scheme}://127.0.0.1:${PORT}/console/`);
  console.log(`  mobile: ${scheme}://127.0.0.1:${PORT}/rider-mobile/`);
  console.log(`  ifood:  ${scheme}://127.0.0.1:${PORT}/ifood-handoff/`);
  console.log(`  aparelhos autorizados: ${authorizedDevices.length}`);
  console.log(
    `  unidade configurada: ${unitConfig.ok ? "SIM" : "NAO (retorno automatico desligado)"}`,
  );
  console.log(`  termo publicavel: ${termPublishable() ? "SIM" : "NAO (GPS bloqueado)"}`);
  console.log(`  ${banner}`);
  console.log(`  dados:  ${dataDir}`);
  console.log("  multi-instância: NÃO · GPS prod: NÃO · Copiloto: NÃO");

  const mins = cfg.backup.auto_interval_minutes || 30;
  autoBackupTimer = setInterval(
    () => {
      createBackup(facade.dataPath, backupDir, cfg.backup.retain_count, log);
    },
    mins * 60 * 1000,
  );
  // backup inicial
  createBackup(facade.dataPath, backupDir, cfg.backup.retain_count, log);
});

process.on("SIGINT", () => {
  if (autoBackupTimer) clearInterval(autoBackupTimer);
  createBackup(facade.dataPath, backupDir, cfg.backup.retain_count, log);
  log.info("server_stopped", "Servidor do piloto encerrado.");
  process.exit(0);
});
