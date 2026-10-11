/**
 * Verifica se um PostgreSQL qualquer serve para o DeliveryOS.
 *
 * Roda contra o banco que estiver em `DELIVERYOS_DATABASE_URL` — o container
 * local, um Supabase, um RDS, um Postgres numa VM. Não sabe nem se importa com
 * quem hospeda: pergunta ao banco se ele atende ao que a plataforma precisa.
 *
 * É o que torna "trocar de provedor" uma decisão, e não uma aventura. Antes de
 * apontar a produção para um banco novo, este comando responde se ele serve —
 * em segundos, sem migrar nada e sem gravar dado de operação.
 *
 *   DELIVERYOS_DATABASE_URL=postgres://... npm run verificar:banco
 *
 * Sai com 0 quando serve, 1 quando não serve, e diz exatamente o que faltou.
 */

import { createPgClient, dispensadoDeTls, isLocalUrl, type SqlRow } from "../persistence/sql-client";
import { diretorioDeMigrations } from "../migrations/localizar";
import { loadMigrations } from "../migrations/runner";
import { evaluateDatabasePreflight, readDatabasePreflightFacts } from "../database-preflight";

interface Achado {
  nome: string;
  ok: boolean;
  detalhe: string;
  /** false quando é recomendação, e não requisito. */
  bloqueante: boolean;
}

const VERSAO_MINIMA = 14;

async function main(): Promise<void> {
  const url = process.env.DELIVERYOS_DATABASE_URL;
  if (!url) {
    console.error("DELIVERYOS_DATABASE_URL não definida.");
    console.error("  DELIVERYOS_DATABASE_URL=postgres://usuario:senha@host:5432/base");
    process.exit(2);
  }

  const local = isLocalUrl(url);
  const privateHost = (process.env.DELIVERYOS_DATABASE_PRIVATE_HOST || "").trim();
  const tlsRequired = !dispensadoDeTls(url, privateHost);
  const ssl = process.env.DELIVERYOS_DATABASE_SSL
    ? process.env.DELIVERYOS_DATABASE_SSL === "true"
    : !local;

  console.log("=== Verificação de compatibilidade do PostgreSQL ===");
  try {
    const u = new URL(url);
    // Sem usuário e sem senha: este comando costuma rodar em terminal
    // compartilhado e sua saída costuma ser colada em conversa.
    console.log(`alvo: ${u.protocol}//${u.hostname}:${u.port || "5432"}${u.pathname}`);
  } catch {
    console.error("URL inválida.");
    process.exit(2);
  }

  const achados: Achado[] = [];
  const cliente = await createPgClient({
    url,
    ssl,
    host_privado: privateHost,
    max: 2,
    statementTimeoutMs: 20_000,
  });

  try {
    /* ---------------------------------------------------------------- */

    const versao = await cliente.query<SqlRow>("SHOW server_version");
    const bruta = String(versao[0]?.server_version ?? "0");
    const major = Number.parseInt(bruta.split(".")[0], 10);
    achados.push({
      nome: "versão do servidor",
      ok: major >= VERSAO_MINIMA,
      detalhe: `${bruta} (mínimo ${VERSAO_MINIMA})`,
      bloqueante: true,
    });

    /* ---------------------------------------------------------------- */

    const criptografado = await cliente.query<SqlRow>(
      `SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()`,
    );
    const temTls = criptografado[0]?.ssl === true;
    achados.push({
      nome: "conexão criptografada",
      // Localhost e o host privado EXPLICITAMENTE declarado podem dispensar
      // TLS. Fora dessas duas fronteiras, transporte em claro é bloqueante.
      ok: temTls || !tlsRequired,
      detalhe: temTls
        ? "TLS ativo"
        : local
          ? "local, dispensado"
          : !tlsRequired
            ? "rede privada declarada, dispensado"
            : "SEM TLS",
      bloqueante: tlsRequired,
    });

    /* ---------------------------------------------------------------- */

    const podeCriar = await cliente.query<SqlRow>(
      `SELECT has_database_privilege(current_user, current_database(), 'CREATE') AS pode`,
    );
    achados.push({
      nome: "permissão para criar schema",
      ok: podeCriar[0]?.pode === true,
      detalhe: podeCriar[0]?.pode === true ? "concedida" : "negada — as migrations não rodam",
      bloqueante: true,
    });

    /* ---------------------------------------------------------------- */

    // A trigger de append-only é escrita em PL/pgSQL. Um banco sem a
    // linguagem aceita a migration até a trigger e falha no meio — deixando
    // metade do schema aplicado.
    const plpgsql = await cliente.query<SqlRow>(
      `SELECT count(*)::int AS n FROM pg_language WHERE lanname = 'plpgsql'`,
    );
    achados.push({
      nome: "PL/pgSQL disponível",
      ok: Number(plpgsql[0]?.n) > 0,
      detalhe: Number(plpgsql[0]?.n) > 0 ? "presente" : "AUSENTE — a trigger append-only não instala",
      bloqueante: true,
    });

    /* ---------------------------------------------------------------- */

    const jsonb = await cliente.query<SqlRow>(
      `SELECT '{"a":1}'::jsonb ->> 'a' AS v`,
    );
    achados.push({
      nome: "JSONB operacional",
      ok: jsonb[0]?.v === "1",
      detalhe: jsonb[0]?.v === "1" ? "ok" : "falhou",
      bloqueante: true,
    });

    /* ---------------------------------------------------------------- */

    // SKIP LOCKED precisa FUNCIONAR: a sonda antiga usava VALUES, que o
    // PostgreSQL aceita a sintaxe sobre VALUES, mas esse SELECT não demonstra
    // bloqueio de uma linha real. Pior: outros erros eram rotulados como
    // "sintaxe aceita", sem distinguir falha da prova de compatibilidade.
    // Teste real em tabela TEMPORÁRIA da sessão: não lê, altera nem migra
    // qualquer tabela de operação; ON COMMIT DROP limpa o artefato.
    // A conexão tem de ser a MESMA durante CREATE, INSERT e SELECT.
    let skipLocked = false;
    let detalheSkip = "não verificado";
    try {
      await cliente.transaction(async (tx) => {
        await tx.query(
          "CREATE TEMP TABLE deliveryos_preflight_skip_locked " +
          "(probe_key integer PRIMARY KEY) ON COMMIT DROP",
        );
        await tx.query(
          "INSERT INTO pg_temp.deliveryos_preflight_skip_locked(probe_key) VALUES (1)",
        );
        const locked = await tx.query<{ probe_key: number }>(
          "SELECT probe_key FROM pg_temp.deliveryos_preflight_skip_locked " +
          "WHERE probe_key = 1 FOR UPDATE SKIP LOCKED",
        );
        if (locked.length !== 1 || Number(locked[0]?.probe_key) !== 1) {
          throw new Error("a consulta bloqueável não devolveu a linha de prova");
        }
      });
      skipLocked = true;
      detalheSkip = "executado com sucesso em tabela temporária; sem dado operacional";
    } catch (e) {
      // Falha no TEMP também impede provar a capacidade. NÃO afirmar que o
      // servidor não tem o recurso: a sonda pode estar sem permissão TEMP.
      const codigo = (e as { code?: string })?.code;
      detalheSkip = "capacidade NÃO comprovada" +
        (typeof codigo === "string" ? " (SQLSTATE " + codigo + ")" : "") +
        " — verificar suporte e permissão TEMP da credencial migradora";
    }
    achados.push({
      nome: "FOR UPDATE SKIP LOCKED",
      ok: skipLocked,
      detalhe: detalheSkip,
      bloqueante: true,
    });

    /* ---------------------------------------------------------------- */

    const fuso = await cliente.query<SqlRow>("SHOW timezone");
    const tz = String(fuso[0]?.TimeZone ?? fuso[0]?.timezone ?? "?");
    achados.push({
      nome: "fuso do servidor",
      // Todo carimbo do schema é TIMESTAMPTZ, então o fuso do servidor não
      // altera o instante armazenado. Mas ele muda o que aparece em consulta
      // manual — e é assim que uma investigação erra o horário do turno.
      ok: /UTC|Etc\/UTC/i.test(tz),
      detalhe: `${tz} (recomendado UTC — não altera o dado, altera o que você lê)`,
      bloqueante: false,
    });

    /* ---------------------------------------------------------------- */

    const conexoes = await cliente.query<SqlRow>("SHOW max_connections");
    const max = Number(conexoes[0]?.max_connections ?? 0);
    achados.push({
      nome: "conexões disponíveis",
      // O crítico pede 10 e o assíncrono 5. Com margem para migration,
      // backup e uma sessão humana, abaixo de 25 o piloto trava sob pressão.
      ok: max >= 25,
      detalhe: `${max} (crítico usa 10, assíncrono 5; abaixo de 25 aperta)`,
      bloqueante: false,
    });

    /* ---------------------------------------------------------------- */

    const facts = await readDatabasePreflightFacts(cliente);
    const schema = evaluateDatabasePreflight({
      facts,
      local_migrations: loadMigrations(diretorioDeMigrations()),
      tls_required: tlsRequired,
    });

    achados.push({
      nome: "credencial de migration",
      ok: !schema.issues.some((x) => /papel de runtime/.test(x)),
      detalhe: schema.issues.find((x) => /papel de runtime/.test(x)) ??
        `${facts.current_user} não é papel de runtime`,
      bloqueante: true,
    });
    achados.push({
      nome: "drift de migrations",
      ok: schema.unknown_migrations.length === 0 && schema.checksum_mismatches.length === 0,
      detalhe: schema.unknown_migrations.length
        ? `migration desconhecida no banco: ${schema.unknown_migrations.join(", ")}`
        : schema.checksum_mismatches.length
          ? `checksum divergente: ${schema.checksum_mismatches.map((x) => x.version).join(", ")}`
          : "sem versão futura nem checksum divergente",
      bloqueante: true,
    });

    if (facts.applied_migrations.length) {
      console.log(
        `\nmigrations já aplicadas: ${facts.applied_migrations.map((x) => x.version).join(", ")}`,
      );
    } else {
      console.log("\nbanco ainda sem schema do DeliveryOS — rode `npm run migrate`");
    }
    if (schema.pending_migrations.length) {
      console.log(`migrations pendentes: ${schema.pending_migrations.join(", ")}`);
    } else {
      console.log("schema do checkout atual: completo");
    }
  } finally {
    await cliente.close();
  }

  console.log("");
  for (const a of achados) {
    const marca = a.ok ? "  ok  " : a.bloqueante ? " FALHA" : " aviso";
    console.log(`${marca}  ${a.nome.padEnd(28)} ${a.detalhe}`);
  }

  const bloqueios = achados.filter((a) => !a.ok && a.bloqueante);
  const avisos = achados.filter((a) => !a.ok && !a.bloqueante);

  console.log("");
  if (bloqueios.length) {
    console.error(
      `Este banco NÃO serve: ${bloqueios.length} requisito(s) não atendido(s) — ` +
        bloqueios.map((b) => b.nome).join(", "),
    );
    process.exit(1);
  }
  console.log(
    avisos.length
      ? `Este banco serve, com ${avisos.length} aviso(s): ${avisos.map((a) => a.nome).join(", ")}`
      : "Este banco serve.",
  );
}

void main().catch((e) => {
  console.error("verificação falhou:", e instanceof Error ? e.message : e);
  process.exit(1);
});
