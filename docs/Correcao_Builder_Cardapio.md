# Correção do Builder do Cardápio — Registro

> Executa a correção autorizada depois de `docs/Auditoria_Builder_Cardapio_PreCorrecao.md`. Escopo
> estritamente cirúrgico: só `tools/build_cardapio_knowledge.js` foi alterado. Motor, baseline, seed
> efetivo e classificação operacional de qualquer item **permanecem idênticos** — provado por diff
> vazio, não por afirmação.

## As duas divergências históricas (confirmadas, não hipotéticas)

O gerador (`tools/build_cardapio_knowledge.js`, commitado uma única vez em `6afc130`, nunca alterado
até hoje) ficou defasado em relação a **duas** correções manuais feitas diretamente no
`data/cardapio_knowledge_seed.json` no commit seguinte (`aa1df5d`, "Motor de 8 praças reais"):

1. **Nomes de praça.** O gerador produzia `"bar"`, `"cozinha"`, `"montagem"` em vez de
   `"bar_bebidas"`, `"cozinha_quentes"`, `"montagem_outros"` — o vocabulário oficial de `motor.js`.
   Afetava 72 dos 199 itens (36,2% do cardápio).
2. **Confiança/revisão manual de 3 itens.** `Ceviche`, `Tartar de Salmão` e `Tuna Shisô Tartar` tinham,
   no seed, `confianca_classificacao: "media"` e `revisao_manual: true` com uma nota sobre a regra
   operacional do César — uma decisão manual tomada uma vez, nunca incorporada ao gerador, que
   continuava a produzir `"alta"`/`false` para esses 3 itens.

Ambas nasceram do mesmo padrão: alguém corrigiu o **resultado** (`cardapio_knowledge_seed.json`) sem
atualizar a **fonte da correção** (o gerador). O seed commitado sempre esteve certo; o gerador é quem
ficou para trás — confirmado por `git log`/`git diff` em `docs/Auditoria_Builder_Cardapio_PreCorrecao.md`.

## Correção aplicada

Em `tools/build_cardapio_knowledge.js`:

1. **`normalizarPracaOficial()`** — função centralizada, único ponto de entrada de qualquer nome de
   praça no seed (chamada logo após `classify()`, antes de `derive()` e do registro final). Mapeia os
   3 aliases (`bar→bar_bebidas`, `cozinha→cozinha_quentes`, `montagem→montagem_outros`), preserva os 5
   nomes já corretos e os itens sem praça (`null`), e **lança erro** para qualquer valor fora do
   vocabulário oficial — trava anti-regressão explícita, para este bug (ou variante dele) nunca mais
   entrar silenciosamente.
2. **Exceção nomeada e restrita** — dentro do bloco "ENROLADOS QUENTES" do `classify()`, checagem por
   nome normalizado exato (`ceviche`, `tartar de salmao`, `tuna shiso tartar` — só estes 3, nenhum
   outro item) que reproduz **literalmente** o texto de observação já existente no seed, e define
   `confianca:"media"`/`revisao:true`. Nenhuma regra de classificação, categoria ou praça foi tocada —
   só os 2 campos e o texto que já existiam no seed.
3. Seis referências de exibição do próprio relatório gerado (`ORDEM_PRACA`, o checklist "Critério de
   sucesso", 2 linhas da seção "Sinais destravados", e o resumo de console) foram atualizadas para os
   nomes oficiais — sem isso, o relatório passaria a **esconder** os 72 itens corrigidos (chave errada
   em `porPraca[...]`), uma regressão de documentação que o próprio fix teria introduzido.

Nenhuma regra de `classify()` (regex, prioridade, `depsFrom`) mudou além do necessário para essas duas
correções.

## Vocabulário oficial (referência)

`combinados · duplas · enrolados · enrolados_quentes · cozinha_quentes · sobremesa · bar_bebidas · montagem_outros`
(fonte única: `src/perfil-delivery/motor.js`, linha 19).

## Teste de diff vazio

1. Builder rodado **isolado** primeiro (scratchpad, lendo a fonte real mas escrevendo fora do repo) —
   confirmado: `cozinha_quentes` 31, `bar_bebidas` 36, `montagem_outros` 5; diff do seed isolado vs
   commitado = **vazio** (ignorando só `_meta.gerado_em`, timestamp de execução, não dado de cardápio).
2. Só então rodado **sobre o repositório real**. Resultado idêntico ao teste isolado.
3. `_meta.gerado_em` restaurado manualmente para `2026-07-01` (o valor commitado) — o conteúdo do
   cardápio não mudou em nada; só o timestamp de execução seria diferente, e mantê-lo idêntico evita
   um diff de 1 linha sem nenhum significado de dado.
4. **`git diff data/cardapio_knowledge_seed.json` → 0 linhas.** Diff literalmente vazio.

## Testes rodados (combinados)

`npm run build` ✓ · `npm run typecheck` ✓ · `npm run demo` ✓ (idempotência OK, 17 transições) ·
`node tools/teste_fonte_real.js` ✓ (16/16 casados) · `node tools/autoteste_8pracas.js` ✓ (nota 8.1/10,
idêntica a todas as execuções anteriores — motor não mudou).

## Efeito colateral esperado (não é regressão)

`docs/Auditoria_Cardapio_Conhecimento.md` — gerado pelo mesmo script — **muda em 3 linhas**: a nota
sobre "cozinha" (texto desatualizado que dizia "unificação só quando conectarmos ao motor" — já não é
verdade) e as 2 linhas da seção "Sinais destravados" que mostravam **"0 itens em cozinha"/"0 itens em
bar"** — valores errados, herdados do mesmo bug, agora corretos (31 e 36). Contagem de "revisão
manual" sobe de 5 para 8, refletindo a exceção dos 3 itens agora corretamente contabilizada — o mesmo
número que o documento de auditoria histórico (`docs/Auditoria_Cardapio_Conhecimento.md`, lido em
sessões anteriores) sempre citou como correto.

## Decisão final: seed atual preservado, gerador agora confiável

`data/cardapio_knowledge_seed.json` está, byte a byte, idêntico ao que já estava commitado. O que
mudou é que agora **é possível regenerá-lo com segurança** — antes, rodar o builder era uma bomba
silenciosa (36% do cardápio perderia afiliação de praça); agora, rodar reproduz exatamente o estado
protegido, e qualquer desvio futuro do vocabulário oficial faz o script **falhar alto**, não silenciar.

## Trava permanente de integridade

A correção acima prova que o builder está certo **hoje**. Sem uma verificação permanente, nada impede
uma futura edição de `classify()` (nova regra de item, novo termo, refatoração) de reintroduzir drift
silencioso — exatamente como aconteceu da primeira vez, sem nenhum erro visível por meses. Por isso,
`tools/verificar_integridade_cardapio.js` (`npm run verificar:cardapio`) existe como cadeado permanente,
não como script de uma vez só.

**Por que existe:** o bug original só foi descoberto por acidente, testando portabilidade de caminho —
não havia nada no projeto que checasse "o builder ainda reproduz o seed?". Esta trava fecha essa lacuna
de forma permanente, antes de qualquer calibração ou tuning futuro se apoiar num cardápio que pode ter
silenciosamente se corrompido.

**O que ele protege — quatro checagens independentes, cada uma com falha isolada e nomeada:**

1. **Diff byte a byte** entre o seed regenerado (em diretório temporário, nunca no repo) e o commitado,
   ignorando só `_meta.gerado_em`. Qualquer divergência real do conteúdo do cardápio falha aqui primeiro.
2. **Vocabulário oficial** — todo `praca_principal` gerado precisa estar nas 8 praças de `motor.js` (ou
   ser `null`, para itens legitimamente não-produtivos). Herda a mesma trava de `normalizarPracaOficial()`.
3. **Nenhum item perde praça** — cada um dos 199 itens do seed commitado que tem praça é comparado
   individualmente (por `id`) contra a versão regenerada; identifica o item exato, não só "algo mudou".
4. **As 3 exceções históricas** (Ceviche, Tartar de Salmão, Tuna Shisô Tartar) continuam com
   `confianca_classificacao:"media"` e `revisao_manual:true` — a segunda divergência que este mesmo
   processo corrigiu não pode voltar a se perder silenciosamente também.

**Como rodar:** `npm run verificar:cardapio` (ou `node tools/verificar_integridade_cardapio.js`).
Saída: `OK: seed reproduzível sem drift` (exit 0) ou uma lista numerada e objetiva de cada problema
encontrado (exit 1) — nunca "parece que está tudo bem".

**Validado nos dois sentidos, com testes negativos isolados (fora do repo, sem tocar em nenhum arquivo
real):**
- Reintroduzir `"bar"`/`"cozinha"`/`"montagem"` (os aliases já conhecidos) é absorvido silenciosamente
  pela normalização — comportamento correto, não é falha do verificador.
- Introduzir uma praça **desconhecida** (não mapeada, ex. `"bebidas_e_afins"`) faz o builder falhar com
  `throw`, e o verificador reporta "builder falhou ao rodar" — a trava de `normalizarPracaOficial()`
  funciona.
- Simular uma **reclassificação silenciosa** (um item migrado para outra praça oficial, mas errada)
  não gera nenhum erro no builder — e o verificador pega exatamente isso, nomeando cada um dos itens
  afetados individualmente. É o cenário mais perigoso (sem exceção lançada) e o que mais importa provar.

**Por que isso é importante antes de calibração futura:** qualquer calibração de baseline ou tuning
que venha depois vai se apoiar na composição por praça do cardápio. Calibrar sobre um cardápio que
silenciosamente perdeu 36% de sua afiliação de praça — como quase aconteceu aqui — produziria uma
calibração inteira construída sobre dado errado, sem nenhum sinal de alerta. Esta trava garante que,
antes de qualquer novo trabalho de calibração começar, o cardápio que o sustenta continua exatamente o
que deveria ser.
