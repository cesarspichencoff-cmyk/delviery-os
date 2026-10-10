/**
 * Product UI — messages for retryable HTTP read overload (Q-026 candidate).
 * These are presentation-only messages. Never interpret a 503 as "zero
 * deliveries", and never replace a previously timestamped reading.
 */
export function falhaDeLeituraHttp(status, retryAfter) {
  const n = Number(status);
  const delay = Number(retryAfter);
  const segundos = Number.isInteger(delay) && delay >= 1 && delay <= 60
    ? delay : null;
  // Deliberately do not store a response body/URL; it could disclose
  // infrastructure internals. The UI only needs the status class.
  return Object.assign(new Error("HTTP_LEITURA_INDISPONIVEL"), {
    status: Number.isInteger(n) ? n : 0,
    retryAfterSegundos: n === 503 ? segundos : null,
  });
}

export function mensagemDeSobrecarga(error, houveLeituraAnterior = false) {
  if (!error || error.status !== 503) return null;
  const segundos = error.retryAfterSegundos;
  const tempo = Number.isInteger(segundos) && segundos >= 1 && segundos <= 60
    ? `Aguarde pelo menos ${segundos} segundo(s) antes de tentar novamente.`
    : "Tente novamente em instantes.";
  const contexto = houveLeituraAnterior
    ? "A leitura anterior continua visível e envelhecendo; não foi substituída por dados vazios."
    : "Não foi possível consultar os dados atuais. Isso não significa que não haja entregas.";
  return `A leitura de Entregas está temporariamente ocupada. ${tempo} ${contexto}`;
}
