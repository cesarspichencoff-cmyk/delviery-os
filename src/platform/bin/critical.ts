/**
 * Entrypoint do runtime CRÍTICO.
 *
 * Sobe o processo que a operação não pode perder. Ele atende com CRM,
 * Copiloto e IA completamente ausentes — e é por isso que este arquivo não
 * importa nada deles.
 *
 * O que ele expõe é deliberadamente pequeno:
 *
 *   GET /health   — para gente. Detalha dependências.
 *   GET /ready    — para o balanceador. 200 só quando consegue PERSISTIR.
 *
 * A separação entre os dois é o ponto. `/health` responde "como estou";
 * `/ready` responde "pode me mandar tráfego". Um processo vivo que não grava
 * está saudável como processo e inútil como destino — e é exatamente o caso em
 * que um health check único manda a operação para o buraco.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadPlatformConfig, describe, ConfigError } from "../config/platform-config";
import { lerModoDaInstancia } from "../config/modo-da-instancia";
import { runMigrations } from "../migrations/runner";
import { diretorioDeMigrations } from "../migrations/localizar";
import { createPgClient } from "../persistence/sql-client";
import {
  PgDeviceRegistry,
  PgFactSink,
  PgInboxRepository,
  PgOutboxRepository,
  PgTransactionalWriter,
} from "../persistence/pg-repositories";
import { lerSegredo, SegredoAusente } from "../auth/device-token";
import { carregarCatalogo, ContratoIndisponivel } from "../contracts/event-schema";
import type { SourceMode } from "../contracts/event-catalog";
import { tratarLoteGps, ROTA_INGESTAO } from "../runtime/rota-ingestao";
import { tratarSessaoDeAparelho, ROTA_SESSAO } from "../runtime/rota-sessao";
import { CriticalRuntime } from "../runtime/critical";
import type { FactSink } from "../persistence/platform-uow";

async function main(): Promise<void> {
  let cfg;
  let modoDaInstancia: SourceMode;
  try {
    cfg = loadPlatformConfig();
    // O modo desta instância é DECLARADO, nunca presumido (Q-017): ausente,
    // vazio ou fora de real|simulated|control recusa o boot aqui — antes de
    // conexão, migration ou porta. Uma instância de simulação esquecida
    // ligada gravaria histórico como se fosse a rua, e desde a Q-016 esse
    // carimbo é durável e governa o replay.
    modoDaInstancia = lerModoDaInstancia();
  } catch (e) {
    // Fail-closed: configuração ruim não vira "sobe assim mesmo".
    if (e instanceof ConfigError) {
      console.error(`[critico] configuração recusada: ${e.message}`);
      process.exit(78); // EX_CONFIG
    }
    throw e;
  }

  // O modo aparece no boot: é o que esta instância está autorizada a gravar
  // como natureza de cada fato, e decisão que não aparece no boot é decisão
  // que ninguém revisa.
  console.log("[critico] iniciando", JSON.stringify({ ...describe(cfg), source_mode: modoDaInstancia }));

  const cliente = await createPgClient({
    url: cfg.database_url,
    ssl: cfg.database_ssl,
    host_privado: cfg.database_private_host,
    max: 10,
  });

  if (cfg.migrate_on_boot) {
    const r = await runMigrations(cliente, diretorioDeMigrations());
    if (r.mismatch) {
      console.error(
        `[critico] migration divergente: ${r.mismatch.version} ` +
          `(registrado ${r.mismatch.esperado}, arquivo ${r.mismatch.encontrado})`,
      );
      await cliente.close();
      process.exit(78);
    }
    console.log(
      `[critico] migrations: ${r.applied.length} aplicada(s), ${r.skipped.length} já estavam`,
    );
  }

  const outbox = new PgOutboxRepository(cliente);
  const inbox = new PgInboxRepository(cliente);

  const facts: FactSink = new PgFactSink(cliente);

  // A ponte. `PgTransactionalWriter` grava fato e mensagem na MESMA transação;
  // o registro decide revogação a cada requisição.
  const escritor = new PgTransactionalWriter(cliente);
  const registro = new PgDeviceRegistry(cliente);

  // Falha fechada: o contrato de eventos é lido em RUNTIME pela rota de
  // ingestão, e sem ele NENHUM lote de GPS é aceito. Sem esta checagem o
  // processo sobe, responde `/ready` 200 e devolve 503 em tudo — medido em
  // PB19-D3b, com duas linhas de log e nenhuma sobre o 503. Um servidor que
  // se declara pronto enquanto a função operacional está estruturalmente
  // incapaz de funcionar é pior que um servidor que não sobe.
  //
  // Carregar aqui também AQUECE o cache: o primeiro lote em campo não paga
  // leitura de disco, e um contrato que só seria lido sob carga passa a ser
  // lido no boot, onde a falha é barata.
  try {
    const catalogo = carregarCatalogo();
    console.log(
      "[critico] contrato de eventos",
      JSON.stringify({ versao: catalogo.version, tipos: Object.keys(catalogo.$defs).length }),
    );
  } catch (e) {
    if (e instanceof ContratoIndisponivel) {
      console.error(`[critico] contrato de eventos ${e.motivo}: ${e.message}`);
      await cliente.close();
      process.exit(78);
    }
    throw e;
  }

  // Falha fechada: sem segredo, nenhum aparelho consegue autenticar, e subir
  // assim daria a impressão de um servidor pronto que recusa tudo em campo.
  let segredoDeDispositivo: string;
  try {
    segredoDeDispositivo = lerSegredo();
  } catch (e) {
    if (e instanceof SegredoAusente) {
      console.error(`[critico] ${e.message}`);
      await cliente.close();
      process.exit(78);
    }
    throw e;
  }

  const runtime = new CriticalRuntime({
    identity: { version: cfg.version, commit: cfg.commit, instance_id: cfg.instance_id },
    facts,
    outbox,
    inbox,
    // A sonda ESCREVE, e não apenas conecta. `SELECT 1` passa com o disco
    // cheio e com a réplica em modo somente leitura — os dois cenários em que
    // o crítico precisa dizer "bloqueado" e não "saudável".
    probeStorage: async () => {
      try {
        await cliente.query(
          `INSERT INTO platform.schema_migration (version, checksum)
           VALUES ('probe:escrita', 'probe')
           ON CONFLICT (version) DO UPDATE SET applied_at = now()`,
        );
        return true;
      } catch {
        return false;
      }
    },
  });

  const responder = (res: ServerResponse, status: number, corpo: unknown): void => {
    const texto = JSON.stringify(corpo);
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(texto);
  };

  const servidor = createServer((req: IncomingMessage, res: ServerResponse) => {
    const rota = (req.url ?? "/").split("?")[0];

    if (rota === "/health") {
      void runtime
        .health()
        .then((h) => responder(res, h.state === "healthy" ? 200 : 503, h))
        .catch(() => responder(res, 503, { state: "unavailable", summary: "falha ao apurar saúde" }));
      return;
    }

    if (rota === "/ready") {
      void runtime
        .health()
        .then((h) => {
          // `degraded` responde 200: o crítico degradado por ausência do
          // consumidor assíncrono continua atendendo a rua, e tirá-lo do
          // balanceador seria derrubar a operação por causa de um backlog.
          const pronto = runtime.accepting && (h.state === "healthy" || h.state === "degraded");
          responder(res, pronto ? 200 : 503, { ready: pronto, state: h.state, summary: h.summary });
        })
        .catch(() => responder(res, 503, { ready: false, state: "unavailable" }));
      return;
    }

    // O corpo é lido aqui e a decisão mora em `rota-*.ts`. O servidor fica
    // com socket e resposta; a cadeia inteira é testável sem HTTP.
    const lerCorpo = (limite: number, depois: (corpo: unknown) => void): void => {
      let bruto = "";
      req.on("data", (c: Buffer) => {
        bruto += c.toString("utf8");
        // Corpo sem limite é como uma requisição vira incidente de memória.
        if (bruto.length > limite) req.destroy();
      });
      req.on("end", () => {
        let corpo: unknown;
        try {
          corpo = JSON.parse(bruto || "{}");
        } catch {
          responder(res, 400, { classe: "contrato_invalido", detalhe: "corpo não é JSON" });
          return;
        }
        depois(corpo);
      });
    };

    if (rota === ROTA_SESSAO && req.method === "POST") {
      // Bootstrap e renovação da credencial do aparelho. O segredo do
      // aparelho entra aqui e não sai em log nem em resposta; o token sai só
      // no corpo do 200.
      lerCorpo(16_000, (corpo) => {
        void tratarSessaoDeAparelho(corpo, {
          segredo: segredoDeDispositivo,
          registro,
          agora: () => new Date(),
        })
          .then((r) => responder(res, r.status, r.corpo))
          .catch(() => responder(res, 503, { classe: "falha_de_persistencia", retentavel: true }));
      });
      return;
    }

    if (rota === ROTA_INGESTAO && req.method === "POST") {
      lerCorpo(2_000_000, (corpo) => {
        void tratarLoteGps(
          req.headers as Record<string, string | undefined>,
          corpo,
          {
            segredo: segredoDeDispositivo,
            registro,
            escritor,
            agora: () => new Date(),
            source_mode: modoDaInstancia,
          },
        )
          .then((r) => responder(res, r.status, r.corpo))
          // Erro inesperado NUNCA vira 200. O aparelho precisa poder reenviar.
          .catch(() => responder(res, 503, { classe: "falha_de_persistencia", retentavel: true }));
      });
      return;
    }

    responder(res, 404, { error: "rota desconhecida" });
  });

  servidor.listen(cfg.port, cfg.host, () => {
    console.log(`[critico] ouvindo em ${cfg.host}:${cfg.port}`);
  });

  const encerrar = (sinal: string) => {
    console.log(`[critico] ${sinal} recebido, encerrando`);
    void runtime
      .stop(cfg.shutdown_timeout_ms, async () => {
        await new Promise<void>((r) => servidor.close(() => r()));
        await cliente.close();
      })
      .then((r) => {
        console.log(`[critico] encerrado ${r.graceful ? "graciosamente" : `à força: ${r.reason}`}`);
        process.exit(r.graceful ? 0 : 1);
      });
  };

  process.on("SIGTERM", () => encerrar("SIGTERM"));
  process.on("SIGINT", () => encerrar("SIGINT"));
}

void main().catch((e) => {
  console.error("[critico] falha fatal no boot:", e);
  process.exit(1);
});
