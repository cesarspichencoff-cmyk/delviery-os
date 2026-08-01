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

---

# Lições da interrupção — 2026-07-27

> As anteriores são todas sobre o teste que passa sem testar. Estas são de outra
> família: **sobre gastar o recurso que permite verificar.**

## L13 — Especificação ampla não autoriza frentes paralelas ilimitadas

O Macro-Prompt 2 pedia doze resultados. A leitura natural foi abrir três frentes
em paralelo — Copiloto, Android, Figma — mais a implementação principal. As três
frentes de subagente **morreram no meio**, por limite de gasto, e nenhuma
entregou resultado aceitável:

- o port do Conference Brain parou em 309/314, sem o gate de auditoria;
- o Figma não escreveu um arquivo sequer no repositório;
- só a inspeção read-only — que era barata — chegou ao fim.

O trabalho que sobreviveu foi o que **eu** fiz sequencialmente: as seis skills e
os quatro módulos da ponte, cada um com teste verde antes do próximo começar.

**Regra:** uma unidade ativa por vez. Um briefing com doze itens é uma fila,
não uma autorização de paralelismo. Paralelizar é uma decisão de custo, e o
custo aqui é o único recurso que não se recupera dentro da sessão.

**O que fazer em vez disso:** ordenar por dependência, atacar a primeira, provar,
registrar, seguir. Se sobrar recurso, paralelize o que for **independente e
barato** — inspeção read-only, por exemplo, que foi a única que funcionou.

## L14 — Checkpoint ANTES de esgotar, não quando o aviso chegar

Quando o aviso de crédito chegou, havia 78 arquivos não rastreados e zero
commits — cerca de 15 mil linhas de trabalho sustentadas apenas pelo disco.
Não se perdeu nada, mas por sorte de ordem, não por desenho.

**Regra:** commitar cada unidade assim que ela passa no teste. Um commit por
unidade comprovada custa segundos; reconstruir do zero custa a sessão inteira.

Sinal para parar e consolidar: mais de ~5 arquivos novos não rastreados, ou mais
de uma unidade comprovada sem commit.

## L15 — Trabalho de subagente não entra sem validação independente

O port do Conference Brain **parecia** pronto: 34 arquivos no lugar certo,
estrutura coerente, 309 de 314 testes verdes. E o subagente que o produziu
**terminou em erro**, não por conclusão.

A tentação de aceitar era grande e tinha até uma explicação plausível — "os 5
que falham são guardas de compatibilidade a módulos que mandei não copiar". A
explicação é coerente com as mensagens de erro. **Coerente não é provado.**

**Regra:** resultado de subagente é hipótese até um verificador independente
confirmar. E verifique como o agente **terminou**: um agente que morreu no meio
produz artefato com cara de completo.

## L16 — A ferramenta pode falhar por um motivo que não é o seu

Durante o snapshot, `tar -czf "C:/..."` falhou com "Cannot connect to C: resolve
failed" — o `tar` do Git Bash leu `C:` como nome de host remoto.

Falhou ruidosamente, e mesmo assim o comando seguinte reportou "0 arquivos" num
formato que passaria batido numa leitura rápida. O que pegou foi a **comparação
de contagem** contra o esperado (78 = 78) depois de trocar por cópia manual.

**Regra:** toda preservação termina com uma contagem comparada contra o
esperado. "O comando rodou" não é evidência de que o arquivo existe.

## L17 — Verificador citado precisa existir

A skill do Figma citava `npm run test:platform:figma` como verificador. O script
**não existe** — e o teste que valida as skills só exigia que a seção contivesse
*algum* comando, não que o comando fosse real.

Um verificador inexistente é pior que nenhum: ele encerra a pergunta "isto está
verificado?" com um "sim" que ninguém checou.

**Regra:** quando uma skill ou documento citar um comando, rode-o. Se ainda não
existir, diga isso em voz alta no próprio texto e ofereça o substituto que
funciona hoje.

---

## L18 — O ambiente de teste pode substituir a coisa por um boneco

Um teste da credencial falhou por um motivo que não era o meu código: no
ambiente de teste JVM do Android, `org.json.JSONObject` é um **stub** e, com
`isReturnDefaultValues = true`, devolve vazio em vez de lançar.

O teste não estava medindo minha lógica — estava medindo o boneco. E o
caminho tentador era enfraquecer a asserção até passar, o que teria escondido
que aquele caminho **nunca foi exercitado**.

Corrigido com Robolectric, que já era dependência do projeto e fornece a
implementação real.

**Regra:** quando um teste falha por causa de um tipo da plataforma, pergunte
primeiro se aquele tipo é real naquele ambiente. Enfraquecer a asserção troca
um vermelho honesto por um verde que não significa nada.

## L19 — Deixe o compilador ser o guarda

A confusão que causou o P0 era semântica: 401 (credencial) e 400 (lote
malformado) tratados pelo mesmo ramo. Comentário não impede isso voltar.

Acrescentar `Unauthorized` como variante do `sealed class ApiResult` fez o
compilador Kotlin **exigir** tratamento em todo `when` — e foi ele, não eu, que
apontou os três lugares que precisavam mudar.

**Regra:** quando duas coisas de natureza diferente estão sendo tratadas como
uma, dê a elas tipos diferentes. Um teste pega a regressão depois; o tipo a
impede antes.

## L20 - Ligar nao e reimplementar

A Unidade 3D era conectar componentes ja comprovados. A tentacao, ao escrever a
rota, e resolver ali mesmo o que ja estava resolvido - montar o INSERT, calcular
a projecao - porque no momento parece mais direto do que importar.

Tres testes estruturais existem so para impedir isso: nenhum `INSERT INTO` na
rota ou no handler, nenhuma chamada a `projetar`, e uso obrigatorio de
`ingerir` e `consumir`.

**Regra:** quando a missao e integrar, escreva o teste que proibe a segunda
implementacao ANTES de escrever a integracao. Duas pontes nao sao redundancia -
sao duas verdades que divergem no primeiro defeito.

## L21 - Ler a superficie antes de testar contra ela

Escrevendo os testes do 4B1, presumi a API duas vezes e errei nas duas:

- `store.load()` nao devolve a lista de registros. Ele carrega do disco para a
  memoria; quem devolve e `all()`/`count()`. E o arquivo em disco e
  `<entidade>.runtime.jsonl`, nao `<entidade>.jsonl`;
- `sanitizeText()` nao devolve texto sanitizado. Devolve o texto ORIGINAL
  quando ele esta na allowlist, e um objeto marcador de redacao quando nao
  esta.

A fixture tambem estava errada: `live_observations` exige `raw_status` e
`confidence`, e o `put` recusou com o motivo exato.

Nada disso custou caro porque os testes acusaram na primeira execucao — mas o
custo evitado e o que importa: um teste escrito contra uma API imaginada pode
passar por acidente e afirmar algo que nao e verdade.

**Regra:** ao testar codigo que voce nao escreveu, LEIA a superficie primeiro —
o `return` da fabrica, a assinatura da funcao, o `required` do schema. Ler tres
linhas custa menos que um teste que mente.

**Corolario:** quando um teste falha logo na primeira execucao contra codigo
portado, a hipotese inicial deve ser "meu teste esta errado", nao "o codigo
esta quebrado". O codigo portado tinha 309 testes verdes na origem.

## L22 - Controle adversarial que nao falha pode nao ter rodado

No 4B2, a primeira rodada adversarial nao produziu falha nenhuma. A leitura
confortavel seria "as garantias sao tao solidas que nem as mutacoes derrubam".
A leitura correta e o oposto: **um controle que nao acusa nada provavelmente
nao aplicou nada.**

E era isso. O script de mutacao procurava strings que nao existiam no arquivo,
substituia zero ocorrencias, e seguia em silencio. Os testes passaram porque o
codigo estava intacto.

Refeito com verificacao explicita — o script imprime "aplicou" ou "NAO APLICOU"
para cada mutacao antes de qualquer teste rodar — tres garantias removidas
derrubaram quatro testes.

**Regra:** o controle antifalso-positivo tambem precisa de controle. Antes de
concluir que a prova se sustenta, confirme que a mutacao entrou: conte as
substituicoes, ou faca o script falhar alto quando o alvo nao existir.

**Sinal de alarme:** zero falhas num controle adversarial e mais suspeito que
muitas falhas.

## L23 - Fronteira se descobre executando, nao lendo

O plano do 4B2 previa portar o patrimonio historico de testes. O grep de
dependencias mostrou so os requires de `src/conference-brain/`, e a conclusao
natural foi "cabe".

Nao cabia. Ao COPIAR um dos testes e rodar, ele falhou por
`tools/conference-brain/operator-panel-server` — o painel HTTP, que o grep
anterior nao pegou porque eu filtrei so por `src/`.

O custo foi baixo porque a execucao veio antes do trabalho. Se eu tivesse
portado os seis arquivos de teste confiando no grep, teria descoberto a mesma
coisa depois de muito mais esforco.

**Regra:** para saber se uma peca cabe, tente encaixa-la. Um teste copiado e
executado custa segundos e responde o que a analise estatica so estima.

## L24 - O caminho padrao e o menos testado

Ao tornar o relogio do observador injetavel, uma substituicao global reescreveu
tambem o INTERIOR do fallback: `() => agora()`. Recursao infinita para quem nao
injeta relogio nenhum — ou seja, para producao.

Os 25 testes continuaram verdes. Todos injetavam relogio, porque era disso que
eles tratavam. O unico caminho que ninguem exercitava era o que a operacao real
usaria.

O defeito apareceu por acaso: uma mutacao adversarial "nao aplicou", fui ler a
linha, e a recursao estava ali.

**Regra:** ao tornar algo injetavel, escreva UM teste que nao injeta nada.
O default existe justamente para quem nao configura — e por isso e o caminho
que nenhum teste configurado percorre.

**Sinal:** se toda a suite passa um parametro, aquele parametro tem um valor
padrao que ninguem esta testando.

## L25 - Citar um campo para declarar que ele falta nao e preenche-lo

O teste de vazamento do 4B4 varria a saida INTEIRA do adapter procurando nomes
de dimensao de pedido (`order_state`, `courier`, `external_id`...). Ele falhou
na primeira execucao — e nao havia defeito nenhum.

`order_state` estava em `signals.criticalFieldsMissing`, que existe justamente
para dizer "esta fonte nao tem como fornecer este campo". Declarar uma ausencia
exige nomear o que falta. A varredura confundia a declaracao com o dado.

**A correcao tentadora era remover `order_state` da lista do teste.** Isso
teria funcionado, ficado verde, e desligado a guarda para os outros quatro
termos junto — a classe inteira de vazamento passaria a nao ser testada, sem
que nada no placar acusasse.

O que foi feito: a assercao virou duas. Os blocos que carregam DADO (`escopo`,
`contexto`, `procedencia`) nao podem conter o nome; a lista de ausencia
declarada PRECISA conter. Nenhum termo saiu da lista, e agora o teste tambem
pega o caso oposto — alguem apagar a declaracao de ausencia.

**Regra:** quando um teste de vazamento acusa, pergunte primeiro se aquilo e
dado ou declaracao ANTES de mexer no teste. Se for declaracao, a saida nunca e
encolher o alvo: e separar "onde nao pode aparecer" de "onde tem de aparecer".

**Sinal de alarme:** toda correcao de teste que REDUZ o conjunto verificado
merece a mesma suspeita de uma assercao enfraquecida (L18) — as duas compram
verde vendendo cobertura.

---

# Licoes do gate final — 2026-07-31

## L26 - Zero e a assercao mais facil de falsificar por acidente

Metade do gate do 4B5 afirma ZERO: zero pedidos emitidos, zero eventos de
relogio, zero observacao sem identidade. Todas verdadeiras, todas verdes.

E todas continuariam verdes com o observador quebrado, com o store nao
gravando, ou com o `fetchOrders` devolvendo lista vazia por defeito. Cano
entupido devolve exatamente o mesmo zero que a recusa deliberada.

A diferenca entre "o sistema se recusou" e "o sistema nao funcionou" nao esta
no numero — esta em provar que o mesmo caminho PRODUZ quando deve produzir.
Por isso cada zero no 4B5 tem, ao lado, a mesma cadeia (observer + nucleo +
store) alimentada por uma fonte legitima de pedido, exigindo 1 observacao e 1
`ready_observed`.

**Regra:** nenhuma assercao de ausencia vale sozinha. Ela precisa de um par
que exercite o MESMO caminho ate a presenca. Sem isso, o teste nao distingue
recusa de pane — e a pane e sempre mais provavel que a recusa.

**Corolario:** o par positivo tem que passar pelo mesmo codigo, nao por um
atalho. Um controle positivo que monta o resultado a mao prova so que a fixture
funciona.

## L27 - O teste media a garantia do vizinho

A primeira rodada adversarial do 4B5 acusou UMA mutacao cega: remover a
idempotencia da chave natural do store deixou a suite verde.

O motivo nao era mutacao mal aplicada (a contagem confirmou que entrou). Era
que os dois testes de duplicacao exercitavam a guarda do **relogio** — o
observador so emite `ready_observed` uma vez — e nunca chegavam a fazer dois
`put` com a mesma chave. O gate reivindicava "duplicacao e idempotente" medindo
outra coisa que tambem produz o numero certo.

A garantia real estava coberta, mas no 4B1. Um gate que se apoia na cobertura
de outro bloco parece completo e nao e: quem le o 4B5 acredita que ele prova o
que diz.

**Regra:** quando um item do gate reivindica uma garantia, o teste precisa
tocar a CAMADA que a implementa. Se a mutacao naquela camada nao derruba nada,
o teste esta medindo o vizinho.

**Como isso apareceu:** so pelo controle adversarial. Nenhuma leitura do teste
6b denunciava o problema — ele e correto, passa, e testa algo verdadeiro. Era
o alvo que estava errado, e isso e invisivel sem remover a garantia e olhar.

---

# Licoes da Unidade 5 — 2026-07-31

## L28 - Defesa em profundidade e invisivel para o teste de fora

Na Unidade 5, remover o bloqueio que impede uma conclusao de FONTE virar
recomendacao de PEDIDO nao derrubou nada. A leitura confortavel seria "o teste
esta fraco". A leitura correta era outra: a garantia esta aplicada em DOIS
lugares independentes — a politica declara a que especie serve, e o laco
impede que uma politica futura esqueca. Remover uma das duas nao muda nada do
lado de fora, porque a outra continua valendo.

Isso e uma qualidade do codigo e um problema do controle, ao mesmo tempo. Um
teste de comportamento so consegue ver o RESULTADO, e o resultado nao mudou.

**Regra:** quando uma mutacao nao derruba nada, pergunte antes de tudo se a
garantia tem mais de uma aplicacao. Se tiver, a mutacao honesta remove TODAS —
e o que precisa sumir para o teste falar e a garantia, nunca uma linha dela.
Enfraquecer o teste ate uma camada isolada ser detectavel seria trocar uma
protecao real por um alarme bonito.

**Corolario:** documente a redundancia no proprio teste. Um leitor futuro que
encontre as duas checagens vai querer apagar uma por parecer morta.

## L29 - A fixture pode morrer antes de chegar na trava que voce quer provar

Ainda na Unidade 5: a primeira fixture do teste da trava de especie usava uma
conclusao com `pode_afirmar: false`. Com as duas camadas da trava removidas, o
caso ainda assim nao produzia recomendacao — porque morria antes, numa
TERCEIRA garantia (evidencia insuficiente).

O teste passava, a mutacao nao derrubava nada, e as duas coisas eram verdade
pelo motivo errado: a trava que ele dizia provar nunca chegava a ser exercida.

**Regra:** para provar uma trava especifica, a fixture precisa passar por todas
as anteriores. Escreva-a adversarial de proposito — trazendo tudo o que o caso
legitimo traria e mentindo so no ponto sob teste — e confirme que, sem a trava,
o caso REALMENTE chegaria ao outro lado.

**Sinal:** se o teste continua verde depois de remover a garantia que ele
nomeia, ou o alvo esta errado (L27), ou a fixture nao chega la.

---

## L30 — O teste que reprova a própria garantia que deveria proteger

**O que quase passou.** O teste do Copiloto procurava a palavra `executed` no JSON serializado
inteiro da view model, para provar que nenhum vocabulário de execução vaza. Ele falhou — acusando
a **frase que nega a execução**: *"o estado `executed` não existe no vocabulário"*.

**Por que importa.** A correção tentadora era apagar a frase. Isso teria removido uma das
declarações mais importantes da superfície para fazer um teste passar — trocar uma garantia real
por uma verde.

**Como foi fechado.** O teste passou a andar pelos **valores** da estrutura (um walker que coleta
strings e compara por igualdade), em vez de procurar substring no texto serializado. A prosa
continua dizendo o que precisa dizer, e o teste continua proibindo o que precisa proibir.

**Família.** É primo de L26/L27: uma medição que parece medir a coisa certa e mede o vizinho. Aqui
o vizinho era a própria documentação da garantia.

## L31 — Chamada posicional numa API que espera um objeto devolve zero em silêncio

**O que quase passou.** `extrairConclusoes({store, unit_id, source_mode, run_id, observer})` recebe
**um** objeto. Foi chamada como `(store, opts)`. Ela não lança: cai no ramo `escopo_incompleto` e
devolve `{conclusoes: [], recusadas: [...]}`.

**Por que importa.** Zero conclusões é exatamente o que a cadeia real deveria devolver para
**pedido**. A tela teria mostrado "0 conclusões", que é plausível, e o defeito teria atravessado a
unidade inteira parecendo verdade operacional.

**Como foi pego.** Por um smoke test escrito antes de construir a interface, que imprimiu os
números da cadeia. O controle positivo sintético também devolvia vazio — e é isso que denunciou:
**os dois lados do par deram zero**, e o par existe justamente para isso.

**Regra que fica.** Antes de construir tela sobre uma cadeia, imprima os números dela. E quando um
par controle/tratamento der o mesmo resultado, suspeite do instrumento antes de acreditar no dado.
