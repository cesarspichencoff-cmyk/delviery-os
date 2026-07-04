# Auditoria Pré-Correção — Bug do Builder do Cardápio

> Investigação completa via código e histórico do git — nada aqui é recordação de sessão anterior,
> tudo foi reconferido agora. **Nenhuma correção foi feita.** Este documento existe para que a correção,
> quando autorizada, seja mecânica e sem risco, não uma investigação feita às pressas.

## 1. Qual é o bug exato

`tools/build_cardapio_knowledge.js` gera `praca_principal` com **3 nomes curtos** que não existem no
vocabulário oficial do motor: `"bar"`, `"cozinha"`, `"montagem"` — em vez de `"bar_bebidas"`,
`"cozinha_quentes"`, `"montagem_outros"` (as 8 praças oficiais, definidas em `motor.js` linha 19). Os
outros 5 nomes que o builder gera (`combinados`, `duplas`, `enrolados`, `enrolados_quentes`,
`sobremesa`) já estão corretos — o bug afeta só estas 3 das 8 praças.

## 2. Onde nasce

Em 5 pontos do próprio `classify()` dentro de `tools/build_cardapio_knowledge.js`:

| Linha | Praça errada | Praça oficial esperada |
|---|---|---|
| 145 | `"bar"` | `"bar_bebidas"` |
| 208 | `"cozinha"` | `"cozinha_quentes"` |
| 216 | `"cozinha"` | `"cozinha_quentes"` |
| 241 | `"montagem"` | `"montagem_outros"` |
| 247 | `"montagem"` | `"montagem_outros"` |

Mais 4 pontos onde o nome errado se repete de forma consistente (não é bug adicional, é o mesmo bug
propagado dentro do próprio arquivo): linha 429 (`ORDEM_PRACA`), linha 449 (checklist "Critério de
sucesso"), linhas 517/519 (seção "Sinais destravados pelo cardápio" do relatório de auditoria gerado),
linha 543 (resumo de console). Linhas 85/86/88 (`depsFrom`, usada só para `pracas_dependentes` de
combinados/menus) também usam os nomes curtos — mesmo bug, mesma origem.

## 3. Quais nomes errados são gerados

`"bar"`, `"cozinha"`, `"montagem"` — como `praca_principal` de 36+31+5 = **72 dos 199 itens (36,2%
do cardápio)**, se o builder rodasse hoje sem correção.

## 4. Quais nomes oficiais o motor espera

`motor.js` linha 19: `["combinados","duplas","enrolados","enrolados_quentes","cozinha_quentes","sobremesa","bar_bebidas","montagem_outros"]`.
As comparações que dependem do nome exato: `PRODUCAO.includes(x.praca)` (linha 21/68/70/90/111),
`CONFERENCIA.includes(x.praca)` (linha 23/72), e comparações diretas `x.praca === "bar_bebidas"`
(linha 81/112) e `s.praca === "cozinha_quentes"` (linha 306). Todas usam **igualdade de string exata**
— não há normalização nem tolerância a abreviação em lugar nenhum do motor.

## 5. O seed atual está correto, ou só protegido por não regenerar?

**Está correto — e a causa é precisa, não hipotética.** Confirmado via `git log`/`git diff`:

- `tools/build_cardapio_knowledge.js` foi commitado uma única vez (`6afc130`, 01/07) e **nunca mudou**
  desde então (a única alteração posterior foi o fix de caminho absoluto desta fase de portabilidade,
  que não toca nenhuma lógica de classificação).
- O commit seguinte, `aa1df5d` ("Motor de 8 praças reais"), **editou o `data/cardapio_knowledge_seed.json`
  diretamente** — o diff mostra exatamente 36× `"bar"→"bar_bebidas"`, 31× `"cozinha"→"cozinha_quentes"`,
  5× `"montagem"→"montagem_outros"`, sem nenhuma outra mudança de conteúdo. A mensagem do commit
  confirma: *"nomes finais das praças"*.

Ou seja: **o seed foi corrigido à mão, uma vez, no momento em que o vocabulário de 8 praças foi
definido — e o gerador nunca foi atualizado para refletir essa correção.** O seed commitado é a
verdade certa; o builder é quem ficou para trás. Não é sorte nem proteção acidental — é dívida técnica
documentada com precisão agora.

## 6. Qual seria o risco se alguém rodasse o builder hoje

**Alto, e silencioso.** `PRODUCAO.includes("cozinha")` e `CONFERENCIA.includes("bar")` são ambos
`false` — os 72 itens afetados (36% do cardápio) deixariam de contar para sobrecarga de praça
(`cozinha_quentes` nunca mais apareceria sobrecarregada), deixariam de disparar os sinais de bebida/
sobremesa/conferência (`contemBebida`, `confPr`), e sairiam do `itemPorPraca` usado para nomear o
"item dominante" nos focos. O motor não erraria com barulho — ele **silenciosamente pararia de ver
mais de um terço do cardápio**, exatamente o tipo de falha que as Leis Fundamentais (Lei 5: nunca
mentir) e o Manifesto (honestidade estrutural) mais temem: nenhum log, nenhum erro, só sinais que
deveriam existir e não existem mais. Isso já quase aconteceu nesta fase de portabilidade — capturado
só porque o procedimento de `git diff` depois de rodar qualquer script foi seguido (ver
`docs/Procedimento_Continuidade.md`, Incidente 2).

## 7. Qual é o teste de segurança antes/depois

1. `git status` limpo antes de tocar no builder.
2. `cp data/cardapio_knowledge_seed.json` e `docs/Auditoria_Cardapio_Conhecimento.md` para a
   scratchpad (backup fora do repo, não fora do Git — precaução extra).
3. Aplicar a correção (só os 5 valores de `praca_principal` + as 6 referências consistentes listadas
   no §2 — nenhuma lógica de classificação, nenhuma regex, nenhuma ordem de prioridade).
4. Rodar `node tools/build_cardapio_knowledge.js`.
5. `git diff data/cardapio_knowledge_seed.json docs/Auditoria_Cardapio_Conhecimento.md`.
6. Critério de sucesso: **diff vazio** (§9).
7. Se o diff não for vazio, reverter (`git checkout --` ou `git show HEAD:<arquivo> > <arquivo>`) e
   reabrir investigação — não commitar nada até o diff bater exato.
8. Só depois: `node tools/build_prototipo.js` + `npm run demo`/`autoteste_8pracas.js` como sanity
   adicional (nenhum deles depende do builder, mas confirmam que nada mais quebrou).

## 8. Qual é o critério de sucesso

Diff vazio entre a saída do builder corrigido e os dois arquivos já commitados
(`data/cardapio_knowledge_seed.json`, `docs/Auditoria_Cardapio_Conhecimento.md`). Nada além disso —
não é "parecer razoável", é bit a bit.

## 9. A correção pode gerar diff vazio?

**Sim — com alta confiança, já verificável por inspeção.** O `data/cardapio_knowledge_seed.json`
commitado **é literalmente a saída do builder atual com só essas 5 strings trocadas** (prova: o commit
`aa1df5d` mudou exclusivamente essas 3 famílias de string, nada mais, no arquivo inteiro). Isso
significa que corrigir as mesmas 5 strings (+ as 6 referências consistentes) no gerador deveria
reproduzir o seed commitado exatamente. Esta é uma previsão testável, não uma garantia — o teste do §7
é quem decide, não este parágrafo.

## 10. Há risco de alterar classificação de itens sem querer?

**Baixo, se a correção for disciplinada a só renomear strings.** Nenhuma regra de `classify()` (regex,
ordem de prioridade, `depsFrom`) precisa mudar — só o literal do nome da praça em 5 `return` e 6
referências de relatório/agregação. O risco existiria **se** a correção fosse além disso (ex.:
"aproveitar" para revisar os 8 itens de baixa confiança já documentados em
`docs/Auditoria_Cardapio_Conhecimento.md` §5, ou mudar alguma regra de prioridade) — isso não é parte
deste bug e não deve ser misturado à correção quando ela for autorizada.

## Conclusão

Bug totalmente diagnosticado, com evidência de git, não de memória. Fix é mecânico (troca de 5
literais de string + 6 referências), com teste objetivo (diff vazio) e risco baixo se escopado
estritamente à troca de nomes. **Não corrigido nesta fase** — aguardando autorização explícita, como
pedido.
