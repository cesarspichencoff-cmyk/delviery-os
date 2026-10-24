/**
 * Assinatura do produtor na outbox pública do piloto.
 *
 * Um único ponto: o `outbox.enqueue` da UoW que o piloto abre. Assim as três
 * escritas do EntregasApplicationService (Trip, handoff, ocorrência) saem
 * atestadas sem que o serviço saiba que a assinatura existe.
 *
 * Chave só por ambiente, os três juntos ou nenhum:
 *   ENTREGAS_PRODUCER_SIGNING_KEY_B64  PKCS#8 DER Ed25519 em base64 padrão
 *   ENTREGAS_PRODUCER_ID               id registrado na plataforma
 *   ENTREGAS_PRODUCER_KEY_ID           kid registrado na plataforma
 *
 * Nenhum = outbox sem atestação, exatamente como antes. Parcial ou inválido =
 * erro, e o servidor recusa subir. Nada de chave gerada no boot, nada de chave
 * no arquivo de config, nada de chave em log.
 *
 * Assinar NÃO dá autoridade: a plataforma confere a chave contra o registro de
 * produtores, que este processo não escreve, e nunca admite `real`.
 */
import { createPrivateKey } from "node:crypto";

import {
  criarAssinanteDeProdutor,
  idDeProdutorValido,
  type AssinanteDeProdutor,
} from "../contracts/producer-attestation";
import type { OutboxRepository, UnitOfWork } from "../persistence/ports";
import type { PilotUnitOfWorkSource } from "./pilot-storage";

export class ConfiguracaoDeProdutorInvalida extends Error {
  constructor(readonly codigo: string) {
    // Mensagem fixa: nunca ecoa o valor recebido.
    super("configuracao_de_produtor_invalida:" + codigo);
    this.name = "ConfiguracaoDeProdutorInvalida";
  }
}

const VARIAVEIS = [
  "ENTREGAS_PRODUCER_SIGNING_KEY_B64",
  "ENTREGAS_PRODUCER_ID",
  "ENTREGAS_PRODUCER_KEY_ID",
] as const;

export function carregarAssinanteDeProdutor(
  env: NodeJS.ProcessEnv,
  opcoes: { now?: () => Date } = {},
): AssinanteDeProdutor | null {
  const [chaveB64, producerId, kid] = VARIAVEIS.map((v) => env[v] ?? "");
  if (!chaveB64 && !producerId && !kid) return null;
  if (!chaveB64 || !producerId || !kid) throw new ConfiguracaoDeProdutorInvalida("incompleta");
  if (!idDeProdutorValido(producerId) || !idDeProdutorValido(kid)) {
    throw new ConfiguracaoDeProdutorInvalida("identificador");
  }
  const der = Buffer.from(chaveB64, "base64");
  if (der.length === 0 || der.length > 8192 || der.toString("base64") !== chaveB64) {
    throw new ConfiguracaoDeProdutorInvalida("codificacao");
  }
  let chave;
  try {
    chave = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  } catch {
    throw new ConfiguracaoDeProdutorInvalida("chave");
  }
  if (chave.asymmetricKeyType !== "ed25519") throw new ConfiguracaoDeProdutorInvalida("algoritmo");
  return criarAssinanteDeProdutor({
    producer_id: producerId,
    kid,
    privateKey: chave,
    ...(opcoes.now ? { now: opcoes.now } : {}),
  });
}

/**
 * A atestação nunca bloqueia o domínio: se não der para assinar (evento acima
 * do teto do contrato, chave quebrada), o registro sai SEM atestação e a
 * fronteira da plataforma o põe em quarentena (`atestacao_ausente`). Falhar o
 * comando de Entregas por causa da procedência pararia a operação para
 * proteger um consumo que já é fail-closed.
 */
function atestar(assinante: AssinanteDeProdutor, record: Parameters<OutboxRepository["enqueue"]>[0]) {
  try {
    return { ...record, attestation: assinante.assinar(record.event) };
  } catch (e) {
    console.warn(
      "[piloto] registro da outbox sem atestacao:",
      record.event?.event_id ?? "?",
      e instanceof Error ? e.message : "erro",
    );
    return record;
  }
}

function outboxAssinada(outbox: OutboxRepository, assinante: AssinanteDeProdutor): OutboxRepository {
  return {
    enqueue: (record) => outbox.enqueue(atestar(assinante, record)),
    listPending: () => outbox.listPending(),
    markPublished: (id, at) => outbox.markPublished(id, at),
    markFailed: (id, error, at) => outbox.markFailed(id, error, at),
    all: () => outbox.all(),
  };
}

/** Delegação explícita: a UoW original continua dona do estado e do commit. */
export function uowComAtestacao(uow: UnitOfWork, assinante: AssinanteDeProdutor): UnitOfWork {
  const outbox = outboxAssinada(uow.outbox, assinante);
  return {
    get trips() { return uow.trips; },
    get handoffs() { return uow.handoffs; },
    get occurrences() { return uow.occurrences; },
    get riders() { return uow.riders; },
    get events() { return uow.events; },
    get inboundReceipts() { return uow.inboundReceipts; },
    outbox,
    hasPendingWrites: () => uow.hasPendingWrites(),
    commit: () => uow.commit(),
    rollback: () => uow.rollback(),
  };
}

export function fonteComAtestacaoDeProdutor(
  fonte: PilotUnitOfWorkSource,
  assinante: AssinanteDeProdutor,
): PilotUnitOfWorkSource {
  return {
    kind: fonte.kind,
    ...(fonte.dataPath !== undefined ? { dataPath: fonte.dataPath } : {}),
    open: () => uowComAtestacao(fonte.open(), assinante),
  };
}
