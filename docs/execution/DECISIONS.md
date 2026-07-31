# Decisões — Macro-Prompt 1/3

> Uma decisão entra aqui quando escolher diferente teria produzido um sistema
> diferente. O que é consequência óbvia de outra decisão não entra.
>
> Cada uma diz o que foi decidido, **contra o quê**, e o que ela custa. Decisão
> sem alternativa registrada é decisão que ninguém consegue revisar depois.

---

## D1 — O crítico grava, o assíncrono consome

**Decidido:** dois processos separados, com o mesmo código e ciclos de vida
diferentes. O crítico nunca espera de forma síncrona por CRM, Copiloto, IA ou
qualquer coisa da lista `FORBIDDEN_IN_CRITICAL`.

**Contra:** um processo só com módulos internos, que é mais simples de operar.

**Por quê:** a rua não pode parar porque uma projeção travou. Num processo só,
qualquer consumidor lento vira latência de quem está entregando — e o sintoma
aparece como "o app está lento", nunca como "o CRM está lento".

**Custo:** dois processos para operar, duas imagens para acompanhar, e uma
classe nova de problema (backlog) que não existiria no monólito.

**Como está protegida:** testes estruturais afirmam sobre os *imports reais*
que o Entregas não importa módulo proibido e que o crítico não importa o worker.

---

## D2 — PostgreSQL é a fonte de verdade online; o FileUnitOfWork fica

**Decidido:** o banco passa a ser a verdade quando há rede. O
`FileUnitOfWork` existente permanece **intocado**, como caminho local e de
recuperação.

**Contra:** migrar tudo para o banco e apagar o caminho em arquivo.

**Por quê:** o caminho em arquivo é o que já rodou e é o que funciona quando o
banco não responde. Apagá-lo agora trocaria uma redundância barata por uma
dependência total, antes de o banco ter histórico de operação.

**Custo:** dois caminhos de persistência para manter coerentes.

---

## D3 — `pg` entra como primeira dependência de runtime, isolado atrás de uma porta

**Decidido:** o repositório, que tinha zero dependências de runtime, passa a ter
uma: o driver `pg`. Ele é usado em **um** arquivo (`persistence/sql-client.ts`).
Os repositórios conhecem só a interface `SqlClient`.

**Contra:** (a) falar com o banco via `psql` por processo filho, mantendo zero
dependências; (b) usar o SDK do provedor hospedado direto.

**Por quê:** (a) é frágil e lento para o caminho crítico. (b) foi vetado pela
arquitetura congelada — acoplar o domínio ao SDK de um provedor transforma
troca de fornecedor em reescrita. A porta preserva a promessa de "contratos de
provedor substituíveis" ao custo de uma dependência ubíqua e MIT.

**Custo:** uma dependência a auditar. O `npm audit` continua com o mesmo
apontamento pré-existente (`xlsx`), e nenhum novo.

---

## D4 — Migration nova em vez de editar a aplicada

**Decidido:** `device_id` e `sequence_local` entraram no event log pela
migration `0002`, e não editando a `0001`.

**Contra:** editar a `0001`, que era mais limpo — nada estava em produção.

**Por quê:** a `0001` já tinha sido aplicada e validada contra um PostgreSQL
real. Reescrever migration aplicada é exatamente como o schema fica diferente
entre duas máquinas sem ninguém perceber. A disciplina só vale se valer quando
é inconveniente.

**Custo:** um arquivo a mais e um histórico com um passo que poderia ter sido
um só.

---

## D5 — Schema no boot só em ambiente local

**Decidido:** `DELIVERYOS_MIGRATE_ON_BOOT` é ligado por padrão apenas em
`local`. Em piloto e produção, a migration é um passo explícito
(`npm run migrate`, ou o serviço `deliveryos-migrate` da composição).

**Contra:** aplicar sempre no boot, que dispensa um passo do deploy.

**Por quê:** N réplicas subindo juntas correriam a mesma migration ao mesmo
tempo. Um deploy vira corrida, e o resultado depende de quem chegou primeiro.

**Custo:** um passo a mais no procedimento de deploy, e a possibilidade de
alguém esquecê-lo — mitigada pelo `depends_on: service_completed_successfully`.

---

## D6 — `/health` e `/ready` são rotas diferentes

**Decidido:** `/health` descreve o estado com detalhe, para gente. `/ready`
responde ao balanceador, e só é 200 quando o processo consegue **persistir**.
`degraded` responde 200; `blocked` responde 503.

**Contra:** uma rota só, que é o padrão da maioria dos serviços.

**Por quê:** um processo vivo que não grava está saudável como processo e
inútil como destino. E o inverso também importa: tirar do balanceador um
crítico degradado por ausência do consumidor assíncrono seria derrubar a rua
por causa de um backlog.

**Custo:** duas rotas para manter coerentes entre si.

---

## D7 — A sonda de armazenamento escreve

**Decidido:** `probeStorage` executa um `INSERT ... ON CONFLICT DO UPDATE`, e
não um `SELECT 1`.

**Contra:** `SELECT 1`, que é mais barato e é o que quase todo mundo faz.

**Por quê:** `SELECT 1` passa com o disco cheio e com a réplica em modo somente
leitura — os dois cenários em que o crítico precisa dizer "bloqueado". Uma
sonda que não exercita a capacidade que promete não é sonda.

**Custo:** uma escrita a cada verificação, numa linha dedicada da tabela de
migrations.

---

## D8 — Lease vencido não consome tentativa

**Decidido:** `reclaimExpired` devolve o job à fila sem incrementar `attempts`.

**Contra:** contar, tratando "sumiu" como "falhou".

**Por quê:** lease vencido significa que o processo morreu — o trabalho sequer
chegou a falhar. Cobrar tentativa ali mataria por dead-letter um job que nunca
foi executado, e faria uma reinicialização de máquina parecer erro de negócio.

**Custo:** um job que trava o worker de forma reprodutível pode ser retomado
para sempre. Aceito porque o sintoma disso é backlog visível, e não dado
perdido em silêncio.

---

## D9 — Jitter determinístico, não aleatório

**Decidido:** o jitter do backoff é derivado por hash da chave de idempotência.

**Contra:** `Math.random()`, que é o padrão.

**Por quê:** o objetivo do jitter — evitar que mil mensagens que falharam
juntas voltem juntas — é atingido igual. Mas com hash, a mesma mensagem espera
sempre o mesmo tempo, e uma investigação pode ser reproduzida.

**Custo:** duas mensagens com a mesma chave teriam o mesmo atraso. Não acontece:
a chave é única por construção.

---

## D10 — Append-only por trigger no banco, não por disciplina no código

**Decidido:** `UPDATE` e `DELETE` no `platform.event_log` são recusados por uma
trigger do PostgreSQL.

**Contra:** garantir no código da aplicação, que é mais simples de testar.

**Por quê:** o event log é a memória da operação. Uma garantia que depende de
todo mundo lembrar de respeitá-la não é garantia — e "todo mundo" inclui
scripts de manutenção, correções manuais e o próprio teste. A prova disso é que
a limpeza da suíte de repositórios **bateu na trava** e teve que usar
`TRUNCATE`.

**Custo:** correções legítimas exigem passo deliberado.

---

## D11 — Conexão remota sem TLS é recusada no boot

**Decidido:** `createPgClient` lança se a URL não for local e `ssl` for falso.

**Contra:** avisar no log e seguir.

**Por quê:** credencial e dado de operação atravessando a internet em claro não
é escolha de configuração, é defeito. Localhost fica liberado porque o
PostgreSQL efêmero de teste não tem certificado, e exigir TLS ali empurraria
alguém a desligar a checagem inteira.

**Custo:** um ambiente com TLS mal configurado não sobe. É o comportamento
desejado.

---

## D12 — A composição não publica porta nenhuma

**Decidido:** nenhum serviço tem `ports:`. Banco e crítico usam `expose`.

**Contra:** publicar a porta do banco para facilitar inspeção.

**Por quê:** numa VM com IP público, publicar o PostgreSQL é entregar o banco
para a internet — e é um erro de uma linha, fácil de introduzir e difícil de
notar. A auditoria trava isso, e o teste foi verificado por injeção de defeito.

**Custo:** inspecionar o banco exige entrar na rede do Docker.

---

## D13 — O gate de endereço do Android roda no grafo de tarefas

**Decidido:** a recusa de endereço não-HTTPS ou local acontece em
`gradle.taskGraph.whenReady`, e vale só para `pilot` e `release`.

**Contra:** validar na configuração do projeto, que foi a primeira versão.

**Por quê:** medido — na configuração, o gate derrubava `assembleDebug`,
`testDebugUnitTest` e até `tasks`. O desenvolvedor perdia a bancada inteira por
causa de uma variante que não pediu.

**Custo:** o erro aparece um pouco mais tarde no build. Irrelevante: ele aparece
antes de qualquer bit ser compilado para a variante.

---

## D14 — `pilot` é variante separada de `release`

**Decidido:** três variantes, com `applicationIdSuffix = ".pilot"`.

**Contra:** usar `release` para o piloto.

**Por quê:** são binários com propósitos diferentes, e o sufixo permite conviver
com outra instalação no mesmo aparelho. Sem ele, instalar o piloto apagaria os
dados locais da outra — inclusive eventos ainda não sincronizados.

**Custo:** uma variante a mais para manter.

---

## D15 — O que não pôde ser provado é declarado, não contornado

**Decidido:** Docker Desktop (licença comercial) não foi instalado; conta em
provedor de nuvem não foi criada; APK não foi para aparelho. Cada ausência
está registrada em `STATE.json` com o substituto e o que exatamente falta.

**Contra:** instalar e seguir, ou omitir a limitação.

**Por quê:** licença comercial e criação de recurso com potencial de cobrança
são decisões do César, e silêncio nunca é autorização. Omitir seria pior: um
relatório que não distingue "verificado" de "escrito" não serve para decidir
nada.

**Custo:** o veredito carrega itens abertos, e alguém precisa fechá-los.

---

# Decisões da recuperação — 2026-07-27

> O Macro-Prompt 2 foi interrompido pelo fim dos créditos antes de qualquer
> checkpoint. Estas seis decisões são sobre **como preservar**, não sobre o que
> construir.

## D16 — Snapshot externo ANTES de qualquer operação Git

**Decidido:** copiar os 78 arquivos não rastreados um a um para fora do
repositório, e gerar o patch dos rastreados, antes de criar branch ou commitar.

**Contra:** ir direto ao commit WIP, que já preserva tudo.

**Por quê:** o commit WIP depende do Git funcionar como esperado. O snapshot
não depende de nada — é cópia de arquivo. Se qualquer operação Git tivesse
saído errado, o trabalho ainda existiria.

**Custo:** duplicação temporária. Aceito: o custo de duplicar 78 arquivos é
nulo perto do custo de perdê-los.

**Detalhe que quase custou caro:** o `tar` do Git Bash interpretou `C:/...`
como host remoto e falhou — mas falhou **ruidosamente**, e a verificação de
contagem (78 = 78) foi o que confirmou a cópia manual. Um `tar` que falhasse em
silêncio teria produzido um snapshot vazio com cara de completo.

## D17 — WIP e checkpoint principal SEPARADOS

**Decidido:** duas referências. `wip/macro2-interrupted-recovery-20260727`
guarda tudo, sem juízo. A branch principal recebe só o comprovado.

**Contra:** um commit só, marcado como "WIP", na branch principal.

**Por quê:** misturar preservação com aprovação faz o histórico da branch
principal deixar de significar "isto funciona". Quem olhar o log daqui a três
meses precisa poder confiar que cada commit ali passou em teste.

**Custo:** uma branch a mais para lembrar de limpar depois.

## D18 — O port do Conference Brain NÃO foi aceito

**Decidido:** 309/314 fica só no WIP.

**Contra:** aceitar com os 5 documentados como inaplicáveis.

**Por quê:** duas razões independentes, e cada uma bastaria. Primeira: o
subagente **terminou em erro** por limite de gasto — o resultado é de um
processo interrompido, não de um processo que concluiu. Segunda: a hipótese de
que os 5 são guardas de compatibilidade a módulos vizinhos é **coerente com as
mensagens de erro, e não foi provada**. Coerente não é provado.

**Custo:** o trabalho fica um passo atrás. Recuperável a qualquer momento a
partir do WIP.

**O que NÃO fazer na retomada:** apagar os 5 testes para ficar verde. Eles
existem para impedir que um sprint quebre o motor de 8 praças. Apagá-los remove
a proteção, não o problema.

## D19 — `shadow.ts` entrou no checkpoint

**Decidido:** incluir, contrariando a suposição de que estaria incompleto.

**Contra:** deixá-lo no WIP junto do resto, por precaução.

**Por quê:** a suposição foi verificada e é falsa. O arquivo fecha com `}`, não
tem marcador de interrupção, passa no `tsc`, e tem teste dedicado dentro dos 45
verdes — inclusive o que afirma que o estado `executed` **não existe** no
contrato. Excluir por precaução, com a evidência apontando o contrário, seria
substituir medição por medo.

**Custo:** nenhum identificado. A ressalva real — que ele não está **integrado**
— está registrada em três lugares, e vale igualmente para os outros três
módulos da ponte.

## D20 — O P0 do Android não foi corrigido nesta missão

**Decidido:** reproduzir e documentar, não corrigir.

**Contra:** corrigir, já que a causa é conhecida e o JDK funciona nesta máquina.

**Por quê:** a missão de recuperação proíbe implementação nova, e com razão. A
correção não é de uma linha: exige decidir o modelo de autenticação de
dispositivo, e essa decisão é a próxima frente inteira. Começá-la com crédito
incerto produziria exatamente o estado que esta missão existe para desfazer.

**Custo:** o P0 continua aberto. Está reproduzido com precisão de arquivo:linha,
então a retomada começa da correção, não da investigação.

## D21 — O Figma não foi consultado

**Decidido:** nenhuma chamada ao MCP do Figma.

**Contra:** ao menos registrar o que o agente interrompido chegou a criar lá.

**Por quê:** a missão proíbe explicitamente. E o que importa saber já está
registrado e verificado: o arquivo aceita escrita, as três páginas existem, e
`docs/figma/` não existe no repositório.

**Custo:** não se sabe se o agente interrompido chegou a criar variáveis no
arquivo antes de morrer. A retomada precisa **verificar antes de criar**, senão
duplica.

---

## D22 — O consumidor guarda o fato e recalcula

**Decidido:** o consumidor da Operação Viva registra o fato e recomputa a
projeção inteira a cada leitura.

**Contra:** aplicar o efeito de cada mensagem sobre um estado mutável, que é o
padrão e é mais rápido.

**Por quê:** a alternativa mutável exige que cada aplicação seja idempotente
**e** comutativa — duas propriedades que dependem de quem escreve cada handler
lembrar delas. Guardando fato e recomputando, idempotência, ordem e expiração
deixam de ser casos a tratar e viram consequência de `projetar` ser função
pura. A evidência de que funciona: os 23 testes passaram de primeira.

**Custo:** recomputar é O(n) por leitura. Aceitável enquanto n é o volume de um
turno; quando não for, a saída é snapshot periódico + replay incremental, sem
mudar a semântica.

## D23 — Roteabilidade antes do payload

**Decidido:** a ingestão verifica se o tipo tem consumidor antes de validar o
conteúdo.

**Contra:** validar o payload primeiro, que era a ordem original.

**Por quê:** o teste mostrou o diagnóstico errado — um tipo sem consumidor era
recusado como "payload inválido", o que mandaria o produtor consertar
exatamente o que já está certo. Um erro que aponta o lugar errado custa mais
que nenhum erro.

**Custo:** nenhum identificado.

## D24 — Replay não emite mensagem de outbox

**Decidido:** `reconstruirPorReplay` recalcula estado derivado e não enfileira
nada.

**Contra:** reprocessar a outbox junto, o que reconstruiria "tudo".

**Por quê:** emitir trabalho crítico de novo faria um fato de ontem disparar
efeito hoje. Replay reconstrói o que é DERIVADO; o que já aconteceu no mundo
não acontece duas vezes.

**Custo:** um efeito externo perdido por bug de consumidor não volta por
replay. Correto — ele precisa de decisão humana, não de reprocessamento
automático.

---

## D25 - A rota mora fora do servidor HTTP

**Decidido:** `tratarLoteGps` recebe cabecalhos e corpo e devolve status e
corpo. O `critical.ts` le o socket e escreve a resposta.

**Contra:** tratar a requisicao dentro do `createServer`, como e o comum.

**Por que:** testar a rota subindo servidor exige sincronizar processos por
texto - e isso ja produziu falso verde nesta base (L3). Separada, a cadeia
inteira (autenticacao, contrato, transacao, resposta) e testavel em processo,
com relogio injetado e sem porta.

**Custo:** o `critical.ts` tem um trecho de leitura de corpo que nao e coberto
pelos testes de wiring. Registrado como nao exercitado.

## D26 - A rota e `/api/gps/batch`, a que o Android ja fala

**Decidido:** o servidor adota o caminho e o formato existentes do aparelho.

**Contra:** desenhar um endpoint novo, mais limpo, e adaptar o Kotlin.

**Por que:** mudar o Kotlin significa recompilar e reinstalar em cada aparelho
em campo, e um aparelho com versao velha pararia de sincronizar no dia do
deploy. O servidor e a peca barata de mudar; o parque de celulares e a cara.

**Custo:** o adaptador de formato fica no servidor para sempre. Aceito - e onde
ele custa menos.

## D27 - O handler lanca em vez de engolir

**Decidido:** mensagem nao aplicavel faz o handler lancar.

**Contra:** registrar e devolver, tratando como processada.

**Por que:** o `AsyncRuntime` traduz excecao em tentativa contada, backoff e
dead-letter com motivo. Engolir devolveria "processado" para algo que ninguem
processou, e o problema sumiria da fila sem nunca ter sido resolvido.

**Custo:** uma mensagem estruturalmente incoerente consome tentativas antes de
morrer. Correto: ela precisa aparecer, nao desaparecer.

---

## D28 - Port seletivo do nucleo do Conference Brain

**Decidido:** portar ~18 arquivos do nucleo, com adapter de entrada novo.

**Contra:** (B) reimplementar sobre os contratos atuais; (C) portar tambem os
vizinhos para satisfazer os 5 guardas; (D) portar os 65.

**Por que:** o nucleo e autocontido - a varredura de `require` devolve so
`crypto`, `fs`, `path` e `playwright` opcional. Ele passa 309/309 no isolamento
e o gate independente confirma 12/12 as correcoes dos Sprints 2.3 e 2.4.

Reimplementar (B) descartaria doze correcoes de seguranca adversarial que
existem **porque a versao obvia delas estava errada** - PII por allowlist com
`fullMatch`, canonicalizacao de hostname, determinismo de empate, idempotencia
por identidade de fato - e faria isso sem os 309 testes para acusar o erro.

Portar os vizinhos (C) traria dois modulos que o DeliveryOS nao usa, so para
satisfazer guardas que protegem um repositorio onde aqueles modulos existem.
Aqui eles nao existem, e o guarda perde o objeto.

**Custo:** os 5 guardas ficam inaplicaveis e precisam de marcacao explicita.
**Nao devem ser apagados** - se um dia os modulos existirem, eles voltam a
valer. Apagar remove a protecao, nao o problema.

**Risco identificado:** o bloco 4B4. As duas listas de nove dimensoes descrevem
coisas diferentes - as do Brain sao sobre PEDIDO observado em tela, as da
Operacao Viva sao sobre CARGA da operacao. Forcar correspondencia campo a campo
produziria um mapeamento que parece certo e mente.

---

## D29 - O adapter da Operacao Viva nao emite pedido nenhum

**Decidido:** `orders` e sempre `[]`. O adapter atravessa escopo, saude da
fonte, contexto e procedencia - e recusa, por escrito, tudo que exigiria
identidade de pedido.

**Contra:** (A) usar `trip_id` como `external_id`, que era o caminho obvio e o
unico que produziria um adapter "que funciona"; (B) mapear `estado` da viagem
para `order_state`; (C) mapear a viagem para `courier_state`.

**Por que:** o risco registrado no 4B4 nao era teorico, e a causa dele e mais
funda do que vocabulario divergente. O Brain indexa por **pedido**
(`external_id`); a Operacao Viva indexa por **viagem** (`trip_id`); e a
projecao do HEAD **nao carrega identidade de pedido**. `order_id` existe no
envelope (`contracts/event-catalog.ts:95`) e e usado como chave de particao na
ingestao (`ingest/ingest-service.ts:131`), mas `projetar()` nao o propaga para
`ViagemAcumulada`. Nao ha a que prender uma observacao de pedido.

(A) faria o Brain gravar `live_observations` com um `trip_id` no campo do
pedido, abrir relogio de Conferencia para uma viagem e reconciliar dimensoes de
pedido a partir de fato de motoboy. (B) fundiria LOGISTICA com PRODUCAO -
`entregue` e sobre a rua, `finalized` e sobre a cozinha - que e exatamente o
erro que o modelo multidimensional do Sprint 2.1 existe para impedir. (C)
afirmaria que o iFood alocou entregador, quando o motoboy e da propria loja.

As tres produziriam um sistema que roda, mostra numero e mente. Ausencia
declarada e pior de vender e melhor de operar.

**Custo:** o Brain nao recebe nenhuma dimensao de pedido desta fonte, e vai
continuar assim ate alguem decidir - com evidencia, no lugar certo - o que uma
viagem afirma sobre um pedido. O custo esta pago em visibilidade: os dez campos
ausentes viajam em `signals.criticalFieldsMissing` e o observador os grava em
`live_cycle_runs.fields_missing`, entao a ausencia vive no registro duravel do
proprio Brain, nao num comentario.

**O que destravaria:** propagar `order_id` em `ViagemAcumulada`. E decisao de
produto, nao de adapter - por isso, se um `order_id` aparecer numa viagem hoje,
o adapter o REGISTRA em `recusas.identidade_de_pedido` e continua nao emitindo
pedido. Aparecer e motivo de decisao humana, nunca de mapeamento automatico.

---

## D30 - A unica ponte semantica e a saude da fonte

**Decidido:** `integridade_sinal` da Operacao Viva traduz para
`LIVE_SOURCE_HEALTH` do Brain. E a unica traducao de valor que este adapter faz.

**Contra:** nao traduzir nada, deixando o Brain classificar a saude por conta
propria com `classifyCycleHealth`.

**Por que:** e legitima por um motivo preciso, e nao por conveniencia: os dois
lados falam da **qualidade da observacao**, nao da operacao. `stale` de um lado
e `stale` do outro querem dizer a mesma coisa - "o que eu sei esta velho".

A alternativa foi rejeitada por ser ativamente mentirosa: `classifyCycleHealth`
espera sinais de TELA (`containerFound`, `captchaDetected`,
`layoutSignatureMatch`). Sem `containerFound`, ela devolve `layout_changed` -
e nao existe layout nenhum aqui para ter mudado. Por isso o adapter entrega
`health` pronta e nao fabrica um unico sinal de tela.

**Custo:** `available` nunca e emitido, em nenhum caminho. No Brain, `available`
e o que autoriza `mayAffirmOperationalLoad`, e esta fonte nao observa um unico
pedido - deixar passar um `available` daqui faria a Conferencia afirmar carga
com base em dado que nao e dela. Consequencia aceita: a Conferencia nunca fica
"disponivel" so porque a Operacao Viva esta saudavel.

---

## D31 - A carga do store valida com o mesmo porteiro da escrita

**Decidido:** `load()` valida cada registro com o MESMO `validate()` que `put()`
usa. O que nao passa vai para `invalid_lines`, contado em `health()`, nunca para
a memoria.

**Contra:** manter a carga rapida e confiar que, como so o `put` grava, o que
esta no disco ja passou pelo porteiro uma vez.

**Por que:** o argumento do "ja passou uma vez" descreve o caminho feliz e
ignora todos os outros. O arquivo e JSONL em disco, editavel por fora:
correcao manual num incidente, restauracao de um backup ruim, uma versao
anterior do codigo com schema diferente, um merge de arquivos. Foi reproduzido
antes de corrigir - um registro com `customer_name` acrescentado ao arquivo
voltava inteiro na memoria no reinicio, com PII e tudo, e a saude nao acusava
nada porque so contava linha ILEGIVEL.

Uma garantia que vale so no caminho de escrita nao e garantia do sistema, e sim
do caminho. E o custo de descobrir isso e assimetrico: quem escreve errado
descobre na hora; quem CARREGA errado descobre meses depois, decidindo com base
no dado ressuscitado.

**Custo:** a carga passa a validar registro a registro. Aceito - e o mesmo
trabalho que a escrita ja fazia, e acontece uma vez por reinicio, nao por
operacao.

**Detalhe que precisou de cuidado:** o diagnostico da linha recusada nao pode
guardar o registro. `erroSeguro` mantem o sufixo so dos codigos cujo sufixo e
NOME DE CAMPO - decidivel, e o contrato ja nomeia chave proibida ao recusar
(mesma escolha de `checkEvent`). Os codigos que podem embutir VALOR
(`status_invalido:<valor>`) perdem o sufixo. Guardar o diagnostico bruto teria
reaberto exatamente o vazamento que a validacao existe para fechar.

---

## D32 - Toda afirmacao de ZERO carrega um controle positivo

**Decidido:** no gate do 4B5, cada teste que afirma "a Operacao Viva nao produz
pedido / nao abre relogio / nao cria observacao" tem, ao lado, a MESMA cadeia
alimentada por uma fonte legitima de pedido, exigindo que ela produza um.

**Contra:** afirmar so os zeros, que e o que o bloco pedia literalmente.

**Por que:** zero e a asserção mais facil de falsificar por acidente que existe.
Um observador quebrado, um store que nao grava, um `fetchOrders` que devolve
lista vazia por bug - todos produzem exatamente o mesmo zero que a recusa
deliberada produz. Sem o par positivo, metade do gate passaria com a cadeia
morta, e passaria em silencio, com placar verde.

**Custo:** uma fonte de teste a mais para manter, e a lembranca de que o
controle positivo usa fonte SINTETICA - ele prova que a cadeia esta viva, nao
que existe fonte real de pedido neste repositorio. Essa ausencia continua
registrada em D29 e no `nao_comprovado`.
