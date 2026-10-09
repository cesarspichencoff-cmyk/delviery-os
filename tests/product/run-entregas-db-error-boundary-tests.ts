/**
 * Falha de banco nao deve revelar IP/porta, DNS, SQL nem credenciais pela
 * superficie de leitura da expedição. Roda SOMENTE um Postgres inacessivel
 * em localhost; nenhum banco operacional, CAIXA ou TATA Comanda e tocado.
 */
import assert from "node:assert/strict";
import net from "node:net";

async function portaLivre(): Promise<number> {
  const socket = net.createServer();
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const addr = socket.address();
  assert.ok(addr && typeof addr !== "string");
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return addr.port;
}

void (async () => {
  const port = await portaLivre();
  const enderecoInterno = `127.0.0.1:${port}`;
  const antigo = process.env.DELIVERYOS_DATABASE_URL;
  process.env.DELIVERYOS_DATABASE_URL =
    `postgresql://usuario-teste:segredo-ficticio@${enderecoInterno}/deliveryos_teste`;

  const { criarServidor } = await import("../../tools/product_system_server");
  const server = await criarServidor();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr !== "string");
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    const response = await fetch(`${base}/api/entregas?unidade=ITAIM`);
    assert.equal(response.status, 200, "a demo nao deve cair quando o Postgres cai");
    const body = await response.json() as {
      leitura?: { disponivel?: boolean };
      realidade?: { aparelhos?: unknown[] };
    };
    const raw = JSON.stringify(body);
    assert.equal(body.leitura?.disponivel, false, "falha de leitura nao pode parecer dado real");
    assert.ok(!raw.includes(enderecoInterno), "IP/porta interna vazou na resposta JSON");
    assert.ok(!raw.includes("ECONNREFUSED"), "erro tecnico bruto vazou ao gerente");
    assert.ok(!raw.includes("segredo-ficticio"), "credencial de teste vazou");
    assert.match(raw, /indisponiv|nao respondeu|falhou/i, "deve haver explicacao publica util");
    console.log("ENTREGAS_DB_ERROR_BOUNDARY: PASS");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (antigo === undefined) delete process.env.DELIVERYOS_DATABASE_URL;
    else process.env.DELIVERYOS_DATABASE_URL = antigo;
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
