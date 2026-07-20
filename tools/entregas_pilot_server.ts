/**
 * Servidor PILOTO CONTROLADO — ENTREGAS
 * - FileUnitOfWork single-instance
 * - Sessão por token (não nome livre para ações)
 * - Sem seed de demo
 * - Banner de piloto
 * Não é produção multi-unidade.
 */
import http from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { loadPilotConfig, resolveBanner } from "../src/entregas/pilot/pilot-config";
import { createPilotLogger } from "../src/entregas/pilot/pilot-log";
import { PilotApplicationFacade } from "../src/entregas/pilot/pilot-facade";
import {
  createBackup,
  restoreBackup,
  listBackups,
} from "../src/entregas/pilot/pilot-backup";
import { asInternalRiderActorId, asExternalCourierRef } from "../src/entregas/foundation/brands";

const configPath = process.env.ENTREGAS_PILOT_CONFIG;
const cfg = loadPilotConfig(configPath);
const dataDir = join(process.cwd(), cfg.data_dir);
mkdirSync(dataDir, { recursive: true });
const log = createPilotLogger(dataDir);
const facade = new PilotApplicationFacade(cfg, log);
const backupDir = join(dataDir, cfg.backup.dir || "backups");
const PORT = Number(process.env.ENTREGAS_UI_PORT || cfg.port || 5193);
const BIND = process.env.ENTREGAS_BIND || cfg.bind || "0.0.0.0";
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
  // esconder dock de demo na expedição iFood
  if (pathname.includes("ifood-handoff") && !cfg.features.demo_controls) {
    out = out.replace(
      /<aside class="demo-dock"[\s\S]*?<\/aside>/,
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

const server = http.createServer(async (req, res) => {
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
      return json(res, 200, {
        ok: true,
        module: "ENTREGAS",
        mode: "pilot",
        unit: cfg.unit_name,
        banner,
        demo: false,
        shell: false,
        copiloto: false,
        gps_production: false,
        multi_instance: false,
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
});

server.listen(PORT, BIND, () => {
  log.info(
    "server_started",
    `Piloto iniciado na unidade ${cfg.unit_name}.`,
    `http://${BIND}:${PORT}/console/`,
  );
  console.log(`ENTREGAS PILOTO http://127.0.0.1:${PORT}/console/`);
  console.log(`  mobile: http://127.0.0.1:${PORT}/rider-mobile/`);
  console.log(`  ifood:  http://127.0.0.1:${PORT}/ifood-handoff/`);
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
