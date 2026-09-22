#!/usr/bin/env node
/**
 * Controle positivo do PB19: a imagem íntegra aceita um lote de GPS de verdade.
 *
 * Roda com `cwd` na RAIZ FIEL À IMAGEM (só `dist/`, `node_modules/`,
 * `package.json`) e só usa o que está ali — é isso que torna o resultado uma
 * afirmação sobre o artefato, e não sobre o checkout.
 *
 * Existe como ferramenta separada, e não dentro do gate, porque precisa ser
 * executado COM OUTRO `cwd`. Um teste que troca o próprio diretório de
 * trabalho contamina os testes seguintes da mesma suíte.
 *
 * Imprime linhas `CHAVE=valor` para o gate afirmar sobre elas. Nunca "parece
 * que funcionou": `ACEITOS=` vem de contagem no banco, não da resposta HTTP.
 */

const { spawn, execFileSync } = require("node:child_process");
const { join } = require("node:path");

const URL_PG = (process.env.DELIVERYOS_PG_URL || "").trim();
const SEGREDO = (process.env.PB19_SEGREDO || "").trim();
if (!URL_PG || !SEGREDO) {
  console.error("PULADO: DELIVERYOS_PG_URL e PB19_SEGREDO são obrigatórios");
  process.exit(2);
}

const PORTA = 8300 + Math.floor(Math.random() * 400);
const SUFIXO = Math.random().toString(36).slice(2, 8);
const UNIDADE = `PB19${SUFIXO}`.toUpperCase();
const APARELHO = `dev-${SUFIXO}`;
const VIAGEM = `t-${SUFIXO}`;

function sql(comando) {
  return execFileSync("psql", [URL_PG, "-At", "-c", comando], { encoding: "utf8" }).trim();
}

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // Identidade própria por execução: duas rodadas em paralelo não disputam a
  // mesma linha, e nenhuma depende de semente deixada por outra suíte.
  sql(
    `INSERT INTO identity.unit(unit_id,display_name) VALUES('${UNIDADE}','PB19') ON CONFLICT DO NOTHING;
     INSERT INTO identity.actor(actor_id,unit_id,role,label) VALUES('a-${SUFIXO}','${UNIDADE}','motoboy_interno','PB19') ON CONFLICT DO NOTHING;
     INSERT INTO identity.device(device_id,unit_id,actor_id,label) VALUES('${APARELHO}','${UNIDADE}','a-${SUFIXO}','PB19') ON CONFLICT DO NOTHING;`,
  );

  const { emitirToken } = require(join(process.cwd(), "dist/src/platform/auth/device-token.js"));
  const token = emitirToken({
    device_id: APARELHO,
    unit_id: UNIDADE,
    issued_by: "gerente",
    agora: new Date(),
    segredo: SEGREDO,
  }).token;

  const filho = spawn(process.execPath, ["dist/src/platform/bin/critical.js"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      DELIVERYOS_ENV: "local",
      DELIVERYOS_DATABASE_URL: URL_PG,
      DELIVERYOS_MIGRATE_ON_BOOT: "false",
      DELIVERYOS_DEVICE_TOKEN_SECRET: SEGREDO,
      DELIVERYOS_PORT: String(PORTA),
    },
  });
  let log = "";
  filho.stdout.on("data", (d) => (log += d.toString()));
  filho.stderr.on("data", (d) => (log += d.toString()));

  try {
    // Espera o crítico declarar que está escutando. Dormir um tempo fixo
    // transformaria máquina lenta em falha de propriedade.
    const limite = Date.now() + 25_000;
    while (Date.now() < limite && !/ouvindo em/.test(log)) {
      if (filho.exitCode !== null) break;
      await esperar(150);
    }

    const ready = await fetch(`http://127.0.0.1:${PORTA}/ready`).catch(() => null);
    console.log(`READY=${ready ? ready.status : "sem-resposta"}`);

    const ponto = {
      point_id: `p-${SUFIXO}`,
      idempotency_key: `gps:${APARELHO}:${VIAGEM}:1`,
      trip_id: VIAGEM,
      device_id: APARELHO,
      latitude: -23.55,
      longitude: -46.63,
      accuracy_m: 12,
      occurred_at: new Date().toISOString(),
      sequence_local: 1,
      provider: "fused",
      is_mock: false,
    };
    const corpo = { device_id: APARELHO, correlation_id: `pb19-${SUFIXO}`, points: [ponto] };

    const envia = () =>
      fetch(`http://127.0.0.1:${PORTA}/api/gps/batch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });

    const r1 = await envia().catch(() => null);
    console.log(`GPS=${r1 ? r1.status : "sem-resposta"}`);

    // Idempotência: o MESMO lote de novo não pode virar um segundo fato.
    const r2 = await envia().catch(() => null);
    console.log(`GPS_REPETIDO=${r2 ? r2.status : "sem-resposta"}`);

    // Payload inválido: `latitude` como texto passa no envelope e tem de ser
    // recusado pelo CONTRATO — é o que o asset de runtime existe para fazer.
    const ruim = await fetch(`http://127.0.0.1:${PORTA}/api/gps/batch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...corpo,
        correlation_id: `pb19-ruim-${SUFIXO}`,
        points: [{ ...ponto, point_id: `p-ruim-${SUFIXO}`, idempotency_key: `gps:${APARELHO}:${VIAGEM}:9`, latitude: "norte" }],
      }),
    }).catch(() => null);
    const corpoRuim = ruim ? await ruim.text() : "";
    console.log(`GPS_INVALIDO=${ruim ? ruim.status : "sem-resposta"}`);
    console.log(`GPS_INVALIDO_RECUSADO=${/rejected":1|rejeitad|invalid/i.test(corpoRuim) ? "sim" : "nao"}`);

    // A contagem vem do BANCO. A resposta HTTP diz o que o servidor achou; o
    // banco diz o que sobreviveu.
    //
    // MEDIDO: um lote aceito vira linha em `platform.event_log`
    // (`gps_batch_received`) mais uma na outbox. `entregas.gps_point` NÃO é
    // escrita pelo crítico — contá-la dava zero com o lote aceito, que é um
    // falso vermelho pronto para virar falso verde no dia em que alguém
    // "consertasse" a asserção em vez da consulta.
    const aceitos = sql(
      `SELECT count(*) FROM platform.event_log WHERE correlation_id = 'pb19-${SUFIXO}'`,
    );
    console.log(`ACEITOS=${aceitos}`);
    console.log(`READY_FINAL=${(await fetch(`http://127.0.0.1:${PORTA}/ready`).catch(() => null))?.status ?? "sem-resposta"}`);
  } finally {
    filho.kill("SIGTERM");
    await esperar(400);
    if (filho.exitCode === null) filho.kill("SIGKILL");
    if (process.env.PB19_LOG === "1") console.log(log);
  }
}

void main().catch((e) => {
  console.error("PB19_INGESTAO_FALHOU", e && e.message ? e.message : String(e));
  process.exit(1);
});
