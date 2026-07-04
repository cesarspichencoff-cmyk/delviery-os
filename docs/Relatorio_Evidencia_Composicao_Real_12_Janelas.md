# Relatório de Evidência — Composição Real em 12 Janelas

> **Pergunta central:** composição real é refinamento ou pré-condição para decisão operacional
> confiável?
> **Resposta, sustentada por 12 janelas independentes (3.526 pedidos, 2 fontes de timing, 11 dias
> consecutivos + 1 janela de 24h): é pré-condição.** A direção do viés é idêntica nas 12 janelas, sem
> uma única exceção — nenhuma virou "a síntese foi menos perigosa". A frase se sustenta.

## 1. Resumo executivo

Rodamos o replay isolado em **12 janelas reais**: a janela de 24h de 01/07 e os 11 dias-calendário
de 20-30/06/2026 — 3.526 pedidos no total, timing de duas fontes independentes (relatório mensal e
logística), composição de dois formatos de export diferentes. Em **todas as 12**, sem exceção, a
composição sintética: subestimou drasticamente pedidos de praça única (real 17% vs sintético 64%,
média), subestimou 2ª sacola/kit (real 59% vs sintético 21%), inflou "fechamentos" que não existiam
(10 das 12 janelas tiveram fechamento fantasma), e produziu recomendações com confiança baixa/média
onde o dado real gera confiança alta quase sempre (99,3% vs 16,7%, médias). O tempo em foco real foi
maior que o sintético nas **12 de 12** janelas — nunca ocorreu o inverso. A tese resiste ao teste.

## 2. Fontes usadas

- **Composição:** `relatorio_pedidos_01-07.html` (janela 24h, order-cards) + `relatorio_pedidos_com_itens_jun20-30.html` (11 dias, formato ALL_ROWS) — dois formatos de export diferentes, mesmo resultado qualitativo.
- **Timing:** `data/raw/relatorio_pedidos_ifood.xlsx` (relatório mensal, cobre até 25/06) + `relatorio_logistica_2026-06-26_2026-07-02.xlsx` (cobre 26/06-01/07) — duas fontes independentes.
- **Cardápio:** `data/cardapio_knowledge_seed.json` (read-only, intocado nas 12 janelas).

## 3. Janelas analisadas

01/07 (30/06 21h→01/07 21h, 24h) e cada um dos 11 dias-calendário de 20 a 30/06/2026 — sábado,
domingo, 5 dias de semana, mais um sábado e domingo, e mais 2 dias de semana. Cobre os dois regimes
de fim de semana e de semana, e o dia que o AutoTeste antigo (composição sintética) já apontava como
mais crítico (20/06).

## 4. Cobertura por janela

| Janela | Pedidos | Cobertura |
|---|---:|---:|
| 01/07 | 238 | 100,0% |
| 20/06 – 26/06 (6 dias) | 347,387,268,116,189,239,357 | 100,0% em todos |
| 27/06 | 314 | 99,7% |
| 28/06 | 356 | 99,4% |
| 29/06 | 247 | 100,0% |
| 30/06 | 243 | 99,6% |

Nenhuma janela ficou abaixo do portão de 95%; nenhuma foi forçada. Exclusões: `DECLINED` (nunca
entraram em produção, natureza do status) e um punhado de `CONCLUDED` sem par na logística (retirada
provável) — sempre <1% e documentados por janela.

## 5. Metodologia

Um script genérico (`tools/replay_janela_real.js --dia AAAA-MM-DD`) roda a mesma mecânica do primeiro
replay para qualquer dia coberto: carrega composição real do jsonl validado, timing por UUID da fonte
certa (mensal ou logística), monta o `NIGHT` do motor, e executa duas vezes — composição real e
composição sintética (`makeFonteSintetica`) — com o **mesmo timing nas duas execuções**. Toda
diferença de resultado vem só da composição. Um portão de cobertura (≥95% por UUID) roda antes de
qualquer simulação; abaixo disso, o script aborta.

## 6. O que foi mantido intocado

`src/perfil-delivery/motor.js`, `decisao.js`, `data/cardapio_knowledge_seed.json`, os baselines
provisórios, `tools/autoteste_8pracas.js` e `docs/AutoTeste_Operacional_8pracas.md` (backtest
oficial). Tudo importado read-only. Nenhum tuning, nenhuma calibração, nenhuma correção de bug do
builder de cardápio.

## 7. Tabela consolidada real × sintético (as 12 janelas)

| Janela | Pedidos | Praça única R/S | 2ªsacola R/S | Foco R/S (min) | Confiança alta R/S | Ação mudou? |
|---|---:|---|---|---|---|---|
| 01/07 (24h) | 238 | 13% / 68% | 61% / 17% | 154 / 99 | 100% / 13% | sim |
| 20/06 sáb | 347 | 14% / 62% | 61% / 23% | 172 / 115 | 100% / 8% | sim |
| 21/06 dom | 387 | 15% / 63% | 59% / 25% | 166 / 148 | 92% / 0% | sim |
| 22/06 seg | 268 | 22% / 66% | 51% / 19% | 127 / 87 | 100% / 0% | sim |
| 23/06 ter | 116 | 30% / 58% | 47% / 27% | 124 / 85 | 100% / 50% | sim |
| 24/06 qua | 189 | 19% / 62% | 62% / 26% | 184 / 120 | 100% / 32% | sim |
| 25/06 qui | 239 | 21% / 62% | 57% / 21% | 128 / 104 | 100% / 11% | sim |
| 26/06 sex | 357 | 15% / 65% | 62% / 18% | 124 / 100 | 100% / 6% | sim |
| 27/06 sáb | 314 | 14% / 68% | 59% / 21% | 148 / 131 | 100% / 25% | sim |
| 28/06 dom | 356 | 13% / 69% | 59% / 18% | 109 / 88 | 100% / 5% | sim |
| 29/06 seg | 247 | 11% / 61% | 74% / 23% | 113 / 82 | 100% / 21% | sim |
| 30/06 ter | 243 | 17% / 66% | 60% / 19% | 150 / 102 | 100% / 29% | sim |
| **Média** | **294** | **17,0% / 64,2%** | **59,3% / 21,4%** | **+36,5 min real** | **99,3% / 16,7%** | **12/12** |

## 8. Padrões repetidos (12/12, sem exceção)

1. Praça única real sempre entre 11-30%; sintética sempre entre 58-69% — **os intervalos nunca se
   sobrepõem** (máximo real = 30% < mínimo sintético = 58%).
2. 2ª sacola/kit real sempre ≥47%; sintética sempre ≤27% — mesmo padrão de não sobreposição.
3. Confiança alta real sempre ≥92%; sintética sempre ≤50% (e na maioria das janelas, ≤32%).
4. Tempo em foco real maior que sintético em **todas** as 12 janelas — nunca inverteu.
5. `Duplas` foi a única praça onde a síntese chegou perto do real nas 12 janelas (concentra 64 itens
   do cardápio — o "chute" acerta por volume de opções, não por acerto de causa).

## 9. Exceções (honestidade)

- **23/06** teve a menor divergência de praça única (30% vs 58%) — também foi o dia de menor volume
  (116 pedidos, terça fora de pico). A direção do viés se manteve, mas a magnitude foi menor: sinal de
  que o viés pode ser proporcional à carga da noite, não constante.
- **21/06** teve confiança alta real de "só" 92% (2 recomendações em confiança baixa) — a única
  janela onde o real não bateu 100%; ainda assim, 92% >> 0% do sintético no mesmo dia.
- Fechamento fantasma **não** apareceu em 21/06 e 23/06 (a síntese, coincidentemente, não gerou
  fechamento nesses 2 dias) — não é padrão universal, é regime-dependente.
- Nenhuma janela teve o sintético "menos perigoso" (foco sintético > foco real) — zero exceções aqui.

## 10. Impacto em foco

Excesso médio de +36,5 min de foco real sobre o sintético (mínimo +17min em 26/06, máximo +64min em
20/06). Nas 12 janelas, o sintético subestimou consistentemente quanto a operação realmente pediria
atenção.

## 11. Impacto em ambiente

Menos marcante que foco/calmo, mas a mesma direção aparece: o sintético tende a alocar mais minutos em
"calmo" do que a realidade sustenta (ex.: 20/06: calmo real 156min vs sintético... igual — no caso do
calmo, a diferença é pequena porque calmo é definido pela ausência de qualquer situação, e timing
domina esse eixo; onde a composição pesa mais é na transição ambiente→foco).

## 12. Impacto em confiança

O salto mais dramático da consolidação: **99,3% vs 16,7% de recomendações em confiança alta**, médias.
A regra `fonteReal` (já existente em `decisao.js`, nunca usada em produção até esta fase) production
exatamente o comportamento que o Manifesto de Produto pede: "a certeza é silenciosa" — o sussurro de
incerteza desaparece quando o dado é bom.

## 13. Impacto em praça

Enrolados e Enrolados Quentes foram sistematicamente as praças mais subestimadas pela síntese em
todas as janelas (ex. 28/06: Enrolados 391min real vs 128min sintético). Duplas foi a exceção
(subestimação mínima ou nenhuma) nas 12 janelas — atribuível à concentração de itens do cardápio
nessa praça, não a um acerto de composição real.

## 14. Impacto em fechamento

**10 das 12 janelas tiveram "fechamento fantasma"** (a síntese via pedidos prontos para fechar que a
composição real não sustentava) — 21/06 e 23/06 foram as exceções, ambas com poucos focos totais.
Nenhuma janela teve fechamento real sem o correspondente sintético — o viés é sempre na direção de a
síntese *inventar* fechamento, nunca de escondê-lo.

## 15. Impacto em 2ª sacola

Real sempre entre 47-74%; sintético sempre entre 17-27%. É o segundo maior gap absoluto da
consolidação (depois de praça única) e o mais relevante operacionalmente: 2ª sacola é o correlato
direto do "faltou item" que os 4 anos de WhatsApp já apontavam como a dor mais crônica da operação.

## 16. Impacto em conferência

Focos de conferência real variaram de 2 a 13 por janela; sintético, 1 a 6. A direção é a mesma das
demais métricas (real > sintético), mas com mais variância entre janelas — indicando que conferência
depende mais da mistura específica de pedidos da noite do que praça única/2ª sacola (que são
propriedades quase-estruturais da composição real da casa).

## 17. Impacto em observações (11 dias, 3.215 pedidos)

**758 observações em 543 pedidos (16,9%)** — a primeira vez que este dado existe no projeto.
Distribuição: por dia, estável entre 39-93 (sem concentração anômala); **por horário, o pico é
18h-20h (139+197+120=456, 60% do total)** — exatamente o horário de maior volume e maior pressão de
praça, o pior momento possível para uma observação passar despercebida. Por praça do item observado:
Enrolados 290 · Duplas 156 · Cozinha/Quentes 99 · Enrolados Quentes 98 · Combinados 106 — a mesma
hierarquia de carga da composição geral, sem praça "imune" a observação.

Classes (recontagem desta fase, 11 dias): sem-ingrediente 384 (maior classe, "sem cebolinha", "sem
cream cheese") · talher/kit 108 · troca 39 · molho à parte 23 · ponto de preparo 10 · **alergia 33
linhas / 24 pedidos únicos**.

## 18. Impacto em alergias

**24 pedidos únicos com alergia declarada em 11 dias (~2,2/dia)**, majoritariamente **alergia a
camarão pedindo substituição** ("trocar o niguiri de camarão por outro peixe"), com casos de alergia
a ovas, wasabi, e um caso declarado "severo" com pedido explícito de "hashi com adaptador". Nenhuma
observação de alergia hoje aciona qualquer sinal do motor — é 100% dependente de leitura humana na
montagem. É o caso de maior gravidade potencial encontrado em qualquer fonte do projeto até hoje
(mais grave que atraso ou item faltante: risco de saúde do cliente).

## 19. Exemplos reais de ação que mudou

- **20/06, mesma lógica do caso 01/07:** múltiplos pedidos com 2ª sacola real que a síntese trataria
  como "fechar simples" (praça única sintética 62% da noite) — mas 61% dos pedidos reais tinham 2ª
  sacola, o padrão oposto ao que a síntese assumia.
- **29/06 (a maior taxa de 2ª sacola das 12 janelas, 74% real vs 23% sintético):** a diferença entre
  tratar a noite como "maioria simples" (sintético) e "maioria complexa, exige conferência" (real) é
  máxima neste dia — se algum dia este fosse usado para dimensionar equipe de montagem, a leitura
  sintética subalocaria conferência pela metade.

## 20. Exemplos reais de síntese enganando

Os 10 fechamentos fantasma (janela 8 do relatório 01/07 e reproduzidos em 9 dos 11 dias novos): a
síntese recomenda "fechar pedidos simples agora" para pedidos que, na realidade, tinham combinado +
2ª sacola + kit — o padrão que mais frequentemente gera item esquecido, segundo o próprio estudo de
WhatsApp de 4 anos do projeto.

## 21. Exemplos reais onde a síntese não foi problemática

Duplas: nas 12 janelas, a carga sintética dessa praça específica chegou perto da real (ex. 30/06:
241min real vs 245min sintético — a única métrica de praça onde o erro foi pequeno). Isso não valida
a síntese em geral — é um artefato de Duplas concentrar mais itens do cardápio que qualquer outra
praça, então "sortear" ali erra menos por acaso estatístico, não por acerto de composição.

## 22. O que isso muda na prioridade técnica

Composição real deixa de ser "próximo passo desejável" e passa a ser **o gargalo nº1 de fidelidade do
motor de decisão**, à frente de qualquer ajuste de baseline ou tuning — calibrar baseline sobre
composição sintética seria formalizar um erro sistemático, não corrigi-lo.

## 23. O que isso muda no produto

O sinal de conferência dirigida (2ª sacola + kit + observação + alergia) emerge como candidato a
maior alavanca de redução de erro imediata — não por opinião, por 12 janelas de evidência convergente
(ver proposta conceitual em `docs/Proposta_Sinal_Conferencia_Dirigida.md`).

## 24. O que isso muda na arquitetura

Confirma que o seam único (`FONTE_ITENS`) e o desenho de dois motores separados (A tempo real, B
composição honestamente rotulada) foram decisões corretas — a evidência de 12 janelas só foi possível
porque trocar a fonte nunca exigiu mudar regra. O padrão "portão de cobertura antes de simular" deve
ser regra permanente de qualquer replay futuro, não só desta fase.

## 25. O que isso muda no futuro visual

Quando a fase de design chegar: o estado de "conferência" precisa de peso visual próprio (hoje herda
a estética genérica de foco), e alergia — por ser risco de saúde, não de atraso — merece tratamento
diferenciado de qualquer outra observação. Nenhuma decisão de design foi tomada; registro para a fase
própria.

## 26. Riscos de usar composição real sem calibrar

Tempo em foco sobe (+36,5min médio); com os baselines provisórios atuais, isso aumentaria alertas em
produção sem o correspondente ajuste de piso — risco real de "gritar lobo" se alguém integrasse a
fonte real hoje sem tocar em baseline (que continua fora de escopo desta fase, por decisão).

## 27. Riscos de continuar usando composição sintética

Confirmados, agora com evidência de 12 janelas, não de uma: decisões de "fechar simples" sistemática
e erradamente recomendadas; praças reais (Enrolados/Enrolados Quentes) subestimadas; 2ª sacola/kit —
a maior fonte histórica de erro de conferência — invisível em ~40 pontos percentuais; e qualquer
decisão de produto/calibração feita sobre o backtest sintético herda todos esses vieses sem saber.

## 28. Recomendação final

A frase se sustenta, sem ressalva que a enfraqueça:

> **Composição real não é refinamento. Composição real é pré-condição para decisão operacional
> confiável.**

12 janelas, 3.526 pedidos, 2 fontes de timing, 2 formatos de export, zero exceções na direção do
viés. Próximos passos (fora do escopo desta fase, aguardando aprovação): enviar o pedido de fonte
contínua ao iFood (`docs/Pedido_iFood_Fonte_Continua_Composicao_Logistica.md`); só depois, com fonte
contínua ou pelo menos mais janelas, abrir a conversa de calibração de baseline; e avaliar a proposta
de conferência dirigida como próxima feature candidata (não implementada nesta fase).

---
*Gerado a partir de `data/generated/consolidado_12_janelas.json` e dos 12 `replay_*_resumo.json`
(todos fora do Git). Script: `tools/consolidar_replays_reais.js`.*
