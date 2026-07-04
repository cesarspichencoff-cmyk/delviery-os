# Inventário de Dados Primários

> Registro de toda fonte bruta recebida para o DeliveryOS, fora do `Mapa_Canonico_Dados.md` (que cobre
> o pacote `Dados Claude.zip` já auditado). **Nenhum arquivo bruto listado aqui foi movido para o
> GitHub.** Todos vivem em `data/raw/incoming/<lote>/`, gitignorado (ver `docs/Politica_Dados.md`).
> Este documento é o passo 1 do fluxo obrigatório: *arquivo bruto → inventário → parser → validação →
> relatório → aprovação humana → integração* — nada aqui autoriza pular os passos seguintes.

## Lote `ifood_2026-07-01` (recebido 03/07/2026)

Local: `data/raw/incoming/ifood_2026-07-01/` (gitignorado — ver `.gitignore` linhas 6-8).

| Arquivo | Tipo | Tamanho | Hash MD5 |
|---|---|---:|---|
| `relatorio_pedidos_01-07.html` | HTML estático (relatório de impressão) | 459.557 bytes | `6b7d7406aca132800a111d1273709e59` |
| `dashboard.html` | HTML estático + Chart.js (dados embutidos) | 22.548 bytes | `e90a503dd50cbea977998361edb57499` |
| `dashboard_itens_detalhado.html` | HTML estático + Chart.js (dados embutidos) | 119.762 bytes | `a722d2600bf25a3293601fc00cb44f11` |
| `avaliacoes_tata_sushi_53069.xlsx` | Planilha (4 abas) | 90.909 bytes | `e7db25f753e86d044cb658ee3ec89887` |

**Origem provável (todos os 4):** exports/relatórios gerados a partir do painel administrativo do iFood
para a loja FRN_ID 53069 (TATA SUSHI, merchant_id `039ed60c-0ea5-4660-900a-265a720d7869`) — os 3 HTML
citam explicitamente `iFood` no cabeçalho/rodapé; o `dashboard.html` cita a fonte
`main.commercial_datamarts.competition_analysis` (um datamart interno do iFood, sugerindo exportação
via ferramenta de BI do parceiro, não um export genérico). Nenhum dos 4 arquivos tem metadado de autor
ou histórico de edição — a origem é inferida do conteúdo, com confiança alta pela consistência de marca,
`FRN_ID` e formatação entre eles.

### Tabela-resumo (os 8 campos pedidos)

| | `relatorio_pedidos_01-07.html` | `dashboard.html` | `dashboard_itens_detalhado.html` | `avaliacoes_tata_sushi_53069.xlsx` |
|---|---|---|---|---|
| **Período** | ⚠️ CORRIGIDO (2ª remessa): janela de ~24h **30/06 ~21:00 → 01/07 ~20:59**, não o dia-calendário 01/07 — ver correção na seção 1 | 03/04/2026 – 30/06/2026 (Abr-Jun, 91 dias) | 03/04/2026 – 02/07/2026 (90 dias) | 03/04/2026 – 02/07/2026 (90 dias) |
| **Primário ou agregado?** | **Primário** — item por pedido | Agregado (item×mês/turno/dia-semana) | Agregado (item, Curva ABC) | Misto — `Diário`/`Resumo`/`Distância` agregados; `Comentários` semi-primário (ver abaixo) |
| **Dado sensível?** | Não (ID interno iFood, sem nome/telefone/endereço de cliente) | Não | Não | Não (sem nome/telefone/endereço; `Comentários` tem texto livre do cliente, mas sem identificação) |
| **Entra no Git?** | **Não** — bruto, `data/raw/incoming/` | **Não** — bruto | **Não** — bruto | **Não** — bruto |
| **Serve para qual camada** | Motor B (composição real do pedido) — ver classificação detalhada | Cardápio/popularidade (contexto, já coberto por `Cardapio.xlsx` do lote anterior, período parcialmente sobreposto) | Cardápio/popularidade (Curva ABC, mais rico que o anterior) | Camada de desfecho/SAC — sinal de qualidade, NPS, distância×satisfação |

## Classificação detalhada por arquivo

### 1. `relatorio_pedidos_01-07.html` — o achado mais importante deste lote

**Confirma a hipótese do César: contém item por pedido.** Estrutura verificada linha a linha (não por
amostra): capa + "Sumário Executivo" + **"Todos os Pedidos do Dia" (250 pedidos, um `order-card` por
pedido)** + "Top 10 Itens do Dia" + "Análise Horária".

| Campo pedido | Presente? | Detalhe |
|---|---|---|
| ID completo do pedido | ✅ | UUID iFood (`#a0eb2c4d-4f77-497b-a731-545bd89e1747`), único por pedido — **250 IDs, zero duplicado** (conferido) |
| Horário | ✅ | `HH:MM` por pedido (ex.: `21:02`) — só um horário, não os carimbos de ciclo de vida (recebido/pronto/saiu) que o relatório de pedidos xlsx tradicional traz |
| Status | ✅ | 3 valores: `CONCLUDED` (236 · 94,4%), `DECLINED` (11 · 4,4%), `CANCELLED` (3 · 1,2%) |
| Valor total do pedido | ✅ | `order-total`, ex. `R$ 70,98` |
| Itens | ✅ | Tabela por pedido, **790 itens no total**, média 3,2 itens/pedido |
| Quantidade | ✅ | Coluna `Qtd` por item |
| Preço unitário | ✅ | Coluna `Unit.` por item |
| Total por item | ✅ | Coluna `Total` por item (qtd × unitário, já calculado) |
| Observações do cliente | ❌ | **Não existe** — nenhuma ocorrência de "obs"/"observ"/nota do cliente em todo o arquivo (14.009 linhas verificadas por busca de texto) |
| Cancelados/recusados | ✅ | `DECLINED` e `CANCELLED` aparecem como `order-card` normal, **com os itens ainda listados** — dado valioso (mostra o que teria sido produzido) |
| Pedidos duplicados | ❌ nenhum encontrado | 250 IDs únicos, contagem exata bate com o "250 pedidos" da capa |
| Pedidos refeitos | não determinável | Não há campo que indique "pedido refeito"/reenvio; só dá pra inferir por dois pedidos do mesmo horário/valor, o que não foi encontrado nesta amostra |
| Dados sensíveis | ❌ | Nenhum nome, telefone, endereço ou e-mail de cliente — só o UUID interno do pedido |

**Resposta direta à pergunta do César:** sim, este arquivo pode virar a fonte real de
`itens_pedido_reais` **para o dia 01/07/2026 especificamente** — um teste de "uma noite real" nos
mesmos moldes do que `docs/Formato_Importacao_Itens_Reais.md` já previu, mas **não substitui o Motor B
de forma permanente**: é só 1 dia (250 pedidos), não uma integração contínua. Ver
`docs/Relatorio_Fonte_Real_Itens_2026-07-01.md` para o teste real (Parte 5).

**Limitação já visível antes de parsear:** o horário é só o do pedido (equivalente a "recebido"), não
há carimbo de "pronto"/"saiu"/"entregue" neste arquivo — logo ele **não substitui** o relatório
tradicional para o eixo de tempo/estado (Motor A continua vindo de lá). Ele só resolve o eixo de
composição (Motor B).

**⚠️ CORREÇÃO (descoberta na 2ª remessa, 03/07):** o arquivo **não cobre o dia-calendário 01/07** — é
uma **janela de ~24h: 30/06 ~21:00 → 01/07 ~20:59** (provavelmente "últimas 24h" no momento da
geração). Prova, medida por join com o relatório de logística da mesma semana (ID completo, minuto a
minuto): os 34 pedidos de 21h+ do HTML aparecem na logística com data **30/06** e horário idêntico; os
42 pedidos de 21h+ do dia real 01/07 **não estão** no HTML. Dos 46 pedidos do HTML sem par na
logística de 01/07: 34 são de 30/06 21h+ (têm timing, datado 30/06), 11 são `DECLINED` (recusados não
entram no relatório logístico — natural) e 1 `CONCLUDED` 11:45 sem registro logístico (possível
retirada). Qualquer uso deste arquivo deve tratar a data por linha como **janela**, não como "01/07".

### 2. `dashboard.html` — agregado, não confundir com o anterior

Dado 100% embutido em um array JS (`top10`, `diasData`, `turnos`) — não é tabela HTML lida do DOM, é
JS já processado. Confirmado:

- **Período:** Abril–Junho 2026 (91 dias), badge explícito no cabeçalho.
- **Total de pedidos:** 25.222 (Abr 8.161 / Mai 8.898 / Jun 8.163).
- **GMV:** R$ 5,89M · **Ticket médio:** R$ 233,84.
- **Top itens:** top 10 do trimestre + top 10 por dia da semana (7 abas).
- **Distribuição por turno:** almoço/tarde/jantar/ceia, mês a mês (jantar domina, ~72-73%).
- **Ranking por dia da semana:** presente (tabs "Domingo" a "Sábado").

**Serve para:** validar/enriquecer popularidade de item (mesmo papel do `Cardapio.xlsx` já auditado,
mas com granularidade extra por dia-da-semana que aquele não tinha) e confirmar o padrão de turno
(jantar dominante) já visto nos dados do pacote anterior.

**NÃO serve para:** nada no nível de pedido individual — não tem ID de pedido, não tem composição por
pedido, não tem horário fino. Também não deve ser somado ao `Cardapio.xlsx`/`Vendas.xlsx` do pacote
anterior sem checar sobreposição de período (Abr-Jun aqui vs. Abr-Jun lá — quase certamente o mesmo
recorte, risco de dupla contagem se alguém juntar os dois sem conferir).

### 3. `dashboard_itens_detalhado.html` — o mais rico dos 3 HTML, ainda agregado

- **Período:** 03/04/2026 – 02/07/2026 (90 dias).
- **Total de itens:** 179 únicos no cardápio.
- **Total de pedidos:** 24.937 (quase idêntico ao total de pedidos do `avaliacoes_tata_sushi_53069.xlsx`
  no mesmo período — **bom sinal de consistência cruzada** entre os dois arquivos deste lote).
- **Curva ABC:** presente e explícita — **Classe A: 43 itens · B: 44 · C: 92** (Seção 1).
- **Faixas de preço:** presente (Seção 4 — "Distribuição por Faixa de Preço").
- **Itens classe A/B/C:** confirmado, com contagem exata acima.
- **Cauda longa:** a Classe C (92 de 179 itens = 51% do cardápio) é a cauda longa; o documento tem
  Seção 6 "Análise Consultiva" que comenta isso qualitativamente.
- **Campos de desconto:** **presentes na estrutura, mas vazios** — KPI "Itens com Desconto" mostra
  literalmente `N/D` com a nota "Dado não disponível no período". Registrar como lacuna, não inventar.
- **Limitações:** mesmo problema do `dashboard.html` — é agregado de cardápio, não tem pedido
  individual. Não dá para saber "qual pedido continha qual item".

**Deve alimentar:** popularidade/cardápio (Curva ABC é um dado novo e valioso — o pacote anterior tinha
popularidade por contagem, mas não uma classificação ABC pronta). **Não deve alimentar composição por
pedido** — confirmado, mesma limitação estrutural do item anterior.

### 4. `avaliacoes_tata_sushi_53069.xlsx` — camada de desfecho/SAC, a mais rica em texto livre

4 abas, todas parseadas:

| Aba | Linhas de dado | Conteúdo |
|---|---:|---|
| `Resumo` | 22 | Painel de métricas: 90 dias, 1.111 avaliações com nota, 1.237 com texto, **nota média 4,86**, **NPS -21,3 (negativo)**, 700 detratores vs 463 promotores, 24.937 pedidos totais, 5,0% taxa de avaliação |
| `Diário` | 90 (uma linha por dia) | 36 colunas: contagem/nota/NPS do dia, promotores/detratores/neutros, nota por 8 faixas de distância (até 1km → acima de 7km), `pedidos_atrasados_avaliados`, `elegivel_selo`/`classificacao_selo` |
| `Nota por Distância` | 8 | Nota média (proporção) e pedidos avaliados por faixa de distância — a faixa "acima de 7km" tem nota mais baixa (0,85 na aba diária consolidada) |
| `Comentários` | 1.319 | Data, nota, **texto livre do comentário**, tags (ex. "Comida Saborosa", "Temperatura certa", "Bem temperada"), contagem de pedidos avaliados/com comentário/concluídos |

**Achado importante sobre a granularidade de `Comentários`:** não é 1 linha = 1 review individual. É
**1 linha por combinação única (data × conjunto de tags aplicadas)**, com uma contagem de quantos
pedidos daquele dia compartilham a mesma combinação. Confirmei contando: das 1.319 linhas, **apenas 146
(11%) têm texto livre real** (as demais têm literalmente a string `"(sem comentário)"` na coluna
`Comentário`, mas ainda carregam tags e contagens agregadas). Isso não invalida o dado — só significa
que "1.319 comentários" não quer dizer 1.319 clientes escreveram algo; é uma tabela mista
agregado+semi-primário.

**Dados sensíveis:** nenhum. Sem nome, telefone, endereço, e-mail. O texto livre da coluna `Comentário`
é do cliente, mas não identifica quem é — mesmo padrão de risco (ou ausência dele) já registrado para
`Relatorio Cancelamentos.xlsx` no `docs/Auditoria_Dados_Estruturados.md`.

**Sinal cruzado com atraso:** existe a coluna `pedidos_atrasados_avaliados` na aba `Diário` — mas em
**todos os 90 dias o valor é `0`** (conferido, não é lacuna de leitura). Ou não houve pedido atrasado
avaliado no período, ou o iFood não está atribuindo essa métrica para esta loja — não dá para saber
qual das duas sem perguntar à fonte. Registrar como observação, não como conclusão.

**Deve alimentar:** a camada de desfecho/SAC do núcleo (`dimensao: "desfecho"`, mesma família de
`sac.mensagem`/`review.nota` que já existe em `src/core/adaptadores.ts`) — é o primeiro dado real de
NPS e comentário de qualidade com granularidade diária que o projeto recebe. O NPS **negativo** (-21,3)
é um sinal de produto relevante que nenhum documento anterior tinha capturado (os relatórios de
cancelamento/erro mostravam sintoma; este mostra a métrica-resumo que a própria plataforma usa).

## 2ª remessa do lote (recebida 03/07/2026) — mais 6 arquivos

Mesmo local (`data/raw/incoming/ifood_2026-07-01/`), renomeados para nomes limpos (hash original do
iFood removido do nome; conteúdo intocado). Todos confirmados fora do Git via `git check-ignore`.

| Arquivo | Tipo | Período (medido) | Linhas de dado | Hash MD5 |
|---|---|---|---:|---|
| `relatorio_logistica_2026-06-26_2026-07-02.xlsx` | **primário, pedido-a-pedido** (29 col, mesmo formato da `Logistica.xlsx` histórica) | 26/06 → 01/07 (nome diz até 02/07, mas não há linhas de 02/07) | 1.763 | `4ad23169235488b43f8abdab8c00a534` |
| `relatorio_cancelamento.xlsx` | primário (cancelamento-a-cancelamento, **itens nomeados**, só ID curto) | 26/06 → 01/07 | 61 | `a6bec1842df53ca0e5780305e7b9cf63` |
| `relatorio_negociacoes.xlsx` | primário (negociação-a-negociação, só ID curto; **2 colunas novas**: `Houve arbitragem`, `Resultado da arbitragem`) | 26/06 → 01/07 | 59 | `33ce4d32673f07f02c50f48d6845f3ac` |
| `relatorio_cardapio.xlsx` | agregado (Funil/Itens/Complementos — mesmo formato do `Cardapio.xlsx` histórico) | 26/06 → 02/07 | 1+148+19 | `e496c474c81caee7474c5a6716654632` |
| `relatorio_vendas.xlsx` | agregado (4 abas — mesmo formato do `Relatorio Vendas.xlsx` histórico) | 26/06 → 02/07 | pequenas | `363516653948a36b1916c72625c4287e` |
| `relatorio_qualidade_operacao.zip` | agregado pivotado (1 xlsx interno, série diária Dia vs Dia) | 26/06 → 02/07 (01/07 presente: 247 pedidos) | ~89 | `cd9455d791e9c8b56c8765e836676023` |

- **PII:** nenhum dos 6 tem nome/telefone/endereço/CPF de cliente (mesmas famílias de export já
  auditadas em `docs/Auditoria_Dados_Estruturados.md`).
- **Entra no Git:** nenhum — todos brutos, `data/raw/incoming/` (gitignorado).
- **Camadas servidas:** logística → **Motor A/timing por pedido** (a peça que faltava para 01/07);
  cancelamento+negociações → camada de desfecho; cardápio+vendas+qualidade → contexto/validação
  cruzada e popularidade (agregados — nunca composição por pedido).
- **Achado-chave (join, medido):** logística tem **246 pedidos no dia 01/07, todos com timing completo**
  (botão-pronto, entrega realizada, espera na loja, alocação — 246/246 em cada campo). Join por
  **ID completo** com o HTML: 204/250. Join dos cancelamentos de 01/07 por ID curto→logística: **7/7**;
  negociações: **9/9**. Parser exploratório: `tools/parse_lote_ifood_2026-07-01.js` → 4 `.jsonl` em
  `data/generated/` (gitignorados), com hash de origem e proveniência por linha.
- **Análise de completude e resposta à pergunta da fase:** ver
  `docs/Relatorio_Completude_Simulacao_2026-07-01.md`.

## Lote `ifood_2026-06-20_a_2026-06-30` (recebido 03/07/2026)

Local: `data/raw/incoming/ifood_2026-06-20_a_2026-06-30/` (gitignorado, confirmado por `git check-ignore`).

| Arquivo | `relatorio_pedidos_com_itens_jun20-30.html` |
|---|---|
| Tipo | HTML com dados embutidos em array JS `const ALL_ROWS` (formato **diferente** do HTML de 01/07 — tabela paginada, 1 objeto por pedido) |
| Período | 20/06/2026 → 30/06/2026 (11 dias-calendário completos, medido: 0 datas fora do período) |
| Tamanho / Hash MD5 | 1.196.540 bytes / `0fbf1cd5067b3dad62bc791cbc66199a` |
| Origem provável | export/relatório do painel iFood, FRN 53069 (título interno confirma loja e período) |
| Primário ou agregado | **Primário** — pedido a pedido, com itens |
| Item por pedido | ✅ 10.565 itens / 12.118 unidades em 3.215 pedidos (`itens_html`, "Nx Nome") |
| **Observação do cliente** | ✅ **PRIMEIRA fonte com observações**: 758 observações em 543 pedidos (16,9%) — em `<em>(...)</em>`; inclui alergias explícitas |
| Status | ✅ CONCLUDED 2.996 · CANCELLED 71 · DECLINED 148 (KPIs do próprio arquivo batem 100% com a extração) |
| Preço por item | ❌ não existe (só valor total do pedido) — `preco_unitario: null`, nunca inventado |
| ID | ✅ uuid completo (`oid`); atenção: `oid_short` do arquivo é PREFIXO do uuid, **não** o ID curto do iFood |
| PII | Nenhum campo estruturado de cliente; observações são texto livre do cliente (sem identificação) |
| Entra no Git? | **Não** — bruto |
| Camada servida | **Motor B (composição real)** em escala: 11 dias · casamento com seed **154/154 itens únicos = 100% exato** · viabilizou replays reais (ver `docs/Relatorio_Replays_Reais_Jun20-30.md`) |
| Parser | `tools/parse_relatorio_pedidos_com_itens_html.js` → `data/generated/itens_pedido_reais_2026-06-20_a_2026-06-30.jsonl` (fora do Git) |

## O que este lote NÃO resolve (honestidade)

- **Não é uma integração contínua** — é uma janela de ~24h com composição (`relatorio_pedidos_01-07.html`)
  + uma semana de timing logístico. Não dá para rodar o Auto Teste de 30 dias com item real a partir disto.
- ~~Não traz carimbos de ciclo de vida~~ **CORRIGIDO pela 2ª remessa:** o relatório de logística traz as
  durações oficiais por pedido (mesmo formato que o Motor A já consome) para 26/06→01/07 — o eixo de
  tempo/estado desta janela está coberto. O que continua sem existir em nenhum arquivo: observação do
  cliente, pronto-por-praça (só KDS dará) e horário de aceite próprio (aproximado ao recebido, como sempre).
- **Não resolve a integração definitiva** (`docs/Fonte_Real_Itens_Plano.md` continua de pé — API iFood
  como próximo passo recomendado; este lote é mais um "modo ponte", não a integração).

## Próximos passos deste lote

1. Parser exploratório de `relatorio_pedidos_01-07.html` → `data/generated/itens_pedido_reais_2026-07-01.jsonl`
   (não integrado ao motor) — ver `tools/parse_relatorio_pedidos_html.js`.
2. Validação da extração (contagens, exemplos, casos-limite).
3. Teste isolado do motor com esta noite real vs. síntese, sem tocar no backtest oficial.
4. Relatório final com recomendação — `docs/Relatorio_Fonte_Real_Itens_2026-07-01.md`.
5. **Aprovação humana** antes de qualquer integração permanente.
