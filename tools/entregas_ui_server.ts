/**
 * Servidor local de protótipo ENTREGAS 3C.1
 * Expõe JSON API sobre UiApplicationFacade (ApplicationService).
 * Não integra shell. Não conecta Copiloto.
 */
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { UiApplicationFacade } from "../src/entregas/ui/adapters/UiApplicationFacade";
import { asInternalRiderActorId, asExternalCourierRef } from "../src/entregas/foundation/brands";
import type { OperationalRole } from "../src/entregas/operational/auth";

const PORT = Number(process.env.ENTREGAS_UI_PORT || 5193);
// Fonte HTML/CSS/JS permanece em src/ (não em dist/)
const ROOT = join(process.cwd(), "src", "entregas", "ui");
const facade = new UiApplicationFacade();
facade.seedDemo();

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
  });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname === "/api/health") {
      // Demo server: controles de simulação ligados por padrão.
      // Override: ENTREGAS_DEMO_CONTROLS=false desliga mesmo no ui:entregas.
      const demoControls =
        process.env.ENTREGAS_DEMO_CONTROLS === undefined
          ? true
          : process.env.ENTREGAS_DEMO_CONTROLS === "true" ||
            process.env.ENTREGAS_DEMO_CONTROLS === "1";
      return json(res, 200, {
        ok: true,
        module: "ENTREGAS",
        demo: true,
        demo_controls: demoControls,
        features: { demo_controls: demoControls },
        shell: false,
        copiloto: false,
      });
    }
    if (url.pathname === "/api/snapshot" && req.method === "GET") {
      return json(res, 200, await facade.snapshot());
    }
    if (url.pathname === "/api/actor" && req.method === "POST") {
      const body = JSON.parse(await readBody(req)) as {
        actor_id: string;
        role: OperationalRole;
      };
      facade.setActor(body.actor_id, body.role);
      return json(res, 200, await facade.snapshot());
    }
    if (url.pathname === "/api/connection" && req.method === "POST") {
      const body = JSON.parse(await readBody(req)) as {
        connection: "online" | "offline" | "syncing";
      };
      facade.setConnection(body.connection);
      return json(res, 200, await facade.snapshot());
    }
    if (url.pathname === "/api/command" && req.method === "POST") {
      const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
      // hydrate branded ids when present
      if (typeof body.courier_actor_id === "string") {
        body.courier_actor_id = asInternalRiderActorId(body.courier_actor_id);
      }
      if (typeof body.rider_id === "string") {
        body.rider_id = asInternalRiderActorId(body.rider_id);
      }
      if (typeof body.external_courier_ref === "string") {
        body.external_courier_ref = asExternalCourierRef(
          body.external_courier_ref,
        );
      }
      const result = await facade.execute(body as never);
      const snap = await facade.snapshot();
      // 200 sempre: rejeição de domínio é negócio, não falha de rede/UI
      return json(res, 200, { result, snapshot: snap });
    }

    // static (directories → index.html)
    let path = url.pathname === "/" ? "/console/index.html" : url.pathname;
    let rel = path.replace(/^\//, "").replace(/\//g, "\\");
    // normalize for join
    rel = path.replace(/^\//, "");
    let file = join(ROOT, rel);
    if (existsSync(file) && !extname(file)) {
      // directory
      file = join(file, "index.html");
    } else if (path.endsWith("/")) {
      file = join(ROOT, rel, "index.html");
    }
    const rootNorm = ROOT.replace(/\\/g, "/").toLowerCase();
    const fileNorm = file.replace(/\\/g, "/").toLowerCase();
    if (!fileNorm.startsWith(rootNorm) || !existsSync(file)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(`Not found: ${path}`);
    }
    const ext = extname(file);
    res.writeHead(200, { "Content-Type": mime[ext] || "text/plain" });
    res.end(readFileSync(file));
  } catch (e) {
    json(res, 500, {
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`ENTREGAS UI demo http://127.0.0.1:${PORT}/console/`);
  console.log(`  mobile:  http://127.0.0.1:${PORT}/rider-mobile/`);
  console.log(`  ifood:   http://127.0.0.1:${PORT}/ifood-handoff/`);
  console.log(`  mapa:    http://127.0.0.1:${PORT}/map-poc/`);
  console.log("AMBIENTE DE DEMONSTRAÇÃO — ApplicationService only · zero licença paga de mapa");
});
