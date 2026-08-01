/**
 * DeliveryOS — Product System · icones
 *
 * Nao ha biblioteca de icones neste repositorio e nenhuma foi instalada. Estes
 * onze sao desenhados a mao, no mesmo traco: 24x24, stroke 1.5, sem preenchimento,
 * cantos arredondados. `currentColor` para herdarem a cor do contexto.
 *
 * Icone nunca carrega significado sozinho: todo uso vem acompanhado do nome do
 * modulo em texto, e o SVG e `aria-hidden`.
 */

const D = {
  // Entregas — um percurso com duas paradas
  rota: "M5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm14-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM7 17h6a4 4 0 0 0 0-8h-2a4 4 0 0 1 0-8h6",
  // Operacao Viva — um pulso
  pulso: "M3 12h4l2.5-6 4 12 2.5-6h5",
  // Conference Brain — camadas de observacao
  camadas: "M12 4 3 8.5l9 4.5 9-4.5L12 4Zm-9 8 9 4.5 9-4.5m-18 4.5 9 4.5 9-4.5",
  // Copiloto — a forma e a sombra dela
  sombra: "M9 4a6 6 0 1 0 0 12A6 6 0 0 0 9 4Zm4.5 2.2A6 6 0 1 1 13.5 17.8",
  // CRM e Conversa
  conversa: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4V6Z",
  // Caixa
  caixa: "M3 8h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Zm0 0 2.5-4h13L21 8M12 4v16",
  // Suprimentos
  suprimentos: "M4 7 12 3l8 4v10l-8 4-8-4V7Zm0 0 8 4m0 0 8-4m-8 4v10",
  // Evolucao
  evolucao: "M4 18V9m5 9V5m5 13v-6m5 6V7",
  // Treinamento
  treinamento: "M12 4 2 9l10 5 10-5-10-5Zm-6 7.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5",
  // Selecao e RH
  pessoas:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0M16.5 11a3 3 0 1 0 0-6M18 20a5.5 5.5 0 0 0-2-4.3",
  // Gestao
  gestao: "M4 4v16h16M8 16V11m4 5V7m4 9v-3",
};

export function icone(nome, tamanho = 20) {
  const d = D[nome];
  if (!d) return "";
  return `<svg class="icone" width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}

export const ICONES_DISPONIVEIS = Object.keys(D);
