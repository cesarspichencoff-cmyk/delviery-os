/**
 * Busca a saída mínima da fila de prontos no piloto, para a leitura do estado
 * atual (`lerProntosDeEntregas`, origem `observacao_do_piloto`).
 *
 * Nunca lança e nunca inventa: piloto fora do ar, sem resposta no prazo,
 * credencial recusada ou resposta ilegível viram uma declaração de fila
 * INDISPONÍVEL, com motivo — a leitura publica ausência, não zero. A validação
 * do conteúdo (campos, unidade, modo, relógio) é da leitura, não daqui.
 *
 * O token é a sessão de quem observa no piloto (gerente ou líder). Ele vai só
 * no cabeçalho `Authorization` — a rota recusa token na URL — e não aparece em
 * nenhum motivo devolvido. Esta função não escolhe credencial nem lugar de
 * rede: quem chama declara.
 */
import type { DeclaracaoDaFila } from "./prontos-de-entregas";

export const ROTA_DA_OBSERVACAO_DA_FILA = "/api/ready-orders/observation";

export async function observarFilaDoPiloto(opcoes: {
  url_base: string;
  token: string;
  prazo_ms: number;
  buscar?: typeof fetch;
}): Promise<DeclaracaoDaFila> {
  const indisponivel = (motivo: string): DeclaracaoDaFila => ({ origem: "observacao_do_piloto", indisponivel: motivo });
  let base: URL;
  try {
    base = new URL(opcoes.url_base);
  } catch {
    return indisponivel("endereco_do_piloto_invalido");
  }
  if (!opcoes.token.trim()) return indisponivel("credencial_ausente");
  if (!Number.isInteger(opcoes.prazo_ms) || opcoes.prazo_ms <= 0) return indisponivel("prazo_invalido");
  const buscar = opcoes.buscar ?? fetch;
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), opcoes.prazo_ms);
  try {
    const resposta = await buscar(new URL(ROTA_DA_OBSERVACAO_DA_FILA, base), {
      method: "GET",
      headers: { Authorization: `Bearer ${opcoes.token}`, Accept: "application/json" },
      signal: controle.signal,
      redirect: "error",
    });
    if (resposta.status === 401 || resposta.status === 403) return indisponivel("piloto_recusou_a_credencial");
    if (resposta.status !== 200) return indisponivel(`piloto_respondeu_${resposta.status}`);
    let corpo: unknown;
    try {
      corpo = JSON.parse(await resposta.text());
    } catch {
      return indisponivel("resposta_ilegivel");
    }
    return { origem: "observacao_do_piloto", observacao: corpo };
  } catch {
    return indisponivel(controle.signal.aborted ? "piloto_sem_resposta_no_prazo" : "piloto_inalcancavel");
  } finally {
    clearTimeout(relogio);
  }
}
