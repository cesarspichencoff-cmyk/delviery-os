# Crítica Cruzada — Proposta A (Grok) × Proposta B (Claude)

> Escrita **após** o congelamento da Proposta B (`PROPOSTA_B_FREEZE_MANIFEST.json`, commit `4ebc696`).
> Os artefatos congelados da Proposta B **não foram alterados** por esta crítica.
> Isto **não** é uma Proposta C. A decisão final é do César e do ChatGPT.

---

## 0. O achado que corrige AS DUAS propostas

Ao verificar a afirmação da Proposta A sobre dados de item, encontrei uma fonte que **nenhuma das
duas propostas dimensionou corretamente**:

`delviery-os/data/raw/incoming/ifood_2026-06-20_a_2026-06-30/relatorio_pedidos_com_itens_jun20-30.html`

Conteúdo real (verificado, 1,2 MB, dados embutidos como JSON):

| | Valor |
|---|---|
| Pedidos | **3.215** |
| Período | **11 dias** (20/06 → 30/06/2026) |
| Campos por pedido | `dt` · `oid` · `status` · **`tv` (valor: média R$ 237,82)** · **`nitens` ("1 dist. / 1 un.")** · `itens_html` ("1x Beef com Nirá") |

Somado ao dia 01/07 (250 pedidos), há **~3.465 pedidos com composição real em 12 dias**.

**Isto corrige a Proposta A**, que reportou "250 pedidos / 790 itens (01/07)" — **1 dia**. A base de
composição é ~13× maior do que ela declara, e inclui **valor** e **distintos/unidades** por pedido.

**Isto também corrige a Proposta B (minha)**, que afirmou "zero composição disponível". Era verdade
para as camadas derivadas de `deliveryos-private-sources` que inventariei, e **falso** para
`delviery-os/data/raw/incoming/`, que **eu não inventariei**. Foi uma falha de escopo do meu
inventário, não uma inferência errada sobre os dados que li.

**Consequência prática:** a "versão intermediária" que ambas as propostas empurram para o futuro é
**parcialmente possível hoje**, sobre 12 dias reais — incluindo `nitens` (variedade e unidades) e
`tv` (magnitude), exatamente as variáveis que ambas declaramos ausentes.

---

## 1. Convergências (chegamos ao mesmo lugar por caminhos diferentes)

| Ponto | A (Grok) | B (Claude) |
|---|---|---|
| Score único opaco | rejeita | rejeita |
| Ranking / culpa individual | rejeita | rejeita |
| Movimentação automática de pessoas | rejeita | rejeita |
| `montagem_outros` ≠ carga da Conferência | sim | sim |
| 30/50/70 insuficiente sozinho | sim (só sombra) | sim (erra 22% dos dias) |
| Declarar o que não se sabe | sim | sim (`fontes_ausentes[]` obrigatório) |
| WhatsApp ≠ censo estatístico | sim | sim |
| Nada de receita genérica como método TATÁ | sim | sim |
| Hotlink de foto / uso sem aprovação | rejeita | rejeita |

A convergência é forte e independente — as duas propostas foram produzidas sem contato. Isso
aumenta a confiança nesses pontos.

---

## 2. Descobertas exclusivas da Proposta A (verifiquei — são verdadeiras e valiosas)

1. **`montagem_outros` tem apenas 5 itens no seed** — Gengibre, Gohan, Sunomono, Tarê, Wasabi.
   **Verificado: verdadeiro.** É a prova mais forte e concreta de que a praça é *insumo de
   finalização*, não o relógio da Conferência. Minha proposta chegou à mesma conclusão por um
   caminho mais fraco (ela não existe nos dados de pedido). **O argumento do Grok é melhor.**

2. **91 de 199 itens (46%) têm `risco_de_erro: alto` no seed.**
   **Verificado: verdadeiro.** Usar esse campo cru como alerta faria **quase metade do cardápio
   gritar** — "alert storm". Eu não fiz essa verificação. É um achado operacional real e é
   exatamente o tipo de armadilha que destrói a confiança no produto.

3. **Encontrou a existência de composição real de itens** (o HTML). Mesmo subdimensionada (§0), a
   descoberta é dela, não minha.

4. **Roadmap em fases (A0–A7)** com horizontes — a Proposta B não entrega cronograma.

5. **Autocrítica prévia tabelada** (seção 0 do documento-mestre), atacando a própria proposta antes
   de defendê-la. É uma prática melhor que a minha, que só declara recusas.

---

## 3. Descobertas exclusivas da Proposta B (Claude)

1. **Profundidade temporal 9× maior.** A Proposta A analisou pedidos do pacote L2A
   (**8.305 pedidos, 27/05–25/06**, ~30 dias). A Proposta B analisou
   `MULTIPERIOD_L2C` — **70.071 pedidos, 267 dias, 2025-10 a 2026-06**. A base de 9 meses estava
   disponível e não foi usada por A.

2. **Não é volume, é concentração.** 2026-03-21 fez **304 pedidos com pico 28** (22,0 min até
   pronto, 4% atraso); 2025-12-26 fez **159 pedidos com pico 58** (39,1 min, 58%). Correlação
   pico × tempo interno = **0,842**; volume × sofrimento é fraca. **40 dias de alto volume fluidos**
   e **18 de volume moderado problemáticos** — 22% dos dias seriam classificados errado por volume.

3. **"% de atraso" é métrica contaminada.** Fev/2026: 56,6% de atraso. Mar/2026: 20,3%. Volume
   (265 vs 254), pico (41 vs 37) e tempo interno (28,7 vs 24,6 min) equivalentes. Provável mudança
   de *tempo prometido* na plataforma. A Proposta A usa "~38% delayed flag" como característica da
   operação **sem detectar essa contaminação** — e propõe calibrar faixas contra "saída real", o que
   herdaria o viés.

4. **Onde a operação vive**: 91,2% do tempo abaixo de 30 ativos; a faixa "70+" existe por
   **207 minutos em 9 meses** (0,1%). Uma faixa de urgência em 70 quase nunca dispara — e quando
   dispara, é tarde.

5. **Vetor de dois eixos** (carga + **convergência**) como estado da Conferência, em vez de uma
   grandeza única — desenhado para capturar "engasgar mesmo com as praças fluindo".

---

## 4. Insuficiências da Proposta A

| # | Insuficiência | Gravidade |
|---|---|---|
| A1 | **Subdimensionou a composição**: reportou 1 dia (250 pedidos); há 12 dias (~3.465 pedidos) com itens, valor e distintos/unidades | **Alta** — muda o que é possível hoje |
| A2 | **Usou ~30 dias de pedidos** quando havia 267 dias disponíveis | **Alta** — conclusões sobre dias bons/críticos ficam frágeis |
| A3 | **Não detectou a contaminação do "atraso"**; cita "~38% delayed" como fato operacional e propõe calibrar contra saída real | **Alta** — risco de ensinar configuração de plataforma ao modelo |
| A4 | **CEC (Carga Equivalente de Conferência)** é um agregado multi-fator; mesmo "vetorial", tende a colapsar carga e convergência, que pedem ações distintas | Média |
| A5 | `active_proxy` reconhecido como enviesado, mas usado como eixo central sem quantificar o viés | Média |
| A6 | Documentos muito curtos (vários com 1,5–3 KB) para o peso das decisões que propõem | Média |
| A7 | Não testa se simultaneidade prediz sofrimento — apenas se discrimina dias de pico | Média |

**Sobre o CEC — avaliação específica pedida:** a intenção está certa (compor fatores em vez de contar
pedidos), e a Proposta A acerta ao mantê-lo em sombra e recusar pesos finais. O risco é que
"Carga Equivalente" sugere **uma grandeza escalar**. Os dados mostram dois fenômenos distintos:
carga (quantos vivos) e convergência (quantos prontos juntos). Um dia pode ter carga alta e
convergência baixa — e a ação é diferente. Recomendo manter o CEC **explicitamente vetorial e sem
soma final**, ou renomeá-lo.

---

## 5. Insuficiências da Proposta B (autocrítica)

| # | Insuficiência | Gravidade |
|---|---|---|
| B1 | **Afirmou "zero composição"** — errado; não inventariei `delviery-os/data/raw/incoming/` | **Alta** |
| B2 | **Estágios 2, 3, 7 e 8 não executados** (preparo dos itens, memória humana, catálogo visual, coletor iFood) — limite de sessão da API interrompeu as frentes delegadas | **Alta** |
| B3 | Não verifiquei o seed como o Grok verificou (5 itens em `montagem_outros`, 46% risco alto) | Média |
| B4 | Sem roadmap com horizontes | Média |
| B5 | A "convergência" é proposta mas **não foi medida** — falta o carimbo absoluto de "pronto"; usei duração | Média |
| B6 | Zero cobertura do WhatsApp: 194.539 linhas disponíveis, nenhuma analisada | **Alta** |

Em cobertura de missão, a Proposta A entregou **17 artefatos** cobrindo todos os estágios; a
Proposta B entregou **10**, com 4 estágios ausentes. **A Proposta A é mais completa.**
A Proposta B é mais profunda onde tocou.

---

## 6. Evidência mais sólida de cada lado

| Tema | Evidência mais sólida | De quem |
|---|---|---|
| `montagem_outros` não mede a Conferência | 5 itens nominais no seed | **A** |
| Risco do seed é inutilizável cru | 91/199 = 46% | **A** |
| Concentração > volume | 304/pico 28 vs 159/pico 58; r = 0,842 | **B** |
| "% atraso" não é confiável | fev 56,6% vs mar 20,3% com operação equivalente | **B** |
| Raridade do estado crítico | 207 min em 70+ em 9 meses | **B** |
| Existe composição real | HTML com 3.465 pedidos / 12 dias | **A descobriu · B dimensionou** |

---

## 7. Incompatíveis × combináveis

**Incompatível (escolher um):**
- **Alvo do modelo**: A tende a calibrar contra atraso/saída real; B recusa o atraso como verdade e
  usa tempo interno. **Não dá para os dois.** A evidência de fev/mar favorece B.
- **Forma da saída**: CEC como grandeza composta × vetor de dois eixos sem soma.

**Combináveis (e melhores juntos):**
- Conhecimento de item de A (`item-preparation-master.json`, fatores de conferência) **+**
  profundidade temporal de B (267 dias) → testar se composição explica os 69 dias problemáticos.
- Achado de A sobre 46% de risco alto **+** eixo I5 de B (impacto × probabilidade, não complexidade)
  → resolve o "alert storm".
- Checklist de abertura de A (alinhado a OP-04/08, que **eu não li**) **+** prontidão como
  denominador de B.
- Roadmap faseado de A **+** ordem por custo/benefício de B.

---

## 8. Riscos de cada proposta

**A:** calibrar contra métrica contaminada · alert storm por risco do seed (ela mesma alerta) ·
conclusões temporais sobre base de 30 dias · CEC virar score por conveniência de implementação.

**B:** incompletude (4 estágios) · propor convergência sem poder medi-la hoje · rigor estatístico
sem conhecimento de produto pode levar a um modelo elegante que a operação não reconhece.

---

## 9. O que depende do César

1. **Autorizar o parser dos 12 dias com itens** (`jun20-30` + `01-07`) — é o desbloqueio mais barato e imediato das duas propostas. *(consequência do §0)*
2. Houve mudança de **tempo prometido** em fev/2026? Decide se "atraso" pode ser alvo.
3. `montagem_outros` = insumo de finalização (5 itens) confirma que a Conferência precisa de **fonte própria**?
4. CEC: manter como vetor sem soma, ou adotar o modelo de dois eixos?
5. OP-04 é o checklist oficial vigente? (pergunta de A — não verifiquei)
6. Autorizar a execução dos estágios 2, 3, 7 e 8 da Proposta B.
7. Ordem: aprofundar composição (12 dias) **antes** de coletor novo?

---

## 10. Veredito honesto

**Nenhuma das duas está pronta para virar produto, e as duas erraram no inventário.**

A Proposta A é **mais completa e mais concreta sobre o cardápio**; encontrou as duas evidências mais
afiadas (5 itens de `montagem_outros`; 46% de risco alto) e cobriu todos os estágios pedidos.

A Proposta B é **mais profunda e mais rigorosa sobre o tempo**; provou que concentração explica
sofrimento melhor que volume, e que a métrica de atraso está contaminada — duas correções que
mudam o alvo do modelo.

O erro comum foi de **inventário, não de raciocínio**: as duas subestimaram a composição real
disponível. Corrigido isso (§0), o próximo passo não é escolher uma proposta — é **parsear os 12
dias de itens** e testar, sobre eles, a hipótese que ambas só puderam supor: *a composição do pedido
explica os dias problemáticos que o volume não explica?*
