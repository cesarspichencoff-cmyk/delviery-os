# Relatório de Completude — Simulação da noite de 01/07/2026

> Pergunta da fase: **"Com esse pacote, conseguimos fazer uma simulação operacional completa ou apenas
> uma simulação parcial muito mais realista?"**
> Método: tudo abaixo foi **medido** (join por ID completo, contagem por campo, minuto a minuto), não
> suposto. Nenhum motor, baseline, seed ou backtest foi tocado. Parsers exploratórios:
> `tools/parse_relatorio_pedidos_html.js` (1ª remessa) e `tools/parse_lote_ifood_2026-07-01.js`
> (2ª remessa). Saídas em `data/generated/` (gitignoradas), com hash de origem por linha.

---

## 0. A descoberta que muda a pergunta (janela ≠ dia-calendário)

O `relatorio_pedidos_01-07.html` **não cobre o dia-calendário 01/07** — cobre a janela
**30/06 ~21:00 → 01/07 ~20:59** (~24h, provavelmente "últimas 24h" no momento de geração).

Prova (join por ID completo com o relatório de logística, horários batendo minuto a minuto):
- Os 34 pedidos de 21h+ do HTML estão na logística com data **30/06** e horário idêntico
  (ex.: `a0eb2c4d` — HTML "01/07 21:02", logística "2026-06-30 21:02").
- Os **42 pedidos de 21h+ do dia real 01/07** (medidos na logística) **não estão no HTML**.
- Todos os casados de 11h–20h batem dia e minuto exatos.

Consequência: existem **duas perguntas de completude**, com respostas diferentes:
(a) a **janela do HTML** (30/06 21h → 01/07 21h) e (b) o **dia-calendário 01/07**.

## 1. Matriz de completude

| Dimensão | Fonte | Existe? | Confiança | Observação |
|---|---|---|---|---|
| Pedido (ID completo, uuid) | HTML pedidos + logística | **Sim** | alta | 250 no HTML (janela) · 246 na logística (dia 01/07) |
| Item por pedido | HTML pedidos | **Sim** (na janela) | alta | 790 itens, 100% casados contra o seed de 199 |
| Quantidade | HTML pedidos | **Sim** | alta | coluna Qtd por item, 0 ausentes |
| Preço unitário / total por item | HTML pedidos | **Sim** | alta | 0 ausentes |
| Observação do cliente | — | **Não** | — | não existe em NENHUM arquivo do pacote (verificado por busca de texto no HTML e coluna a coluna nos xlsx) |
| Status final | HTML + logística | **Sim** | alta | HTML: CONCLUDED/DECLINED/CANCELLED · logística: CONCLUÍDO/CANCELADO |
| Cancelamento (motivo/origem/itens) | relatorio_cancelamento.xlsx | **Sim** | alta | 7 no dia 01/07, **7/7 casam** com a logística por ID curto; itens nomeados |
| Negociação/reembolso | relatorio_negociacoes.xlsx | **Sim** | alta | 9 no dia 01/07, **9/9 casam**; +2 colunas novas (arbitragem) |
| Avaliação/review | avaliacoes_tata_sushi_53069.xlsx | **Sim, só nível-DIA** | média | série diária 03/04→02/07; **sem ID de pedido** — proibido afirmar desfecho de pedido específico |
| Vendas/GMV/ticket | relatorio_vendas.xlsx (+dashboards) | **Sim (agregado semanal)** | alta | 26/06→02/07: 1.720 pedidos, R$ 419,6k — contexto, nunca estado operacional |
| Cardápio/popularidade | relatorio_cardapio.xlsx (+dashboard_itens) | **Sim (agregado)** | alta | 148 itens na semana — alimenta popularidade, nunca composição por pedido |
| Qualidade operacional diária | relatorio_qualidade_operacao.zip | **Sim** | média (formato pivotado) | 01/07: 247 pedidos totais — consistente com HTML (236+11=247) e logística (246+retirada) |
| **Tempo pronto** | **relatorio_logistica** (`TEMPO DE ACIONAMENTO DO BOTÃO PRONTO`) | **Sim** | alta | **246/246** pedidos de 01/07 têm o campo; duração em min a partir do horário do pedido (mesmo formato que o Motor A já consome) |
| **Tempo saiu** | logística (reconstrução: entrega − a caminho − esperando cliente) | **Sim (derivado)** | alta | mesma fórmula já oficial em `src/ingest/ifoodRelatorio.ts` |
| **Tempo entrega** | logística (`TEMPO DA ENTREGA REALIZADA`) | **Sim** | alta | 246/246 |
| **Logística/motoboy** | logística (`ESPERANDO NA LOJA`, `ALOCAÇÃO`, `A CAMINHO DA LOJA`) | **Sim** | alta | 246/246 — inclusive a dor nº1 (espera do motoboy na loja) |
| Horário de aceite próprio | — | **Não** | — | como sempre: aproximado ao horário do pedido |
| Pronto-por-praça | — | **Não** | — | só KDS dará; nenhum export do iFood tem |

## 2. O número que decide (join composição × timing)

Dos **250 pedidos do HTML** (composição real):
- **238 têm timing logístico completo** (204 casados no dia 01/07 + 34 casados em 30/06).
- Os 12 sem timing: **11 `DECLINED`** (recusados não entram no relatório logístico — natural, não é
  lacuna) e **1 `CONCLUDED` 11:45** sem registro logístico (possível retirada).
- Excluindo os recusados (que não têm ciclo operacional): **238/239 = 99,6% de cobertura
  composição+timing** dentro da janela do HTML.

Do **dia-calendário 01/07** (246 pedidos na logística):
- 204 têm composição (HTML) — **42 pedidos de 21h–23h têm timing mas NÃO têm composição** (fora da
  janela do HTML).

## 3. Respostas objetivas

**"Dá para simular a noite completa?"**
**Para a janela real de ~24h [30/06 21h → 01/07 21h]: sim, quase por inteiro** — composição real +
timing real + desfecho real (cancelamento/negociação) para 99,6% dos pedidos aceitos (238/239).
**Para o dia-calendário 01/07 inteiro: não** — o fim da noite (21h+, 42 pedidos, justamente parte do
pico do jantar) tem timing mas não tem composição.

**"Dá para simular apenas composição real?"**
Sim — já provado na fase anterior (250 pedidos, 790 itens, 100% casados).

**"Dá para simular foco operacional?"**
**Agora sim, com dado real, para a janela coberta** — timing (Motor A) + composição (Motor B real) +
conhecimento (Motor C) existem simultaneamente para 238 pedidos. Um replay minuto a minuto com foco,
fechamento, 2ª sacola e Camada de Decisão é possível **sem inventar nenhum tempo**. Duas ressalvas
honestas: (1) as durações são as oficiais D+1 do iFood (reconstrução de instantes pelo mesmo método já
oficial do Motor A — não é carimbo ao vivo); (2) observação do cliente e pronto-por-praça continuam
inexistentes, então os sinais que dependem deles seguem fora. **Não foi rodado nesta fase** — é
integração/simulação, exige sua aprovação (regra: parser → validação → relatório → **aprovação humana**
→ integração).

**"O que ainda falta pedir ao iFood?"** — ver §5.

## 4. Limitações registradas

1. Data por linha do jsonl de itens diz "01/07/2026" para todos — **herança da 1ª remessa, hoje sabida
   incorreta** para os ~35 pedidos de 30/06 21h+. Corrigível cruzando com a logística (o join é a
   correção); o arquivo gerado não foi reescrito nesta fase para não mexer em artefato já citado no
   relatório anterior sem aprovação.
2. Avaliações: nível-dia, NPS e comentários sem ID de pedido — proibido usar como prova de atraso de
   pedido específico.
3. Cancelamentos/negociações: só ID curto — join via logística (curto→completo) funcionou 16/16 no dia
   01/07, mas a ambiguidade estrutural do ID curto (~1,4% no mesmo dia, medida na Auditoria de Dados)
   continua valendo para volumes maiores.
4. Dashboards e vendas são agregados — inventariados como contexto; **nunca** entram como estado
   operacional ou composição.

## 5. O que pedir ao iFood (lista objetiva)

1. **O mesmo relatório de pedidos com itens (HTML ou export equivalente) gerado APÓS o fim do dia**
   (ex.: na manhã seguinte), para que a janela de 24h cubra o dia-calendário fechado — ou, melhor,
   com período explícito selecionável. É o único furo entre "quase completa" e "completa" para um dia.
2. **Confirmar como a janela do relatório HTML é definida** ("últimas 24h no momento da geração?") —
   determina o horário certo de gerar.
3. **Export estruturado (xlsx/csv/API) de pedidos com composição** (item, qtd, preço, ID completo) —
   o HTML funciona como ponte, mas é frágil a mudança de layout; perguntar se existe export oficial
   com itens (o "Relatório de Pedidos" de 56 colunas não tem).
4. **Observações do cliente por pedido** — não existe em nenhum arquivo recebido até hoje; perguntar
   em qual export/tela isso sai (destrava o sinal S20 do Mapa de Sinais).
5. **Avaliações com ID de pedido** (a atual é só diária) — destravaria o join review↔pedido↔operação.
6. Manter o **relatório de logística semanal** vindo junto de cada lote — foi ele que destravou o
   timing; é o par obrigatório do relatório de itens.

## 6. Recomendação

**"Temos insumo suficiente para simulação operacional quase completa de uma janela real de ~24h
(30/06 21h → 01/07 21h), com composição+timing+desfecho reais para 99,6% dos pedidos aceitos — e
simulação parcial (timing sem composição) para o fim da noite de 01/07."**

Próximo passo natural (aguardando aprovação): replay isolado dessa janela com os 3 motores em dado
real — sem tocar no backtest oficial, sem tuning, gerando um relatório comparativo (foco/ambiente/calmo
que a noite real teria produzido vs. o que a composição sintética teria dito). Seria a primeira vez que
o DeliveryOS enxerga uma noite inteira de verdade.
