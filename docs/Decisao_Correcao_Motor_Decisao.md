# Decisão de Correção — Motor × Decisão

> Não é implementação. É a estratégia de correção mais segura, definida antes de qualquer código,
> fundamentada nos 266 casos medidos em `docs/Medicao_Divergencia_Motor_Decisao.md` e no contrato já
> definido em `docs/Contrato_Motor_Decisao.md`. Diretriz obrigatória: **o objetivo não é tornar o
> sistema mais inteligente — é impedir que ele troque de assunto da atenção ativa.** Nenhum código foi
> alterado para produzir este documento.

---

## 1. Quais `sit.kind` não devem ser alterados agora — e por quê

**`conferencia`** (71/72 alinhado, 1,4% de troca proibida) e **`saida`** (7/7 alinhado, 0% de troca) —
**provado pela medição**, não hipótese. Os dois já funcionam. Mexer neles agora violaria a Lei 8 (na
dúvida, subtrai): não há dúvida a resolver aqui, há comportamento correto já medido. Qualquer correção
nesses dois tipos seria complexidade sem retorno, e carrega o risco real de introduzir uma divergência
nova onde hoje não existe nenhuma.

## 2. Correção conceitual para `praca`

**O que a medição provou:** quando o foco ativo é uma praça sobrecarregada, em 31% dos casos a ação
mostrada é sobre **outra praça**, porque `priorizar_praca`/`fechar_simples` competem livremente entre
todas as praças por `score`, sem saber qual delas abriu o foco.

**Decisão arquitetural:** restringir o universo de candidatos de `priorizar_praca` e `fechar_simples`
à **mesma praça** de `sess.active.sit.praca` quando o foco ativo é `kind:"praca"`. Isso não é uma nova
regra de inteligência — é reduzir o espaço de busca ao que já foi decidido pelo motor. A fórmula de
`score` não muda; só o conjunto de candidatos elegíveis para vencer.

## 3. `order`: candidatos próprios ou `buildFoco()` puro?

**Cair para `buildFoco()` puro.** `buildFoco()` já tem texto dedicado e correto para este `kind`
(`motor.js:335-339` — nomeia a praça, o tempo sem ficar pronto, se depende de múltiplas praças, a
consequência). O problema medido não é falta de texto — é que `decisao.js` **substitui** esse texto
correto por um de outra tensão quando nenhum candidato do próprio pedido vence o `score`. Criar um novo
tipo de candidato para competir por esse slot é resolver com mais inteligência um problema que hoje é
de **disciplina de escopo**. A diretriz obrigatória desta missão pede o oposto de mais inteligência.

## 4. `fechamento`: candidatos próprios ou `buildFoco()` puro?

**Mesma decisão: `buildFoco()` puro.** `buildFoco()` já cobre este `kind` corretamente
(`motor.js:309-313`). A medição mostrou que `fechar_simples` só nasce com **2 ou mais** pedidos de
praça única esperando (`decisao.js:77`) — um `fechamento` isolado nunca tem chance de competir. Isso
não é um bug a corrigir com um candidato novo; é a prova de que este `kind`, sozinho, **não tem
candidato aplicável** na maioria das vezes — e o princípio desta missão já diz o que fazer quando não
há candidato aplicável: mostrar `buildFoco()`.

## 5. Quando `decisao.js` deve obrigatoriamente cair para `buildFoco()` puro

Sempre que, **depois de restringir os candidatos ao escopo da tensão ativa** (mesma praça para
`kind:"praca"`; mesmo `id` do pedido para `kind:"order"`/`"fechamento"`/`"conferencia"`; mesma zona
para `kind:"saida"`), **nenhum candidato sobreviver ao filtro**. Não é uma exceção rara — pela
medição, é o caminho mais comum para `order` (nenhum candidato específico daquele pedido na maioria
dos 49 casos) e para `fechamento` (nenhum candidato específico em nenhum dos 5 casos medidos).

## 6. Quais novos candidatos NÃO devem ser criados agora

- Um tipo de candidato dedicado a "pedido preso individual" (`order`).
- Um tipo de candidato dedicado a "fechamento de praça única isolado" (sem exigir 2+).
- Qualquer ajuste de `score` entre praças concorrentes (ex.: dar peso extra à praça que já está há
  mais tempo em foco).
- Qualquer heurística nova de desempate.

Todos esses são **hipóteses de melhoria de inteligência**, não correções de escopo — e a diretriz
desta missão proíbe explicitamente esse caminho agora.

## 7. Riscos de criar candidatos próprios para `order` e `fechamento`

1. **Nenhum dado histórico para calibrar o `score` de um candidato novo** — violaria a Lei 11
   (observabilidade antes de inteligência): estaríamos decidindo um comportamento sem tê-lo observado
   antes.
2. **Risco de o candidato novo competir e vencer onde hoje `conferencia`/`saida` já funcionam bem** —
   introduzir um quinto/sexto tipo de candidato pode mudar o equilíbrio de `score` que hoje mantém
   98,6%/100% de acerto nesses dois tipos, sem ninguém ter pedido essa mudança.
3. **Mais superfície para testar e mais chance de bug** — cada candidato novo exige nova cobertura nas
   12 janelas, nova validação, novo texto de apresentação — custo real, sem benefício medido.
4. **Contradiz a diretriz explícita desta missão.**

## 8. A menor correção segura que respeita o contrato

Duas peças, nenhuma delas "inteligência nova" — as duas são restrição de escopo:

1. Quando o foco ativo é `kind:"praca"`, candidatos de `priorizar_praca`/`fechar_simples` só competem
   se forem da **mesma praça** de `sess.active.sit.praca`.
2. Depois de aplicar essa restrição (e a de mesmo-`id`/mesma-zona para os outros `kind`), se **nenhum**
   candidato sobreviver, mostrar `buildFoco()` puro em vez de chamar `decisao.js` para escolher algo de
   outro lugar.

**Isso, sozinho, cobriria (hipótese a confirmar por teste, não fato ainda):** os 41 casos de
praça-diferente + os ~40 casos de `order`/`fechamento` perdendo para candidato de outro lugar — a
maior parte dos 82 casos de troca proibida medidos, sem inventar nenhum candidato novo.

## 9. Testes/auditorias necessários para validar a correção

1. **Re-rodar `tools/auditar_divergencia_motor_decisao.js`** (já existe, não-produção) sobre as mesmas
   12 janelas, depois da correção — confirmar que "TROCA PROIBIDA DE CAUSA RAIZ" cai para perto de
   zero (o que sobrar deve ser só os casos de "direção inversa" já identificados como indeterminados,
   não cobertos pelo contrato).
2. **Rodar `node tools/autoteste_8pracas.js`** (sem alterá-lo) como sanity check — confirmar que a nota
   do backtest oficial não piora.
3. **Conferir manualmente 2-3 dos exemplos concretos já citados na medição** (ex.: o caso
   `pr:combinados` → "Priorizar Duplas") e confirmar que passam a mostrar a praça certa ou `buildFoco()`
   puro.
4. **Confirmar que a distribuição de confiança (alta/média/baixa) não muda** — a correção é de escopo,
   não de confiança; se a distribuição mudar, algo além do previsto foi alterado.

## 10. O que NÃO deve ser mexido de forma alguma agora

- O conteúdo de `buildFoco()` — já está correto, só precisa voltar a ser mostrado com mais frequência.
- A fórmula de `score` de qualquer tipo de candidato existente.
- O gerente de atenção (`DEBOUNCE`/`COOLDOWN`/`MAXFOCUS`, `sess.pending`/`sess.active`) — fora do
  escopo deste problema.
- A assimetria de `firedAt` identificada no Red Team — é um bug separado, com sua própria missão de
  correção, não deve ser misturado a esta.
- `BASELINE`/`TEMPO_PRACA` (nenhum tuning).
- A fórmula de confiança (`confComp`, `fonteReal`).
- Qualquer coisa no `kind:"conferencia"` ou `kind:"saida"` (§1).

---

## Separação explícita (o que é fato, o que é decisão, o que é hipótese)

| | Conteúdo |
|---|---|
| **Provado pela medição** | 30,8% de troca proibida geral; `order` 75,5%; `fechamento` 100% (n=5); `conferencia` 1,4%; `saida` 0%; presente nas 12/12 janelas; `priorizar_praca` é o candidato que mais "rouba" o slot (67% das trocas) |
| **Decisão arquitetural (recomendada aqui, não implementada)** | restringir escopo de `priorizar_praca`/`fechar_simples` à mesma praça do foco; cair para `buildFoco()` puro quando nenhum candidato sobreviver ao escopo; não criar candidatos novos para `order`/`fechamento` |
| **Hipótese (a confirmar só depois de implementar e medir de novo)** | que essas duas mudanças resolvem ~81/82 dos casos medidos; que a nota do backtest não piora; que a distribuição de confiança não muda |
| **Não deve ser implementado agora** | qualquer candidato novo, qualquer ajuste de score, qualquer coisa em `conferencia`/`saida`, a correção do bug de `firedAt`, qualquer tuning de baseline |
