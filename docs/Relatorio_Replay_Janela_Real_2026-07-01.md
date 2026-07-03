# Relatório — Primeiro Replay com Dado Real (janela 30/06 21h → 01/07 21h)

> A pergunta do experimento: **o que o DeliveryOS enxergaria se, pela primeira vez, recebesse
> composição real + timing real + desfecho real na mesma janela operacional?**
> Executado por `tools/replay_janela_real_2026-07-01.js`, isolado: motor, camada de decisão, seed,
> baseline e backtest oficial **intocados** (importados read-only). Saídas em `data/generated/`
> (fora do Git). Reproduzível: rodar o script re-gera tudo deterministicamente.

## 1. Resumo executivo

Pela primeira vez o DeliveryOS enxergou uma janela operacional inteira — 23,9 horas, 238 pedidos —
sem imaginar nada: composição real de cada pedido, tempos reais de produção/expedição/entrega,
cancelamentos e negociações reais. Rodamos a mesma janela duas vezes: uma com a composição real, outra
com a composição sintética que o backtest oficial usa até hoje. O timing é idêntico nos dois — provado
por sanity check (focos de tempo iguais) — então **toda diferença vem de uma coisa só: parar de
imaginar o que havia dentro de cada sacola.**

O resultado central: **a síntese fazia o motor subestimar a pressão real da noite e recomendar ações
erradas na direção errada.** Com dado real, a operação é menos calma (201min vs 255min), as praças
carregam mais (Enrolados Quentes: 165min de sobrecarga real vs 16 imaginados), os "pedidos simples
prontos para fechar" praticamente desaparecem (13% real vs 68% imaginado), e as sacolas duplas — a
maior fonte de item esquecido — triplicam (146 vs 41). E cada recomendação passou a sair com
**confiança alta** (24/24), sem o sussurro de incerteza: a certeza ficou silenciosa, como o manifesto
pede.

## 2. Janela exata

**30/06/2026 21:02 → 01/07/2026 20:59** (23,9h), definida pelos dados (primeiro e último pedido do
HTML confirmados na logística), não por calendário. Eixo de tempo contínuo em minutos desde 30/06
00:00 (a janela cruza a meia-noite; o motor não precisou de nenhuma alteração — só aritmética
relativa). Simulação até +90min após o último pedido (drenagem das entregas em curso; mesmo range nas
duas execuções — comparação justa).

## 3. Fontes usadas

| Fonte | Papel | Registros usados |
|---|---|---|
| `relatorio_pedidos_01-07.html` (via jsonl validado) | composição: itens, qtd, preço, status | 238 pedidos · 744 itens (100% casados no seed) |
| `relatorio_logistica_2026-06-26_2026-07-02.xlsx` | timing: pedido, pronto, saiu, entregue, espera motoboy | 238/238 com timing completo |
| `relatorio_cancelamento.xlsx` | desfecho (motivo, itens, parcial/total) | 5/5 casados na janela, 0 ambíguos |
| `relatorio_negociacoes.xlsx` | desfecho (reembolso, evitado, arbitragem) | 10/10 casados, 0 ambíguos |
| `cardapio_knowledge_seed.json` | Motor C: praça, kit, sacolas, temperatura | 199 itens (read-only) |

## 4. Fontes excluídas e motivo

- **Avaliações** — sem ID de pedido em nenhuma aba; join honesto não existe. Fora.
- **Dashboards, vendas, Curva ABC, qualidade** — agregados; usá-los como evento pedido-a-pedido seria
  mentir a granularidade. Fora da simulação (contexto apenas).

## 5. Qualidade dos joins

Chave primária: **ID completo (uuid)** — 238/250 do HTML casados com a logística. Desfechos por ID
curto→logística→uuid, **por dia, com colisão detectada e descartada** (1 ID curto colidiu na janela;
os 15 desfechos casados usaram só IDs únicos — 15/15, zero join às cegas).

## 6. Cobertura (portão V1 — passou antes de qualquer simulação)

**100,0%**: todos os 238 pedidos da logística dentro da janela estão no HTML. Zero faltantes. O HTML
não é amostra — é o universo completo da janela. (Detalhe: `--v1` no script re-imprime o portão.)

## 7. Pedidos incluídos

238 pedidos vivos (233 concluídos + 5 cancelados, que existem até o minuto do cancelamento).

## 8. Pedidos excluídos

- **11 `DECLINED`** — recusados pela loja; nunca entraram em produção (não têm ciclo logístico por
  natureza). Contexto, não pedido vivo.
- **1 `CONCLUDED` sem registro logístico** (11:45) — retirada provável; sem timing, entrar seria inventar.
- **42 pedidos de 01/07 pós-21h** — têm timing, não têm composição (depois do fim da janela do HTML).

## 9. Eventos reconstruídos

Método já oficial do Motor A (nenhuma fórmula nova): `pronto = pedido + botão_pronto` ·
`entregue = pedido + entrega_realizada` · `saiu = pedido + (entrega − a_caminho_cliente −
esperando_cliente)` · `cancelado = minuto do pedido` (o export não traz hora do cancelamento —
aproximação conservadora, rotulada).

## 10. Campos ausentes (explícitos, não maquiados)

Observação do cliente (não existe em nenhum arquivo do lote) · hora real do aceite (aproximada ao
pedido, como sempre) · hora real do cancelamento · pronto-por-praça (só KDS dará) · eventos de pausa
de item.

## 11. Comparação real × sintético (mesma janela, mesmo timing)

| Métrica | REAL | SINTÉTICO | Leitura |
|---|---:|---:|---|
| Minutos em calmo (operacionais) | 201 | 255 | a noite real é menos calma do que a síntese imaginava |
| Minutos em foco | 154 | 99 | +55% de tempo em foco com dado real |
| Focos (onsets) | 24 | 17 | — |
| … de praça | 11 | 4 | pressão real de bancada quase 3× maior |
| … de conferência | 8 | 2 | 2ª sacola/kit real triplica o risco visível |
| … de fechamento | **0** | **8** | os "prontos pra fechar" da síntese eram ficção |
| … de pedido preso (timing) | 5 | 5 | idênticos — sanity OK |
| Recomendações | 24 | 16 | — |
| Confiança alta | **24/24** | 2/16 | o sussurro de incerteza desaparece da tela |
| Pedidos de praça única | 32 (13%) | 162 (68%) | o viés central da síntese |
| Pedidos com 2ª sacola / kit | 146 (61%) | 41 (17%) | idem, invertido |
| Sobrecarga Combinados (min) | 302 | 109 | — |
| Sobrecarga Enrolados (min) | 275 | 102 | — |
| Sobrecarga Enrolados Quentes (min) | 165 | 16 | praça quase invisível na síntese |
| Sobrecarga Quentes (min) | 166 | 61 | — |
| Sobrecarga Duplas (min) | 214 | 209 | única praça onde a síntese acertava (concentra 64 itens do cardápio) |

## 12. Exemplos reais onde a decisão mudou

**30/06 22:52 — mesma hora, ação oposta (o exemplo central).**
Sintético: *"Fechar pedidos simples agora — 3 pedidos dependem só de Quentes"* → `#111bfe7f`,
`#2cdf5bb0`, `#d1262b90`. Real, para **os mesmos pedidos**: *"Conferência reforçada — 2 sacolas ·
bebida · kit"*. A síntese mandava acelerar o fechamento de pedidos que na verdade eram grandes, com
segunda sacola e kit — exatamente os pedidos onde acelerar é o que faz esquecer item. A composição
real inverte a ação: não é "feche rápido", é "confira com atenção".

**30/06 22:09 — o mesmo pedido, causa diferente.**
Sintético: *"Conferir saída do `#38f93b72` — pronto há 34 min sem sair"* (só timing). Real:
*"Conferência reforçada — 2 sacolas · kit"* no mesmo pedido. O dado real explica **por que** o pedido
está parado — é um pedido grande em montagem — e aponta a ação específica, não só "olhe a saída".

**Tarde/noite de 01/07 — a praça errada o turno inteiro.**
Sintético: 6 recomendações "Priorizar **Duplas**" seguidas (12:06→21:09, release impact imaginado de
6–15 pedidos). Real: a pressão se distribui — Combinados (11:56, 12:54), **Enrolados** (12:06, 13:05,
18:23), **Quentes** (19:17, 21:09), Duplas só em parte. Uma operação seguindo a síntese teria olhado
para uma bancada enquanto outras três carregavam.

## 13. Onde a síntese enganava o motor (padrões, não casos)

1. **Fechamentos fantasma:** 8 focos + 4 recomendações "fechar pedidos simples" que não existem com
   composição real (0 focos de fechamento na noite real).
2. **Cegueira de sacola:** 105 pedidos com 2ª sacola/kit que a síntese não via — a maior fonte real de
   item esquecido (415+ menções de "faltou" no WhatsApp) ficava invisível.
3. **Praça errada:** atenção concentrada em Duplas enquanto Enrolados/Quentes/Combinados carregavam.
4. **Falsa calma:** 54 minutos operacionais a mais de "calmo" que a noite real não teve.

## 14. Sinais avaliados com dado real

Praça sobrecarregada · combinados segurando fluxo · conferência reforçada (2ª sacola/kit/bebida) ·
pedido preso · release impact ("N saem se a praça liberar") · pedido âncora · Camada de Decisão
completa com confiança alta automática (`fonteReal: true` — regra que já existia, agora exercida pela
primeira vez).

## 15. Sinais ainda não avaliáveis

Observação do cliente (S20) · fechável-como-fato / pronto-por-praça (S9/S12/S13 — só KDS) · item
pausado (S15/S16 — sem eventos de pausa) · ruptura/ficha técnica (S17) · review↔pedido (avaliações sem
ID). O "fechamento" real (0 focos) reflete `pracaUnica` real baixa — não significa que fechamento não
exista como sinal; significa que ele é raro de verdade e que a versão plena precisa do pronto-por-praça.

## 16. Limitações

- Durações D+1 oficiais, não carimbos ao vivo (mesma limitação estrutural do Motor A oficial — rotulada).
- Cancelados: sem hora do cancelamento → `c = minuto do pedido` (conservador; encurta a vida deles).
- Janela específica (terça-noite + quarta): 1 janela não é amostra estatística — padrões aqui são
  desta noite, não leis.
- IDs exibidos como `uuid[0:8]` (houve 1 colisão de ID curto na janela; legibilidade sacrificada pela
  exatidão).

## 17. Riscos

- **Foco em 24% dos minutos operacionais** (154/647) — bem acima dos ~13% do backtest sintético. Com
  carga real, os baselines provisórios saturam mais. Risco de nag se isso virasse produção sem
  calibração — **é exatamente o dado que o tuning futuro (com aprovação) precisa; nada foi tunado.**
- Recomendações de conferência re-disparam para o mesmo pedido (`#38f93b72` 2×) — cooldown por pedido
  é aprendizado de produto para a fase própria.
- Micro-achado cosmético pré-existente: `decisao.js` gera "1 pedido **sae**" (pluralização). Não
  corrigido (motor intocado por regra desta fase).

## 18. Aprendizados para o produto

- **A composição não adiciona detalhe — muda a direção da ação.** O caso 22:52 (fechar → conferir) é a
  prova: dado real não é "mais precisão", é outra decisão.
- **A conferência é o sinal subestimado.** 61% dos pedidos reais têm 2ª sacola/kit. A bancada de
  montagem é onde a noite real pede atenção — bate com os 4 anos de WhatsApp ("faltou", "esqueceram").
- **A certeza silenciosa funciona.** 24/24 recomendações em confiança alta: a tela fica mais limpa
  conforme o dado melhora, sem uma linha de código nova — a regra já esperava por isso.

## 19. Aprendizados para a arquitetura

- O seam único (`FONTE_ITENS`) cumpriu a promessa: trocar síntese→real não tocou uma regra sequer.
- O eixo de tempo contínuo atravessou a meia-noite sem alteração no motor — o `step()` relativo provou
  ser a abstração certa.
- O join em dois saltos (curto→logística→uuid) com detecção de colisão é o padrão a repetir no Mapa
  Canônico: nada entra por join às cegas.

## 20. Recomendação sobre integração futura

O experimento confirma que a integração de composição real é **a alavanca nº 1 de fidelidade** do
DeliveryOS — mas 1 janela não é regime. Recomendo: (a) repetir este replay para 2–3 janelas novas
(mesmo método, custo quase zero) antes de qualquer decisão de tuning; (b) manter a síntese como
fallback rotulado, nunca como padrão silencioso; (c) só então abrir a discussão de calibração de
baseline com dado real acumulado. Integração permanente continua dependendo de fonte contínua
(API iFood — `docs/Fonte_Real_Itens_Plano.md`).

## 21. O que pedir ao iFood para tornar isso definitivo

1. Export diário de pedidos **com itens** gerado após o fim do dia (ou API de pedidos) — elimina a
   janela deslocada.
2. Relatório de logística sempre do mesmo período — é o par obrigatório da composição.
3. Hora do cancelamento (hoje só a hora do pedido).
4. Observações do cliente por pedido.
5. Avaliações com ID de pedido.

---
*Saídas geradas (fora do Git): `replay_janela_real_2026-07-01_resumo.json`, `_focos_real.jsonl`,
`_focos_sintetico.jsonl`, `_recs_real.jsonl`, `_recs_sintetico.jsonl` em `data/generated/`.*
