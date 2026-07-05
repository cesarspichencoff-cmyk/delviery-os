# Relatório Pós-Correção — Motor × Decisão

> Implementação da menor correção segura definida em `docs/Decisao_Correcao_Motor_Decisao.md`, sobre o
> contrato de `docs/Contrato_Motor_Decisao.md` e a medição de `docs/Medicao_Divergencia_Motor_Decisao.md`.
> Base: commit `72561c9` (main, working tree limpo antes desta missão).

---

## 1. O que foi alterado

Uma restrição de escopo dentro de `decisao.js:decidir()`: quando existe foco ativo
(`opts.active = sess.active`, contendo `sess.active.sit`), os candidatos gerados (inalterados) são
filtrados por uma função nova, `dentroDoEscopo(candidato, ativo)`, que só deixa competir quem pertence
à **mesma causa raiz** do foco:

| `sit.kind` do foco ativo | Tipos de candidato permitidos | Condição de escopo |
|---|---|---|
| `praca` | `priorizar_praca`, `fechar_simples` | mesma `praca` do foco |
| `order` | `olhar_pedido`, `conferir_saida` | mesmo `id` do pedido do foco |
| `fechamento` | `fechar_simples` (se o pedido está entre os que ele fecha), `olhar_pedido`, `conferir_saida` | mesmo `id` do pedido do foco |
| `conferencia` | `conferencia` | mesmo `id` do pedido do foco |
| `saida` | `chamar_motoboy`, `conferir_saida` | (agregado — já é zona de expedição) |

Se nenhum candidato sobreviver ao filtro, `decidir()` retorna `null` — comportamento que **já existia**
e que os chamadores (protótipo) **já tratam** mostrando `buildFoco()` puro (`docs/Contrato_Motor_Decisao.md`
§6). Não foi necessário criar nenhum caminho novo de fallback.

Sem `opts.active` (chamador não migrado), `decidir()` continua **idêntico ao comportamento anterior** —
a restrição só ativa quando o chamador passa o foco ativo.

**Nenhuma fórmula de `score` ou `confiança` foi tocada.** As únicas adições aos candidatos existentes
são campos de metadado para permitir o filtro saber o alvo de cada um: `praca` (em `priorizar_praca` e
`fechar_simples`), `ids` (lista de pedidos que `fechar_simples` fecharia) e `id` (em `conferencia`,
`olhar_pedido`/`conferir_saida`). Confirmado por diff: nenhuma linha com `score:` ou `confianca:` foi
alterada.

## 2. Arquivos tocados

- `src/perfil-delivery/decisao.js` — filtro de escopo + metadado de alvo nos candidatos (única mudança
  de comportamento real).
- `tools/autoteste_8pracas.js` — as 2 chamadas a `DECISAO.decidir()` passam `active: sess.active`
  (senão o sanity check continuaria medindo o comportamento antigo).
- `tools/auditar_divergencia_motor_decisao.js` — mesma alteração de chamada, mais um ajuste de
  diagnóstico: quando `decidir()` retorna `null`, o script agora chama `decidir()` **de novo, sem**
  `active`, só para saber se o `null` é "nenhum candidato existe" (inconsistência momentânea, já
  existia antes) ou "existia candidato, mas fora do escopo — caiu corretamente para `buildFoco()`"
  (o novo comportamento correto). Isso é diagnóstico do script de auditoria, não uma mudança em
  `motor.js`/`decisao.js`.
- `motor.js` — **não tocado** (confirmado: `git diff --stat` vazio).
- Não tocados (conforme instrução): seed, baseline, parser, `tools/replay_janela_real.js`,
  `tools/replay_janela_real_2026-07-01.js`, `prototipos/parados-agora/*`, `buildFoco()`, fórmula de
  score, fórmula de confiança, `firedAt`.

## 3. Resultado dos testes

- `npm run build` — OK, sem erros.
- `npm run typecheck` — OK, sem erros.
- `node tools/autoteste_8pracas.js` — **Nota do motor: 8,1/10, idêntica a antes** (a nota não depende
  de `decisao.js`, só de `motor.js`+timing real — confirmado por diff do relatório gerado, a linha da
  nota não mudou). O que mudou no relatório (esperado, é o efeito da correção): distribuição de
  **tipo** de recomendação — `priorizar_praca` caiu de 332→159, `conferir_saida`/`olhar_pedido`
  (order) subiram de 52+4→114+22, `fechar_simples` subiu de 37→95, `conferencia` caiu de 96→69, total
  de recomendações geradas caiu de 532→470 (a diferença são os casos que agora caem corretamente para
  `buildFoco()` puro em vez de mostrar ação de outra causa raiz).
- `node tools/auditar_divergencia_motor_decisao.js` — ver §4.

## 4. Divergência antes/depois (auditoria das 12 janelas reais)

| Categoria | Antes | Depois |
|---|---:|---:|
| TROCA PROIBIDA DE CAUSA RAIZ | **82 (30,8%)** | **0 (0%)** |
| REFINAMENTO ACEITÁVEL | 92 | 133 |
| ALINHADO | 90 | 132 |
| INDETERMINADO | 2 | 1 |
| **Total de onsets** | 266 | 266 |
| Avisos de score não-casado | 0 | 0 |

Por `sit.kind` (depois):

| `kind` | Antes (alinhado+refin / troca) | Depois (alinhado+refin / troca) |
|---|---|---|
| `praca` | 92 / 41 | 133 / **0** |
| `order` | 12 / 37 | 49 / **0** |
| `fechamento` | 0 / 3 (+2 indeterm.) | 4 / **0** (+1 indeterm.) |
| `conferencia` | 71 / 1 | 72 / **0** |
| `saida` | 7 / 0 | 7 / 0 |

O único `INDETERMINADO` restante (24/06, `fech:28f9a0e9`) é uma inconsistência momentânea genuína
(`decidir()` retorna `null` mesmo **sem** restrição de escopo — não há candidato nenhum naquele
instante) — não é o caso de "direção inversa" identificado na medição original (esse caso,
`fech:f5e65a4b` 23/06, agora cai corretamente para `buildFoco()` puro, ver §5).

## 5. Exemplos corrigidos (os três citados na missão)

**`pr:combinados` → "Priorizar Duplas"** (janela 01/07, minuto 2554): agora mostra **"Priorizar
Combinados"** (âncora `#57e9f4cf`, mesma praça do foco) — REFINAMENTO ACEITÁVEL.

**`order` #38f93b72 → "Conferência reforçada" de outro pedido** (janela 01/07, minuto 1329): agora
mostra **"Conferir saída do #38f93b72"** — o mesmo pedido do foco — ALINHADO.

**`fechamento` #c43c7652 → "Priorizar Combinados"** (janela 21/06, minuto 836): agora **cai para
`buildFoco()` puro** (nenhum candidato de `fechar_simples`/`olhar_pedido`/`conferir_saida` sobre esse
pedido específico venceu o escopo) — ALINHADO.

Bônus: o caso de "direção inversa" não coberto pelo contrato original (`fech:f5e65a4b`, 23/06, minuto
771 — antes mostrava "Priorizar Enrolados", mesma praça mas menos específico que o foco) também caiu
para `buildFoco()` puro, porque `priorizar_praca` nunca competiu para foco `kind:"fechamento"` — o
filtro resolveu esse caso sem precisar de uma regra de "direção" dedicada.

## 6. `conferencia` e `saida` não pioraram

- `conferencia`: 71/72 alinhado (98,6%) → **72/72 alinhado (100%)** — melhorou, não piorou.
- `saida`: 7/7 alinhado (100%) → **7/7 alinhado (100%)** — inalterado.

Nenhum dos dois teve código tocado; a melhora em `conferencia` é efeito colateral do filtro de escopo
aplicado aos OUTROS `kind`s (menos candidatos de `priorizar_praca`/`conferencia` de fora competindo
contra o pedido certo).

## 7. O que não foi mexido

- `motor.js` inteiro (sinais, `buildFoco()`, `DEBOUNCE`/`COOLDOWN`/`MAXFOCUS`, `firedAt`, `BASELINE`,
  `TEMPO_PRACA`).
- Fórmula de `score` de qualquer candidato (confirmado por diff linha a linha).
- Fórmula de `confComp`/confiança (a função `confComp` e os valores hardcoded `"alta"` não mudaram uma
  linha sequer).
- Nenhum candidato novo criado (mesmos 6 tipos: `priorizar_praca`, `fechar_simples`, `chamar_motoboy`,
  `conferencia`, `olhar_pedido`, `conferir_saida`).
- `tools/replay_janela_real.js`, `tools/replay_janela_real_2026-07-01.js`, `prototipos/parados-agora/*`
  — continuam chamando `decidir()` sem `active`, portanto continuam com o comportamento **anterior**
  (sem a restrição) até que alguém decida migrá-los — isso é intencional, não um esquecimento (ver §8).
- Seed do cardápio, parser, baseline.

## 8. Risco restante — honesto, não maquiado

- **A correção só está ativa onde o chamador passa `active: sess.active`.** Hoje isso é
  `tools/autoteste_8pracas.js` e `tools/auditar_divergencia_motor_decisao.js` (ferramentas de
  validação). O protótipo visual (`prototipos/parados-agora/app.js`, `index.html`) e os dois scripts de
  replay **continuam sem a correção**, porque a instrução explícita desta missão foi não tocá-los. Ou
  seja: a correção está **provada e pronta**, mas ainda não está "ligada" na única superfície que um
  operador humano realmente vê hoje (o protótipo). Isso é uma decisão explícita da missão, não um
  descuido — mas precisa virar a próxima decisão do César: migrar `app.js`/`index.html` para passar
  `active: sess.active` é uma mudança de 1 linha em cada um, fora do escopo autorizado aqui.
- **Distribuição de confiança mudou em agregado, embora a fórmula não tenha mudado.** No backtest de 30
  dias (`autoteste_8pracas.js`, composição sintética): alta 63→125, média 447→345, baixa 22→0. Isso é
  consequência **esperada e correta** do filtro — candidatos de alta confiança e dado 100% real
  (`conferir_saida`, `chamar_motoboy`) deixam de ser suprimidos por candidatos de menor confiança de
  outra causa raiz (`priorizar_praca`, `conferencia`), então aparecem mais. Mas isso diverge da
  hipótese registrada em `docs/Decisao_Correcao_Motor_Decisao.md` ("distribuição de confiança não
  muda") — reportando com transparência: a fórmula `confComp()` e os valores fixos de confiança não
  têm uma linha alterada (confirmado por diff), mas a distribuição agregada muda porque a correção
  muda **quem vence**, e quem vence tem confiança diferente. Vale registrar essa hipótese como
  refutada, não escondida.
- Assimetria de `firedAt` (Red Team) — não tocada, continua pendente, fora do escopo desta missão.
- Granularidade de Resolução (praça-agregada vs. pedido-específica) — ainda não definida, fora do
  escopo.
- Nenhum dado bruto ou gerado foi commitado (`data/generated/divergencia_motor_decisao.json` continua
  fora do Git, conforme `docs/Politica_Dados.md`).

---

## Estado do Git ao final desta missão

Modificados: `src/perfil-delivery/decisao.js`, `tools/autoteste_8pracas.js`,
`tools/auditar_divergencia_motor_decisao.js`, `docs/AutoTeste_Operacional_8pracas.md` (gerado pelo
autoteste). Novo: este arquivo. Não commitado — aguardando autorização do César.
