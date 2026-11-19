import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { pathToFileURL } from "node:url";

const [certFile, keyFile, gatewayModule] = process.argv.slice(2);
const { criarPortaoDeCampo } = await import(pathToFileURL(gatewayModule));
const handler = criarPortaoDeCampo({
  piloto: { host: "127.0.0.1", port: 15193 },
  critico: { host: "127.0.0.1", port: 8080 },
});
createServer({
  cert: readFileSync(certFile),
  key: readFileSync(keyFile),
  minVersion: "TLSv1.2",
}, handler).listen(5193, "127.0.0.1", () => console.log("LAB_HTTPS_FIELD_GATEWAY_READY"));
