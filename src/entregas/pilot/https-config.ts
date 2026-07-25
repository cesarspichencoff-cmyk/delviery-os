/**
 * HTTPS local para o piloto — pré-requisito do GPS no celular.
 *
 * A Geolocation API do navegador só funciona em contexto seguro. `localhost`
 * é exceção, mas o aparelho do motoboy acessa o servidor pelo IP da LAN —
 * que NÃO é exceção. Sem HTTPS, o GPS simplesmente não liga no celular.
 *
 * Regras (herdadas da correção de bind já aprovada no Copiloto, sem alterar
 * o Copiloto):
 *  - Certificado e chave NUNCA no Git — apenas caminhos, por variável de
 *    ambiente. Este módulo lê arquivos; não gera nem versiona chave.
 *  - Falha FECHADA: HTTPS pedido e mal configurado não cai para HTTP em
 *    silêncio — recusa subir.
 *  - Exposição na LAN é opt-in EXPLÍCITO. O default é loopback.
 *  - Nenhum túnel público, nenhum serviço pago, nenhuma exposição à internet.
 */

export interface HttpsPaths {
  cert_path?: string;
  key_path?: string;
}

export interface HttpsResolution {
  /** true = subir com TLS. */
  enabled: boolean;
  cert_path?: string;
  key_path?: string;
  /** Motivo quando não habilitado ou quando recusado. */
  reason?: string;
  /** true = configuração inválida; o servidor NÃO deve subir. */
  fatal: boolean;
}

export interface FsLike {
  existsSync(p: string): boolean;
}

/**
 * Resolve a configuração de TLS.
 *
 * - Sem `ENTREGAS_HTTPS=1` → HTTP (uso local/localhost), sem erro.
 * - Com `ENTREGAS_HTTPS=1` e paths ausentes/inexistentes → FATAL.
 *   Nunca cair para HTTP quando o operador pediu HTTPS: cair em silêncio
 *   faria o GPS falhar no celular sem explicação.
 */
export function resolveHttps(
  env: Record<string, string | undefined>,
  fs: FsLike,
): HttpsResolution {
  const wanted = env.ENTREGAS_HTTPS === "1" || env.ENTREGAS_HTTPS === "true";
  if (!wanted) {
    return {
      enabled: false,
      fatal: false,
      reason: "HTTPS não solicitado (ENTREGAS_HTTPS!=1) — servindo HTTP local",
    };
  }

  const cert_path = (env.ENTREGAS_TLS_CERT || "").trim();
  const key_path = (env.ENTREGAS_TLS_KEY || "").trim();

  if (!cert_path || !key_path) {
    return {
      enabled: false,
      fatal: true,
      reason:
        "ENTREGAS_HTTPS=1 exige ENTREGAS_TLS_CERT e ENTREGAS_TLS_KEY — servidor não sobe (falha fechada)",
    };
  }
  if (!fs.existsSync(cert_path)) {
    return {
      enabled: false,
      fatal: true,
      reason: `certificado não encontrado no caminho configurado — servidor não sobe`,
    };
  }
  if (!fs.existsSync(key_path)) {
    return {
      enabled: false,
      fatal: true,
      reason: `chave não encontrada no caminho configurado — servidor não sobe`,
    };
  }

  return { enabled: true, cert_path, key_path, fatal: false };
}

/** Hosts de loopback aceitos sem opt-in. */
export const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "::1"] as const;

export interface BindResolution {
  host: string;
  /** true quando o servidor ficará acessível na rede local. */
  exposedToLan: boolean;
  reason: string;
  fatal: boolean;
}

/**
 * Resolve o bind. Default = loopback. Exposição na LAN — necessária para o
 * celular do motoboy — é opt-in explícito por `ENTREGAS_BIND`.
 *
 * Ao expor na LAN sem TLS, avisa: o GPS não vai funcionar no aparelho.
 */
export function resolveBind(
  env: Record<string, string | undefined>,
  httpsEnabled: boolean,
): BindResolution {
  const raw = (env.ENTREGAS_BIND || "").trim();

  if (!raw) {
    return {
      host: "127.0.0.1",
      exposedToLan: false,
      reason: "default seguro: apenas loopback (para celular use ENTREGAS_BIND=0.0.0.0)",
      fatal: false,
    };
  }

  if ((LOOPBACK_HOSTS as readonly string[]).includes(raw)) {
    return {
      host: raw,
      exposedToLan: false,
      reason: "loopback explícito",
      fatal: false,
    };
  }

  // Qualquer host não-loopback expõe na LAN — exige consciência.
  const exposed: BindResolution = {
    host: raw,
    exposedToLan: true,
    reason: httpsEnabled
      ? "exposto na rede local com TLS (opt-in explícito)"
      : "exposto na rede local SEM TLS — a Geolocation API não funcionará no celular; use ENTREGAS_HTTPS=1",
    fatal: false,
  };
  return exposed;
}

/** Resumo para log de inicialização — sem caminho de chave, sem dado pessoal. */
export function startupSummary(
  https: HttpsResolution,
  bind: BindResolution,
  port: number,
): string {
  const scheme = https.enabled ? "https" : "http";
  const scope = bind.exposedToLan ? "rede local" : "somente neste computador";
  return `Entregas piloto: ${scheme}://${bind.host}:${port}/ · ${scope} · ${bind.reason}`;
}
