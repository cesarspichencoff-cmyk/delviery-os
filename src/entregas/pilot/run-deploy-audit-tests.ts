/**
 * Auditoria da composição de implantação.
 *
 * Docker não está instalado nesta máquina, então `docker compose config` não
 * rodou. Este arquivo verifica o que dá para verificar sem o Docker: que os
 * arquivos existem, que as referências entre eles fecham, e — o que mais
 * importa — que as **regras de exposição** estão no YAML e não só na cabeça
 * de quem escreveu.
 *
 * Ele NÃO substitui `docker compose build`. Substitui a leitura apressada que
 * declara "está pronto" porque o arquivo tem a aparência certa.
 *
 * Parser de YAML próprio, mínimo: o projeto não tem dependência de YAML e
 * acrescentar uma só para o teste seria trocar risco por conveniência.
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DEPLOY = join(ROOT, "deploy");

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

const compose = read("deploy/compose.yaml");
const dockerfile = read("deploy/Dockerfile");
const dockerignore = read(".dockerignore");
const caddyfile = read("deploy/Caddyfile");
const envExample = read("deploy/.env.pilot.example");

/**
 * Extrai o bloco de um serviço do compose por indentação. Suficiente para as
 * asserções deste teste, e sem dependência nova.
 */
function serviceBlock(name: string): string {
  const lines = compose.split("\n");
  const start = lines.findIndex((l) => l.trimEnd() === `  ${name}:`);
  assert.ok(start >= 0, `serviço não encontrado no compose: ${name}`);
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const l = lines[i];
    if (l.trim() && !l.startsWith("    ") && !l.startsWith("  #")) break;
    out.push(l);
  }
  return out.join("\n");
}

/* ------------------------------------------------------------------ *
 * 1. Os arquivos existem e se referenciam
 * ------------------------------------------------------------------ */

test("a composição tem todos os arquivos", () => {
  for (const f of [
    "deploy/Dockerfile",
    "deploy/compose.yaml",
    "deploy/Caddyfile",
    "deploy/.env.pilot.example",
    ".dockerignore",
  ]) {
    assert.ok(existsSync(join(ROOT, f)), `falta ${f}`);
  }
});

test("o compose aponta para o Dockerfile que existe", () => {
  assert.match(compose, /dockerfile:\s*deploy\/Dockerfile/);
  assert.match(compose, /context:\s*\.\./, "contexto precisa ser a raiz do repo");
});

test("o proxy monta o Caddyfile que existe", () => {
  assert.match(compose, /\.\/Caddyfile:\/etc\/caddy\/Caddyfile:ro/);
});

test("a composição usa o nome deliveryos-pilot", () => {
  assert.match(compose, /^name:\s*deliveryos-pilot/m);
});

/* ------------------------------------------------------------------ *
 * 2. Exposição — a regra que mais importa
 * ------------------------------------------------------------------ */

test("SOMENTE o proxy publica portas", () => {
  // Um `ports:` esquecido na API publicaria o serviço sem proxy, sem TLS e
  // sem rate limit. É o erro mais fácil de cometer e o mais caro.
  const comPortas = ["deliveryos-proxy", "deliveryos-api", "deliveryos-backup"].filter((s) =>
    /^\s+ports:/m.test(serviceBlock(s)),
  );
  assert.deepEqual(comPortas, ["deliveryos-proxy"], `serviços publicando porta: ${comPortas}`);
});

test("a API declara expose, não ports", () => {
  const api = serviceBlock("deliveryos-api");
  assert.match(api, /expose:/, "a porta interna precisa estar documentada");
  assert.equal(/^\s+ports:/m.test(api), false);
});

test("nenhuma porta sensível é publicada", () => {
  // 5193/5194 são do Entregas; 5178/5179 são protótipo e v1; 2019 é o admin
  // do Caddy. Nada disso pode aparecer do lado esquerdo de um mapeamento.
  const publicadas = [...compose.matchAll(/^\s+-\s+"(\d+):(\d+)"/gm)].map((m) => m[1]);
  assert.deepEqual(publicadas.sort(), ["443", "80"], `portas publicadas: ${publicadas}`);
  for (const proibida of ["5193", "5194", "5178", "5179", "2019", "5432"]) {
    assert.equal(
      publicadas.includes(proibida),
      false,
      `porta ${proibida} publicada no host`,
    );
  }
});

test("todos os serviços estão na rede privada", () => {
  for (const s of ["deliveryos-proxy", "deliveryos-api", "deliveryos-backup"]) {
    assert.match(serviceBlock(s), /networks:\s*\[interna\]/, `${s} fora da rede interna`);
  }
});

/* ------------------------------------------------------------------ *
 * 3. Persistência declarada
 * ------------------------------------------------------------------ */

test("o volume de dados é nomeado e montado na API", () => {
  assert.match(serviceBlock("deliveryos-api"), /entregas_dados:\/dados/);
  assert.match(compose, /entregas_dados:\s*\n\s+name:\s*deliveryos-pilot-dados/);
});

test("ENTREGAS_DATA_DIR aponta para dentro do volume", () => {
  const api = serviceBlock("deliveryos-api");
  const m = api.match(/ENTREGAS_DATA_DIR:\s*(\S+)/);
  assert.ok(m, "ENTREGAS_DATA_DIR não declarado na API");
  assert.equal(m![1], "/dados", "o diretório de dados precisa ser o ponto de montagem");
});

test("o backup lê o volume somente-leitura", () => {
  // Backup com escrita no volume de dados poderia corromper o que deveria
  // proteger.
  assert.match(serviceBlock("deliveryos-backup"), /entregas_dados:\/dados:ro/);
});

test("configurações externas são montadas somente-leitura", () => {
  assert.match(serviceBlock("deliveryos-api"), /\.\/config:\/config:ro/);
});

/* ------------------------------------------------------------------ *
 * 4. Operação
 * ------------------------------------------------------------------ */

test("todo serviço tem restart policy", () => {
  for (const s of ["deliveryos-proxy", "deliveryos-api", "deliveryos-backup"]) {
    assert.match(serviceBlock(s), /restart:\s*unless-stopped/, `${s} sem restart`);
  }
});

test("proxy e API têm healthcheck", () => {
  for (const s of ["deliveryos-proxy", "deliveryos-api"]) {
    assert.match(serviceBlock(s), /healthcheck:/, `${s} sem healthcheck`);
  }
});

test("a API tem tempo para desligar graciosamente", () => {
  // O SIGINT dispara o backup final. Sem folga, o SIGKILL chega antes.
  assert.match(serviceBlock("deliveryos-api"), /stop_grace_period:\s*30s/);
});

test("a API tem limite de memória e CPU", () => {
  const api = serviceBlock("deliveryos-api");
  assert.match(api, /limits:/);
  assert.match(api, /memory:\s*512M/);
});

test("logs são rotacionados — disco cheio derruba o serviço", () => {
  assert.match(compose, /max-size:\s*"10m"/);
  assert.match(compose, /max-file:\s*"5"/);
});

/* ------------------------------------------------------------------ *
 * 5. Dockerfile
 * ------------------------------------------------------------------ */

test("build em múltiplos estágios: a imagem final não compila nada", () => {
  assert.match(dockerfile, /FROM node:22-bookworm-slim AS build/);
  assert.match(dockerfile, /FROM node:22-bookworm-slim AS runtime/);
  assert.match(dockerfile, /COPY --from=build \/build\/dist \.\/dist/);
});

test("o container roda como usuário não-root", () => {
  assert.match(dockerfile, /^USER node$/m, "sem USER, o processo roda como root");
  const userIdx = dockerfile.indexOf("USER node");
  const cmdIdx = dockerfile.indexOf("CMD ");
  assert.ok(userIdx < cmdIdx, "USER precisa vir antes do CMD");
});

test("o volume pertence ao usuário do processo", () => {
  // Sem chown, o processo não-root não grava no volume e a viagem se perde.
  assert.match(dockerfile, /chown -R node:node \/dados/);
});

test("PID 1 encaminha sinais — senão o desligamento gracioso não roda", () => {
  assert.match(dockerfile, /dumb-init/);
  assert.match(dockerfile, /ENTRYPOINT \["dumb-init", "--"\]/);
});

test("o Dockerfile tem healthcheck próprio", () => {
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /api\/health/);
});

test("a interface estática é copiada — sem ela o console não carrega", () => {
  assert.match(dockerfile, /COPY src\/entregas\/ui \.\/src\/entregas\/ui/);
});

/* ------------------------------------------------------------------ *
 * 6. O que NÃO pode entrar na imagem
 * ------------------------------------------------------------------ */

test(".dockerignore exclui Android, git e node_modules", () => {
  for (const p of ["android", ".git", "node_modules", "dist"]) {
    assert.match(dockerignore, new RegExp(`^${p.replace(".", "\\.")}$`, "m"), `falta excluir ${p}`);
  }
});

test(".dockerignore exclui TODO segredo e certificado", () => {
  for (const p of [
    "deploy/.env",
    "config/entregas-pilot.json",
    "config/entregas-devices.json",
    "\\*.pem",
    "\\*.key",
    "\\*.keystore",
    "\\*.apk",
  ]) {
    assert.match(dockerignore, new RegExp(`^${p}$`, "m"), `falta excluir ${p}`);
  }
});

test("o exemplo de ambiente continua entrando — é documentação, não segredo", () => {
  assert.match(dockerignore, /^!deploy\/\.env\.pilot\.example$/m);
});

test(".dockerignore exclui dados reais e protótipos", () => {
  for (const p of ["data", "prototipos", "app-v1", "docs"]) {
    assert.match(dockerignore, new RegExp(`^${p}$`, "m"), `falta excluir ${p}`);
  }
});

/* ------------------------------------------------------------------ *
 * 7. Proxy
 * ------------------------------------------------------------------ */

test("HTTP redireciona para HTTPS", () => {
  assert.match(caddyfile, /redir https:\/\/\{host\}\{uri\} permanent/);
});

test("o proxy fala com a API pelo nome do serviço, não por IP", () => {
  assert.match(caddyfile, /reverse_proxy deliveryos-api:5193/);
  assert.equal(/reverse_proxy\s+\d+\.\d+\.\d+\.\d+/.test(caddyfile), false, "IP fixo no proxy");
});

test("o domínio é configurável e não está fixo", () => {
  assert.match(caddyfile, /\{\$ENTREGAS_DOMAIN:localhost\}/);
});

test("nenhum certificado público é solicitado nesta missão", () => {
  // `tls internal` emite certificado próprio; não fala com autoridade nenhuma.
  assert.match(caddyfile, /tls internal/);
});

test("lote de GPS tem timeout e corpo maiores que o resto", () => {
  // Sincronização acontece com o motoboy em movimento: timeout curto aqui
  // significa ponto perdido justamente quando a rede está ruim.
  assert.match(caddyfile, /path \/api\/gps\/batch/);
  assert.match(caddyfile, /max_size 10MB/);
  assert.match(caddyfile, /read_timeout 120s/);
  assert.match(caddyfile, /max_size 2MB/, "o resto precisa de limite menor");
});

test("cabeçalhos de segurança presentes", () => {
  for (const h of [
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Content-Security-Policy",
  ]) {
    assert.match(caddyfile, new RegExp(h), `falta ${h}`);
  }
  assert.match(caddyfile, /frame-ancestors 'none'/);
});

/* ------------------------------------------------------------------ *
 * 8. Segredos
 * ------------------------------------------------------------------ */

test("nenhum segredo real nos arquivos de implantação", () => {
  const tudo = [compose, dockerfile, caddyfile, envExample].join("\n");
  assert.equal(/BEGIN (RSA |EC )?PRIVATE KEY/.test(tudo), false);
  // Um token de verdade tem entropia; os exemplos são marcadores óbvios.
  for (const linha of envExample.split("\n")) {
    if (linha.startsWith("ENTREGAS_USERS=")) {
      assert.match(linha, /GERE_UM_TOKEN|GERE_OUTRO_TOKEN|GERE_MAIS_UM/, "exemplo com token real?");
    }
  }
});

test("o exemplo de ambiente não traz domínio nem coordenada real", () => {
  assert.match(envExample, /exemplo\.com\.br/, "o domínio precisa ser claramente de exemplo");
  assert.equal(/-?\d{1,3}\.\d{4,}/.test(envExample), false, "coordenada no exemplo");
});

test("o compose lê segredo de arquivo não versionado", () => {
  assert.match(serviceBlock("deliveryos-api"), /env_file:\s*\[\.env\]/);
  const gitignore = read(".gitignore");
  assert.match(gitignore, /^deploy\/\.env$/m, "deploy/.env precisa estar no gitignore");
});

/* ------------------------------------------------------------------ *
 * Execução
 * ------------------------------------------------------------------ */

console.log("=== Auditoria da composição de implantação ===");
console.log("(Docker não instalado: `docker compose build/up` NÃO foi executado)");
if (failures.length) {
  console.error(`\n=== ${failures.length} FALHA(S) ===`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`\n=== ${passed} deploy-audit tests OK ===`);
