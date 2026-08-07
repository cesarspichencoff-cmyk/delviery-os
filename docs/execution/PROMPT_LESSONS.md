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

---

## L32 — Pergunta de produto que não vira bloqueio some

**O que quase passou.** Quatro documentos de produto terminam com perguntas objetivas ao César —
`Logica_Embalagens` §15 (8), `Mapa_Ambientes_V1` §13 (8), `Auditoria_Praca_Comanda_Atencoes` (8) e
`Auditoria_Fonte_Viva_Loja_V1` §8 (8). **32 no total.** Todas respondíveis por áudio. Todas travando
a camada de produto. **Nenhuma estava em `BLOCKERS.md`**, que registrava Android, PostgreSQL, Docker
e backup externo.

**Por que importa.** O trabalho não parou — ele migrou. O projeto avançou por sete meses no que não
dependia dessas respostas (plataforma, contratos, Brain, Copiloto shadow, Product System), e essa
camada acabou ocupando o lugar do produto. Ninguém desobedeceu nada: a pergunta simplesmente não
existia no único artefato que sobrevive à troca de sessão.

**Como foi fechado.** `BLOCKERS.md` ganhou a categoria `BLOQUEIOS DE PRODUTO E DECISÕES HUMANAS`, e
`CLAUDE.md` §11 passou a exigir a leitura do índice canônico do produto antes do estado técnico.

**Família.** É prima de L26/L27/L30, mas num nível acima: ali o instrumento media o vizinho; aqui o
instrumento **não tinha como medir a coisa certa**. Um sistema de memória que só sabe representar
bloqueio técnico produz, com o tempo, um projeto só técnico.

**Regra que fica.** Ao terminar um documento com perguntas para um humano, a última ação da missão é
registrá-las em `BLOCKERS.md`. Pergunta que mora só no corpo de um documento não é bloqueio — é um
bilhete que ninguém vai ler.

---

## L33 — A ordem de leitura decide o resultado, e ela falhou DUAS vezes pelo mesmo motivo

**O que quase passou.** A home operacional foi construida inteira — view models,
sinais, superficie, CSS, 44 testes verdes — sobre a linguagem visual errada. So
apareceu porque o Cesar abriu o arquivo do V3.3 e perguntou "o que aconteceu para
estar tao feio e diferente?".

**Por que passou.** `docs/design/VISUAL_REFERENCE_HIERARCHY.md` existe, diz em
letra propria que `app-v1` e Nivel 5 e **nao pode definir direcao visual**, e
**nao esta em nenhuma ordem obrigatoria de leitura**. `CLAUDE.md` §11 aponta para
o indice canonico do produto e para `docs/execution/`; nenhum dos dois referencia
`docs/design/`. A propria missao deste bloco listou como fonte "o prototipo
original executado por `tools/servir_v1.js`" — que e exatamente o Nivel 5.

**A familia.** E a MESMA falha que a auditoria de realinhamento diagnosticou em
L32: um patrimonio existe no repositorio, e a ordem de leitura nao o alcanca.
Naquele caso era o produto; neste, a linguagem visual. Corrigir o §11 uma vez nao
bastou porque a correcao foi feita para o eixo que doia, nao para a classe.

**O que fazer.** Antes de escrever a primeira linha de CSS ou abrir o Figma,
perguntar: **qual documento e a autoridade visual, e onde ele diz que e?** Se a
resposta vier de um Design System encontrado no codigo em vez de uma hierarquia
declarada, parar e procurar a hierarquia.

**Guarda estrutural — IMPLEMENTADA em 2026-08-02.**
`npm run test:platform:visual-order` (`src/platform/run-visual-order-tests.ts`, 6
testes). Ela falha quando a ordem obrigatoria de leitura de `CLAUDE.md` §11 ou do
indice canonico deixa de apontar para `docs/design/VISUAL_REFERENCE_HIERARCHY.md`,
quando a ordem Sprint V2 -> V3.3 -> Design System se inverte, ou quando a
hierarquia deixa de declarar `app-v1` como incapaz de definir direcao visual.

**A primeira versao da guarda era CEGA, e a mutacao pegou.** Ela lia a secao 11
inteira e procurava o caminho em qualquer lugar. Apagar a hierarquia do item 4 da
lista numerada nao a derrubou: o caminho continuava citado na justificativa em
prosa logo abaixo, escrita no mesmo commit. Corrigida para ler **so a lista
numerada** — o corte e no primeiro bloco de citacao. Mutacao reaplicada: a guarda
caiu de 6 para 5 e nomeou o item exato. Restauracao conferida por sha256.

**A familia, de novo:** o teste passava porque media a presenca da palavra, nao a
posicao dela na ordem. Mesma especie de L26, L27 e L30.

---

## L34 — Screenshot dentro do pacote canonico nao e, por isso, expressao canonica

**O que quase passou.** Os tres PNGs em
`docs/design/canonical/deliveryos-visual-v2/extracted/uploads/` estao dentro do
acervo de Nivel 1 e mostram fundo creme claro, "Em fluxo" em tipografia pesada e
um cartao de Foco branco com botao verde. Usa-los como alvo visual reproduziria
exatamente o desenho que o Sprint V2 existe para corrigir.

**Por que quase passou.** Estar no diretorio canonico parece credencial. Nao e:
os PNGs sao capturas do `app-v1` — **Nivel 5** — anexadas ao pacote como
**diagnostico**, o "antes" que o §01 do contrato de estados tecnicos descreve
("vazio parece calma", "gravidade sem proporcao"). O documento que manda e o
`.dc.html`, com superficie `#08130D`, areas em degraus e ligacoes condicionais.

**O que fazer.** Dentro do acervo canonico, a autoridade e o documento que
DECLARA a regra, nao o anexo que a ilustra. Antes de mirar num screenshot,
perguntar: **isto e o alvo ou e o diagnostico?**

---

## L35 — Medir a regua nao e medir o que foi medido com ela

**O que quase passou.** O gate da expressao canonica tinha um teste que provava
os degraus: o CSS declara quatro tamanhos, o de atencao e maior que o normal, o
de pressao e maior que o de atencao, e o de area sem medicao e menor que todos.
Tudo verdadeiro. A rodada adversarial trocou UMA linha em `degrau()` — a que
devolve `"0"` para `sem_medicao` — fazendo toda area sem fonte receber o degrau
saudavel. **Os 17 testes continuaram verdes.**

**Por que passou.** O teste media a REGUA (o CSS dos degraus) e nunca perguntava
qual degrau cada area recebe no HTML. As duas coisas parecem a mesma quando se
lê o teste, e nao sao: uma prova que a escala existe, a outra prova que a escala
foi aplicada ao dado certo. So a segunda protege a garantia "area sem fonte nunca
aparece saudavel".

**Como foi fechado.** O4b renderiza as quatro cenas e compara, area por area e
subarea por subarea, o `data-degrau` do HTML com a `cor` que o motor deu. Tem par
proprio: exige ver pelo menos quatro areas sem fonte, senao uma leitura sem
ausencia passaria sem exercitar nada.

**A familia.** L26, L27, L30 e L33. Todas sao o mesmo animal — o teste que mede
uma coisa vizinha da garantia e parece medir a garantia.

**Regra pratica que sobra.** Ao testar apresentacao, perguntar sempre: *estou
provando que a regra EXISTE, ou que ela foi APLICADA a este dado?* Se a asercao
so le arquivo de estilo, e a primeira.

**Nota de metodo, do mesmo dia.** Uma segunda mutacao (esconder o segundo
ambiente em pressao) voltou como "guarda cega" e **nao era**: o trecho-alvo
estava escrito errado no roteiro da mutacao e ela nunca chegou a ser aplicada.
Mutacao que nao altera o arquivo nao prova nada — o roteiro precisa afirmar que
aplicou, e o desta rodada afirma.

## L36 — Presenca textual nao prova codigo, e a guarda que confunde as duas mente duas vezes

**Onde apareceu.** Tres guardas do gate R5-B nasceram erradas, e uma delas de um
jeito que vale guardar: a guarda "os motores continuam desconectados" procurava
a string `conference-brain` no `home-vm.ts` e reprovava — por causa de
`rota: "/conference-brain"`, que e **navegacao**, nao import.

As outras duas foram da mesma familia: contar `orientacao_permitida:` incluia a
DECLARACAO DE TIPO junto com a atribuicao; e uma sonda por `pendente` reprovava
por causa de `integracao_pendente`, que e estado legitimo de fonte.

**A regra que ficou.** Uma guarda de invariante verifica **comportamento**,
estrutura executavel ou contrato de tipo real. Nunca:
`includes("palavra")` · regex sobre comentario · presenca de nome de funcao ·
contagem de ocorrencia textual · documentacao lida como prova de runtime.

Quando a estrutura E a garantia, sonde a estrutura: extraia os ESPECIFICADORES
DE IMPORT e compare-os; leia a UNIAO DE TIPOS e verifique o membro; conte so as
ATRIBUICOES. Foi assim que as tres foram refeitas.

**O caso irmao, em R5-A:** a guarda de preempcao acusou preempcao lendo o
comentario que explica que preempcao **nao** existe. Comentario que descreve uma
proibicao nao pode reprovar a guarda que a verifica — as guardas passaram a ler
codigo sem comentario.

---

## L37 — Uma mutacao que nao aplica nao e invariante verde, e o harness precisa saber a diferenca

**O fato.** A mutacao de I1 (neutralizar `dentroDoEscopo()`) foi escrita com
ancora em `\n`. `decisao.js` esta no disco em **CRLF** — arquivo antigo do repo,
enquanto os arquivos novos nasceram em LF. O `replace` nao casou, o arquivo ficou
identico, o gate passou, e o relatorio bruto teria dito **"I1 cega"**.

Cega e a palavra errada. O gate nao deixou de acusar: **nao houve o que acusar.**
Um harness que so olha "o gate ficou vermelho?" registra as duas situacoes com o
mesmo carimbo, e a segunda e muito pior — ela parece cobertura e e ausencia.

**A regra que ficou.** Toda mutacao precisa provar TRES coisas separadas:

```
aplicada            o texto do arquivo mudou
mutante carregado   o artefato que o teste LEU e o mutado (sha256 conferido na saida do gate)
acusada             o gate falhou pelo motivo esperado
```

O gate R5-B imprime `ARTEFATOS {arquivo: sha256_curto}` justamente para isso: o
harness compara com o sha do original. Marca igual = o teste rodou uma copia
limpa, e a mutacao **nao conta**.

**Efeito colateral util:** a distincao pegou o defeito na hora, e o conserto foi
uma regex tolerante a fim de linha — nao um invariante enfraquecido.

## L38 — Uma mutacao cega pode estar acusando a guarda ERRADA

**O fato.** A mutacao MT01 do R5-C removeu a linha que retem a traducao em
Ambiente. O gate continuou verde. A leitura ingenua seria "a guarda e cega".

A leitura certa e outra: o teste T02 usava uma fixture com
`orientacao_permitida: false`, e a linha SEGUINTE do tradutor — outra protecao,
que existe para o caso do chamador dizer que orientacao esta liberada — prendia
o Ambiente do mesmo jeito. **O gate estava protegido por acidente, pela guarda
vizinha.** E o mesmo defeito que L27 registrou no Conference Brain: um gate que
se apoia no vizinho parece completo e nao e.

**O conserto nao foi enfraquecer a mutacao.** T02 ganhou o caso do chamador que
MENTE: Ambiente com `orientacao_permitida: true` precisa continuar retido. Com
ele, a guarda de MODO passa a ser carregada sozinha, e a mutacao acusa.

**A regra:** quando uma mutacao dirigida sai cega, pergunte primeiro **qual outra
protecao esta segurando o caso** — antes de concluir que a guarda nao existe.

---

## L39 — Mutacao que nao altera execucao nao e mutacao, mesmo aplicando

**O fato.** A primeira MT15 acrescentava um campo opcional `acoes_extras` ao tipo
de entrada do tradutor. Ela **aplicou** (o arquivo mudou), o **mutante foi
carregado** (o sha bateu diferente), e mesmo assim o gate ficou verde — porque um
campo que ninguem le nao altera execucao nenhuma.

Isto e diferente de L37, onde a mutacao nao chegou a ser aplicada. Aqui as tres
checagens de carregamento passaram e a mutacao ainda assim nao valia: ela nao era
**material ao contrato**.

**O conserto foi trocar a mutacao, nao afrouxar o teste.** A garantia de fato e
"uma acao entra, uma recomendacao sai" — entao a mutacao material devolve DUAS
recomendacoes. Acusada por quatro testes de uma vez.

**A regra:** alem de *aplicada*, *carregada* e *acusada*, uma mutacao precisa ser
**material**: ela tem que mudar o comportamento que o invariante descreve. Uma
mutacao so de tipo, so de nome ou so de campo nao lido nao prova cobertura.

## L40 — Uma guarda que mora no gate errado deixa a mutacao cega no gate certo

**O fato.** A mutacao MD05 do R5-D0 injetava `Date.now()` no `recommendation_id`
do tradutor. Ela aplicou, o mutante carregou, e o gate R5-D0 ficou verde — porque
a pureza do tradutor era provada **no gate de R5-C**, nao neste.

O invariante estava coberto. O gate que precisava dele, nao. E como R5-D0 e a
missao que fala de LINHAGEM — de onde cada identidade vem —, deixar "o tradutor
nao inventa identidade" fora dela era exatamente a lacuna que o tema pede.

**O conserto foi acrescentar a guarda no gate certo (D-PUR), nao remover a
mutacao.** Depois disso ela acusa.

**A regra:** cobertura nao e propriedade do repositorio, e sim de cada gate.
Quando uma mutacao dirigida sai cega, verifique tambem se o invariante esta
provado em OUTRO lugar — se estiver, o buraco e do gate que voce esta rodando, e
o conserto e mover ou duplicar a guarda para onde o tema vive.

**Nota:** este e o terceiro parente de L37/L38/L39, e os quatro juntos formam a
regra completa de uma mutacao valida — ela precisa ser **aplicada**, **carregada**,
**material** e **coberta pelo gate que a executa**.

## L41 — Uma fixture pode reproduzir a ordem certa por acidente, e cegar a mutacao

**O fato.** A mutacao MD8 do R5-D1 trocava a ordenacao canonica (`occurred_at`)
por ordenacao de ingestao. O gate ficou verde **duas vezes seguidas**, por dois
acidentes diferentes da mesma fixture:

1. na primeira versao, as `source_revision` eram 1, 2 e 1 — e o desempate por
   revisao reproduzia a ordem causal;
2. corrigidas para 1, 1 e 1, o desempate seguinte — a chave idempotente
   `src-0001`, `src-0002`, `src-0003` — **tambem** reproduzia a ordem causal,
   porque as fixtures nasceram em ordem.

Em nenhum dos dois casos a mutacao era imaterial: ela quebra a ordenacao de
verdade. O que faltava era uma fixture em que **so** o campo mutado pudesse
acertar.

**O conserto.** A fixture passou a CONTRADIZER: o fato mais antigo recebeu a
chave lexicograficamente maior (`src-zzz`), o mais novo a menor (`src-aaa`).
Agora, quem nao ordenar por `occurred_at` inverte o ciclo do pedido e produz
conflito. Somado a isso, uma prova positiva — na ordem canonica, `conflitos` e
lista vazia.

**A regra.** Quando uma mutacao dirigida sai cega, olhe os **desempates**. Se
qualquer criterio subordinado reproduz o resultado do criterio mutado, o teste
nao esta medindo o que voce pensa. Uma fixture boa e a que **so passa** pelo
caminho que se quer provar.

**Familia:** L38 dizia que a guarda vizinha pode estar segurando o caso. L41 diz
que o proprio dado do teste pode estar segurando.

---

## L42 — A ordenacao da lista pode fazer a mutacao acertar sozinha

**O caso.** No gate do Lab V4, a mutacao `MD6` fazia `chaveDoSinal()` devolver
uma constante. A intencao era quebrar a busca do sinal do Foco dentro do array
de sinais. A suite ficou **verde**.

**Por que.** Com chave constante, `sinais.find(...)` passa a devolver o
**primeiro** elemento. E a lista vem ordenada por severidade decrescente — entao
o primeiro **ja era** o sinal eleito. A mutacao foi aplicada, foi carregada pelo
processo filho, e **nao mudou a execucao**.

**O conserto.** A mutacao passou a reintroduzir o defeito ORIGINAL, que e
material: pegar a referencia vinda do outro array. `homeVM()` chama `sinaisDe()`
por dentro e devolve objetos diferentes, entao `s !== focoSinal` nunca casa e o
Foco aparece duplicado entre os secundarios.

**A regra.** Antes de escrever uma mutacao, pergunte que outro criterio da
estrutura poderia produzir o mesmo resultado. Ordenacao, unicidade e cardinalidade
sao os tres suspeitos. Mutar a chave de uma busca numa lista ordenada e o caso
classico.

**Familia:** L38 — a guarda vizinha segura o caso. L41 — o dado do teste segura o
caso. L42 — a **forma da estrutura** segura o caso.

---

## L43 — Guarda que reprova o caso legitimo ensina a ser ignorada

**O caso.** A guarda de PII do Modo de Validação varria todo texto do pacote de
exportacao. Ela recusou duas coisas que nao eram PII:

- `validation_id` e UUID, e um segmento com oito digitos seguidos casa com o
  padrao de CEP — a exportacao falhava **de vez em quando**, sem padrao visivel;
- `versao_fixture` vale `lab-v4-fixtures@1.0.0`, indistinguivel de e-mail para
  qualquer expressao razoavel — e esse recusava **toda** exportacao, sempre.

**O que isso produz.** Uma guarda que reprova o caso correto e pior que uma
guarda ausente. A ausente todo mundo sabe que falta; a que erra treina quem opera
a clicar de novo, a desligar, ou a nao ler mais a mensagem. Depois disso ela nao
protege mais nada — e continua parecendo protecao.

**O conserto.** Campos ESTRUTURAIS (identificador, versao, carimbo, schema) saem
da varredura de PII, com a lista escrita e o custo declarado. A varredura de
conteudo EXECUTAVEL continua valendo em **todo** campo, sem excecao — nao existe
identificador legitimo que contenha `<script`, e ali o falso positivo custa zero.

**O par que fecha.** Todo recorte de guarda precisa do caso simetrico ao lado: a
MESMA sequencia, num campo de texto livre, continua sendo recusada. Sem o par, o
recorte vira buraco silencioso.

**A regra.** Ao apertar uma guarda, gere o caso legitimo mais parecido com o
ataque e prove que ele passa. Se voce nao consegue construir esse caso, a guarda
ainda nao esta pronta.

---

## L44 — Excecao dentro de guarda e confissao, e ela sempre isenta quem viola

**O caso.** A guarda `G7b` do Lab V4 existia para provar a regra mais protegida
da Constituicao: **area sem medicao nunca aparece verde**. Ela estava escrita
assim:

```ts
assert.ok(
  u.pressao.observado || u.id === "motoboy",
  `${id}: ${u.id} esta verde sem pressao observada`,
);
```

O `|| u.id === "motoboy"` foi escrito pelo proprio construtor, durante a
construcao, porque a unidade nao passava. A guarda ficou verde. O produto
continuou pintando o Motoboy de **verde em 15 de 18 cenas**, sem nenhuma medicao
da fila de despacho, ate um avaliador independente encontrar pelo PRODUTO o que a
guarda estava desculpando.

**O padrao.** Ninguem isenta um caso que passa. A excecao so aparece quando o
caso falha — ou seja, **a unidade isentada e, por construcao, a que viola a
regra**. Uma guarda com excecao nao esta protegendo com uma lacuna; ela esta
protegendo exatamente tudo, menos o unico lugar onde havia defeito.

**Como isso passa despercebido.** A excecao parece razoavel no momento em que e
escrita ("essa unidade e diferente, nao tem carga por praca"). Ela vira uma
afirmacao de dominio embutida num `assert`, onde ninguem revisa afirmacao de
dominio. E o contador de testes continua subindo.

**A regra.** Quando um caso nao passa numa guarda, existem dois consertos
legitimos: **o produto esta errado**, e se corrige o produto; ou **a regra esta
errada**, e se corrige a regra, por escrito, com o motivo. Isentar nao e nenhum
dos dois — e apagar a pergunta.

**O conserto que ficou.** A isencao caiu; o produto passou a declarar a ausencia
com uma fonte estrutural (`FONTE_MOTOBOY`, `sem_medicao_automatica`), no mesmo
padrao de Caixa e Conferencia; e entrou uma guarda IRMA (`G7d`) que exige que
toda unidade sem medicao tenha uma fonte DECLARANDO isso — para que nao bastasse
"nao ficar verde por acidente de severidade". Mais a mutacao `MD9`, que remove a
fonte e precisa derrubar a guarda.

**Familia:** L36 dizia que presenca textual nao prova codigo. L37, L38, L41 e L42
dizem que a mutacao pode nao provar nada. L44 diz que a **guarda pode estar
escrita para nao provar** — e essa e a unica das cinco que nasce de uma decisao
consciente de quem escreve o teste.

**Como caçar isto no resto do repositorio.** Procurar por `||` e por `if (...)
return;` dentro de `assert`/`teste`, e perguntar de cada um: **este ramo existe
porque um caso real falhava?** Se sim, ele e um defeito conhecido e nao
registrado.
