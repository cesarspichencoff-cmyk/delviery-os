# Lições de execução

> O que quase passou, e como foi pego. Escrito para a próxima missão não
> repetir — inclusive quando quem executa for outro.
>
> Todas as lições daqui são de uma família só: **o teste que passa sem
> testar.** Um teste que falha é barato — ele grita. Um teste que passa sem
> exercitar nada é caro, porque compra confiança que não existe e some no meio
> de um placar verde.

---

## L1 — Ferramenta de linha de comando pode ignorar suas flags em silêncio

O `psql` do Windows recebeu a URL como argumento **posicional** e ignorou tudo
o que veio depois — o `-c` inclusive. Conectava, não executava nada, e saía com
código 0.

O que salvou foi a asserção comparar **valores esperados**, e não apenas
"não deu erro": `'' !== '7'` denunciou. Um teste escrito como
`assert.doesNotThrow(...)` teria ficado verde sem tocar no banco.

**Regra:** todo canal externo (banco, processo filho, HTTP) começa com um
**preflight** que prova que ele executa — devolvendo um valor combinado. Está
implementado em `run-postgres-integration-tests.ts` e em
`run-backup-restore-tests.ts`.

---

## L2 — A saída de uma ferramenta não é só dado

`psql -tA` imprime o rótulo do comando (`UPDATE 10`) **junto** com as linhas do
`RETURNING`. Dois workers devolveram `UPDATE 10` cada um, o rótulo entrou na
lista de resultados, e o teste acusou "a mesma mensagem foi entregue a dois
workers" — um falso positivo que parecia um defeito grave de concorrência.

**Regra:** filtrar a saída pelo **formato esperado** (aqui, `/^o-\d+$/`), nunca
por "linha não vazia". E quando existir, usar a flag que silencia o rótulo
(`-q`).

---

## L3 — Sincronizar dois processos pela saída de texto não funciona

O teste de concorrência esperava um worker imprimir uma marca no meio da
transação. Como a saída redirecionada para arquivo fica **bufferada**, a marca
só aparecia quando o processo terminava — depois de soltar os locks. O "worker
rápido" media uma fila vazia.

Isso passou despercebido no verde. **O que revelou foi remover o `SKIP LOCKED`
e ver o teste continuar passando.**

**Regra:** sincronizar por estado **autoritativo** — aqui, `pg_stat_activity`
com `wait_event = 'PgSleep'`, que só é verdade depois do `UPDATE`. E, para todo
teste que afirma uma garantia, **remover a garantia e exigir a falha**. Sem
esse controle, o teste é uma opinião.

---

## L4 — Medição com efeito colateral em segundo plano não mede nada

Uma verificação de "banco fora do ar" reportou `healthy`. A conclusão apressada
foi "o health check mente". A verdade: um `pg_ctl start &` de um passo anterior
tinha religado o banco no meio do teste.

**Regra:** antes de afirmar sobre um estado, **verificar o estado** — a porta
está escutando? o cliente é recusado? Só então medir. E não deixar comando com
efeito rodando em segundo plano durante uma medição.

---

## L5 — Erro de evento em Node derruba o processo inteiro

O runtime crítico **morria** quando o PostgreSQL caía. O pool do `pg` emite
`error` nas conexões ociosas quando o servidor vai embora, e um evento `error`
sem ouvinte encerra o Node.

Isto não apareceu em nenhum teste unitário: só apareceu derrubando o banco de
verdade com o processo no ar.

**Regra:** todo recurso que emite eventos (pool, socket, stream) precisa de
ouvinte de `error`. E todo runtime que promete um estado degradado precisa ser
testado **na condição que produz esse estado**, com o processo rodando.

---

## L6 — Informação auxiliar não pode derrubar o diagnóstico

Corrigido o L5, o `/health` passou a responder um genérico "falha ao apurar
saúde" com o banco fora. A contagem de backlog — que é informativa — falhava
junto e derrubava a apuração inteira, escondendo o diagnóstico exato
(`storage: não é possível persistir fatos`) bem na hora em que alguém precisa
dele.

**Regra:** num apurador de saúde, o que é **informação** é tolerante a falha; o
que é **essencial** decide o estado. Misturar os dois faz o relatório piorar
justamente quando o sistema piora.

---

## L7 — `tsc` só compila TypeScript

O build gerava `dist/` sem os arquivos `.sql`. Uma imagem construída a partir
dali subiria sem schema e — pior — concluiria que não há migration pendente.

**Regra:** todo recurso não-TypeScript que o runtime lê precisa de passo
explícito de cópia no build, e o passo precisa **falhar** se não copiar nada.
`tools/copiar_migrations.js` sai com erro ao encontrar zero arquivos.

---

## L8 — Um gate no lugar errado tira a bancada de quem trabalha

A validação de endereço do Android, escrita na configuração do Gradle, derrubava
`assembleDebug`, `testDebugUnitTest` e `tasks`. O gate estava certo; o momento,
não.

**Regra:** validação de variante age quando a variante é **pedida**. Depois de
mover um gate, reexecutar os comandos que **não** deveriam ser afetados — foi
`assembleDebug` voltar a `BUILD SUCCESSFUL` que confirmou o acerto.

---

## L9 — `.gitignore` amplo engole o contrato de configuração

`deploy/.env.*` engoliu também `.env.platform.example`. O commit passou, e a
auditoria de deploy teria falhado no primeiro clone limpo — por arquivo
ausente, não por defeito.

**Regra:** depois de `git add`, conferir se o que se pretendia versionar
**entrou** (`git ls-files`). O Git avisa que ignorou, mas o aviso passa no meio
da saída.

---

## L10 — Restore devolve dados; proteção é outra pergunta

Um backup que ninguém restaurou é suposição. E conferir contagem de linhas é o
teste fácil e o inútil: o que some num restore e só dá sinal meses depois são
triggers, constraints e índices parciais.

A verificação da trigger é **comportamental** — tenta um `UPDATE` e exige a
recusa — porque trigger restaurada sem a função por trás existe no catálogo e
não protege nada.

**Regra:** testar backup pelo que ele **impede** depois de restaurado, não só
pelo que ele traz de volta. E restaurar sempre em base criada do zero: por cima
de uma existente, o teste esconde justamente o que procura.

---

## L11 — Comentários entram na medição de código

Recorrente em várias missões: testes estruturais casaram com termos proibidos
dentro de **comentários que explicavam a proibição**.

**Regra:** remover comentários antes de afirmar sobre o código. Vale para
TypeScript, SQL (`--`) e YAML (`#`).

---

## L12 — Ausência de ferramenta não pode virar verde

As três suítes que dependem de banco se declaram **PULADAS em voz alta** e saem
com sucesso quando `DELIVERYOS_PG_URL` não existe. A auditoria de containers diz
no próprio arquivo que Docker não rodou ali.

**Regra:** quando algo não pôde ser verificado, o resultado precisa **dizer
isso** — no console e no artefato. Um placar verde que não distingue "passou"
de "não rodou" é pior que um vermelho.
