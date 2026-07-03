# Relatório — Fonte Real de Itens, 01/07/2026

> Teste exploratório, isolado do motor oficial e do backtest oficial. Objetivo: responder, com dado
> real de um dia inteiro (não uma amostra de 5 pedidos como em `docs/Formato_Importacao_Itens_Reais.md`),
> **quanto a composição sintética diverge da composição real** — e só isso. Nenhum baseline, nenhuma
> regra do motor, nenhum seed de cardápio foi alterado para produzir este relatório.
>
> Fluxo seguido: arquivo bruto (`docs/Inventario_Dados_Primarios.md`) → parser exploratório
> (`tools/parse_relatorio_pedidos_html.js`) → validação (embutida no próprio parser) → este relatório →
> **aguardando aprovação humana** antes de qualquer integração.

## 1. O que foi extraído

Fonte: `relatorio_pedidos_01-07.html` (250 pedidos, 01/07/2026), via
`tools/parse_relatorio_pedidos_html.js` → `data/generated/itens_pedido_reais_2026-07-01.jsonl`.

- **250 pedidos, 790 itens** — 100% dos `order-card` do arquivo, nenhum pedido sem item.
- Por pedido: `pedido_id` (UUID iFood), `data`, `horario` (só um — o do pedido, não há pronto/saiu/entregue),
  `status` (CONCLUDED/DECLINED/CANCELLED).
- Por item: `item_nome`, `quantidade`, `preco_unitario`, `total_item`. `observacao` sempre `null`
  (campo não existe na fonte — não inventado).
- Cada linha carrega `origem: "relatorio_pedidos_html"`, `confianca`, `arquivo_origem` — rastreável até
  a fonte, como todo dado real do projeto.

## 2. Qualidade da extração

Três verificações objetivas, não "parece certo":

| Checagem | Resultado |
|---|---|
| Pedidos extraídos vs. declarado no cabeçalho do relatório | **250 / 250** |
| Itens extraídos vs. declarado no cabeçalho | **790 / 790** |
| IDs de pedido duplicados | **0** |
| Pedidos sem nenhum item | **0** |
| Itens sem quantidade ou sem preço (confiança baixa) | **0** |
| Soma dos `order-total` (todos os status) vs. GMV bruto declarado | **R$ 55.318,51 = R$ 55.318,51** (exato) |
| Soma dos `order-total` só CONCLUDED vs. GMV concluídos declarado | **R$ 51.239,46 = R$ 51.239,46** (exato) |
| Itens que **não casaram** contra `cardapio_knowledge_seed.json` (199 itens) | **0 de 790 (0,0%)** |

O último item é o mais importante: **todos os 790 itens vendidos neste dia real bateram contra o seed
de 199 itens já auditado**, via o mesmo `matchSeed()` que o motor já usa (`makeFonteItensFromRows`,
sem nenhuma regra nova). Isso valida, com um dia inteiro de venda real (não uma amostra escolhida a
dedo), que o cardápio-conhecimento está completo o suficiente para cobrir a demanda real de um dia
comum. Cancelados/recusados (`DECLINED`/`CANCELLED`) mantiveram os itens listados e também casaram
100% — dado extra que o modo-ponte anterior não tinha testado.

## 3. Exemplos reais

```
#a0eb2c4d  REAL: Temaki de Salmão · Temaki de Atum → praça única (Enrolados), sem 2ª sacola
#f353bd84  REAL: Combinado Kids → 3 praças (Combinados+Duplas+Enrolados), 2ª sacola, kit
#c1c90ae4  REAL: Yakissoba Misto → praça única (Quentes), sem 2ª sacola
#c856f410  REAL (DECLINED): Tempurá de milho doce · Combinado Especial Sashimi+Sushi 1 pessoa ·
           Sushi de Massagô · Sushi de Vieira · Sushi de Ikura · Sashimi Bluefin Toro · Missoshiro
           → pedido grande (7 itens, R$ 465,98), recusado — composição real de um pedido perdido,
           dado que nenhum arquivo anterior do projeto tinha (cancelamentos só traziam item nomeado
           em texto livre, sem preço/quantidade estruturados).
```

## 4. Sinais que ficaram mais confiáveis (comparação objetiva real × sintética, mesmos 250 IDs)

Rodado por `tools/testar_fonte_real_2026-07-01.js` — chama `MOTOR.resolver()` (o mesmo do motor
oficial, zero regra alterada) uma vez com a fonte real, outra com `makeFonteSintetica`, para os mesmos
250 pedidos:

| Sinal | Real | Sintética | Leitura |
|---|---:|---:|---|
| Combinados toca o pedido | 59,2% | 19,2% | síntese **subestima** muito o peso de Combinados |
| Enrolados toca o pedido | 85,6% | 31,6% | síntese subestima Enrolados também |
| Enrolados Quentes toca o pedido | 31,2% | 6,0% | idem |
| **Praça única (fechável)** | **13,2%** | **65,2%** | síntese superestima 5× quantos pedidos são "simples" |
| **2ª sacola** | **61,6%** | **19,2%** | síntese subestima 3× o risco de 2ª sacola |
| **Contém kit** | **61,6%** | **19,2%** | idem (kit segue a regra de combo/pedido grande) |
| Risco de conferência alto | 88,4% | 78,4% | ambas altas, mas real ainda maior |
| Nº de bancadas por pedido (distribuição) | concentra em 3-4 | concentra em 1 | pedidos reais tocam **muito mais praças simultâneas** que a síntese assume |

**O que isto prova:** a composição sintética não é só "ilustrativa" no sentido inofensivo do termo — ela
tem um **viés sistemático na direção de pedidos mais simples e mais fecháveis do que a realidade**. Todo
sinal do motor que depende de composição (S5-S9, S12-S14, S17, S18, S21 do `Mapa_Sinais_Operacionais.md`)
provavelmente está a subestimar praça única real e a subestimar 2ª sacola/kit real nos backtests já
publicados (`AutoTeste_Operacional_8pracas.md`). Isso não invalida o eixo de tempo/estado (Motor A,
intocado), mas é uma correção de expectativa importante sobre o quanto confiar nos números de praça já
documentados.

## 5. Sinais que ainda dependem de estado/timing (não testados aqui, de propósito)

- **Foco (calmo/ambiente/foco)** — depende de `MOTOR.step()` simulando o relógio do dia contra os
  carimbos de pronto/saiu/entregue (Motor A). **Este relatório não os tem** — o HTML de 01/07/2026 só
  traz o horário do pedido, não o ciclo de vida completo. Simular isso exigiria inventar tempos de
  produção, o que violaria a mesma honestidade estrutural que o projeto já defende em outros lugares
  (nunca fingir dado que não existe). Por isso **não geramos foco nem recomendação da Camada de Decisão
  para este dia** — só comparamos composição.
- **Praça sobrecarregada em tempo real (S5)** — depende de contagem de pedidos *simultaneamente* na
  praça, que por sua vez depende do timing. Sem isso, só sabemos que a praça X *aparece* em Y% dos
  pedidos do dia, não que ela *travou* em algum momento.
- **Saída travada (motoboy)** — 100% dependente de Motor A; nada aqui o afeta, positiva ou negativamente.

## 6. Limitações

1. **Só 1 dia.** 250 pedidos é uma amostra única, não uma validação estatística robusta (o backtest
   oficial usa 30 dias/8.305 pedidos). As proporções da seção 4 podem não generalizar — mas a direção do
   viés (síntese simplifica demais) é consistente com o que já se esperava conceitualmente antes deste
   teste, e agora tem número.
2. **Sem carimbos de ciclo de vida** — não dá para medir foco, praça sobrecarregada em tempo real, nem
   rodar a Camada de Decisão para este dia. Ver seção 5.
3. **Sem observação do cliente** — confirmado ausente na fonte; sinais como S20 (observação especial na
   conferência) continuam sem dado real aqui.
4. **Fonte é um relatório de impressão HTML, não uma API** — se o iFood mudar o layout deste relatório
   (nomes de classe CSS, estrutura de tabela), o parser quebra. Isso é esperado e aceitável para um
   parser exploratório (mesmo risco documentado para "spool da impressora" em
   `docs/Fonte_Real_Itens_Plano.md`), mas desqualifica este caminho como integração definitiva.
5. **"Pedido refeito" não é detectável** — não há campo que indique reenvio; não avaliamos isso.
6. **GMV/order-total bate exato com o resumo do próprio relatório** — o que prova que a extração está
   correta, mas não prova nada sobre a exatidão do relatório em si (não temos como auditar isso contra
   uma segunda fonte independente para 01/07/2026, já que nenhum outro arquivo do projeto cobre esta
   data).

## 7. Recomendação de integração futura

**Não integrar ao motor ou ao backtest oficial ainda.** O que este teste já vale, mesmo sem integração:

1. **Confirma, com dado real de um dia inteiro, que o seed do cardápio (199 itens) tem cobertura
   completa** (0% de itens não-casados) — reduz o risco de que a próxima integração real esbarre em
   "item desconhecido" com frequência.
2. **Quantifica pela primeira vez o viés da síntese** (seção 4) — isso é suficiente, por si só, para
   justificar tratar os números de praça dos backtests existentes como "direção certa, magnitude
   provavelmente subestimada" em vez de "ilustrativo" genérico.
3. **Se o César aprovar**, os próximos passos concretos, em ordem de esforço crescente:
   - a. Pedir relatórios HTML iguais a este para mais dias (ideal: os mesmos 30 dias do backtest oficial,
     27/05–25/06/2026) — permitiria rodar o Auto Teste completo com composição 100% real, sem depender
     de API nem de impressora. É o "modo ponte" de `docs/Fonte_Real_Itens_Plano.md`, mas em escala.
   - b. Se isso não for viável, seguir o plano já aprovado: API iFood como integração definitiva
     (`docs/Fonte_Real_Itens_Plano.md`), que também traria os carimbos de ciclo de vida que faltam aqui.
   - c. Só depois de ter timing real para os mesmos dias: rodar o Auto Teste completo (Motor A+B ambos
     reais) e comparar a nota final (hoje 8.1/10 com B sintético) — a expectativa, dado o viés medido
     aqui, é que a precisão/cobertura mudem de forma não trivial.
4. **Enquanto isso não acontece:** nenhuma mudança de baseline ou tuning deveria ser feita assumindo os
   números de praça sintéticos como calibração — o que já era a política do projeto, agora com evidência
   concreta de que essa cautela era bem fundamentada.
