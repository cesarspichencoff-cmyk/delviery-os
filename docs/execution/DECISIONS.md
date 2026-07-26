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
