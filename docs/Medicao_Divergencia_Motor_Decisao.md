# Medição — Divergência Motor × Decisão

> Mede, não conserta. Ferramenta: `tools/auditar_divergencia_motor_decisao.js` (auditoria, não
> produção — lê `motor.js`/`decisao.js` sem alterá-los). Rodada sobre as 12 janelas reais já
> validadas (01/07 + 20-30/06), com composição real (não sintética) em todas. Dado bruto:
> `data/generated/divergencia_motor_decisao.json` (fora do Git). Nenhum código de produção foi
> tocado para produzir esta medição.

## Metodologia (para poder confiar no número)

Para cada minuto em que `sess.active` existia e sua chave mudou (onset de um novo foco — o instante
em que o operador veria uma mensagem nova), capturei `sess.active.sit` (a tensão que abriu o foco) e
chamei `DECISAO.decidir()` **de verdade, sem modificação** para obter a ação exibida. Como
`decisao.js` não exporta o alvo (praça/id) de cada candidato, usei um **espelho de leitura** —
cópia da mesma lógica de geração de candidatos, só para recuperar esse campo — e casei o candidato
espelhado com o vencedor real por `tipo`+`score` (arredondado a 1 casa, igual `decisao.js` já faz em
`top.todas`). **0 de 266 casos falharam esse casamento** — o espelho reproduziu o score real em
100% das vezes, validando que a leitura é fiel ao código de produção, não uma aproximação.

## 1-2. Quantos casos com foco ativo e com decisão exibida

**266 onsets de foco** nas 12 janelas (24 na janela de 01/07 + 242 nos 11 dias de 20-30/06).
**Em todos os 266, houve uma ação exibida** — `decidir()` nunca retornou `null` quando `sess.active`
existia, exceto 1 caso de inconsistência momentânea (ver §6).

## 3-6. Classificação

| Categoria | Quantidade | Percentual |
|---|---:|---:|
| ALINHADO | 90 | 33,8% |
| REFINAMENTO ACEITÁVEL | 92 | 34,6% |
| TROCA PROIBIDA DE CAUSA RAIZ | 82 | 30,8% |
| INDETERMINADO | 2 | 0,8% |

## 7. Quais `sit.kind` mais apresentam divergência

| `sit.kind` | Total | Alinhado/Refinamento | Troca proibida | Taxa de troca |
|---|---:|---:|---:|---:|
| **order** (pedido preso, outlier individual) | 49 | 12 | **37** | **75,5%** |
| **fechamento** (pedido dependente de praça única) | 5 | 0 | 3 (+2 indeterminado) | **100%** (n pequeno) |
| praca (praça sobrecarregada) | 133 | 92 | 41 | 30,8% |
| conferencia (2ª sacola/bebida/kit/observação) | 72 | 71 | 1 | 1,4% |
| saida (saída travada/lenta) | 7 | 7 | 0 | 0% |

**`order` e `fechamento` são estruturalmente mal servidos.** Não é coincidência de dado — é
consequência direta do vocabulário de `decisao.js`: não existe nenhum `tipo` de candidato dedicado a
"pedido preso individual" fora de expedição, nem a "fechamento de praça única" isolado (o único tipo
próximo, `fechar_simples`, exige **pelo menos 2** pedidos de praça única esperando —
`decisao.js:77`: `if (simples.length >= 2)` — um `fechamento` isolado nunca dispara isso sozinho).
Quando esses dois `kind` vencem o slot de atenção, `decisao.js` quase sempre entrega a ação de **outro**
candidato mais barulhento (geralmente `priorizar_praca` ou `conferencia`), porque não há candidato
próprio para competir.

## 8. Quais tipos de ação mais aparecem fora do escopo

Entre as 82 trocas proibidas: **`priorizar_praca` — 55 (67%)** · `conferencia` — 25 (30%) ·
`chamar_motoboy` — 2 (2%). `priorizar_praca` é o "vencedor barulhento" mais frequente: seu score
(`unblock×2 + n×0,5 + sev`) cresce rápido quando há muitos pedidos liberáveis, o suficiente para
vencer mesmo quando a praça sobrecarregada **não é a mesma** que abriu o foco (ver exemplo abaixo).

## 9. Exemplos concretos dos casos mais graves

**O mais revelador — mesma `kind`, praça diferente** (janela 01/07, minuto 2554):
```
foco: praça COMBINADOS sobrecarregada (pr:combinados)
ação exibida: "Priorizar Duplas"
```
O foco e a ação são do mesmo **tipo** de tensão (praça sobrecarregada) — mas de **praças diferentes**.
O operador é interrompido por causa de Combinados e instruído a agir sobre Duplas.

**`order` perdendo para `conferencia`** (janela 01/07, minuto 1329):
```
foco: pedido preso #38f93b72 (produção, fora do padrão)
ação exibida: "Conferência reforçada" — sobre outro pedido inteiramente
```

**`fechamento` perdendo para `priorizar_praca`** (janela 21/06, minuto 836):
```
foco: fechamento do pedido #c43c7652 (depende só de cozinha_quentes)
ação exibida: "Priorizar Combinados" — praça diferente, pedido diferente
```

**Caso indeterminado, direção inversa não coberta pelo contrato** (janela 23/06, minuto 771):
```
foco: fechamento do pedido #f5e65a4b (praça enrolados)
ação exibida: "Priorizar Enrolados" — mesma praça, mas MENOS específica que o foco
```
Aqui a ação nomeia a praça certa, mas de forma mais genérica que o foco específico do pedido — o
inverso do exemplo de "refinamento" dado na missão (que é sempre foco-genérico→ação-específica).
`docs/Contrato_Motor_Decisao.md` não cobre essa direção; classifiquei como indeterminado em vez de
forçar.

## 10. A divergência é rara, moderada ou estrutural?

**Estrutural.** Presente nas **12 de 12 janelas**, sem exceção, variando entre 16% e 47% de taxa de
troca proibida por janela — nunca ausente, nunca um evento raro de um dia atípico:

| Janela | Troca proibida |
|---|---:|
| 01/07 (24h) | 29% |
| 20/06 | 33% |
| 21/06 | 28% |
| 22/06 | 16% |
| 23/06 | 30% |
| 24/06 | 40% |
| 25/06 | 47% |
| 26/06 | 44% |
| 27/06 | 28% |
| 28/06 | 22% |
| 29/06 | 22% |
| 30/06 | 26% |

Quase 1 em cada 3 focos, em toda janela testada, mostra uma ação sobre causa raiz diferente da que
abriu o foco. Isso não é ruído estatístico — é o `score` de `decisao.js` competindo, sem restrição de
escopo, exatamente como o Red Team e o Contrato já previam antes desta medição.

## 11. Risco operacional real hoje

**Alto para dois tipos de sinal específicos (`order`, `fechamento`), moderado para o resto.** Um
pedido preso isolado (`order`) é, por definição, um outlier que já escapou do padrão — é exatamente o
tipo de situação que mais precisa de atenção pontual, e é o que **mais frequentemente** (75,5%) recebe
uma mensagem sobre outra coisa. Para `conferencia` e `saida`, o risco medido é baixo — esses dois tipos
já são, na prática, quase sempre coerentes com sua própria ação. O risco não é uniforme: é concentrado.

---

## O que esta medição permite decidir

**Já existe evidência suficiente para implementar o contrato?** Para dois tipos de sinal
(`order`, `fechamento`), sim — a divergência é tão alta (75-100%) e tão claramente ligada à ausência
de candidato próprio no vocabulário de `decisao.js` que qualquer correção precisa passar por ali.
Para `praca`, a evidência mostra divergência real (31%) mas de natureza diferente — não é ausência de
candidato, é **competição entre praças** (o score da praça vencedora simplesmente ganha de qualquer
outra) — corrigir isso é uma decisão de design diferente da anterior (ex.: restringir candidatos de
`priorizar_praca` à mesma praça do foco vs. permitir a praça mais severa vencer sempre). Para
`conferencia` e `saida`, **não há evidência de problema** — não implementar restrição ali seria
otimizar o que já funciona.

**Ainda é necessário medir mais?** Sim, em um ponto: esta medição usou só **composição real**
(`fonteReal:true`). Não sei se a taxa de divergência muda com composição sintética (o modo que
ainda roda em produção hoje) — é uma medição barata de fazer depois, não decisiva para as conclusões
acima, mas relevante antes de qualquer decisão final de prioridade de correção.

**Quais partes do contrato parecem seguras (dado real, não hipótese):**
- Restringir `priorizar_praca` e `fechar_simples` à mesma praça do foco quando o foco é `kind:"praca"`
  — resolveria os 41 casos medidos de praça-diferente sem tocar em mais nada.
- Dar a `order`/`fechamento` um caminho de ação dedicado (ou, na ausência de um candidato aplicável,
  cair para o texto de `buildFoco()` puro, como já recomendado no Contrato §6) resolveria a maior
  fatia da divergência medida (40 dos 82 casos de troca proibida, entre `order`+`fechamento`).

**Quais partes continuam perigosas:**
- A "direção inversa" (ação mais genérica que o foco, ver §9) não está coberta por nenhum documento
  até agora — decidir isso exige julgamento de produto, não só medição.
- Não medi ainda se a taxa de divergência **piora ou melhora** com o volume/pico da noite — a
  variação de 16% a 47% por janela pode ter causa (volume? mix de pedidos?) ainda não investigada.

**O que não deve ser implementado ainda:**
- Qualquer filtro de escopo em código — esta é só a medição; a Missão 2 (correção) precisa de uma
  decisão explícita do César sobre qual comportamento é o pretendido, não uma inferência automática
  a partir destes números.
- Qualquer novo tipo de candidato para `order`/`fechamento` — decidir a forma desse candidato é
  design de produto, fora do escopo de medição.
- Nenhuma correção de `firedAt` (a assimetria de cooldown do Red Team) — não medida nesta missão,
  seria uma quarta missão separada.
