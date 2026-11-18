/**
 * Processo do portão de campo (D101). Sem banco, sem segredo, sem estado.
 *   DELIVERYOS_FIELD_LISTEN   http://<ip da rede privada>:<porta>/   (nunca 0.0.0.0)
 *   DELIVERYOS_FIELD_PILOT    http://<piloto>:<porta>/
 *   DELIVERYOS_FIELD_CRITICAL http://127.0.0.1:<porta do crítico>/
 * Configuração ausente ou inválida: sai com 78 sem abrir porta.
 */
import * as http from "node:http";
import { configDoAmbiente, criarPortaoDeCampo, PORTAO_DE_CAMPO_VERSION } from "../campo/portao-de-campo";

let cfg: ReturnType<typeof configDoAmbiente>;
try {
  cfg = configDoAmbiente(process.env);
} catch (e) {
  console.error(`[portao-de-campo] configuração recusada: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(78);
}
const servidor = http.createServer(criarPortaoDeCampo(cfg));
servidor.requestTimeout = 60_000;
servidor.headersTimeout = 15_000;
servidor.listen(cfg.escuta.port, cfg.escuta.host, () => {
  console.log(`[portao-de-campo] ${PORTAO_DE_CAMPO_VERSION} ouvindo em ${cfg.escuta.host}:${cfg.escuta.port} · piloto ${cfg.piloto.host}:${cfg.piloto.port} · critico ${cfg.critico.host}:${cfg.critico.port}`);
});
for (const s of ["SIGINT", "SIGTERM"] as const) process.on(s, () => servidor.close(() => process.exit(0)));
