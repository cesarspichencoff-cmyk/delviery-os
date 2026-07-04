# Relatório — Replays Reais 20-30/06/2026

> Pergunta central da fase: **o resultado da janela 01/07 foi um caso isolado ou um padrão
> operacional?**
> **Resposta, medida em 3 novas janelas independentes (+ a de 01/07 = 4 pontos, 2 fontes de timing
> distintas): é padrão.** A composição sintética não era só imprecisa — mudava a decisão operacional,
> em todos os dias testados, sempre na mesma direção.
> Tudo isolado: motor, seed, baseline e backtest oficial intocados. Scripts:
> `tools/parse_relatorio_pedidos_com_itens_html.js`, `tools/analise_fonte_real_jun20-30.js`,
> `tools/replay_janela_real.js` (genérico, `--dia`). Saídas em `data/generated/` (fora do Git).

## 1. Resumo executivo

Recebemos a maior fonte de composição real até hoje: **3.215 pedidos com 10.565 itens em 11
dias-calendário completos (20-30/06)** — e, pela primeira vez, **com observações do cliente** (758,
incluindo alergias explícitas). A extração bateu 100% com os KPIs do próprio arquivo; o casamento com
o seed do cardápio foi **154/154 itens únicos — 100% exato, zero aproximação**. Cruzando com o timing
que já tínhamos (relatório mensal para 20-25/06; logística para 26-30/06), **os 11 dias inteiros têm
cobertura composição×timing ≥ 99,4% — todos aptos a replay completo**. Rodamos 3: o sábado crítico
20/06, o domingo de maior volume 21/06 e a sexta 26/06. O viés da síntese se repetiu nos 3, na mesma
direção e magnitude da janela 01/07. Conclusão da fase: **composição real não é refinamento;
é pré-condição para decisão operacional confiável.**

## 2. O que o arquivo novo trouxe

- Composição real em **escala** (11 dias vs 1 janela) — permite falar em padrão, não em anedota.
- **Observações do cliente** — inexistentes em TODAS as fontes anteriores. 543 pedidos (16,9%) têm ao
  menos uma; destrava pela primeira vez o sinal S20 (conferência dirigida por observação) com dado real.
- Cancelados (71) e recusados (148) **com composição** — dá para ver o que a operação perdeu/recusou.
- Formato novo (array `ALL_ROWS`), mais estável de parsear que os order-cards de 01/07.
- O que NÃO trouxe: preço por item (só valor total — `preco_unitario: null`, motivo registrado) e o
  ID curto do iFood (o campo `oid_short` é prefixo do uuid).

## 3. Qualidade da fonte

Alta. KPIs do próprio arquivo (3.215 / 2.996 / 71 / 148) reproduzidos exatamente pela extração; 0
duplicados; 0 datas fora do período; 0 pedidos sem item; 0 valores inválidos; 100% dos
cancelados/recusados com itens listados. Um defeito de parser foi encontrado e corrigido durante a
validação (observações com quebra de linha dentro do `<em>` viravam 3 pseudo-itens) — depois da
correção: 0 itens sem quantidade, 0 não-casados.

## 4-5. Cobertura por dia (matriz composição × timing)

| Dia | Pedidos (comp. real) | Vivos c/ timing | Cobertura | Fonte timing | Replay completo? |
|---|---:|---:|---:|---|---|
| 20/06 sáb | 364 | 347/347 | 100,0% | relatório mensal | **SIM** (rodado) |
| 21/06 dom | 402 | 387/387 | 100,0% | relatório mensal | **SIM** (rodado) |
| 22/06 seg | 283 | 268/268 | 100,0% | relatório mensal | SIM |
| 23/06 ter | 122 | 116/116 | 100,0% | relatório mensal | SIM |
| 24/06 qua | 205 | 189/189 | 100,0% | relatório mensal | SIM |
| 25/06 qui | 249 | 239/239 | 100,0% | relatório mensal | SIM |
| 26/06 sex | 372 | 357/357 | 100,0% | logística | **SIM** (rodado) |
| 27/06 sáb | 328 | 314/315 | 99,7% | logística | SIM |
| 28/06 dom | 381 | 356/358 | 99,4% | logística | SIM |
| 29/06 seg | 258 | 247/247 | 100,0% | logística | SIM |
| 30/06 ter | 251 | 243/244 | 99,6% | logística | SIM |

Join sempre por **UUID** (nunca ID curto). O dia crítico do AutoTeste (20/06, gargalo 70%, 133 ruins)
**tem replay real completo — e foi rodado.**

## 6. Validação do parser

Total 3.215 ✓ · concluídos 2.996 ✓ · cancelados 71 ✓ · recusados 148 ✓ (todos contra os KPIs do
próprio HTML; o script **aborta** se não bater). 10.565 itens · 12.118 unidades · 0 sem quantidade ·
758 observações · 0 IDs duplicados · 0 fora do período.

## 7. Casamento com o cardápio

**154 itens únicos no HTML → 154 casam exatos com o seed (100%).** Zero por aproximação, zero
não-casados, zero itens novos, zero variações de grafia (após correção do parser — os 6 "suspeitos"
da primeira rodada eram todos o defeito de quebra de linha, não itens reais). O cardápio-conhecimento
de 199 itens cobre integralmente 11 dias de operação real. Nenhuma alteração no seed foi feita nem é
necessária por conta desta fonte.

## 8. Composição real dos 11 dias (3.215 pedidos)

- **Praça única: 16,1%** (síntese assume ~65%) · multi-praça: 83,6%
- **2ª sacola/kit: 59,6%** (síntese: ~17%)
- Bebida: 8,0% · sobremesa: 5,5% (síntese superestimava ambos: ~35%/~15%)
- Risco de conferência alto: **91,0%** dos pedidos
- Carga por praça (pedidos que tocam): **Enrolados 83%** · Duplas 76% · Combinados 56% · Quentes 43% ·
  Enrolados Quentes 28% (a síntese punha Enrolados em ~32% — subestimava a praça mais tocada da casa)
- Turnos: jantar 70% · almoço 28% · tarde 2,5%. Fim de semana: 1.475 (46%) vs semana 1.740.
- Dias mais pesados: 21/06 dom (402) · 20/06 sáb (364) · 26/06 sex (372) · 28/06 dom (381).

## 9. Observações (758 — primeira vez com esse dado)

| Classe | Qtde | Exemplo real |
|---|---:|---|
| sem_ingrediente | 384 | "Sem cream cheese e sem cebolinha…" |
| talher/kit | 108 | "Favor enviar 2 conjuntos de hashis e bastante shoyo" |
| troca | 39 | "trocar as fatias de sashimi por outros niguiris" |
| **alergia** | **33** | "**Extremamente alérgico a frutos do mar e oleaginosas**" |
| molho à parte | 23 | "Favor não colocar shoio, mandar a parte" |
| ponto de preparo | 10 | "Bem passado" |

33 pedidos com alergia declarada em 11 dias (~3/dia) — cada um é um erro potencialmente grave que o
sinal S20 (conferência dirigida) pegaria. As 108 observações de kit/talher confirmam com dado de
cliente o que o WhatsApp já mostrava: kit é o item mais pedido-e-esquecido da operação.

## 10. Risco de conferência

Perfil do pedido de maior risco (real): combinado/menu (âncora) + ≥2 praças + 2ª sacola — 59,6% dos
pedidos têm 2ª sacola provável. Cancelados (71): 52% com 2ª sacola, 48% com combinado, valor médio
R$222. **Recusados (148): 58% 2ª sacola, 55% combinado, valor médio R$283 — 20% acima do valor médio
dos concluídos (R$236).** As recusas concentram-se em pedidos grandes: cada recusa custa mais que um
pedido médio. A síntese classificaria errado a maioria: trataria ~65% como "praça única simples".

## 11-13. Replays rodados — comparação real × sintético

| Métrica | **20/06 sáb** R / S | **21/06 dom** R / S | **26/06 sex** R / S | (01/07 R / S, referência) |
|---|---|---|---|---|
| Pedidos vivos | 347 | 387 | 357 | 238 |
| Minutos em foco | **172** / 115 | **166** / 148 | **124** / 100 | 154 / 99 |
| Focos totais | 27 / 25 | 25 / 23 | 18 / 17 | 24 / 17 |
| … de praça | **16** / 7 | **12** / 7 | **11** / 6 | 11 / 4 |
| … de conferência | **7** / 3 | **8** / 3 | 2 / 5 | 8 / 2 |
| … de fechamento | 1 / **9** | 1 / **8** | 0 / 0 | 0 / 8 |
| Confiança alta | **27/27** / 2 | **23/25** / 0 | **18/18** / 1 | 24/24 / 2 |
| Praça única | 49 / 214 | 58 / 242 | 55 / 233 | 32 / 162 |
| 2ª sacola | 210 / 79 | 230 / 96 | 220 / 66 | 146 / 41 |
| Sobrecarga Enrolados (min) | 429 / 217 | 413 / 196 | 342 / 272 | 275 / 102 |
| Sobrecarga Enrol. Quentes (min) | 306 / 43 | 265 / 119 | 349 / 59 | 165 / 16 |
| Sobrecarga Duplas (min) | 380 / 378 | 375 / 417 | 346 / 368 | 214 / 209 |

Sanity (sinais de timing detectados idênticos minuto a minuto): **OK nos 3**.

## 14. Padrões que se repetiram (4/4 janelas)

1. Praça única real 13-16% vs 62-68% sintético.
2. 2ª sacola/kit real ~60% vs 17-25% sintético.
3. Mais tempo de foco com dado real (+12% a +55%).
4. Confiança alta em ~100% das recomendações reais vs ~0-8% das sintéticas.
5. Enrolados e Enrolados Quentes dramaticamente subestimados pela síntese; **Duplas quase exata nas 4
   janelas** (380/378, 375/417, 346/368, 214/209) — a praça com mais itens no cardápio é a única onde
   o chute acerta por concentração.
6. Focos de praça ~2× mais frequentes com dado real.

## 15. Padrões que NÃO se repetiram (honestidade)

- **Fechamentos fantasma**: 8-9 nos dias de fim de semana sintéticos, mas **0/0 em 26/06** (nem a
  síntese gerou fechamento na sexta) — o fantasma depende do regime da noite, não é constante.
- Conferência em 26/06 invertida (real 2 vs sint 5) — dia em que os pedidos com 2ª sacola não
  esperaram o suficiente para virar foco; o risco existia (220 pedidos), mas não virou onset.
- Magnitude do excesso de foco varia (166 vs 148 em 21/06 é modesto; 172 vs 115 em 20/06 é grande).

## 16. Onde o Motor B sintético enganava o sistema

Nas 4 janelas, sempre nas mesmas direções: inventava pedidos simples/fecháveis que não existem;
escondia sacolas duplas e kits; concentrava a atenção em Duplas enquanto Enrolados/Quentes/Combinados
carregavam; e mantinha a tela mais "calma" do que a noite real era.

## 17. Onde a composição real muda a decisão operacional

- Recomendação dominante muda de "fechar pedidos simples"/"priorizar Duplas" para **"priorizar a praça
  certa" + "conferência reforçada"**.
- **Competição por atenção** (achado novo desta fase): mesmo os focos de *timing* mudam de momento
  entre as execuções — não porque o sinal mude (sits idênticos, verificado), mas porque o slot único
  de atenção é disputado por focos de composição que antes não existiam. Com dado real, o motor
  prioriza diferente até o que já enxergava. Em 20/06: 3 focos de timing que o sintético exibia foram
  legitimamente "atropelados" por focos de praça reais mais severos.

## 18. Efeitos na Camada de Decisão

92-100% das recomendações reais saem com confiança **alta** (regra `fonteReal` pré-existente) — o
sussurro de incerteza some. Tipos mudam: `fechar_simples` praticamente desaparece; `priorizar_praca` e
`conferencia` dominam. A "régua de 4 linhas + sussurro" fica mais limpa exatamente quando o dado
melhora — comportamento previsto pelo manifesto, agora demonstrado em 4 janelas.

## 19. Sinais que ficaram muito mais fortes

Praça sobrecarregada (com a praça certa) · conferência reforçada/2ª sacola · pedido âncora · release
impact · **S20 agora possível** (observações existem nesta fonte — incluindo 33 alergias).

## 20. Sinais que continuam cegos

Pronto-por-praça (S9/S12/S13 pleno — só KDS) · pausa de item (S15/S16) · ruptura/ficha (S17) ·
review↔pedido · hora real de aceite e de cancelamento. E o S20, embora destravado NESTA fonte, não
existe na de 01/07 nem nos exports xlsx — a fonte contínua precisa garantir observações.

## 21. Implicações para o produto

A conferência dirigida (2ª sacola + kit + observação + alergia) é possivelmente o sinal de maior valor
imediato da casa: 91% dos pedidos têm risco alto e a maior dor histórica é "faltou item". O excesso de
"calma sintética" significa que qualquer decisão de produto tomada sobre o backtest antigo subestimava
o quanto a tela precisaria aparecer — bom para revisitar (sem tuning) quando a fase permitir.

## 22. Implicações para arquitetura

O seam `FONTE_ITENS` aguentou 3 formatos de fonte (sintética, order-cards, ALL_ROWS) sem tocar em
regra — validado. O padrão "portão de cobertura antes de simular" (≥95% por UUID) deve virar rito de
qualquer replay futuro. Duas fontes de timing (mensal e logística) plugaram no mesmo replay sem
alteração de motor — o vocabulário de durações do iFood é estável entre exports.

## 23. Implicações para design futuro

O regime real tem mais foco e mais conferência do que os protótipos assumiram (que foram homologados
sobre noite sintética). Quando a fase visual chegar: o estado "conferência" merece hierarquia própria
(hoje herda a do foco genérico), e observação/alergia precisa de tratamento visual digno da gravidade
(alergia não é rodapé). Nenhuma mudança feita — registro para a fase própria.

## 24. O que pedir ao iFood para fechar a fonte contínua

1. Export diário automático de pedidos **com itens e observações** (este formato ALL_ROWS serve) —
   é o único que traz observação.
2. Par obrigatório: relatório de logística do mesmo período (timing).
3. Preço por item no export (hoje só valor total).
4. ID curto junto do uuid no export de itens (para casar com cancelamentos/negociações sem 2 saltos).
5. Hora real do cancelamento e avaliações com ID de pedido (pendências antigas, continuam).

## 25. Recomendação de próximo passo

1. **Estender os replays aos 8 dias restantes** (custo ~zero, o script genérico já aceita `--dia`) e
   consolidar estatística de 12 janelas — base honesta para a futura conversa de calibração.
2. Levar ao iFood o pedido da fonte contínua (§24) — a decisão estratégica desta fase é que **composição
   real é pré-condição, não refinamento**, e isso exige fonte contínua, não exports manuais.
3. Só então (com aprovação): discutir calibração de baseline com dado real acumulado, e o desenho do
   sinal de conferência dirigida com observação/alergia.

---
*Gerados (fora do Git): `itens_pedido_reais_2026-06-20_a_2026-06-30.jsonl`,
`analise_jun20-30_resumo.json`, `replay_2026-06-{20,21,26}_resumo.json`.*
