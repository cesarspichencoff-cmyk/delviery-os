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
  const origens = new Map<string, Origem>();
  const de = (k: string): Origem => {
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
      const o = origens.get(origem);
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
      if (o.falhas.length >= maxFailures) {
        o.travadoAte = t + lockMs;
        o.falhas = [];
      }
    },
  };
}

export const MUITAS_TENTATIVAS = "Muitas tentativas com código errado. Aguarde alguns minutos.";
