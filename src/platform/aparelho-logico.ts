/**
 * Aparelho LÓGICO — o contrato do Android, em TypeScript, para a cadeia ser
 * provada sem telefone físico.
 *
 * Isto NÃO é o aplicativo. É uma réplica fiel do que `DeviceSession.kt`,
 * `EntregasApi.kt` e `SyncWorker.kt` decidem, sobre um Room de arquivo:
 *
 *  - `gps_point` com `syncState` pending|failed|sent, chave `gps:<dev>:<trip>:<occurred_at>`
 *    e inserção IGNORE (a mesma amostra nunca vira dois pontos);
 *  - `device_state` chave/valor: device_id, device_secret, session_token,
 *    session_token_expires_at, device_revoked_at;
 *  - a tabela de decisão do `SyncWorker.doWork()`: só marca `sent` com recibo;
 *    401 é credencial, nunca lote; 403 na sessão é revogação local; falha de
 *    rede é retentável; nenhum caminho apaga ponto.
 *
 * Toda linha aqui que divergir do Kotlin é um defeito DESTE arquivo, não do
 * app — e o `run-android-project-tests` continua sendo quem olha o Kotlin. O
 * que este arquivo compra é poder plantar, em teste, os defeitos que o
 * cliente NÃO pode ter (apagar ponto em 401, tratar 401 como sucesso, trocar a
 * chave no reenvio) e ver a propriedade acusar.
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const APARELHO_LOGICO_VERSION = "aparelho-logico@1.0.0";
export const CLIENT_SCHEMA_VERSION = "android-client@1.0.0";

/* ------------------------------------------------------------------ *
 * Room de arquivo
 * ------------------------------------------------------------------ */

export type EstadoDeSync = "pending" | "failed" | "sent";

export interface PontoLocal {
  pointId: string;
  idempotencyKey: string;
  tripId: string;
  deviceId: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  occurredAt: string;
  sequenceLocal: number;
  provider: string;
  isMock: boolean;
  capturedOffline: boolean;
  syncState: EstadoDeSync;
  attempts: number;
  lastError: string | null;
  createdAtMs: number;
}

interface Disco {
  device_state: Record<string, { value: string; updatedAtMs: number }>;
  gps_point: PontoLocal[];
}

/** Gravação atômica: escreve ao lado e renomeia. Ponto pela metade não existe. */
function gravarAtomico(caminho: string, conteudo: string): void {
  const tmp = `${caminho}.tmp`;
  writeFileSync(tmp, conteudo);
  renameSync(tmp, caminho);
}

export class RoomDeArquivo {
  private readonly arquivo: string;
  private disco: Disco;

  constructor(readonly diretorio: string) {
    mkdirSync(diretorio, { recursive: true });
    this.arquivo = join(diretorio, "entregas.db.json");
    this.disco = existsSync(this.arquivo)
      ? (JSON.parse(readFileSync(this.arquivo, "utf8")) as Disco)
      : { device_state: {}, gps_point: [] };
  }

  private persistir(): void {
    gravarAtomico(this.arquivo, JSON.stringify(this.disco));
  }

  /* device_state */
  get(chave: string): string | null {
    return this.disco.device_state[chave]?.value ?? null;
  }
  put(chave: string, valor: string, agoraMs: number): void {
    this.disco.device_state[chave] = { value: valor, updatedAtMs: agoraMs };
    this.persistir();
  }
  clear(chave: string): void {
    delete this.disco.device_state[chave];
    this.persistir();
  }

  /* gps_point — as mesmas consultas do GpsPointDao */
  insert(p: PontoLocal): boolean {
    if (this.disco.gps_point.some((x) => x.pointId === p.pointId)) return false; // IGNORE
    this.disco.gps_point.push(p);
    this.persistir();
    return true;
  }
  nextBatch(limite: number): PontoLocal[] {
    return this.disco.gps_point
      .filter((p) => p.syncState === "pending" || p.syncState === "failed")
      .sort((a, b) => a.sequenceLocal - b.sequenceLocal)
      .slice(0, limite)
      .map((p) => ({ ...p }));
  }
  markSent(ids: readonly string[]): void {
    for (const p of this.disco.gps_point) if (ids.includes(p.pointId)) p.syncState = "sent";
    this.persistir();
  }
  markFailed(ids: readonly string[], erro: string): void {
    for (const p of this.disco.gps_point) {
      if (!ids.includes(p.pointId)) continue;
      p.syncState = "failed";
      p.attempts += 1;
      p.lastError = erro;
    }
    this.persistir();
  }
  pendingCount(): number {
    return this.disco.gps_point.filter((p) => p.syncState !== "sent").length;
  }
  maxSequence(): number {
    return this.disco.gps_point.reduce((m, p) => Math.max(m, p.sequenceLocal), 0);
  }
  todos(): readonly PontoLocal[] {
    return this.disco.gps_point.map((p) => ({ ...p }));
  }
}

/* ------------------------------------------------------------------ *
 * Identidade — DeviceId.ensure + o segredo do aparelho
 * ------------------------------------------------------------------ */

export const KEY_DEVICE_ID = "device_id";
export const KEY_DEVICE_SECRET = "device_secret";
export const KEY_SESSION_TOKEN = "session_token";
export const KEY_TOKEN_EXPIRA_EM = "session_token_expires_at";
export const KEY_REVOGADO_EM = "device_revoked_at";

export function ensureDeviceId(db: RoomDeArquivo, agoraMs: number): string {
  const existente = db.get(KEY_DEVICE_ID);
  if (existente) return existente;
  const id = `dev-${randomBytes(8).toString("hex")}`;
  db.put(KEY_DEVICE_ID, id, agoraMs);
  return id;
}

/** 128 bits do gerador criptográfico. Gerado uma vez; só sai no bootstrap. */
export function ensureDeviceSecret(db: RoomDeArquivo, agoraMs: number): string {
  const existente = db.get(KEY_DEVICE_SECRET);
  if (existente) return existente;
  const s = randomBytes(16).toString("hex");
  db.put(KEY_DEVICE_SECRET, s, agoraMs);
  return s;
}

/* ------------------------------------------------------------------ *
 * EntregasApi — erro estruturado, nunca exceção solta
 * ------------------------------------------------------------------ */

export type ApiResult =
  | { tipo: "ok"; value: Record<string, unknown> }
  | { tipo: "retryable"; reason: string; status?: number }
  | { tipo: "rejected"; reason: string; status: number }
  | { tipo: "unauthorized"; reason: string; status: number };

export class EntregasApi {
  constructor(
    private readonly baseUrl: string,
    private readonly tokenProvider: () => string | null,
    private readonly timeoutMs = 3000,
  ) {}

  private async request(path: string, body: unknown): Promise<ApiResult> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=utf-8",
      "X-Entregas-Client": CLIENT_SCHEMA_VERSION,
    };
    const token = this.tokenProvider();
    if (token) headers.Authorization = `Bearer ${token}`;
    let r: Response;
    try {
      r = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      // Rede caiu, servidor fora, timeout. Tudo retentável.
      return { tipo: "retryable", reason: e instanceof Error ? e.name : String(e) };
    }
    const texto = await r.text();
    let json: Record<string, unknown> = {};
    try {
      json = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
    } catch {
      return { tipo: "rejected", reason: "resposta inesperada do servidor", status: 0 };
    }
    const humano = typeof json.humano === "string" ? json.humano : typeof json.human === "string" ? json.human : texto;
    if (r.status >= 200 && r.status < 300) return { tipo: "ok", value: json };
    if (r.status === 401) return { tipo: "unauthorized", reason: humano, status: 401 };
    if (r.status >= 400 && r.status < 500) return { tipo: "rejected", reason: humano, status: r.status };
    return { tipo: "retryable", reason: `servidor respondeu ${r.status}`, status: r.status };
  }

  authenticateDevice(deviceId: string, deviceSecret: string, appVersion: string): Promise<ApiResult> {
    return this.request("/api/device/session", {
      device_id: deviceId,
      device_secret: deviceSecret,
      app_version: appVersion,
      client: CLIENT_SCHEMA_VERSION,
    });
  }

  sendPoints(points: readonly Record<string, unknown>[], correlationId: string): Promise<ApiResult> {
    return this.request("/api/gps/batch", {
      schema_version: CLIENT_SCHEMA_VERSION,
      correlation_id: correlationId,
      points,
    });
  }
}

/* ------------------------------------------------------------------ *
 * DeviceSession — obter, guardar, usar, limpar
 * ------------------------------------------------------------------ */

const FOLGA_DE_RENOVACAO_MS = 60 * 60 * 1000;

export interface Sessao {
  token: string;
  expiraEmMs: number;
}

export type ResultadoAutenticacao =
  | { tipo: "autenticado" }
  | { tipo: "falhou_temporariamente"; motivo: string }
  | { tipo: "revogado"; motivo: string }
  | { tipo: "precisa_de_humano"; motivo: string };

export const DeviceSession = {
  sessaoAtual(db: RoomDeArquivo): Sessao | null {
    const token = db.get(KEY_SESSION_TOKEN);
    if (!token) return null;
    const expira = Number(db.get(KEY_TOKEN_EXPIRA_EM) ?? "0");
    return { token, expiraEmMs: Number.isFinite(expira) ? expira : 0 };
  },
  estaRevogado(db: RoomDeArquivo): boolean {
    return db.get(KEY_REVOGADO_EM) !== null;
  },
  precisaAutenticar(sessao: Sessao | null, agoraMs: number): boolean {
    if (!sessao) return true;
    return agoraMs >= sessao.expiraEmMs - FOLGA_DE_RENOVACAO_MS;
  },
  async autenticar(db: RoomDeArquivo, api: EntregasApi, deviceId: string, appVersion: string, agoraMs: number): Promise<ResultadoAutenticacao> {
    const segredo = ensureDeviceSecret(db, agoraMs);
    const r = await api.authenticateDevice(deviceId, segredo, appVersion);
    switch (r.tipo) {
      case "ok": {
        const token = typeof r.value.device_token === "string" ? r.value.device_token : "";
        if (!token) return { tipo: "falhou_temporariamente", motivo: "resposta sem device_token" };
        const validadeS = Number(r.value.expires_in_s ?? 0);
        const expiraEm = validadeS > 0 ? agoraMs + validadeS * 1000 : Date.parse(String(r.value.expires_at ?? "")) || 0;
        db.put(KEY_SESSION_TOKEN, token, agoraMs);
        db.put(KEY_TOKEN_EXPIRA_EM, String(expiraEm), agoraMs);
        db.clear(KEY_REVOGADO_EM);
        return { tipo: "autenticado" };
      }
      case "unauthorized":
        return { tipo: "precisa_de_humano", motivo: r.reason };
      case "rejected":
        if (r.status === 403) {
          db.put(KEY_REVOGADO_EM, String(agoraMs), agoraMs);
          DeviceSession.limparCredencial(db);
          return { tipo: "revogado", motivo: r.reason };
        }
        return { tipo: "precisa_de_humano", motivo: r.reason };
      case "retryable":
        return { tipo: "falhou_temporariamente", motivo: r.reason };
    }
  },
  /** Apaga a credencial — e SOMENTE a credencial. */
  limparCredencial(db: RoomDeArquivo): void {
    db.clear(KEY_SESSION_TOKEN);
    db.clear(KEY_TOKEN_EXPIRA_EM);
  },
};

/* ------------------------------------------------------------------ *
 * O aparelho: captura, sincroniza
 * ------------------------------------------------------------------ */

export interface OpcoesDoAparelho {
  diretorio: string;
  /** URL da PLATAFORMA (runtime crítico): sessão e GPS. Nunca a do piloto. */
  plataformaUrl: string;
  appVersion?: string;
  agora?: () => number;
}

export type ResultadoDeSync = "success" | "retry";

export class AparelhoLogico {
  readonly db: RoomDeArquivo;
  readonly deviceId: string;
  plataformaUrl: string;
  private readonly appVersion: string;
  private readonly agora: () => number;

  constructor(o: OpcoesDoAparelho) {
    this.db = new RoomDeArquivo(o.diretorio);
    this.agora = o.agora ?? (() => Date.now());
    this.deviceId = ensureDeviceId(this.db, this.agora());
    ensureDeviceSecret(this.db, this.agora());
    this.plataformaUrl = o.plataformaUrl;
    this.appVersion = o.appVersion ?? "1.0.0-logico";
  }

  /** `TripLocationService` → Room: gravado ANTES de qualquer rede. */
  capturar(tripId: string, lat: number, lon: number, occurredAt: string, opcoes: { offline?: boolean; mock?: boolean } = {}): boolean {
    const chave = `gps:${this.deviceId}:${tripId}:${occurredAt}`;
    return this.db.insert({
      pointId: chave,
      idempotencyKey: chave,
      tripId,
      deviceId: this.deviceId,
      latitude: lat,
      longitude: lon,
      accuracyM: 8,
      occurredAt,
      sequenceLocal: this.db.maxSequence() + 1,
      provider: "fused",
      isMock: opcoes.mock === true,
      capturedOffline: opcoes.offline === true,
      syncState: "pending",
      attempts: 0,
      lastError: null,
      createdAtMs: this.agora(),
    });
  }

  /** A tabela de decisão do `SyncWorker.doWork()`. */
  async sincronizar(): Promise<ResultadoDeSync> {
    const db = this.db;
    const agoraMs = this.agora();
    const correlationId = `sync-${agoraMs}`;

    if (DeviceSession.estaRevogado(db)) return "success";

    let sessao = DeviceSession.sessaoAtual(db);
    if (DeviceSession.precisaAutenticar(sessao, agoraMs)) {
      const semCredencial = new EntregasApi(this.plataformaUrl, () => null);
      const a = await DeviceSession.autenticar(db, semCredencial, this.deviceId, this.appVersion, agoraMs);
      switch (a.tipo) {
        case "autenticado":
          sessao = DeviceSession.sessaoAtual(db);
          break;
        case "revogado":
          return "success";
        case "falhou_temporariamente":
        case "precisa_de_humano":
          if (!sessao) return "retry";
      }
    }

    const tokenAtual = sessao?.token ?? null;
    const api = new EntregasApi(this.plataformaUrl, () => tokenAtual);
    let retryable = false;
    let credencialRecusada = false;

    const points = db.nextBatch(100);
    if (points.length) {
      const ids = points.map((p) => p.pointId);
      const payloads = points.map((p) => ({
        point_id: p.pointId,
        idempotency_key: p.idempotencyKey,
        trip_id: p.tripId,
        device_id: p.deviceId,
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy_m: p.accuracyM,
        occurred_at: p.occurredAt,
        provider: p.provider,
        is_mock: p.isMock,
        captured_offline: p.capturedOffline,
        sequence_local: p.sequenceLocal,
        source: "device",
      }));
      const r = await api.sendPoints(payloads, correlationId);
      switch (r.tipo) {
        case "ok":
          db.markSent(ids);
          break;
        case "retryable":
          db.markFailed(ids, r.reason);
          retryable = true;
          break;
        case "unauthorized":
          // Credencial recusada é problema de credencial, não do que foi coletado.
          db.markFailed(ids, r.reason);
          credencialRecusada = true;
          break;
        case "rejected":
          db.markFailed(ids, r.reason);
          break;
      }
    }

    if (credencialRecusada) {
      DeviceSession.limparCredencial(db);
      return "retry";
    }
    return retryable ? "retry" : "success";
  }
}
