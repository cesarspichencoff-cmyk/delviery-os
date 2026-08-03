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

---

# Decisoes da Unidade 5 - Copiloto em sombra

## D33 - As duas fronteiras sao espelhos, e nenhuma e uma dependencia

**Decidido:** o Copiloto recebe conclusoes do Brain como OBJETO SIMPLES, e a
extracao dessas conclusoes mora do lado do Brain. Nenhum dos dois subsistemas
importa o outro, em nenhuma direcao.

**Contra:** (A) o Copiloto importar `src/conference-brain/` e ler o store
direto, que e o caminho curto; (B) o extrator morar do lado do Copiloto, junto
de quem consome.

**Por que:** a Unidade 4 ja tinha estabelecido a metade dessa simetria - o
adapter e Brain-side e recebe a projecao como objeto simples. Fechar o espelho
custa quase nada agora e vale muito depois: os dois subsistemas podem ser
movidos, versionados ou substituidos sem que o outro recompile.

(B) foi rejeitada por um motivo mais forte que simetria: do lado do Brain vivem
as tres coisas que a extracao precisa e que ja foram provadas - o `PiiGuard`,
o `mayAffirmOperationalLoad` que decide o que pode ser afirmado, e a
reconciliacao recalculada do historico. Move-la para o outro lado significaria
reimplementar as tres (L20).

**Custo:** a fronteira e um contrato de dados versionado
(`conference-brain-conclusion@1.0.0`), e major diferente e recusa explicita.
Alguem precisa mante-lo dos dois lados - o teste G11 exige que as duas pontas
declarem a mesma versao.

## D34 - `status` e `evidence_grade` sao eixos separados

**Decidido:** o ciclo de vida da recomendacao (proposta, vencida, retirada,
invalidada) e a qualidade da evidencia que a sustenta (sustentada, degradada,
stale) sao dois campos, nunca um.

**Contra:** um `status` unico com mais valores - `insufficient_evidence` e
`degraded` entrando como estados ao lado de `expired` e `dismissed`, que e o
que a leitura literal do briefing sugeria.

**Por que:** sao fatos independentes que mudam em momentos diferentes e por
causas diferentes. Uma recomendacao degradada pode expirar; uma sustentada pode
ser retirada. Num campo so, cada combinacao viraria um valor novo, e a lista
cresceria ate ninguem conseguir dizer o que cada um significa.

E o argumento decisivo e local: este repositorio ja pagou por esse erro. O
modelo multidimensional do Sprint 2.1 do Brain existe porque um unico
`LIVE_ORDER_STATUS` estava carregando producao, prontidao e logistica ao mesmo
tempo. Repetir isso na Unidade 5 seria desaprender.

**Custo:** dois campos para ler em vez de um. Aceito.

**Consequencia que precisou de cuidado:** `insuficiente` NAO e um valor de
`evidence_grade` no armazenamento. Evidencia insuficiente e o motivo de a
recomendacao NAO existir - ela viaja em `recusas`, nunca como atributo de uma
recomendacao que existe. O schema recusa o valor.

## D35 - O Copiloto grava no store do Conference Brain

**Decidido:** a entidade `copilot_recommendations` entra em
`contracts/schemas.js` e usa o store que ja existe.

**Contra:** um store proprio do Copiloto, que manteria os subsistemas
independentes tambem na persistencia.

**Por que:** aquele armazenamento ja teve provado, uma peca de cada vez, tudo o
que a Unidade 5 precisa: chave natural idempotente, JSONL append-only,
recuperacao por `load` COM validacao de schema (D31), contagem de linha
corrompida e a guarda de PII por nome de campo. Um store proprio significaria
reprovar tudo isso do zero - e, pior, dois caminhos de persistencia que
divergiriam no primeiro defeito corrigido so de um lado.

A independencia que importa e a de CODIGO, e ela esta preservada por D33: o
Copiloto nao importa o Brain nem para gravar. Quem persiste e quem compoe.

**Custo:** o store do Brain passa a hospedar dado de outro subsistema, e o
`schemas.js` cresce. Aceito - o schema e o registro de entidades daquele
armazenamento, e e exatamente onde uma entidade nova deve ser declarada.

**Ganho que nao estava no plano:** as travas da Unidade 4 passaram a valer no
disco. O schema recusa recomendacao de pedido sem identidade de pedido e
recomendacao de fonte com identidade de pedido - a fronteira semantica deixou
de depender so do motor.

---

## Unidade 6 — Product System (2026-08-01)

### D36 — Estender o frontend existente, não criar um segundo

**Decisão.** O Product System vive em `src/product/`, em HTML/CSS/JS vanilla, servido por
`tools/product_system_server.ts`, e carrega `src/entregas/ui/shared/tokens.css` **pelo mesmo
arquivo**, servido em `/shared/tokens.css` — sem cópia.

**Alternativa recusada.** Introduzir React/Vite e construir um frontend moderno separado.

**Por quê.** O repositório não tem framework nenhum: `package.json` tem `pg`, `typescript`,
`playwright` e `xlsx`. Trazer um framework criaria um segundo frontend, um segundo Design System e
uma segunda verdade — exatamente o que o bloco proíbe. O custo é real: sem componentização de
framework, a reutilização é por função e por classe CSS.

**Custo aceito.** Sem type-checking no JS das superfícies (elas são `.js`, não `.ts`). Mitigado por
view models tipadas: toda regra e toda forma de dado vivem no TS, e o `.js` só desenha.

### D37 — `Campo<T>` como trava de tipo contra `null` virando zero

**Decisão.** Todo valor que pode faltar viaja como
`{observado: true, valor, origem, observado_em} | {observado: false, motivo, explicacao}`.
Não existe caminho de tipo que leia `valor` sem antes provar `observado === true`.

**Alternativa recusada.** `valor: number | null` com o componente decidindo o que fazer com `null`.

**Por quê.** `null | number` deixa o `?? 0` a uma tecla de distância, e um `0` falso numa tela
operacional é indistinguível de um `0` medido. A mutação M2 confirmou: transformar a ausência de
capacidade em `observado(0)` derruba o gate.

**Custo aceito.** Mais verboso em todo ponto de leitura.

### D38 — Superfície de leitura sem rota de escrita, e não com rota de escrita desativada

**Decisão.** `product_system_server.ts` recusa qualquer método diferente de `GET`/`HEAD` **antes**
de olhar o caminho, e não tem leitura de corpo de requisição.

**Alternativa recusada.** Implementar as rotas de ação e desativá-las por flag.

**Por quê.** Flag se liga. Rota que não existe não se liga por engano, e a garantia deixa de
depender da disciplina de quem escrever a próxima tela. A mutação M4 confirmou que remover a trava
derruba dois testes.

### D39 — Tokens `ink/*` separados das cores de sinal

**Decisão.** `signal/*` serve a ponto, traço e glifo. Texto pequeno usa `ink/*`, sete cores novas
criadas no Figma e no CSS ao mesmo tempo.

**Alternativa recusada.** Escurecer as próprias `signal/*` para passarem em 4,5:1.

**Por quê.** As `signal/*` já estão em uso na fundação e carregam o clima do Campo Vivo; escurecê-las
mudaria a leitura de toda a paleta para resolver um problema que é só de texto pequeno. Medido:
`signal-calm` 3,72:1 e `text-faint` 3,77:1 sobre `surface/work`.

**Custo aceito.** Duas famílias de cor para o mesmo conceito. Mitigado por um teste com **controle
positivo**: ele exige que `signal-calm` continue reprovando, senão a razão de existir dos `ink`
teria desaparecido sem ninguém notar.

---

## Checkpoint canônico de realinhamento (2026-08-01)

> Consolida as declarações do César e a documentação recuperada pelas duas auditorias.
> Índice vinculante: `docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md`.

### D40 — DeliveryOS é a plataforma; o Copiloto é um ativo dentro dela

**Decisão.** DeliveryOS é a plataforma operacional completa — domínios, dados, interfaces, memória e
ativos de inteligência. O Copiloto é um ativo operacional central **dentro** dela: atua sobre sinais
e estados já sustentados e, dentro do Foco, reduz a decisão e oferece orientação prática. Não é banco
de dados, não é a plataforma inteira, não é rede de informações. A decisão operacional relevante
permanece humana.

**Alternativa recusada.** Tratar DeliveryOS e Copiloto como sinônimos — leitura que a primeira
auditoria fez a partir de `PRODUCT_CONSTITUTION.md` §1.

**Por quê.** O César corrigiu explicitamente, e o `Mapa_Mestre_Dominios` §1 lhe dá razão: a
plataforma tem domínios (Operação Viva, Entregas, Suprimentos, Caixa e Atendimento) e um motor
soberano. A frase da constituição de produto é sobre **nome de marca**, não sobre arquitetura.

**Custo.** Nenhum. Corrige um erro de leitura antes que ele governasse um redesenho.

### D41 — Operação Viva é a única dona de Calmo, Ambiente e Foco

**Decisão.** Operação Viva é o núcleo de consciência e a única dona dos três estados. Nenhum outro
domínio cria Foco diretamente. A projeção de viagens hoje chamada `operacao-viva.ts` **é preservada**,
mas representa apenas uma camada menor da definição original.

**Alternativa recusada.** Renomear qualquer um dos dois agora.

**Por quê.** `Mapa_Mestre_Dominios` §2.1 é explícito. E o código atual tem **zero** ocorrências de
calmo/ambiente/foco — o nome sobreviveu, a função foi trocada, e nenhum documento registrou a troca.
Renomear antes de decidir quem fica com o nome só trocaria a confusão de lugar.

**Custo.** A divergência de nome permanece aberta (conflito C2), deliberadamente.

### D42 — Calmo não é tela vazia, e nenhum problema relevante fica escondido

**Decisão.** Todos os problemas relevantes permanecem visíveis; os mais urgentes recebem maior
destaque; apenas **uma** orientação principal ocupa o Foco; os demais sinais **não desaparecem**.
Verde/amarelo/vermelho dos ambientes não substituem Calmo/Ambiente/Foco. Um ambiente vermelho nunca
fica escondido.

**Alternativa recusada.** A leitura da primeira auditoria — "um foco por vez, esconde o resto".

**Por quê.** Três provas convergem: o protótipo original em execução mostra **três problemas
simultâneos** (dois em Ambiente, um em Foco); `Mapa_Ambientes` §10 diz que *"Vermelho não fica
escondido no Ambiente"*; e `Mapa_Sinais_Operacionais` classifica 🟢 calmo como *"responde sempre"*.
A exclusividade de slot governa a **ação prescrita**, não a visibilidade.

**Custo.** Resta o conflito C1: o César quer orientação prática também nos secundários, e o
`Modelo` §3 proíbe bloco de ação em Ambiente. Só ele resolve.

### D43 — Os dois motores do Copiloto não são conectados neste checkpoint

**Decisão.** O motor original (`src/perfil-delivery/decisao.js`) e o Copiloto Shadow
(`src/platform/copiloto/`) são ativos diferentes, aparentemente complementares, e **não devem ser
conectados** antes de decisão explícita do César sobre quem é o dono da atenção.

**Alternativa recusada.** Ligar `decisao.js` ao pipeline novo agora, aproveitando que os dois existem
e funcionam.

**Por quê.** `sess.active.sit` é a fonte da verdade da atenção. Dois donos do Foco recriam exatamente
o defeito medido em **30,8% dos onsets** e corrigido no commit `37ca1c9`. O ganho aparente de ligar
cedo é menor que o custo de reabrir um defeito já fechado.

**Custo.** O produto continua sem o ranking por impacto físico até a decisão. Registrado como
bloqueio PB9/C3.

### D44 — Bloqueio de produto passa a ser categoria de primeira classe

**Decisão.** `BLOCKERS.md` ganha a seção **BLOQUEIOS DE PRODUTO E DECISÕES HUMANAS**, separada de
infraestrutura, Android, PostgreSQL, Docker, nuvem e aparelho físico. `CLAUDE.md` §11 passa a mandar
ler o índice canônico do produto **antes** do estado técnico.

**Alternativa recusada.** Registrar as perguntas pendentes apenas no relatório de auditoria.

**Por quê.** Esta é a correção da causa-raiz. 32 perguntas ao César ficaram sem resposta em quatro
documentos, e nenhuma aparecia em `BLOCKERS.md` — que registrava Docker e backup. O sistema de
memória tinha lugar para bloqueio técnico e nenhum lugar para bloqueio humano. Sem esta mudança, a
deriva se repete na próxima sessão longa.

**Custo.** Nenhum. Só disciplina.

---

## Fase de recuperação do produto operacional — checkpoint (2026-08-01)

### D45 — Nomenclatura das praças, confirmada por dado

**Decisão.** `enrolados_quentes` = **Sushi Quentes**, subárea de **Sushi**.
`cozinha_quentes` = **Cozinha / Quentes da Cozinha**, ambiente próprio.
"Sushi Quentes" nomeia **praça e fluxo**, nunca temperatura.

**Alternativa recusada.** Reclassificar itens por conhecimento genérico de culinária — o que teria
tirado tartar de salmão e ceviche do grupo por serem frios.

**Por quê.** Os 11 itens de `enrolados_quentes` cobrem item por item a lista do César (hot roll,
skin, Tuna Shisô, tartar de salmão, ceviche, ebiten, Hot Tatá). O mapa original estava certo desde
julho; faltava só a confirmação humana. Encerra a questão material P1 e o conflito C4.

**Custo.** Fica registrado um defeito de rótulo: `DISPLAY.cozinha_quentes = "Quentes"` exibe a
Cozinha com o nome que o César usa para Sushi Quentes. **Não corrigido** — `motor.js` é núcleo e
exige gate próprio (ação R1).

### D46 — Sushi é ambiente geral com subáreas visíveis

**Decisão.** Sushi é ambiente geral; Combinados, Duplas, Enrolados e Sushi Quentes permanecem
visíveis como subáreas. O sistema pode dizer "Sushi carregado" **sem esconder** qual subárea causa o
congestionamento.

**Alternativa recusada.** Sushi como área única e opaca — que teria escondido a bancada gargalo.

**Por quê.** É a alternativa B escolhida pelo César, e é coerente com o protótipo original, que já
mostrava "Duplas carregando" e "Combinados acima do normal" como dois rótulos distintos. Encerra P7.

**Custo.** Mais de um rótulo por ambiente; o teto de 2 rótulos do Ambiente precisa ser reavaliado
quando a home for construída.

### D47 — "Só quentes" é sinal de roteamento, não de temperatura

**Decisão.** "Só quentes" significa que o pedido **não precisa passar pela área do Sushi** e **pode
ser montado na bancada do caixa**. Serve a roteamento e simplificação da montagem. **Não** implica
prioridade automática.

**Alternativa recusada.** Tratar como etiqueta de temperatura ou como prioridade — as duas leituras
que a auditoria tinha levantado como hipótese.

**Por quê.** Confirmação do César. É compatível com S12 (*"só pratos quentes, sem itens frios
pendentes"*) e mais específico: a fonte dizia "verificar se dá pra fechar"; o César especifica o
destino. Encerra P4.

**Custo.** Nenhum. O dado já existe e é real (14–23% dos pedidos).

### D48 — Contrato antes de conexão; a fase para no contrato

**Decisão.** O contrato de responsabilidades entre Operação Viva, motor do Copiloto, garantias
Shadow e Conference Brain foi escrito (`docs/product/CONTRATO_CONSCIENCIA_COPILOTO.md`), com dez
invariantes (I1–I10) que precisam estar verdes **antes** de qualquer conexão de runtime. A home, os
sinais e o Figma **não foram implementados** nesta sessão.

**Alternativa recusada.** Implementar uma home parcial com o contexto restante.

**Por quê.** A própria missão determina: *"caso a conexão segura não caiba nesta sessão, conclua a
home e os contratos, registre o checkpoint e não improvise"*. Uma home construída às pressas sobre um
contrato não testado reproduziria o defeito de 30,8% que `37ca1c9` corrigiu — e seria exatamente a
entrega por aproximação que o §16 proíbe.

**Custo.** A fase fica em checkpoint, não concluída. Registrado com honestidade em vez de veredito
inflado.

### D49 — A correcao de nomenclatura vive na apresentacao, nao no identificador

**Decisao.** `DISPLAY.cozinha_quentes` passou a valer `"Cozinha"` e
`DISPLAY.enrolados_quentes` passou a valer `"Sushi Quentes"`. As chaves internas
`cozinha_quentes` e `enrolados_quentes` **nao foram renomeadas**.

**Alternativa recusada:** renomear os identificadores para `cozinha` e
`sushi_quentes`. Recusada porque eles sao chave de `cardapio_knowledge_seed.json`
(199 itens), do `BASELINE` calibrado em 30 dias reais e de todos os replays
historicos em `data/generated/`. Renomear exigiria migrar dado historico para
corrigir um defeito que vivia inteiro na camada de exibicao.

**Custo aceito:** duas nomenclaturas coexistem, e um leitor de codigo ve
`enrolados_quentes` onde a operacao diz "Sushi Quentes". Mitigado por
`src/product/viewmodels/areas.ts`, que e o unico lugar onde id vira nome, e pelo
gate `test:platform:r1`, que proibe identificador interno de chegar a uma pessoa.

**Achado que sustenta a decisao:** o campo `temperatura` do seed marca Ceviche,
Tartar de Salmao e Tuna Shiso Tartar como `"quente"` — pratos frios. O campo e
sombra do nome da praca, nao classificacao independente (43 itens "quentes"
contra 31 na Cozinha). Nenhuma heuristica termica pode substituir o mapa canonico.

---

### D50 — Sinal declara se e PRESSAO ou informacao

**Decisao.** Todo sinal carrega `pinta_ambiente: boolean`. So sinal de pressao
muda a cor de uma area.

**Alternativa recusada:** colorir por severidade pura, como o prototipo fazia.
Recusada por medicao: com severidade pura, a cena Calmo — cinco pedidos, nenhum
atraso — pintava Sushi, Cozinha e Conferencia de amarelo, porque "so quentes",
"pedido simples" e "item saindo rapido" tem severidade 1. Uma operacao saudavel
aparecia inteira em atencao, e a tela mentia para baixo.

**Custo aceito:** cada sinal novo precisa declarar sua especie, e errar a
declaracao e silencioso. Mitigado pelo teste H18 (roteamento nao pode pintar).

---

### D51 — Verde exige leitura observada, nao promessa de fonte

**Decisao.** Um ambiente medido por carga so aparece verde se a carga foi
OBSERVADA. Fonte que se declara saudavel e nao entrega leitura nenhuma nao
sustenta verde; a area cai para `sem_medicao`.

**Alternativa recusada:** confiar no estado declarado da fonte. Recusada porque
uma fonte saudavel com zero leituras e indistinguivel de um cano entupido — o
mesmo argumento do controle positivo de L26/D32, aplicado a cor da area.

**Custo aceito:** uma area genuinamente vazia e com fonte viva aparece
`sem_medicao` ate a primeira leitura chegar. Preferimos isso a verde falso.

---

### D52 — A ordem visual e vinculante e mora na ordem de leitura, nao no codigo

**Decisao.** A expressao visual do DeliveryOS obedece, nesta ordem: **(1) Sprint
Visual DeliveryOS V2 · (2) Organismo Operacional V3.3 · (3) handoffs e regras
canonicas associados · (4) Design System atual, para producao e acessibilidade ·
(5) `app-v1` e prototipos antigos, so como referencia historica ou
comportamental.** O Nivel 5 **nao** define expressao visual final. A ordem passa
a viver em `CLAUDE.md` §11 item 4 e no indice canonico §2.1, com guarda
executavel `npm run test:platform:visual-order`.

**Alternativa recusada:** deixar a hierarquia so em `docs/design/` e confiar em
disciplina. Recusada porque foi exatamente isso que ja existia — e falhou duas
vezes, na Unidade 6 e no bloco R2. Um documento que a ordem de leitura nao
alcanca nao e autoridade, e decoracao.

**Segunda alternativa recusada:** uma auditoria visual extensa que medisse
parentesco de cor, tipografia e forma contra o canone. Recusada por
desproporcao: o defeito nao foi de execucao visual, foi de **fonte de
autoridade**. Uma terceira camada de processo sobre o mesmo erro de uma linha
custa mais do que protege. A guarda checa a ordem, nao o CSS.

**Custo aceito:** a guarda nao impede que alguem leia a hierarquia e mesmo assim
desenhe errado. Ela impede que alguem **nao a encontre**, que e a causa raiz
registrada em L33.

---

### D53 — A ligacao entre areas nasce no view model, nunca no CSS

**Decisao.** As relacoes ativas entre areas (`ligacoes` em `home-vm.ts`) sao
derivadas da leitura operacional na camada de view model, com o caminho real do
pedido declarado em `areas.ts` (`CAMINHO_DO_PEDIDO`). A superficie so as
desenha. Uma ligacao existe sempre como caminho e so fica **ativa** quando a area
de ORIGEM esta no degrau `amarelo` (ativa) ou `vermelho` (carregada). O degrau
vem do motor; a ligacao apenas o transpoe.

Area em `sem_medicao` nunca origina ligacao ativa. Sem leitura, o sistema nao
afirma que a pressao esta passando por ali — e por isso a cena `degradado` tem o
caminho inteiro inerte, mesmo com a Cozinha respondendo.

**Alternativa recusada:** deixar `home.js` decidir quando desenhar a linha,
olhando a cor da area. Recusada porque seria a interface escolhendo ligacao — o
contrato canonico diz, em letra propria, que a interface nao calcula, nao
escolhe e nao inventa ligacoes. Alem disso um teste sobre o view model consegue
provar "ligacao so aparece quando ativa"; um teste sobre CSS, nao.

**Custo aceito:** area sem medicao nunca origina ligacao ativa, mesmo que a
operacao real esteja empurrando pressao por ali. E o mesmo custo de D51: sem
observacao, o sistema nao afirma.

---

### D54 — OriginKit e referencia externa de movimento, nunca dependencia

**Decisao.** O OriginKit e **referencia de ritmo, continuidade, suavidade,
feedback, transicao, qualidade de microinteracao e clareza de estado**. Ele
**nao** e dependencia, **nao** governa a identidade e **nao** prevalece sobre o
Sprint Visual V2 nem sobre o Organismo V3.3. Nao entra no `package.json`, nao
entra por MCP, nao e copiado componente a componente.

A identidade, a composicao, a hierarquia e os estados continuam vindo do V2/V3.3.
O sistema de movimento executavel continua sendo `docs/figma/MOTION_SYSTEM.md` e
`MOTION_TOKENS.json`, deste repositorio.

**Alternativa recusada:** instalar a biblioteca e usar os componentes prontos.
Recusada porque movimento aqui precisa declarar **o que afirma sobre a operacao**
— a linha que pulsa so pode pulsar quando a fonte foi observada viva. Uma
biblioteca de efeito nao carrega essa regra, e adota-la significaria herdar
movimento que nao comunica mudanca, que a Lei do movimento deste produto proibe.

**Custo aceito:** tudo e CSS `transition` e `@keyframes` escritos aqui. Menos
sofisticacao de animacao do que uma biblioteca daria, em troca de cada animacao
ter dono, motivo e guarda. Guardas: O18 e o teste `motion: nenhuma dependencia de
biblioteca foi adicionada`.

---

### D55 — Tracejado em movimento e FLUXO; tracejado parado e ESPERA

**Decisao.** As tres intensidades de ligacao tem tres linguagens visuais
distintas, e nenhuma depende de animacao para ser lida:

| Intensidade | Linha | Movimento | Significado |
|---|---|---|---|
| `inerte` | 1px cheia, cor de caminho | nenhum | o caminho existe; a dependencia nao esta ativa |
| `ativa` | 2px tracejada | **parado** | a tensao chegou na relacao e ainda nao passou — espera |
| `carregada` | 3px tracejada | **em movimento** | a pressao esta atravessando — fluxo |

Fonte: Organismo V3.3, prancha 13 — *"O tracejado em movimento indica fluxo;
parado, indica espera."*

**Alternativa recusada:** animar as duas intensidades ativas, que era o estado
anterior. Recusada por medicao: no Foco isso produzia **oito animacoes infinitas
simultaneas**, e o custo nao era so agitacao — era **informacao perdida**. A
diferenca entre uma dependencia que se forma e uma que ja e atravessada
desaparecia dentro do mesmo movimento.

**Efeito colateral, e ele e desejado:** o Ambiente passou a nao ter nenhuma linha
correndo. Ambiente e clima; Foco e o trecho que carrega. A superficie deixou de
parecer agitada exatamente onde precisa parecer grave.

**Custo aceito:** quem esperava ver movimento em toda relacao ativa vai achar o
Ambiente parado. E o ponto. Guarda O20, com par simetrico.

---

### D56 — A evidencia nao anima, e a contradicao entre dois documentos canonicos fica registrada

**Decisao.** Evidencia, sinal, ocorrencia, fonte e erro **aparecem inteiros**,
sem `reveal` e sem stagger. Guarda O25.

**A contradicao, que NAO foi resolvida em silencio.** `MOTION_TOKENS.json` lista
`bloco de evidencia` em `reveal.permitido_em`. `MOTION_COMPONENT_MAPPING.md` diz,
na linha de `bloco-evidencia`: *"evidência não anima, em hipótese nenhuma"*. Os
dois sao canonicos e discordam.

**Alternativa recusada:** seguir o `MOTION_TOKENS.json` por ser o arquivo de
valores. Recusada porque, em duvida entre animar e nao animar numa superficie
operacional, a regra do proprio sistema decide: movimento que nao comunica
mudanca nao entra. A evidencia nao muda — ela sustenta. Atrasa-la em 200ms na
sexta-feira de pico e custo sem contrapartida.

**Pendencia registrada:** os dois documentos precisam concordar. Nao foi
corrigido aqui porque decidir qual dos dois cede e decisao de produto, e este
bloco e de sincronizacao. Fica em `CANONICAL_MOTION_PARITY.md` §4.

---

### D57 — O OriginKit e referencia externa OPCIONAL, e nao bloqueia nada

**Decisao.** `OriginKit external review deferred — non-blocking`. O OriginKit
**nao** e autoridade visual, **nao** e dependencia, **nao** prevalece sobre
V2/V3.3, **nao** bloqueia o Figma, **nao** bloqueia a paridade e **nao** bloqueia
o fechamento visual. A revisao podera acontecer depois como **refinamento**,
nunca como reconstrucao obrigatoria.

**O que NAO muda.** A evidencia de PB12 fica preservada inteira: a navegacao
abre, o titulo chega, e toda leitura de conteudo falha (`Policy check temporarily
unavailable` no navegador, `403` no WebFetch), com localhost lendo normal na
mesma sessao. Continua proibido declarar que ele foi analisado, reconstruir
componentes de memoria ou inventar a matriz de referencia — ela segue vazia de
proposito em `CANONICAL_MOTION_PARITY.md` §1.

**Alternativa recusada:** manter PB12 como bloqueio ate o acesso existir.
Recusada porque prendia o fechamento visual do produto a um site de terceiro que
nunca foi autoridade de nada aqui. O movimento canonico do DeliveryOS mora em
`docs/figma/MOTION_SYSTEM.md`, neste repositorio, e ja governava tudo.

**Custo aceito:** a matriz de referencia OriginKit pode ficar vazia para sempre.
E o preco certo — melhor uma coluna honestamente vazia do que uma coluna
preenchida com titulo de resultado de busca.

---

### D58 — Node ID pendente tem um token, e ele e verificavel

**Decisao.** Na matriz de paridade do organismo, a coluna Node ID aceita
**dois** valores e so dois: um ID real no formato `123:456`, lido do arquivo, ou
o token exato `PENDENTE-PB13`. Vazio, tracinho, "TBD" ou ID malformado
**reprovam** no gate (`npm run test:platform:figma-parity`, teste R1). E uma
linha pendente nao pode declarar paridade no campo Divergencia (teste R2).

**Por que isso e uma decisao e nao um detalhe de formato.** A cota do plano Figma
cortou leitura e escrita no meio desta missao (**PB13**). O caminho facil seria
deixar a celula vazia e escrever a ressalva em prosa — e prosa nao e executavel.
Com o token, a matriz declara a ausencia de um jeito que uma maquina checa, e o
dia em que os frames existirem basta trocar o token pelo ID: o gate fica verde
sozinho, sem que nenhuma asercao precise ser afrouxada.

**Alternativa recusada:** preencher a coluna com IDs plausiveis e corrigir
depois. Recusada pelo motivo de sempre neste repositorio — um numero inventado e
indistinguivel de um numero medido quando alguem le a tabela seis meses depois.

**Custo aceito:** o gate nasce verde com 18 linhas pendentes, o que pode parecer
aprovacao. Nao e, e a §0 da matriz diz isso em letra propria: o gate prova que a
matriz e honesta sobre o estado, nao que o Figma esta sincronizado.

---

### D59 — PB11 bloqueia o fechamento documental, nao o produto

**Decisao do Cesar, 2026-08-03.** O Figma permanece pendente: **sem upgrade de
plano** e **sem redesenho manual** dos 18 cenarios. PB11 passa a bloquear
**apenas** (a) o fechamento documental do ciclo visual e (b) a paridade NATIVA
com o Figma. Ele **nao** bloqueia a continuidade tecnica do DeliveryOS e **nao**
bloqueia R5.

**O que sustenta.** A autoridade visual nunca foi o Figma — e o Sprint Visual V2
e o Organismo Operacional V3.3. A expressao vigente ja esta implementada,
revisada no navegador e coberta por 27 testes de organismo, 44 de home e 23 de
paridade. O Figma e o **espelho documental** dessa expressao: exigido, util, e
nao soberano. Tratar o espelho como pre-requisito do produto inverteria a
hierarquia que PB9 existe para proteger.

**O que continua em vigor, sem excecao:** PB13 registrado com a medicao intacta ·
os 18 `PENDENTE-PB13` e nenhum node ID inventado · o frontend aprovado como
referencia visual EXECUTAVEL · V2 e V3.3 como autoridades · Motion System e as
duas matrizes como documentacao canonica · **proibicao de qualquer alteracao
visual durante R5**.

**Alternativa recusada:** manter PB11 como bloqueio duro ate o Figma existir.
Recusada porque prenderia o produto inteiro a uma cota de plano de terceiro —
exatamente o erro que D57 acabou de corrigir para o OriginKit, na mesma semana.

**Custo aceito:** o ciclo visual fica formalmente ABERTO por tempo
indeterminado, e o Figma continua mostrando a linguagem da Unidade 6 para quem
o abrir. Mitigacao: a §0 e a §9 da matriz do organismo dizem isso em letra
propria, e o gate impede que qualquer linha se declare sincronizada.

---

### D60 — R5 nao comeca pelo fio: a dona de Calmo/Ambiente/Foco nao tem dimensao temporal

**Achado, medido nesta sessao, antes de qualquer implementacao.** O contrato da
consciencia (§1) diz que a Operacao Viva e dona do estado cognitivo e lista
mecanismos que "nao se negociam": DEBOUNCE 3 min · COOLDOWN 45 min · MAXFOCUS
8 min · STALE 120 min · exclusividade de slot. Eles existem — em
`src/perfil-delivery/motor.js:42-46`, com estado de sessao (`sess.pending`,
`sess.active`, `sess.firedAt`) em `motor.js:274-278`.

**E a superficie que hoje e dona de Calmo/Ambiente/Foco nao os tem.**
`src/product/viewmodels/home-vm.ts:607` elege o modo assim:

```
foco !== null ? "foco" : sinais.some(s => s.severidade >= 2) ? "ambiente" : "calmo"
```

Severidade instantanea. **Zero tempo.** Sem debounce, sem cooldown, sem teto de
duracao, sem histerese. Nao aparece hoje porque cada cena e uma fixture estatica
— numa leitura ao vivo, a mesma operacao oscilaria entre Calmo e Foco a cada
atualizacao.

**Decisao.** R5 **nao** comeca conectando `decisao.js` a `shadow.ts`. Comeca
dando a Operacao Viva a dimensao temporal que o contrato ja lhe atribui. Ranquear
orientacao dentro de um Foco sem persistencia garantida e refinar uma causa raiz
que pode ter mudado entre duas leituras — que e a familia do defeito de 30,8%
corrigido em `37ca1c9`.

**Alternativa recusada:** ligar os motores primeiro e tratar a histerese como
ajuste posterior. Recusada porque o defeito so apareceria com fonte ao vivo, que
e exatamente quando ele custa caro.

**Custo aceito:** R5 fica maior do que "ligar dois motores", e o primeiro bloco
nao produz nada visivel. E o preco de nao repetir 30,8%.

---

### D61 — A politica temporal e domínio proprio, e o view model so consome

**Decisao.** `TemporalAttentionPolicy` vive em
`src/product/atencao/politica-temporal.ts`, como funcao pura de dominio.
`home-vm.ts` recebe o resultado por um parametro OPCIONAL `EleicaoTemporal` com
dois campos — `modo` e `orientacao_permitida` — e nada mais.

**Por que o parametro e opcional, e por que isso nao e afrouxamento.** As cenas
de demonstracao sao INSTANTES ISOLADOS, nao sequencias: nenhuma delas tem eixo
de tempo, e nenhuma consegue provar debounce. Sem o parametro, a view model
mantem o caminho de fotografia e **declara** que e fotografia, no proprio codigo.
Fingir que uma fixture estatica prova permanencia seria pior do que dizer que ela
nao prova. O dominio nao foi enfraquecido — ele so nao e exercitado por uma
entrada que nao tem tempo.

**Alternativa recusada:** semear o estado temporal das fixtures para que elas
caissem em Foco na primeira leitura. Recusada porque produziria um Foco que
nenhum debounce sustentou, e o gate deixaria de distinguir uma eleicao legitima
de uma eleicao encenada.

**Custo aceito:** enquanto nao houver leitura ao vivo, a home continua elegendo
por severidade. O ganho e que agora existe UM lugar que sabe eleger com tempo, e
ele e testado com relogio controlado.

---

### D62 — `STALE:120` nao e frescor de fonte, e por isso nenhum limiar foi inventado

**Achado.** `FLOORS.STALE = 120` do `motor.js` e **teto de plausibilidade da
espera observada de um pedido**, aplicado em `motor.js:212` e `:218` sobre
`wmin = t - o.p` e `wait = t - o.r`, com o comentario canonico: *"no dado real,
NENHUMA espera legitima passou de 104 min... Acima de STALE o dado e suspeito:
nao entra em contagem, nao vira foco, nao e nomeado."*

**Decisao.** A politica temporal NAO define limiar de frescor de fonte. Nenhum
existe no canone. A obsolescencia entra como **estado observado** (`saudavel ·
parcial · stale · indisponivel`, de `sinais.ts:76`) mais a **idade da leitura**;
a politica decide a CONSEQUENCIA — nunca o diagnostico.

**Alternativa recusada:** reaproveitar 120 min como "fonte parada ha mais de 2
horas". Recusada porque sao grandezas diferentes — uma mede a espera de um
pedido, a outra mede o silencio de uma fonte — e usar o numero de uma para a
outra inventaria uma regra com aparencia de medicao.

**Consequencia comprovada:** fonte obsoleta nunca vira Calmo (guarda R5A-14),
nao promove a Foco (R5A-12), preserva o Foco vivo com a degradacao declarada
(R5A-13), e a retirada por obsolescencia tem motivo proprio, distinto do fim da
tensao (`fonte_obsoleta` contra `causa_desapareceu`).

**Custo aceito:** sem limiar, uma fonte que envelhece devagar so e tratada quando
alguem a declara obsoleta. Preferivel a fabricar o momento.

---

### D63 — Uma leitura REAL nao pode omitir a eleicao temporal, e a recusa e executavel

**Decisao.** `home-vm.ts` passa a receber `OrigemDaLeitura`, um tipo
discriminado: `{ tipo: "demonstracao", motivo }` ou `{ tipo: "real", temporal }`.
Uma leitura com `procedencia === "real"` que chegue sem `tipo: "real"` **lanca**.

**Por que isso e uma decisao e nao um detalhe.** R5-A deixou a eleicao temporal
OPCIONAL, e por um bom motivo: as cenas de demonstracao sao instantes isolados,
sem eixo de tempo. Isso resolveu a fixture e **abriu uma porta** — um chamador
real poderia simplesmente nao passar o resultado da politica e voltar a eleger
por fotografia, sem que nada acusasse. O bypass nao seria uma violacao visivel;
seria uma omissao silenciosa, que e a especie que este repositorio mais sofre.

`motivo` e obrigatorio no ramo de demonstracao porque "nao passei" nao e motivo,
e omissao. Uma demonstracao precisa DIZER por que pode pular a politica.

**Alternativa recusada:** deixar a fronteira como convencao documentada. Recusada
porque prosa nao e executavel, e a proxima sessao que escrever o primeiro
chamador real nao vai ler este arquivo antes de chamar a funcao.

**Custo aceito:** o controle positivo H28b do gate da home precisou passar a
fornecer a eleicao temporal. O que ele prova continua identico — leitura real nao
vira demonstracao —, mas ele nao pode mais entrar pela porta de fixture. Foi a
UNICA alteracao de teste exigida pela fronteira.

---

### D64 — I1 e I2 sao invariantes de DOMINIO, e o motor original ja estava aqui

**Achado.** O contrato dizia que I1 e I2 exigiriam integracao para serem
provados. Nao exigiam: `src/perfil-delivery/decisao.js` esta neste repositorio,
e `decidir(snap, INFO, opts)` e uma funcao chamavel. Um harness isolado monta a
fotografia do minuto, chama, e inspeciona o retorno.

**Decisao.** I1 e I2 sao provados no DOMINIO, executando o motor de verdade —
nunca por regex sobre `dentroDoEscopo`. Neutralizar a funcao muda o VALOR que
`decidir()` devolve, e e o valor que o teste examina. Nenhuma conexao foi criada:
o harness le comportamento, nao integra nada. D43 continua de pe.

**Alternativa recusada:** adiar I1 e I2 para R5-C, sob o argumento de que "a
integracao que poderia viola-los ainda nao existe". Recusada pela regra da
propria missao: nao se declara verde um invariante porque a violacao e
impossivel hoje. E, no caso, nem era necessario — o motor estava a um `require`
de distancia.

**Custo aceito:** o harness constroi `sits` e `INFO` na mao, entao ele prova a
REGRA DE ESCOPO, nao a producao de situacoes pelo `MOTOR.step`. Registrado como
limitacao, nao como cobertura.

---

### D65 — O Shadow nao tem SUJEITO, e por isso D29 e protegida no tradutor

**Achado, da comparacao formal dos dois lados.** `Recomendacao` (shadow.ts:43)
nao tem campo de sujeito: `recommended_action` e texto. Logo **o contrato do
Shadow nao consegue distinguir** uma recomendacao de pedido de uma de fonte, e
**D29 nao e protegida por ele**.

**Decisao.** `EscopoDoSujeito` — `fonte | ambiente | subarea | pedido` — vive na
ENTRADA do tradutor, e a recusa acontece **antes de o draft nascer**. Sujeito
`pedido` exige `order_id` real; `identidadeDePedidoLegitima()` recusa numero
visual, posicao, indice, horario, hash improvisado, chave de fixture e o id curto
do iFood que o motor exibe. E **nao ha downgrade silencioso**: quando a acao fala
de um pedido e o sujeito declarado nao e pedido, bloqueia — trocar o sujeito para
caber e exatamente o que D29 proibe.

**Alternativa recusada:** acrescentar sujeito ao `Recomendacao` do Shadow.
Recusada porque criaria um segundo modelo de recomendacao concorrente, e porque
o Shadow ja esta provado por 39 testes — mexer nele para acomodar uma fronteira
que ainda nao existe em runtime inverteria a ordem de risco.

**Custo aceito:** a garantia mora fora do schema que persiste. Mitigacao: o draft
so pode nascer pelo tradutor, e o gate prova que nenhum caminho de runtime o
chama.

---

### D66 — Confianca nao atravessa a fronteira: rotulo nao vira numero

**Achado.** O motor devolve `confianca: "alta" | "média" | "baixa"` — rotulo. O
Shadow exige `confidence: number` em 0..1. **Nao existe regra canonica** ligando
os dois no patrimonio do projeto.

**Decisao.** O tradutor **nao converte**. `confianca_rotulo` permanece no
adaptador da saida legada, sem virar numero, e o `confidence` vem do chamador,
sustentado por evidencia. Sem numero: `bloqueada: confianca_sem_evidencia`. Fora
de faixa: `confianca_fora_de_faixa`, usando `exigirConfianca` **importada** do
Shadow, nunca reescrita.

**Alternativa recusada:** mapear alta=0,9 · media=0,6 · baixa=0,3. Recusada por
fabricar precisao — os tres numeros teriam a aparencia de medicao e a origem de
palpite, que e a Lei 5 invertida.

**Custo aceito:** nenhuma traducao passa hoje sem um chamador que forneca
confianca com lastro. E o ponto: hoje esse chamador nao existe, e a fronteira
declara isso em vez de simular.

**Nota que vale guardar:** zero **nao** e ausencia. `confidence: 0` traduz
normalmente; ausencia e `null` e bloqueia.

---

### D67 — O validador do Shadow passa a ter UM lugar, e o runtime o chama

**Decisao.** `validarDraftShadow()` mora em `src/platform/copiloto/shadow.ts`,
`recomendar()` monta a candidata e **chama a funcao** antes de empilhar, e o
tradutor de R5-C **reexporta** a mesma referencia. Nao existe segunda
implementacao.

**Por que era urgente.** R5-C declarou, no proprio relatorio, que o harness
"reproduz as recusas de `recomendar()`". Isso e um par que diverge em silencio: o
dia em que a regra mudar de um lado, o outro continua aprovando o que ja nao
vale — e o teste continuaria verde, que e a pior forma de falhar.

**Como a equivalencia foi provada:** os 39 testes do Shadow continuam verdes, sem
regra alterada, reduzida ou acrescentada. A validacao continua **sem efeito** —
ciclo de vida, ordenacao e store ficaram fora da funcao.

**A guarda que texto nao daria:** o teste compara a **identidade de referencia**
das duas importacoes (`validadorDaFronteira === validadorDoShadow`). Duas copias
parecidas passariam em qualquer comparacao textual e falham nesta.

**Alternativa recusada:** manter o validador do teste e sincronizar por
disciplina. Recusada pelo mesmo motivo de sempre — disciplina nao e executavel.

---

### D68 — O Caminho B nao tem linhagem de evento, e a identidade NUNCA ENTRA

**Achado, medido.** Existem dois caminhos, e so um preserva identidade:

```
A  event log -> projetar() -> ViagemProjetada.eventos[] -> input_event_ids   PRESERVA
B  LeituraOperacional -> sinaisDe() -> causa -> politica -> decidir()        NAO TEM
```

O Caminho B e o que produz o **Foco**. `LeituraOperacional` (`sinais.ts:91`) nao
tem campo de evento, e `sinais.ts` **nao cita `event_id` em nenhuma linha**. A
`Evidencia` do produto e `{tipo, referencia, observado_em}`, e `referencia` e um
alvo de dominio — nunca um id do log.

**Entao a identidade nao se perde no meio: ela nunca entra.** A diferenca importa,
porque "perdeu" sugere um ponto para consertar, e o que existe e uma fonte que
nasceu sem o campo.

**Decisao.** Todo sinal de `sinais.ts` fica `eligible_for_shadow: false` com
`reason: event_lineage_unavailable`. **Nenhum backfill sintetico** — um id
inventado depois e pior que a ausencia, porque parece verificavel.

**Mudanca minima registrada e NAO implementada:** fazer `LeituraOperacional`
carregar os `event_id` que a sustentam e `sinaisDe()` propaga-los. Isso exige que
a leitura nasca do event log em vez de nascer de uma fotografia — runtime amplo,
fora desta missao.

---

### D69 — Confianca e Caso C: o Shadow exige numero e nenhuma politica existe

**Achado.** `Recomendacao.confidence` e `number` **obrigatorio**
(`shadow.ts:52`), e nao existe politica canonica que produza esse numero a partir
do Caminho B. `exigirConfianca` valida FAIXA, nunca ORIGEM.

**Decisao.** A regra **nao foi inventada**. `ConfiancaDeclarada` tem dois ramos —
`nao_estimada` (ausencia explicita, que **nao e zero**) e `apurada` com **regra
declarada** —, e `conferirConfianca` recusa duas conversoes proibidas: regra que
menciona severidade (`severity_used_as_confidence`) e regra que menciona rotulo
qualitativo (`qualitative_label_not_convertible`).

As tres alternativas reais ficam registradas com impacto e risco em
`CONTRATO_LINHAGEM_EVIDENCIA.md` §3, para o Cesar decidir: tornar a confianca
opcional no Shadow · definir politica canonica com evidencia · manter bloqueado.
**Nenhuma foi escolhida em silencio, e R5-D permanece bloqueado.**

**Defeito registrado, NAO corrigido:** `home-vm.ts:474` faz
`severidade >= 3 ? 0.8 : 0.6` — severidade virando confianca, exatamente o que a
separacao conceitual proibe. Nao foi corrigido porque as view models estao
congeladas nesta missao. A guarda D16 impede que essa regra entre no caminho novo.

**Custo aceito:** nenhuma recomendacao do Caminho B pode nascer hoje. E o ponto:
o contrato declara a ausencia em vez de simular precisao.
