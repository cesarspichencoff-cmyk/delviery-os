/**
 * Camada 0 · Memória = log append-only, agora REPLAY-SAFE.
 *
 * Append-only não é aceitar duplicidade cega: a ingestão deduplica por event_id
 * (determinístico). Reprocessar o mesmo evento não cresce o log. O histórico só
 * cresce com transições NOVAS, e nunca é editado.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Transicao } from "./dominio";

export interface LogTransicoes {
  /** retorna true se anexou, false se já existia (dedup). */
  anexar(t: Transicao): boolean;
  todas(): Transicao[];
  doPedido(pedido_id: string): Transicao[];
}

const CAMINHO_PADRAO = process.env.DELIVERYOS_LOG ?? join(process.cwd(), "data", "transicoes.jsonl");

export class LogJsonl implements LogTransicoes {
  private vistos = new Set<string>();
  constructor(private readonly caminho: string = CAMINHO_PADRAO) {
    for (const t of this.todas()) this.vistos.add(t.event_id);
  }
  anexar(t: Transicao): boolean {
    if (this.vistos.has(t.event_id)) return false; // replay-safe
    const dir = dirname(this.caminho);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(this.caminho, JSON.stringify(t) + "\n", "utf8");
    this.vistos.add(t.event_id);
    return true;
  }
  todas(): Transicao[] {
    if (!existsSync(this.caminho)) return [];
    return readFileSync(this.caminho, "utf8").split("\n").filter((l) => l.trim())
      .map((l) => JSON.parse(l) as Transicao);
  }
  doPedido(pedido_id: string): Transicao[] {
    return this.todas().filter((t) => t.pedido_id === pedido_id);
  }
}

export class LogMemoria implements LogTransicoes {
  private buffer: Transicao[] = [];
  private vistos = new Set<string>();
  anexar(t: Transicao): boolean {
    if (this.vistos.has(t.event_id)) return false;
    this.buffer.push(t);
    this.vistos.add(t.event_id);
    return true;
  }
  todas(): Transicao[] {
    return [...this.buffer];
  }
  doPedido(pedido_id: string): Transicao[] {
    return this.buffer.filter((t) => t.pedido_id === pedido_id);
  }
}
