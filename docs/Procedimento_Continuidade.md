# Procedimento de Continuidade

> Nasce da Fase de Continuidade e Portabilidade (jul/2026). Não é burocracia — é a lição direta de
> dois incidentes reais que aconteceram **durante esta própria fase de trabalho** (registrados abaixo,
> sem dramatizar). O critério de aprovação desta fase foi: *"se eu trocar de máquina amanhã, o
> DeliveryOS continua"* — este procedimento é a parte processual dessa garantia; a parte técnica está
> em `docs/Auditoria_Nivel2_Validacao_Base.md` e `docs/Politica_Dados.md`.

## O procedimento (obrigatório, sempre)

1. **Todo início de sessão de trabalho:** `git status`. Se houver qualquer coisa inesperada (arquivo
   modificado que você não lembra de ter tocado, arquivo sumido, arquivo novo não rastreado que não
   deveria existir) — **pare e entenda antes de continuar.** Não presuma que está tudo bem.
2. **Antes de qualquer alteração:** `git diff` (ou `git diff --stat` para um resumo) do que já existe,
   para saber exatamente de onde se está partindo.
3. **Depois de qualquer alteração — especialmente depois de rodar um script que escreve arquivo:**
   `git status` de novo, e `git diff` nos arquivos que o script poderia ter tocado. Um script que só
   deveria *ler* dados pode, por engano, escrever num arquivo versionado (ver Incidente 2, abaixo) —
   isso só se descobre checando.
4. **Antes de qualquer commit:** revisar a lista de arquivos alterados um a um. Nunca `git add -A` /
   `git add .` sem antes ver o que está sendo adicionado.
5. **Se um arquivo sumir sem explicação:** não recriar de memória, não seguir em frente torcendo para
   que não importe. Parar, recuperar o conteúdo exato via `git show HEAD:<caminho>` (ou
   `git checkout -- <caminho>` quando o ambiente permitir), e só então continuar.

## Por que isto é uma regra e não uma sugestão — dois incidentes reais desta mesma fase

### Incidente 1 — `ARQUITETURA.md` sumiu do disco sem nenhum comando de remoção

Durante a Auditoria Nível 2 (turno anterior a esta fase), um `git status` de rotina mostrou
`ARQUITETURA.md` como **deletado** — sem que nenhum comando de remoção tivesse sido executado
deliberadamente. A causa exata não foi identificada (possivelmente um efeito colateral do ambiente de
execução, não do processo de auditoria em si). O que importa para este procedimento:

- **Foi pego a tempo** porque `git status` foi rodado como checagem de rotina antes de prosseguir —
  não porque alguém percebeu o arquivo faltando "a olho".
- A recuperação foi trivial e sem perda: `git show HEAD:ARQUITETURA.md` trouxe o conteúdo exato de
  volta, confirmado depois com `git diff` vazio.
- **Lição:** arquivos podem desaparecer por razões alheias ao seu trabalho. A defesa não é "ter
  cuidado" — é checar o estado do git com frequência suficiente para que a janela entre "sumiu" e
  "percebi" seja curta.

### Incidente 2 — testar um script quase sobrescreveu dado commitado com um bug pré-existente

Nesta própria fase, ao testar se `tools/build_cardapio_knowledge.js` continuava funcionando depois de
corrigido o caminho absoluto, o script rodou "com sucesso" — mas `git diff` revelou que ele teria
**regravado** `data/cardapio_knowledge_seed.json` e `docs/Auditoria_Cardapio_Conhecimento.md` com nomes
de praça errados (`bar`/`cozinha`/`montagem` em vez de `bar_bebidas`/`cozinha_quentes`/`montagem_outros`
— um bug de nomenclatura pré-existente no script, sem relação com o conserto de caminho, provavelmente
esquecido desde a renomeação das 8 praças). Sem o `git diff` imediatamente depois de rodar o script,
essa regravação teria sido **commitada silenciosamente** e quebrado o motor na próxima vez que alguém
confiasse no cardápio.

- **Foi pego a tempo** porque o passo 3 do procedimento (checar diff depois de rodar qualquer script
  que escreve arquivo) foi seguido antes de seguir em frente.
- A reversão foi trivial: `git show HEAD:<arquivo> > <arquivo>` para os dois arquivos afetados.
- **Lição:** "rodei e não deu erro" não é prova de que nada mudou. Só `git diff` prova isso. O bug em
  si (nomenclatura divergente entre o gerador e o dado commitado) ficou registrado como pendência —
  ver `docs/Auditoria_Nivel2_Validacao_Base.md` e não foi corrigido nesta fase (fora do escopo de
  portabilidade; mexer nele é mexer em como o cardápio é classificado, uma decisão de produto).

## O que este procedimento NÃO substitui

- Não substitui backup do dado bruto fora do Git (ver `docs/Politica_Dados.md`) — git só protege o que
  já está versionado.
- Não substitui teste funcional (rodar o backtest e comparar números) — ver
  `docs/Auditoria_Nivel2_Validacao_Base.md` para o padrão de comparação objetiva usado nesta fase
  (nunca aceitar "parece igual"; sempre `diff` byte a byte ou contagem exata).
- Não é uma proteção contra decisão errada — é uma proteção contra **perda ou corrupção silenciosa**
  de trabalho já feito.
