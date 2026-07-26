/**
 * Auditoria da composição da plataforma híbrida.
 *
 * Docker NÃO existe nesta máquina, então `docker compose config` não pode ser
 * a prova. Estes testes são o substituto honesto: leem os arquivos e afirmam
 * os invariantes que importam. Eles NÃO provam que a composição sobe — provam
 * que ela não contradiz a arquitetura.
 *
 * A distinção é o ponto. Um arquivo que passa aqui ainda pode falhar no
 * `docker build`; o que ele não pode é publicar o banco na internet, juntar os
 * dois runtimes num processo só, ou aplicar schema em N réplicas ao mesmo
 * tempo. Isso é verificável sem Docker, e é o que está verificado.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function read(rel: string): string {
  const p = join(ROOT, rel);
  assert.ok(existsSync(p), `arquivo ausente: ${rel}`);
  return readFileSync(p, "utf8");
}

const compose = read("deploy/compose.platform.yaml");
const dockerfile = read("deploy/Dockerfile.platform");
const envExample = read("deploy/.env.platform.example");

/** Remove comentários para medir a CONFIGURAÇÃO, e não a prosa que a explica. */
function semComentarios(texto: string): string {
  return texto
    .split("\n")
    .map((l) => {
      const t = l.trimStart();
      return t.startsWith("#") ? "" : l;
    })
    .join("\n");
}

const composeCode = semComentarios(compose);
const dockerCode = semComentarios(dockerfile);

/** Bloco de um serviço, por indentação. */
function servico(nome: string): string {
  const linhas = composeCode.split("\n");
  const ini = linhas.findIndex((l) => l.trimEnd() === `  ${nome}:`);
  assert.ok(ini >= 0, `serviço não encontrado: ${nome}`);
  const out: string[] = [];
  for (let i = ini + 1; i < linhas.length; i += 1) {
    const l = linhas[i];
    if (l.trim() && !l.startsWith("    ")) break;
    out.push(l);
  }
  return out.join("\n");
}

console.log("=== Auditoria da composição da plataforma (Docker ausente) ===");

/* ------------------------------------------------------------------ *
 * Arquivos e serviços
 * ------------------------------------------------------------------ */

test("os arquivos da composição existem", () => {
  for (const f of [
    "deploy/compose.platform.yaml",
    "deploy/Dockerfile.platform",
    "deploy/.env.platform.example",
    ".dockerignore",
  ]) {
    assert.ok(existsSync(join(ROOT, f)), `falta ${f}`);
  }
});

test("os cinco serviços da arquitetura estão declarados", () => {
  for (const s of [
    "deliveryos-postgres",
    "deliveryos-migrate",
    "deliveryos-critical",
    "deliveryos-async",
    "deliveryos-backup",
  ]) {
    assert.match(composeCode, new RegExp(`^  ${s}:`, "m"), `serviço ausente: ${s}`);
  }
});

test("crítico e assíncrono são processos SEPARADOS, com comandos diferentes", () => {
  // É a arquitetura inteira: mesmo código, ciclos de vida distintos. Um
  // serviço só, com os dois papéis dentro, faria a queda do worker levar a
  // rua junto — e nenhum teste de unidade pegaria isso.
  assert.match(servico("deliveryos-critical"), /bin\/critical\.js/);
  assert.match(servico("deliveryos-async"), /bin\/async-runtime\.js/);
  assert.ok(
    !servico("deliveryos-critical").includes("async-runtime.js"),
    "o crítico não pode executar o worker",
  );
  assert.ok(
    !servico("deliveryos-async").includes("critical.js"),
    "o worker não pode executar o crítico",
  );
});

test("os dois runtimes vêm da MESMA imagem", () => {
  // Duas imagens separadas colocariam duas versões do mesmo código no ar ao
  // mesmo tempo, que é a origem de "funciona no crítico e falha no worker".
  assert.match(composeCode, /x-imagem: &imagem/);
  for (const s of ["deliveryos-critical", "deliveryos-async", "deliveryos-migrate"]) {
    assert.match(servico(s), /<<: \*imagem/, `${s} não reusa a imagem comum`);
  }
});

/* ------------------------------------------------------------------ *
 * Exposição de rede
 * ------------------------------------------------------------------ */

test("NENHUM serviço publica porta no host", () => {
  // `ports:` é o que abre para fora. Numa VM com IP público, publicar o
  // PostgreSQL é entregar o banco para a internet — e é um erro de uma linha.
  assert.ok(
    !/^\s{4}ports:/m.test(composeCode),
    "há `ports:` na composição: algum serviço está publicado no host",
  );
});

test("o PostgreSQL usa expose, e não ports", () => {
  const pg = servico("deliveryos-postgres");
  assert.match(pg, /expose:/);
  assert.ok(!/ports:/.test(pg), "o banco não pode ser publicado");
});

test("o crítico expõe 8080 apenas na rede interna", () => {
  const c = servico("deliveryos-critical");
  assert.match(c, /expose:/);
  assert.match(c, /"8080"/);
  assert.ok(!/ports:/.test(c));
});

test("o worker assíncrono não expõe porta nenhuma", () => {
  const a = servico("deliveryos-async");
  assert.ok(!/expose:/.test(a) && !/ports:/.test(a), "o worker não escuta nada");
});

test("todos os serviços estão na mesma rede privada", () => {
  const ocorrencias = (composeCode.match(/networks: \[interna\]/g) ?? []).length;
  assert.ok(ocorrencias >= 5, `esperava 5 serviços na rede interna, achei ${ocorrencias}`);
});

/* ------------------------------------------------------------------ *
 * Ordem de subida e migrations
 * ------------------------------------------------------------------ */

test("migrate roda uma vez e sai — não é serviço de longa duração", () => {
  const m = servico("deliveryos-migrate");
  assert.match(m, /restart: "no"/);
  assert.match(m, /migrate\.js/);
});

test("nenhum runtime aplica schema no boot", () => {
  // N réplicas subindo juntas correriam a mesma migration ao mesmo tempo, e
  // um deploy viraria corrida. O passo é explícito, e é o serviço `migrate`.
  for (const s of ["deliveryos-critical", "deliveryos-async"]) {
    const bloco = servico(s);
    assert.ok(
      !/DELIVERYOS_MIGRATE_ON_BOOT: "true"/.test(bloco),
      `${s} aplicaria migration no boot`,
    );
  }
  assert.match(composeCode, /DELIVERYOS_MIGRATE_ON_BOOT: "false"/);
});

test("os runtimes só sobem DEPOIS da migration ter terminado bem", () => {
  for (const s of ["deliveryos-critical", "deliveryos-async"]) {
    assert.match(
      servico(s),
      /deliveryos-migrate:\s*\n\s*condition: service_completed_successfully/,
      `${s} não espera a migration concluir`,
    );
  }
});

test("tudo espera o banco ficar SAUDÁVEL, não apenas iniciado", () => {
  // `service_started` volta assim que o container existe — antes de o
  // PostgreSQL aceitar conexão. A diferença aparece como falha de boot
  // intermitente, que é o pior tipo de falha para diagnosticar.
  const alvos = ["deliveryos-migrate", "deliveryos-critical", "deliveryos-async"];
  for (const s of alvos) {
    assert.match(servico(s), /deliveryos-postgres:\s*\n\s*condition: service_healthy/, s);
  }
});

test("o healthcheck do banco identifica usuário e base", () => {
  assert.match(servico("deliveryos-postgres"), /pg_isready -U .+ -d /);
});

/* ------------------------------------------------------------------ *
 * Saúde e encerramento
 * ------------------------------------------------------------------ */

test("o healthcheck do crítico consulta /ready, e não /health", () => {
  // A pergunta do orquestrador é "posso mandar tráfego", e ela só é sim
  // quando o processo consegue persistir.
  const c = servico("deliveryos-critical");
  assert.match(c, /\/ready/);
  assert.ok(!/8080\/health/.test(c), "o healthcheck não pode usar /health");
});

test("há prazo de encerramento gracioso nos dois runtimes", () => {
  assert.match(servico("deliveryos-critical"), /stop_grace_period: \d+s/);
  const a = servico("deliveryos-async");
  const prazo = /stop_grace_period: (\d+)s/.exec(a);
  assert.ok(prazo, "o worker precisa de prazo de encerramento");
  // Job interrompido volta pelo lease, mas retrabalho sobre efeito externo
  // pode duplicar — o worker merece prazo maior que o do crítico.
  assert.ok(Number(prazo[1]) >= 30, `prazo curto demais no worker: ${prazo[1]}s`);
});

test("o Dockerfile encaminha sinais pelo PID 1", () => {
  // Sem isso, SIGTERM do `docker stop` não chega ao Node e o encerramento
  // gracioso nunca roda.
  assert.match(dockerCode, /dumb-init/);
  assert.match(dockerCode, /ENTRYPOINT \["dumb-init", "--"\]/);
});

test("o Dockerfile NÃO define CMD — cada serviço declara o seu", () => {
  assert.ok(
    !/^CMD /m.test(dockerCode),
    "um CMD padrão faria erro de configuração subir o processo errado em silêncio",
  );
});

/* ------------------------------------------------------------------ *
 * Build da imagem
 * ------------------------------------------------------------------ */

test("o build copia as migrations para dist/", () => {
  // O `tsc` ignora .sql. Sem esta linha a imagem sobe sem schema e, pior,
  // conclui que não há migration pendente.
  assert.match(dockerCode, /copiar_migrations\.js/);
});

test("o prune preserva dependências de runtime", () => {
  assert.match(dockerCode, /npm prune --omit=dev/);
  assert.ok(
    !/npm prune --production --omit=optional/.test(dockerCode),
    "o driver do banco não pode ser removido no prune",
  );
});

test("a imagem roda sem privilégio", () => {
  assert.match(dockerCode, /USER node/);
  const semPrivilegio = (composeCode.match(/no-new-privileges:true/g) ?? []).length;
  assert.ok(semPrivilegio >= 4, `esperava no-new-privileges em 4+ serviços, achei ${semPrivilegio}`);
});

test("os runtimes têm sistema de arquivos somente leitura", () => {
  for (const s of ["deliveryos-critical", "deliveryos-async", "deliveryos-migrate"]) {
    assert.match(servico(s), /read_only: true/, `${s} deveria ser somente leitura`);
    assert.match(servico(s), /tmpfs:/, `${s} precisa de /tmp gravável`);
  }
});

/* ------------------------------------------------------------------ *
 * Dados e segredos
 * ------------------------------------------------------------------ */

test("o banco tem volume nomeado — recriar o container não apaga dado", () => {
  assert.match(servico("deliveryos-postgres"), /pgdados:\/var\/lib\/postgresql\/data/);
  assert.match(composeCode, /name: deliveryos-platform-pgdados/);
});

test("o backup escreve em volume SEPARADO do banco", () => {
  // Backup no mesmo volume desaparece junto com o que deveria proteger.
  assert.match(servico("deliveryos-backup"), /pgbackups:\/backups/);
  assert.ok(!servico("deliveryos-backup").includes("pgdados:"), "backup no volume do banco");
});

test("a senha do banco é obrigatória e vem do ambiente", () => {
  // `:?` faz o compose RECUSAR subir sem a variável, em vez de gerar um
  // ambiente pela metade com senha padrão.
  assert.match(composeCode, /POSTGRES_PASSWORD:\?/);
  assert.match(composeCode, /DELIVERYOS_COMMIT:\?/);
});

test("não há segredo literal no compose nem no exemplo de ambiente", () => {
  const suspeitos = [
    /password\s*[:=]\s*["']?[A-Za-z0-9!@#$%^&*()_+-]{8,}/i,
    /secret\s*[:=]\s*["']?[A-Za-z0-9]{12,}/i,
    /token\s*[:=]\s*["']?[A-Za-z0-9]{16,}/i,
  ];
  for (const re of suspeitos) {
    assert.ok(!re.test(composeCode), `possível segredo literal no compose: ${re}`);
  }
  // O exemplo precisa ter a variável VAZIA — preenchê-la viraria credencial
  // versionada no Git.
  assert.match(envExample, /^POSTGRES_PASSWORD=\s*$/m);
  assert.match(envExample, /^DELIVERYOS_COMMIT=\s*$/m);
});

test("o .env real está fora do Git", () => {
  const gitignore = read(".gitignore");
  assert.ok(
    /(^|\/)\.env$/m.test(gitignore) || /deploy\/\.env/.test(gitignore) || /\*\*\/\.env/.test(gitignore),
    ".gitignore não protege deploy/.env",
  );
});

/* ------------------------------------------------------------------ *
 * Fuso e honestidade do arquivo
 * ------------------------------------------------------------------ */

test("o container do banco fixa UTC", () => {
  // Todo carimbo do schema é TIMESTAMPTZ. Deixar o fuso ao acaso do host é
  // como um relatório muda de números quando alguém troca a máquina.
  const pg = servico("deliveryos-postgres");
  assert.match(pg, /TZ: UTC/);
  assert.match(pg, /PGTZ: UTC/);
});

test("os arquivos declaram que NÃO foram executados nesta máquina", () => {
  // Sem esta declaração, alguém lê a composição e conclui que ela já rodou.
  assert.match(compose, /NÃO EXECUTADO NESTA MÁQUINA/);
  assert.match(dockerfile, /NÃO CONSTRUÍDO NESTA MÁQUINA/);
});

test("o exemplo de ambiente explica que remoto exige TLS", () => {
  assert.match(envExample, /DELIVERYOS_DATABASE_SSL=true/);
});

if (failures.length) {
  console.error(`\n=== ${failures.length} FALHA(S) ===`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`\n=== ${passed} platform-deploy-audit tests OK ===`);
