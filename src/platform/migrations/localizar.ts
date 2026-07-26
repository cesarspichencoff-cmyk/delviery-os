/**
 * Onde estão as migrations em tempo de execução.
 *
 * O mesmo código roda de dois jeitos: direto do fonte (`tsx src/...`) e
 * compilado (`node dist/src/...`). No segundo caso os `.sql` só existem em
 * `dist/` se o build os tiver copiado — e uma imagem sem eles sobe achando que
 * não há schema pendente, que é a pior forma de falhar: em silêncio.
 *
 * Por isso a resolução tenta os dois lugares e, não achando nenhum, ERRA alto.
 */

import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

function temMigrations(dir: string): boolean {
  try {
    return existsSync(dir) && readdirSync(dir).some((f) => /^\d{4}_.+\.sql$/.test(f));
  } catch {
    return false;
  }
}

export function diretorioDeMigrations(): string {
  const candidatos = [
    // Override explícito vence tudo — é o que permite montar as migrations
    // como volume sem reconstruir a imagem.
    process.env.DELIVERYOS_MIGRATIONS_DIR,
    // Ao lado do código compilado (ou do fonte, quando roda via tsx).
    join(__dirname),
    // Fallback para execução a partir da raiz do repositório.
    resolve(process.cwd(), "src", "platform", "migrations"),
    resolve(process.cwd(), "dist", "src", "platform", "migrations"),
  ].filter((d): d is string => Boolean(d));

  for (const d of candidatos) {
    if (temMigrations(d)) return d;
  }

  throw new Error(
    `nenhuma migration encontrada. Procurei em: ${candidatos.join(", ")}. ` +
      "Se o processo roda a partir de dist/, o build precisa copiar os .sql " +
      "(npm run build:platform).",
  );
}
