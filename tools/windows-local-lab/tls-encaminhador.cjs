'use strict';
// Encaminhador TLS de ENSAIO — o equivalente, em Node, do socat da bancada do emulador.
//
// O app Android recusa HTTP em toda variante (docs/etapa-4-8/BANCADA-EMULADOR.md §1) e o
// runtime critico nao tem TLS. Na bancada, o TLS veio do socat no WSL; o computador do
// ensaio e Windows, e ja tem Node. Entrada TLS (minimo 1.2) com o certificado de uma CA
// de laboratorio; saida TCP pura para o destino: nada e interpretado, nada do conteudo e
// registrado. Escuta sempre num endereco explicito — nunca 0.0.0.0.
//
// Uso: node tls-encaminhador.cjs --escuta 100.107.78.202:8443 --destino 127.0.0.1:8080 \
//        --cert servidor.pem --chave servidor.key
const fs = require('fs');
const net = require('net');
const tls = require('tls');

function arg(nome) {
  const i = process.argv.indexOf('--' + nome);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function hostPorta(valor, nome) {
  const m = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/.exec(valor || '');
  if (!m) throw new Error(nome + ' precisa ser IPv4:porta');
  if (m[1] === '0.0.0.0') throw new Error(nome + ' recusa 0.0.0.0: a escuta precisa de endereco explicito');
  const porta = Number(m[2]);
  if (porta < 1 || porta > 65535) throw new Error(nome + ': porta invalida');
  return { host: m[1], porta };
}

function main() {
  const escuta = hostPorta(arg('escuta'), '--escuta');
  const destino = hostPorta(arg('destino'), '--destino');
  const cert = arg('cert');
  const chave = arg('chave');
  if (!cert || !chave) throw new Error('--cert e --chave sao obrigatorios');
  const servidor = tls.createServer(
    { cert: fs.readFileSync(cert), key: fs.readFileSync(chave), minVersion: 'TLSv1.2' },
    (entrada) => {
      const saida = net.connect(destino.porta, destino.host);
      const fechar = () => { entrada.destroy(); saida.destroy(); };
      entrada.on('error', fechar);
      saida.on('error', fechar);
      entrada.on('close', () => saida.destroy());
      saida.on('close', () => entrada.destroy());
      entrada.pipe(saida);
      saida.pipe(entrada);
    },
  );
  // Handshake recusado (cliente sem a CA, HTTP puro): fecha sem registrar conteudo.
  servidor.on('tlsClientError', (_erro, socket) => { if (socket) socket.destroy(); });
  servidor.on('error', (e) => { console.error('TLS_ENCAMINHADOR_RECUSADO: ' + e.code); process.exit(78); });
  servidor.listen(escuta.porta, escuta.host, () => {
    console.log('TLS_ENCAMINHADOR_OUVINDO ' + escuta.host + ':' + escuta.porta + ' -> ' + destino.host + ':' + destino.porta);
  });
  const parar = () => { servidor.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGTERM', parar);
  process.on('SIGINT', parar);
}

try {
  main();
} catch (e) {
  console.error('TLS_ENCAMINHADOR_RECUSADO: ' + e.message);
  process.exitCode = 78;
}
