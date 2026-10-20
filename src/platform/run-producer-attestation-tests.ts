/**
 * Fronteira de procedência do produtor — prova em memória com os MÓDULOS DE
 * PRODUÇÃO: contrato `pa1`, julgamento, EntregasLiveConsumer, decorador de
 * assinatura do piloto, file store real e feed atestável real.
 *
 * Fakes só nas portas de banco (registro e livro), com as MESMAS regras de
 * unicidade da migration 0010. A prova transacional em PostgreSQL é outra
 * suíte (tests/product/run-producer-attestation-pg-copiloto-lab-tests.ts).
 *
 * Chaves Ed25519 geradas em memória a cada execução: nenhuma chave é
 * versionada, e nada aqui é fonte real. Nenhum fato `real` é gravado.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assinaturaConfere,
  bytesDaChavePublicaEd25519,
  chavePublicaEd25519,
  criarAssinanteDeProdutor,
  decodificarAtestacao,
  eventoCanonicoIgual,
  PRODUCER_ATTESTATION_MAX_CLAIMS,
  PRODUCER_ATTESTATION_MAX_TOKEN,
  type AssinanteDeProdutor,
} from "../entregas/contracts/producer-attestation";
import type { EntregasPublicEvent } from "../entregas/contracts/events/types";
import { asInternalRiderActorId } from "../entregas/foundation/brands";
import { createPilotPolicy } from "../entregas/foundation/policy";
import { createFileEntregasAttestableFeed } from "../entregas/integration/durable-event-feed";
import { buildSignalEvent } from "../entregas/integration/public-event-builder";
import { EntregasApplicationService } from "../entregas/operational/application-service";
import { openFileUnitOfWork } from "../entregas/persistence/file-store";
import { authorizePilotEventWrite } from "../entregas/pilot/delegated-authorization";
import {
  carregarAssinanteDeProdutor,
  uowComAtestacao,
} from "../entregas/pilot/producer-signing";
import {
  planRegister,
  producerPlanFingerprint,
  type ProducerAdminStore,
} from "./admin/producer-admin";
import { loadEntregasSourceIngestConfig } from "./config/entregas-source-ingest-config";
import {
  FronteiraDeProcedencia,
  julgarProcedencia,
  type AdmissaoAnterior,
  type ChaveDeProdutor,
  type FeedAtestavel,
  type ItemAtestavel,
  type LivroDeAdmissoes,
  type RegistroDeAdmissao,
  type RegistroDeProdutores,
} from "./ingest/fronteira-de-procedencia";
import type { EscritorTransacional, FatoParaGravar } from "./ingest/ingest-service";
import type { OutboxMessage } from "./contracts/messaging";
import {
  EntregasLiveConsumer,
  FileConsumerStateStore,
  MOTIVO_REAL_SEM_AUTORIDADE,
  type ConsumerCheckpointState,
  type ConsumerStateStore,
} from "./runtime/entregas-live-consumer";

const AGORA = new Date("2026-10-20T12:00:00.000Z");
const T = "2026-10-20T11:59:00.000Z";
let passed = 0;
const tests: Array<[string, () => Promise<void> | void]> = [];
function test(name: string, fn: () => Promise<void> | void): void {
  tests.push([name, fn]);
}

/* ------------------------------------------------------------------ *
 * Portas de banco em memória, com as regras da migration 0010
 * ------------------------------------------------------------------ */

class MemRegistro implements RegistroDeProdutores {
  readonly chaves = new Map<string, ChaveDeProdutor>();
  falhar = false;
  async buscar(p: string, k: string) {
    if (this.falhar) throw new Error("registro fora");
    return this.chaves.get(p + "/" + k) ?? null;
  }
}

class MemLivro implements LivroDeAdmissoes {
  readonly linhas: RegistroDeAdmissao[] = [];
  readonly fatos = new Map<string, FatoParaGravar>();
  readonly mensagens: OutboxMessage[] = [];
  falhar = false;

  private violacao(r: RegistroDeAdmissao): string | null {
    if (r.decision !== "admitted") return null;
    for (const l of this.linhas) {
      if (l.decision !== "admitted") continue;
      if (l.source_ref === r.source_ref && l.envelope_sha256 === r.envelope_sha256) continue;
      if (l.producer_id === r.producer_id && l.nonce === r.nonce) return "producer_admission_nonce";
      if (l.producer_id === r.producer_id && l.event_id === r.event_id) return "producer_admission_evento";
    }
    return null;
  }
  private inserir(r: RegistroDeAdmissao): void {
    const v = this.violacao(r);
    if (v) throw new Error("23505 " + v);
    // ON CONFLICT (source_ref, envelope_sha256) DO NOTHING
    if (this.linhas.some((l) => l.source_ref === r.source_ref && l.envelope_sha256 === r.envelope_sha256)) return;
    this.linhas.push(structuredClone(r));
  }
  async decisaoAnterior(source_ref: string, sha: string) {
    if (this.falhar) throw new Error("livro fora");
    const l = this.linhas.find((x) => x.source_ref === source_ref && x.envelope_sha256 === sha);
    return l ? { decision: l.decision, reason: l.reason } : null;
  }
  private achar(campo: "nonce" | "event_id", p: string, v: string): AdmissaoAnterior | null {
    const l = this.linhas.find((x) => x.decision === "admitted" && x.producer_id === p && x[campo] === v);
    return l ? { envelope_sha256: l.envelope_sha256, source_ref: l.source_ref } : null;
  }
  async admitidaPorNonce(p: string, n: string) {
    if (this.falhar) throw new Error("livro fora");
    return this.achar("nonce", p, n);
  }
  async admitidaPorEvento(p: string, e: string) {
    if (this.falhar) throw new Error("livro fora");
    return this.achar("event_id", p, e);
  }
  async quarentenar(r: RegistroDeAdmissao) {
    assert.equal(r.decision, "quarantined");
    this.inserir(r);
  }
  async admitirSemFato(r: RegistroDeAdmissao) {
    assert.equal(r.decision, "admitted");
    this.inserir(r);
  }
  escritor(r: RegistroDeAdmissao): EscritorTransacional {
    assert.equal(r.decision, "admitted");
    return {
      commit: async (fatos, mensagens) => {
        // "Transação": confere tudo antes, aplica tudo depois.
        const v = this.violacao(r);
        if (v) return { ok: false as const, code: "storage", detail: "23505 " + v };
        this.inserir(r);
        let n = 0;
        for (const f of fatos) {
          if (this.fatos.has(f.idempotency_key)) continue;
          this.fatos.set(f.idempotency_key, structuredClone(f));
          n += 1;
        }
        this.mensagens.push(...mensagens);
        return { ok: true as const, facts: n, messages: mensagens.length };
      },
    };
  }
  contar(decision: "admitted" | "quarantined", reason?: string) {
    return this.linhas.filter((l) => l.decision === decision && (!reason || l.reason === reason)).length;
  }
}

class ArrayFeed implements FeedAtestavel {
  readonly itens: ItemAtestavel[] = [];
  polls = 0;
  async pollAtestavel(cursor: string | null, limit = 50) {
    this.polls += 1;
    const i = cursor === null ? 0 : this.itens.findIndex((x) => x.event.event_id === cursor) + 1;
    const out = this.itens.slice(i, i + limit).map((x) => structuredClone(x));
    return { itens: out, next_cursor: out.length ? out[out.length - 1].event.event_id : cursor };
  }
}

class MemState implements ConsumerStateStore {
  estado: ConsumerCheckpointState = { version: 1, checkpoint: null, isolated_count: 0, updated_at: null };
  falharUmaVez = false;
  async load() { return structuredClone(this.estado); }
  async save(s: ConsumerCheckpointState) {
    if (this.falharUmaVez) { this.falharUmaVez = false; throw new Error("disco cheio"); }
    this.estado = structuredClone(s);
  }
}

/* ------------------------------------------------------------------ *
 * Produtores e eventos fictícios
 * ------------------------------------------------------------------ */

interface Produtor { assinante: AssinanteDeProdutor; privada: KeyObject; chave: ChaveDeProdutor }

function produtor(
  registro: MemRegistro,
  o: Partial<ChaveDeProdutor> & { producer_id: string; key_id?: string; agora?: () => Date },
): Produtor {
  const par = generateKeyPairSync("ed25519");
  const chave: ChaveDeProdutor = {
    producer_id: o.producer_id,
    key_id: o.key_id ?? "k1",
    unit_id: o.unit_id ?? "ITAIM",
    public_key: bytesDaChavePublicaEd25519(par.publicKey),
    allowed_event_types: o.allowed_event_types ?? [
      "trip_created", "trip_started", "trip_return_started", "delivery_added", "delivery_ready",
    ],
    allowed_modes: o.allowed_modes ?? ["simulated"],
    not_before: o.not_before ?? new Date("2026-10-01T00:00:00.000Z"),
    not_after: o.not_after ?? new Date("2026-12-01T00:00:00.000Z"),
    revoked_at: o.revoked_at ?? null,
  };
  registro.chaves.set(chave.producer_id + "/" + chave.key_id, chave);
  return {
    privada: par.privateKey,
    chave,
    assinante: criarAssinanteDeProdutor({
      producer_id: chave.producer_id,
      kid: chave.key_id,
      privateKey: par.privateKey,
      now: o.agora ?? (() => new Date(T)),
    }),
  };
}

function evento(
  id: string,
  tipo: "trip_created" | "trip_started" | "delivery_ready" = "trip_started",
  /** null = sem modo (UNKNOWN). */
  modo: "simulated" | "control" | "real" | null = "simulated",
  unidade = "ITAIM",
): EntregasPublicEvent {
  return {
    ...buildSignalEvent({
      event_type: tipo, unit_id: unidade, source_mode: modo ?? undefined, trip_id: "LAB_TRIP",
      recorded_at: T, occurred_at: T, idempotency_key: "LAB_KEY_" + id, payload: { lab_only: true },
    }),
    event_id: id,
  };
}

function item(e: EntregasPublicEvent, a: AssinanteDeProdutor | null, ref = "obx_" + e.event_id): ItemAtestavel {
  return { source_ref: ref, event: e, attestation: a ? a.assinar(e) : null };
}

/** Reescreve o segmento de claims SEM reassinar — o que um adulterador faria. */
function trocarClaims(token: string, mudar: (c: Record<string, unknown>) => void): string {
  const [p, corpo, sig] = token.split(".");
  const c = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
  mudar(c);
  return [p, Buffer.from(JSON.stringify(c)).toString("base64url"), sig].join(".");
}

function cenario() {
  const registro = new MemRegistro();
  const livro = new MemLivro();
  const deps = { registro, livro };
  const julgar = (i: ItemAtestavel, agora = AGORA) => julgarProcedencia(i, agora, deps);
  const motivo = async (i: ItemAtestavel, agora = AGORA) => {
    const v = await julgar(i, agora);
    return v.tipo === "quarentena" ? v.registro.reason : v.tipo;
  };
  return { registro, livro, deps, julgar, motivo };
}

function consumidor(feed: FeedAtestavel, deps: { registro: MemRegistro; livro: MemLivro }, state = new MemState()) {
  let rodar = true;
  const c = new EntregasLiveConsumer({
    enabled: true,
    feed: { list: async () => [], poll: async () => { throw new Error("feed sem atestacao nao deve ser lido"); } },
    writer: { commit: async () => { throw new Error("writer sem admissao nao deve ser usado"); } },
    state,
    control: { canRun: async () => rodar },
    now: () => AGORA,
    procedencia: new FronteiraDeProcedencia({ feed, ...deps }),
  });
  return { c, state, parar: () => { rodar = false; }, ligar: () => { rodar = true; } };
}

/* ================================================================== *
 * 1. Contrato pa1
 * ================================================================== */

test("PA1 assinatura cobre os bytes; codificação não canônica e tamanho errado recusados", () => {
  const r = new MemRegistro();
  const p = produtor(r, { producer_id: "LAB_P" });
  const tok = p.assinante.assinar(evento("E1"));
  const d = decodificarAtestacao(tok);
  assert.ok(d.ok);
  assert.equal(assinaturaConfere(d, generateKeyPairSync("ed25519").publicKey), false, "outra chave");
  const [pre, corpo, sig] = tok.split(".");
  assert.equal(decodificarAtestacao([pre, corpo + "A", sig].join(".")).ok, false, "corpo alterado em base64");
  const curta = Buffer.from(sig, "base64url").subarray(0, 63).toString("base64url");
  const longa = Buffer.concat([Buffer.from(sig, "base64url"), Buffer.from([0])]).toString("base64url");
  for (const s of [curta, longa]) {
    const x = decodificarAtestacao([pre, corpo, s].join("."));
    assert.ok(!x.ok && x.motivo === "atestacao_codificacao_invalida");
  }
  const naoCanonica = decodificarAtestacao([pre, corpo, sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A")].join("."));
  assert.ok(naoCanonica.ok === false || !assinaturaConfere(naoCanonica, createPublicKeyFrom(p)));
  assert.equal(decodificarAtestacao("pa1." + corpo).ok, false, "dois segmentos");
  assert.equal(decodificarAtestacao(undefined).ok, false);
});

function createPublicKeyFrom(p: Produtor): KeyObject {
  return chavePublicaEd25519(p.chave.public_key);
}

test("PA2 duas autorizações separadas: pt1 nunca vale como pa1, e pa1 nunca vale como pt1", async () => {
  const par = generateKeyPairSync("ed25519");
  const claims = Buffer.from(JSON.stringify({ kid: "k", v: "x" })).toString("base64url");
  const pt1 = "pt1." + claims + "." + sign(null, Buffer.from("pt1." + claims), par.privateKey).toString("base64url");
  const d = decodificarAtestacao(pt1);
  assert.ok(!d.ok && d.motivo === "atestacao_formato_invalido");

  const r = new MemRegistro();
  const p = produtor(r, { producer_id: "LAB_P" });
  const pa1 = p.assinante.assinar(evento("E2"));
  const res = await authorizePilotEventWrite({
    bearer: pa1,
    trusted_public_keys: new Map([["k1", createPublicKeyFrom(p)]]),
    expected_unit_id: "ITAIM",
    now_epoch_s: Math.floor(AGORA.getTime() / 1000),
    registry: { check: async () => { throw new Error("nao deveria consultar"); } },
  } as unknown as Parameters<typeof authorizePilotEventWrite>[0]);
  assert.ok(!res.ok && res.reason === "invalid_pilot_token_format");
});

test("PA3 igualdade canônica: ordem de chaves e undefined não importam; valor importa", () => {
  assert.ok(eventoCanonicoIgual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 }));
  assert.ok(eventoCanonicoIgual({ a: 1, x: undefined }, { a: 1 }));
  assert.ok(!eventoCanonicoIgual({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [2, 1] } }));
  assert.ok(!eventoCanonicoIgual({ a: "1" }, { a: 1 }));
  assert.ok(!eventoCanonicoIgual({ a: null }, { a: {} }));
});

/* ================================================================== *
 * 2. Julgamento — cada recusa no passo certo
 * ================================================================== */

test("PA4 assinado, registrado e concedido: admitido com modo ATRIBUÍDO e evento de dentro da assinatura", async () => {
  const s = cenario();
  const p = produtor(s.registro, { producer_id: "LAB_P" });
  const v = await s.julgar(item(evento("E4"), p.assinante));
  assert.equal(v.tipo, "admitido");
  if (v.tipo !== "admitido") return;
  assert.equal(v.registro.assigned_mode, "simulated");
  assert.equal(v.registro.producer_id, "LAB_P");
  assert.equal(v.evento.event_id, "E4");
  assert.equal(v.releitura, false);
});

test("PA5 sem atestação, produtor desconhecido, id trocado: quarentena antes de confiar no payload", async () => {
  const s = cenario();
  const p = produtor(s.registro, { producer_id: "LAB_P" });
  const outro = produtor(new MemRegistro(), { producer_id: "LAB_NAO_REGISTRADO" });
  assert.equal(await s.motivo(item(evento("E5"), null)), "atestacao_ausente");
  assert.equal(await s.motivo(item(evento("E5b"), outro.assinante)), "produtor_desconhecido");
  const tok = p.assinante.assinar(evento("E5c"));
  // O id externo só localiza a chave: trocá-lo (sem reassinar) quebra a prova.
  produtor(s.registro, { producer_id: "LAB_VILA", unit_id: "VILA-LAB" });
  const trocado = trocarClaims(tok, (c) => { c.producer_id = "LAB_VILA"; });
  assert.equal(await s.motivo({ source_ref: "x", event: evento("E5c"), attestation: trocado }), "assinatura_invalida");
});

test("PA6 payload editado depois de assinar (unidade, modo) é assinatura inválida", async () => {
  const s = cenario();
  const p = produtor(s.registro, { producer_id: "LAB_P", allowed_modes: ["simulated", "control"] });
  const tok = p.assinante.assinar(evento("E6"));
  for (const mudar of [
    (c: Record<string, unknown>) => { (c.event as Record<string, unknown>).unit_id = "VILA-LAB"; },
    (c: Record<string, unknown>) => { (c.event as Record<string, unknown>).source_mode = "control"; },
    (c: Record<string, unknown>) => { c.iat = (c.iat as number) + 1; },
  ]) {
    assert.equal(await s.motivo({ source_ref: "x", event: evento("E6"), attestation: trocarClaims(tok, mudar) }), "assinatura_invalida");
  }
});

test("PA7 registro da outbox divergente do assinado: quarentena (o assinado nunca é trocado pelo registro)", async () => {
  const s = cenario();
  const p = produtor(s.registro, { producer_id: "LAB_P", allowed_modes: ["simulated", "control"] });
  const e = evento("E7");
  const tok = p.assinante.assinar(e);
  assert.equal(await s.motivo({ source_ref: "x", event: { ...e, source_mode: "control" }, attestation: tok }),
    "evento_divergente_da_assinatura");
  // JSONB reordena chaves: o mesmo conteúdo em outra ordem continua válido.
  const reordenado = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(e).reverse()))) as EntregasPublicEvent;
  assert.equal((await s.julgar({ source_ref: "x", event: reordenado, attestation: tok })).tipo, "admitido");
});

test("PA8 concessão: unidade, tipo e modo fora da chave são recusados; ausência de modo fica UNKNOWN", async () => {
  const s = cenario();
  const p = produtor(s.registro, { producer_id: "LAB_P", allowed_event_types: ["trip_started"] });
  assert.equal(await s.motivo(item(evento("E8a", "trip_started", "simulated", "VILA-LAB"), p.assinante)), "unidade_nao_concedida");
  assert.equal(await s.motivo(item(evento("E8b", "trip_created"), p.assinante)), "tipo_nao_concedido");
  assert.equal(await s.motivo(item(evento("E8c", "trip_started", "control"), p.assinante)), "modo_nao_concedido");
  assert.equal(await s.motivo(item(evento("E8d", "trip_started", null), p.assinante)), "modo_ausente");
});

test("PA9 `real` nunca: nem com chave válida, nem com registro que (por defeito) o concedesse", async () => {
  const s = cenario();
  const p = produtor(s.registro, { producer_id: "LAB_P" });
  assert.equal(await s.motivo(item(evento("E9a", "trip_started", "real"), p.assinante)), "real_sem_autoridade_de_mundo");
  const defeituoso = produtor(s.registro, {
    producer_id: "LAB_DEFEITO", allowed_modes: ["real" as unknown as "simulated"],
  });
  assert.equal(await s.motivo(item(evento("E9b", "trip_started", "real"), defeituoso.assinante)), "real_sem_autoridade_de_mundo");
});

test("PA10 vida da chave: revogada, fora da validade, iat futuro e iat fora da vida", async () => {
  const s = cenario();
  const rev = produtor(s.registro, { producer_id: "LAB_REV", revoked_at: new Date("2026-10-19T00:00:00Z") });
  assert.equal(await s.motivo(item(evento("E10a"), rev.assinante)), "chave_revogada");
  const venc = produtor(s.registro, { producer_id: "LAB_VENC", not_after: new Date("2026-10-20T11:00:00Z") });
  assert.equal(await s.motivo(item(evento("E10b"), venc.assinante)), "chave_fora_da_validade");
  const fut = produtor(s.registro, { producer_id: "LAB_FUT", agora: () => new Date(AGORA.getTime() + 31_000) });
  assert.equal(await s.motivo(item(evento("E10c"), fut.assinante)), "iat_no_futuro");
  const folga = produtor(s.registro, { producer_id: "LAB_FOLGA", agora: () => new Date(AGORA.getTime() + 29_000) });
  assert.equal((await s.julgar(item(evento("E10d"), folga.assinante))).tipo, "admitido", "dentro da folga de 30 s");
  const antes = produtor(s.registro, { producer_id: "LAB_ANTES", agora: () => new Date("2026-09-30T00:00:00Z") });
  assert.equal(await s.motivo(item(evento("E10e"), antes.assinante)), "iat_fora_da_vida_da_chave");
});

test("PA11 R3: envelope de 6 h atrás (consumidor parado) ainda é admitido — frescor é vida da chave, não hora do poll", async () => {
  const s = cenario();
  const p = produtor(s.registro, { producer_id: "LAB_P", agora: () => new Date(AGORA.getTime() - 6 * 3_600_000) });
  assert.equal((await s.julgar(item(evento("E11"), p.assinante))).tipo, "admitido");
});

test("PA12 rotação: chave antiga revogada recusa; key_id novo do mesmo produtor admite", async () => {
  const s = cenario();
  const velha = produtor(s.registro, { producer_id: "LAB_P", key_id: "k1" });
  const nova = produtor(s.registro, { producer_id: "LAB_P", key_id: "k2" });
  s.registro.chaves.set("LAB_P/k1", { ...velha.chave, revoked_at: new Date("2026-10-20T00:00:00Z") });
  assert.equal(await s.motivo(item(evento("E12a"), velha.assinante)), "chave_revogada");
  assert.equal((await s.julgar(item(evento("E12b"), nova.assinante))).tipo, "admitido");
});

test("PA13 indisponível não é quarentena: registro ou livro fora devolvem indisponivel", async () => {
  const s = cenario();
  const p = produtor(s.registro, { producer_id: "LAB_P" });
  s.registro.falhar = true;
  assert.equal(await s.motivo(item(evento("E13a"), p.assinante)), "indisponivel");
  s.registro.falhar = false;
  s.livro.falhar = true;
  assert.equal(await s.motivo(item(evento("E13b"), p.assinante)), "indisponivel");
});

test("PA14 antirreplay durável: nonce ou event_id reusados por outro envelope; releitura do MESMO não é replay", async () => {
  const s = cenario();
  const nonce = randomBytes(16).toString("hex");
  const par = generateKeyPairSync("ed25519");
  const base = produtor(s.registro, { producer_id: "LAB_P" });
  s.registro.chaves.set("LAB_P/k1", { ...base.chave, public_key: bytesDaChavePublicaEd25519(par.publicKey) });
  const fixo = criarAssinanteDeProdutor({ producer_id: "LAB_P", kid: "k1", privateKey: par.privateKey, now: () => new Date(T), nonce: () => nonce });
  const livre = criarAssinanteDeProdutor({ producer_id: "LAB_P", kid: "k1", privateKey: par.privateKey, now: () => new Date(T) });
  const primeiro = item(evento("E14a"), fixo);
  const v1 = await s.julgar(primeiro);
  assert.equal(v1.tipo, "admitido");
  if (v1.tipo !== "admitido") return;
  await s.livro.admitirSemFato(v1.registro);
  const releitura = await s.julgar(primeiro);
  assert.ok(releitura.tipo === "admitido" && releitura.releitura, "mesmo registro e bytes = releitura");
  assert.equal(await s.motivo(item(evento("E14b"), fixo)), "nonce_reutilizado");
  assert.equal(await s.motivo(item(evento("E14a"), livre, "obx_outro")), "evento_reutilizado");
});

test("PA15 decisão de quarentena é única: registrar a chave depois não admite a releitura", async () => {
  const s = cenario();
  const outro = new MemRegistro();
  const p = produtor(outro, { producer_id: "LAB_TARDE" });
  const i = item(evento("E15"), p.assinante);
  const v = await s.julgar(i);
  assert.ok(v.tipo === "quarentena" && v.registro.reason === "produtor_desconhecido");
  await s.livro.quarentenar(v.registro);
  s.registro.chaves.set("LAB_TARDE/k1", p.chave);
  assert.equal(await s.motivo(i), "produtor_desconhecido", "queda entre quarentena e checkpoint não vira admissão");
});

/* ================================================================== *
 * 3. Consumidor real com a fronteira
 * ================================================================== */

test("PA16 lote misto: válido, forjado, sinal, real assinado, válido — por evento, em ordem, sem travar", async () => {
  const s = cenario();
  const p = produtor(s.registro, { producer_id: "LAB_P" });
  const intruso = produtor(new MemRegistro(), { producer_id: "LAB_P" });
  const feed = new ArrayFeed();
  feed.itens.push(
    item(evento("M1", "trip_created"), p.assinante),
    item(evento("M2"), intruso.assinante),
    item(evento("M3", "delivery_ready"), p.assinante),
    item(evento("M4", "trip_started", "real"), p.assinante),
    item(evento("M5"), p.assinante),
  );
  const { c, state } = consumidor(feed, s.deps);
  const r = await c.tick();
  assert.equal(r.status, "worked");
  assert.equal(r.ingested, 2);
  assert.equal(r.quarantined, 2);
  assert.equal(r.isolated, 1);
  assert.equal(state.estado.checkpoint, "M5");
  assert.equal(state.estado.quarantined_count, 2);
  assert.deepEqual([...s.livro.fatos.values()].map((f) => f.source_mode), ["simulated", "simulated"]);
  assert.equal(s.livro.contar("quarantined", "assinatura_invalida"), 1);
  assert.equal(s.livro.contar("quarantined", "real_sem_autoridade_de_mundo"), 1);
  assert.equal(s.livro.contar("admitted"), 3, "dois fatos + sinal independente com origem positiva");
  assert.equal(state.estado.last_isolation?.event_type, "delivery_ready");
});

test("PA17 registro fora no meio do lote: para sem gravar nem avançar; volta e termina sem duplicar", async () => {
  const s = cenario();
  const p = produtor(s.registro, { producer_id: "LAB_P" });
  const feed = new ArrayFeed();
  feed.itens.push(item(evento("U1"), p.assinante), item(evento("U2"), p.assinante));
  const { c, state } = consumidor(feed, s.deps);
  const original = s.registro.buscar.bind(s.registro);
  let chamadas = 0;
  s.registro.buscar = async (a, b) => { chamadas += 1; if (chamadas === 2) throw new Error("fora"); return original(a, b); };
  const r1 = await c.tick();
  assert.equal(r1.status, "failed");
  assert.match(r1.error ?? "", /^procedencia_indisponivel:/);
  assert.equal(state.estado.checkpoint, "U1");
  assert.equal(s.livro.contar("quarantined"), 0, "indisponibilidade nunca vira quarentena");
  const r2 = await c.tick();
  assert.equal(r2.status, "worked");
  assert.equal(s.livro.fatos.size, 2);
  assert.equal(state.estado.checkpoint, "U2");
});

test("PA18 queda entre commit e checkpoint: releitura absorvida, um fato e uma admissão", async () => {
  const s = cenario();
  const p = produtor(s.registro, { producer_id: "LAB_P" });
  const feed = new ArrayFeed();
  feed.itens.push(item(evento("C1"), p.assinante));
  const { c, state } = consumidor(feed, s.deps);
  state.falharUmaVez = true;
  const r1 = await c.tick();
  assert.equal(r1.status, "failed");
  assert.match(r1.error ?? "", /^checkpoint_write_failed:/);
  assert.equal(state.estado.checkpoint, null);
  const r2 = await c.tick();
  assert.equal(r2.status, "worked");
  assert.equal(r2.duplicates, 1);
  assert.equal(s.livro.fatos.size, 1);
  assert.equal(s.livro.contar("admitted"), 1);
  assert.equal(state.estado.checkpoint, "C1");
});

test("PA19 queda entre quarentena e checkpoint: uma linha de quarentena só", async () => {
  const s = cenario();
  const feed = new ArrayFeed();
  feed.itens.push(item(evento("Q1"), null));
  const { c, state } = consumidor(feed, s.deps);
  state.falharUmaVez = true;
  assert.equal((await c.tick()).status, "failed");
  assert.equal((await c.tick()).status, "worked");
  assert.equal(s.livro.contar("quarantined"), 1);
  assert.equal(state.estado.checkpoint, "Q1");
});

test("PA20 replay que escapa da checagem (corrida) bate na unicidade e vira quarentena no tick seguinte", async () => {
  const s = cenario();
  const nonce = randomBytes(16).toString("hex");
  const par = generateKeyPairSync("ed25519");
  const p = produtor(s.registro, { producer_id: "LAB_P" });
  s.registro.chaves.set("LAB_P/k1", { ...p.chave, public_key: bytesDaChavePublicaEd25519(par.publicKey) });
  const fixo = criarAssinanteDeProdutor({ producer_id: "LAB_P", kid: "k1", privateKey: par.privateKey, now: () => new Date(T), nonce: () => nonce });
  const feed = new ArrayFeed();
  feed.itens.push(item(evento("R1"), fixo), item(evento("R2"), fixo));
  const { c, state } = consumidor(feed, s.deps);
  // Simula a corrida: a consulta de antirreplay não vê R1 na primeira passada.
  const real = s.livro.admitidaPorNonce.bind(s.livro);
  let cego = true;
  s.livro.admitidaPorNonce = async (a, b) => (cego ? null : real(a, b));
  const r1 = await c.tick();
  assert.equal(r1.status, "failed", "commit de R2 recusado pela unicidade");
  assert.equal(state.estado.checkpoint, "R1");
  cego = false;
  const r2 = await c.tick();
  assert.equal(r2.status, "worked");
  assert.equal(s.livro.contar("quarantined", "nonce_reutilizado"), 1);
  assert.equal(s.livro.fatos.size, 1);
});

test("PA21 kill switch e flag: zero poll, zero julgamento", async () => {
  const s = cenario();
  const feed = new ArrayFeed();
  feed.itens.push(item(evento("K1"), null));
  const { c, parar } = consumidor(feed, s.deps);
  parar();
  assert.equal((await c.tick()).status, "killed");
  assert.equal(feed.polls, 0);
  const desligado = new EntregasLiveConsumer({
    enabled: false,
    feed: { list: async () => [], poll: async () => ({ events: [], next_cursor: null }) },
    writer: { commit: async () => ({ ok: true as const, facts: 0, messages: 0 }) },
    state: new MemState(),
    control: { canRun: async () => true },
    procedencia: new FronteiraDeProcedencia({ feed, ...s.deps }),
  });
  assert.equal((await desligado.tick()).status, "disabled");
  assert.equal(feed.polls, 0);
  assert.equal(s.livro.linhas.length, 0);
});

test("PA22 sem fronteira (padrão): `real` declarado é isolado, nada gravado", async () => {
  const fatos: FatoParaGravar[] = [];
  const evs = [evento("N1", "trip_started", "real"), evento("N2")];
  const state = new MemState();
  const c = new EntregasLiveConsumer({
    enabled: true,
    feed: {
      list: async () => evs,
      poll: async (cur) => {
        const i = cur === null ? 0 : evs.findIndex((e) => e.event_id === cur) + 1;
        const out = evs.slice(i);
        return { events: out, next_cursor: out.at(-1)?.event_id ?? cur };
      },
    },
    writer: { commit: async (f) => { fatos.push(...f); return { ok: true as const, facts: f.length, messages: f.length }; } },
    state,
    control: { canRun: async () => true },
    now: () => AGORA,
  });
  const r = await c.tick();
  assert.equal(r.status, "worked");
  assert.equal(r.quarantined, undefined, "sem fronteira, sem contador de quarentena");
  assert.equal(r.isolated, 1);
  assert.deepEqual(fatos.map((f) => f.source_mode), ["simulated"]);
  assert.equal(state.estado.last_isolation?.reason, MOTIVO_REAL_SEM_AUTORIDADE);
});

test("PA23 estado antigo (sem quarentena) ainda carrega; contador inválido é recusado", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pa-state-"));
  try {
    const f = join(dir, "s.json");
    writeFileSync(f, JSON.stringify({ version: 1, checkpoint: "x", isolated_count: 2, updated_at: null }));
    const st = await new FileConsumerStateStore(f).load();
    assert.equal(st.checkpoint, "x");
    assert.equal(st.quarantined_count, undefined);
    writeFileSync(f, JSON.stringify({ version: 1, checkpoint: "x", isolated_count: 2, updated_at: null, quarantined_count: -1 }));
    await assert.rejects(() => new FileConsumerStateStore(f).load(), /quarantined_count/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ================================================================== *
 * 4. Ponta a ponta com o produtor real e o store em arquivo real
 * ================================================================== */

async function produzir(store: string, assinante: AssinanteDeProdutor | null): Promise<void> {
  const base = openFileUnitOfWork(store);
  const app = new EntregasApplicationService(assinante ? uowComAtestacao(base, assinante) : base, createPilotPolicy(), "simulated");
  const r1 = await app.execute({
    type: "CreateTrip", command_id: "pa-c1", occurred_at: T, unit_id: "ITAIM", trip_id: "PA-T1",
    courier_actor_id: asInternalRiderActorId("pa-rider"),
    actor: { actor_id: "pa-ops", role: "operador_expedicao" },
    deliveries: [{ delivery_id: "PA-D1", order_ref: "PA-P1", channel: "proprio" }],
  } as Parameters<EntregasApplicationService["execute"]>[0]);
  assert.equal(r1.ok, true);
  const r2 = await app.execute({
    type: "ConfirmTripDeparture", command_id: "pa-c2", occurred_at: T, unit_id: "ITAIM", trip_id: "PA-T1",
    actor: { actor_id: "pa-rider", role: "motoboy_interno" },
  } as Parameters<EntregasApplicationService["execute"]>[0]);
  assert.equal(r2.ok, true);
}

test("PA24 produtor real assinando -> store.json -> feed atestável -> consumidor: fatos simulated + admissões", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pa-e2e-"));
  try {
    const store = join(dir, "store.json");
    const s = cenario();
    const p = produtor(s.registro, { producer_id: "LAB_PILOTO_ITAIM", agora: () => new Date(T) });
    await produzir(store, p.assinante);
    const gravado = JSON.parse(readFileSync(store, "utf8")) as { outbox: Array<{ attestation?: string }> };
    assert.equal(gravado.outbox.length, 3);
    assert.ok(gravado.outbox.every((r) => typeof r.attestation === "string" && r.attestation.startsWith("pa1.")));
    const { c, state } = consumidor(createFileEntregasAttestableFeed(store), s.deps);
    const r = await c.tick();
    assert.equal(r.status, "worked");
    assert.equal(r.ingested, 2, "trip_created + trip_started");
    assert.equal(r.isolated, 1, "delivery_added sem equivalência de Trip");
    assert.equal(r.quarantined, 0);
    assert.equal(s.livro.contar("admitted"), 3);
    assert.ok([...s.livro.fatos.values()].every((f) => f.source_mode === "simulated" && f.unit_id === "ITAIM"));
    assert.equal((await c.tick()).status, "idle");
    assert.ok(state.estado.checkpoint);

    // Adulteração no arquivo: o registro passa a dizer outra coisa que o assinado.
    const adulterado = JSON.parse(readFileSync(store, "utf8"));
    adulterado.outbox[2].event.unit_id = "VILA-LAB";
    writeFileSync(store, JSON.stringify(adulterado));
    const s2 = cenario();
    s2.registro.chaves.set("LAB_PILOTO_ITAIM/k1", p.chave);
    const r2 = await consumidor(createFileEntregasAttestableFeed(store), s2.deps).c.tick();
    assert.equal(r2.quarantined, 1);
    assert.equal(s2.livro.contar("quarantined", "evento_divergente_da_assinatura"), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("PA25 produtor sem chave com fronteira exigida: tudo em quarentena, zero fato", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pa-unsigned-"));
  try {
    const store = join(dir, "store.json");
    await produzir(store, null);
    const s = cenario();
    const r = await consumidor(createFileEntregasAttestableFeed(store), s.deps).c.tick();
    assert.equal(r.quarantined, 3);
    assert.equal(s.livro.fatos.size, 0);
    assert.equal(s.livro.contar("quarantined", "atestacao_ausente"), 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("PA31 atestação nunca bloqueia o domínio: evento acima do teto sai sem pa1 e cai em quarentena", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pa-grande-"));
  try {
    const store = join(dir, "store.json");
    const s = cenario();
    const p = produtor(s.registro, { producer_id: "LAB_P" });
    const uow = uowComAtestacao(openFileUnitOfWork(store), p.assinante);
    const grande = { ...evento("G1"), payload: { lab_only: true, texto: "x".repeat(30_000) } };
    const pequeno = evento("G2");
    for (const e of [grande, pequeno]) {
      await uow.outbox.enqueue({ outbox_id: "obx_" + e.event_id, event: e, status: "pending", attempts: 0, created_at: T });
    }
    await uow.commit();
    const gravado = JSON.parse(readFileSync(store, "utf8")) as { outbox: Array<{ attestation?: string }> };
    assert.equal(gravado.outbox[0].attestation, undefined, "grande demais: sem atestação, mas gravado");
    assert.ok(gravado.outbox[1].attestation?.startsWith("pa1."));
    const r = await consumidor(createFileEntregasAttestableFeed(store), s.deps).c.tick();
    assert.equal(r.quarantined, 1);
    assert.equal(s.livro.contar("quarantined", "atestacao_ausente"), 1);
    assert.equal(r.ingested, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("PA32 tetos coerentes: claims no limite cabem no token, e o token cabe na coluna da 0010", () => {
  const b64 = Math.ceil(PRODUCER_ATTESTATION_MAX_CLAIMS / 3) * 4;
  assert.ok("pa1.".length + b64 + 1 + 86 <= PRODUCER_ATTESTATION_MAX_TOKEN);
  const sql = readFileSync("src/platform/migrations/0010_producer_attestation.sql", "utf8");
  assert.ok(sql.includes("length(attestation) BETWEEN 1 AND " + PRODUCER_ATTESTATION_MAX_TOKEN));
});

/* ================================================================== *
 * 5. Configuração e ciclo de vida
 * ================================================================== */

test("PA26 chave do piloto: nenhuma = null; parcial, mal codificada ou RSA recusam sem ecoar segredo", () => {
  assert.equal(carregarAssinanteDeProdutor({}), null);
  const { privateKey } = generateKeyPairSync("ed25519");
  const der = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  const ok = carregarAssinanteDeProdutor({
    ENTREGAS_PRODUCER_SIGNING_KEY_B64: der, ENTREGAS_PRODUCER_ID: "LAB_P", ENTREGAS_PRODUCER_KEY_ID: "k1",
  });
  assert.equal(ok?.producer_id, "LAB_P");
  const rsa = generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  const casos: Array<[NodeJS.ProcessEnv, RegExp]> = [
    [{ ENTREGAS_PRODUCER_ID: "LAB_P" }, /incompleta/],
    [{ ENTREGAS_PRODUCER_SIGNING_KEY_B64: der + "=", ENTREGAS_PRODUCER_ID: "LAB_P", ENTREGAS_PRODUCER_KEY_ID: "k1" }, /codificacao/],
    [{ ENTREGAS_PRODUCER_SIGNING_KEY_B64: rsa, ENTREGAS_PRODUCER_ID: "LAB_P", ENTREGAS_PRODUCER_KEY_ID: "k1" }, /algoritmo/],
    [{ ENTREGAS_PRODUCER_SIGNING_KEY_B64: der, ENTREGAS_PRODUCER_ID: "com espaço", ENTREGAS_PRODUCER_KEY_ID: "k1" }, /identificador/],
  ];
  for (const [env, re] of casos) {
    assert.throws(() => carregarAssinanteDeProdutor(env), (e: unknown) =>
      e instanceof Error && re.test(e.message) && !e.message.includes(der.slice(0, 16)));
  }
});

test("PA27 source-ingest: fronteira off por padrão; só off|required; desligado não muda de forma", () => {
  const base = {
    DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED: "true",
    DELIVERYOS_ENTREGAS_SOURCE_FILE: "/s", DELIVERYOS_ENTREGAS_CONSUMER_STATE_FILE: "/c",
    DELIVERYOS_ENTREGAS_KILL_SWITCH_FILE: "/k",
  };
  assert.deepEqual(loadEntregasSourceIngestConfig({}), { enabled: false });
  const cfg = loadEntregasSourceIngestConfig(base);
  assert.ok(cfg.enabled && cfg.producer_attestation === "off");
  const req = loadEntregasSourceIngestConfig({ ...base, DELIVERYOS_ENTREGAS_PRODUCER_ATTESTATION: "required" });
  assert.ok(req.enabled && req.producer_attestation === "required");
  for (const v of ["REQUIRED", "on", "true", "1", "requerido"]) {
    assert.throws(() => loadEntregasSourceIngestConfig({ ...base, DELIVERYOS_ENTREGAS_PRODUCER_ATTESTATION: v }));
  }
});

test("PA28 plano de registro recusa real, tipo desconhecido, validade ruim, chave em uso e unidade inativa", async () => {
  const usadas = new Set<string>();
  const store: ProducerAdminStore = {
    currentUser: async () => "lab_owner",
    unitActive: async (u) => (u === "ITAIM" ? true : u === "FECHADA" ? false : null),
    key: async () => null,
    keyByPublic: async (raw) => (usadas.has(raw.toString("hex")) ? { producer_id: "X", key_id: "k" } : null),
    register: async () => true,
    revoke: async () => true,
  };
  const par = generateKeyPairSync("ed25519");
  const spki = par.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const bruto = {
    producer_id: "LAB_P", key_id: "k1", unit_id: "ITAIM", public_key_spki_b64: spki,
    event_types: "trip_created,trip_started", modes: "simulated",
    not_before: "2026-10-20T00:00:00Z", not_after: "2026-12-20T00:00:00Z", registered_by: "lab",
  };
  const ok = await planRegister(store, bruto);
  assert.equal(ok.plan.can_apply, true);
  assert.equal(producerPlanFingerprint(ok.plan), producerPlanFingerprint((await planRegister(store, bruto)).plan));
  const conflitos = async (o: Partial<typeof bruto>) => (await planRegister(store, { ...bruto, ...o })).plan.conflicts;
  assert.ok((await conflitos({ modes: "simulated,real" })).includes("real_nao_concedivel"));
  assert.ok((await conflitos({ event_types: "admin_override" })).includes("tipo_desconhecido:admin_override"));
  assert.ok((await conflitos({ not_after: "2026-10-19T00:00:00Z" })).includes("validade_invertida"));
  assert.ok((await conflitos({ not_after: "2028-01-01T00:00:00Z" })).includes("validade_acima_do_teto"));
  assert.ok((await conflitos({ unit_id: "FECHADA" })).includes("unit_inactive"));
  usadas.add(bytesDaChavePublicaEd25519(par.publicKey).toString("hex"));
  assert.ok((await conflitos({})).includes("chave_publica_ja_em_uso"));
});

test("PA29 nenhuma chave privada versionada (R11): chave de laboratório não vira autoridade", () => {
  const arquivos = execFileSync("git", ["ls-files", "src", "tools", "deploy", "config", "tests", "docs"], { encoding: "utf8" })
    .split("\n").filter((f) => /\.(ts|js|mjs|cjs|json|ya?ml|sql|md|env|txt|pem|key)$/.test(f));
  // Forme os marcadores em tempo de execucao: se forem literais neste
  // arquivo, a busca em git ls-files acusara o proprio detector.
  // A varredura continua incluindo ESTE teste e todos os caminhos originais.
  const pem = new RegExp(["-{5}", "BEGIN ", "(?:ENCRYPTED |RSA |EC |OPENSSH )?", "PRIVATE KEY", "-{5}"].join(""));
  const prefixoEd25519 = ["MC4CAQAwBQYDK2Vw", "BCIEI"].join("");
  assert.equal(pem.test(["-----", "BEGIN ", "PRIVATE KEY", "-----"].join("")), true);
  assert.equal(pem.test(["-----", "BEGIN ", "ENCRYPTED PRIVATE KEY", "-----"].join("")), true);
  assert.equal(pem.test(["-----", "BEGIN ", "OPENSSH PRIVATE KEY", "-----"].join("")), true);
  assert.equal(prefixoEd25519.length, 21);
  const suspeitos: string[] = [];
  for (const f of arquivos) {
    let txt = "";
    try { txt = readFileSync(f, "utf8"); } catch { continue; }
    // PKCS#8 Ed25519 base64 e PEM: detecta segredo completo, nao a descricao
    // em texto do detector; nenhum caminho e excluido por conveniencia.
    if (pem.test(txt) || txt.includes(prefixoEd25519)) suspeitos.push(f);
  }
  assert.deepEqual(suspeitos, []);
});

test("PA30 migration 0010: real não concedível, admissão append-only, sem GRANT dentro da migration", () => {
  const sql = readFileSync("src/platform/migrations/0010_producer_attestation.sql", "utf8");
  assert.match(sql, /allowed_modes <@ ARRAY\['simulated','control'\]::TEXT\[\]/);
  assert.match(sql, /assigned_mode IN \('simulated','control'\)/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON platform\.producer_admission/);
  assert.match(sql, /BEFORE TRUNCATE ON platform\.producer_admission/);
  assert.match(sql, /WHERE decision = 'admitted'/);
  assert.doesNotMatch(sql, /^\s*GRANT\b/im);
  assert.doesNotMatch(sql, /'real'/);
});

async function main(): Promise<void> {
  console.log("\n=== PROCEDÊNCIA DO PRODUTOR — MÓDULOS DE PRODUÇÃO, PORTAS DE BANCO EM MEMÓRIA ===\n");
  const falhas: string[] = [];
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed += 1;
      console.log("  ok  " + name);
    } catch (e) {
      falhas.push(name);
      console.log("  XX  " + name + ": " + (e instanceof Error ? e.message.split("\n")[0] : String(e)));
    }
  }
  if (falhas.length) {
    console.log("\nPRODUCER_ATTESTATION: " + passed + "/" + tests.length + " — " + falhas.length + " FALHA(S)");
    process.exitCode = 1;
    return;
  }
  console.log("\nPRODUCER_ATTESTATION: " + passed + "/" + tests.length +
    " PASS (CHAVES FICTICIAS EM MEMORIA; PG NAO EXERCIDO AQUI; NENHUM FATO REAL)");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
