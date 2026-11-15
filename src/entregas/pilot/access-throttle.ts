/**
 * Limite de tentativas de código de acesso, por origem da conexão.
 *
 * Os códigos do piloto podem ser curtos (decisão do César em 31/10: quatro
 * dígitos por terminal). Sem limite, qualquer um que alcance o servidor os
 * adivinha em segundos. Depois de `maxFailures` códigos errados na janela, a
 * origem fica travada: código desconhecido recebe 429 SEM ser conferido (não
 * vira oráculo de acerto), e só segue quem já tinha entrado daquela origem
 * antes da trava — o tablet logado não cai porque alguém errou na rede.
 * Memória do processo apenas; nada de código vai a disco ou log.
 */
export interface AccessThrottleOptions {
  maxFailures?: number;
  windowMs?: number;
  lockMs?: number;
  now?: () => number;
  /**
   * Origens DECLARADAS como compartilhadas (proxy reverso do NetBird, portao de
   * campo em loopback): atras delas todo motoboy chega do mesmo endereco, e cinco
   * erros de UM travavam o login NOVO de todos por 15 min. Elas ganham orcamento
   * proprio; a contagem, a trava de codigo desconhecido e a passagem de quem ja
   * entrou continuam iguais. So e aceito com codigos longos (ver
   * `loadSharedOrigins`): o orcamento maior nao abre adivinhacao viavel.
   */
  sharedOrigins?: ReadonlySet<string>;
  sharedMaxFailures?: number;
}

/** Mesma origem escrita de dois jeitos pelo socket (IPv4 mapeado em IPv6). */
export function normalizeOrigin(origem: string): string {
  return origem.startsWith("::ffff:") ? origem.slice(7) : origem;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

/**
 * ENTREGAS_SHARED_ORIGINS: lista exata de enderecos IP, separados por virgula.
 * Recusa (o piloto nao sobe) fora do modo remoto, onde codigos curtos sao
 * permitidos, e qualquer item que nao seja IP literal (nada de faixa, curinga
 * ou nome).
 */
export function loadSharedOrigins(raw: string | undefined, remote: boolean): ReadonlySet<string> {
  const itens = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!itens.length) return new Set();
  if (!remote) throw new Error("ENTREGAS_SHARED_ORIGINS so vale no modo remoto, onde o codigo tem no minimo 24 caracteres");
  for (const i of itens) {
    const n = normalizeOrigin(i);
    if (!IPV4.test(n) && !(n.includes(":") && IPV6.test(n))) throw new Error(`ENTREGAS_SHARED_ORIGINS: '${i}' nao e endereco IP literal`);
  }
  return new Set(itens.map(normalizeOrigin));
}

interface Origem {
  falhas: number[];
  travadoAte: number;
  conhecidos: Set<string>;
}

export function createAccessThrottle(opts: AccessThrottleOptions = {}) {
  const maxFailures = opts.maxFailures ?? 5;
  const windowMs = opts.windowMs ?? 15 * 60_000;
  const lockMs = opts.lockMs ?? 15 * 60_000;
  const now = opts.now ?? (() => Date.now());
  const shared = opts.sharedOrigins ?? new Set<string>();
  const sharedMax = opts.sharedMaxFailures ?? 40;
  const limite = (k: string) => (shared.has(k) ? sharedMax : maxFailures);
  const origens = new Map<string, Origem>();
  const de = (bruta: string): Origem => {
    const k = normalizeOrigin(bruta);
    let o = origens.get(k);
    if (!o) {
      o = { falhas: [], travadoAte: 0, conhecidos: new Set() };
      origens.set(k, o);
    }
    return o;
  };
  return {
    /** Travado para ESTE código? Código já aceito desta origem segue. */
    blocked(origem: string, codigo: string): boolean {
      const o = origens.get(normalizeOrigin(origem));
      if (!o || o.travadoAte <= now()) return false;
      return !o.conhecidos.has(codigo);
    },
    success(origem: string, codigo: string): void {
      de(origem).conhecidos.add(codigo);
    },
    failure(origem: string): void {
      const o = de(origem);
      const t = now();
      o.falhas = o.falhas.filter((x) => t - x < windowMs);
      o.falhas.push(t);
      if (o.falhas.length >= limite(normalizeOrigin(origem))) {
        o.travadoAte = t + lockMs;
        o.falhas = [];
      }
    },
  };
}

export const MUITAS_TENTATIVAS = "Muitas tentativas com código errado. Aguarde alguns minutos.";
