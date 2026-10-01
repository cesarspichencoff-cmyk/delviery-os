# Guardrails de Arquitetura derivados da pesquisa — Comandas + Fiscal — 2026-10-01

## Objetivo

Preservar o caminho mais curto e robusto para o TATÁ sem importar complexidade de
plataformas muito maiores. Este documento não autoriza impressão, escrita no Odhen,
emissão fiscal ou cutover.

## Princípios confirmados por fontes maduras

### 1. Estação de produção é unidade semântica; impressora é transporte

O item pertence a uma praça/prep station. A impressora/KDS é somente o dispositivo
que materializa essa rota.

Aplicação TATÁ:
- roteamento continua sendo produto -> estação configurada -> dispositivo ativo;
- nenhuma tabela paralela genérica de "horário -> impressora";
- almoço/jantar só resolve alternativas explicitamente configuradas.

### 2. Expedidor/conferência não deve duplicar comandas de praça

Sistemas maduros separam prep stations de uma visão consolidada de expediter.

Aplicação TATÁ:
- comandas físicas ficam somente nas praças que produzem;
- conferência/sacola/kit/hashi/shoyu/CMV permanecem digitais;
- não criar ticket físico extra para montar uma "visão geral".

### 3. Retry seguro exige identidade idempotente + semântica de efeito

Mesmo pedido/intenção deve manter a mesma identidade semântica. Repetição só é
automática quando existe prova positiva de ausência de efeito.

Aplicação TATÁ:
- intent_fingerprint identifica a comanda semântica;
- timeout/estado ambíguo bloqueia retry automático;
- PROVEN_NO_EFFECT_FAILURE permite retry seguro do mesmo intent;
- reprint legítimo é nova intenção operacional vinculada ao original.

### 4. Spooler não é papel

Estados do Windows têm significados diferentes:
- PRINTED = evidência de spooler suficiente para avanço operacional;
- COMPLETE sozinho não significa necessariamente impressão física concluída;
- PAPER_OUT/OFFLINE/DOOR_OPEN/USER_INTERVENTION/ERROR bloqueiam;
- confirmação física continua sendo uma classe de prova separada.

Aplicação TATÁ:
PRODUCTION_DISPATCH != PHYSICALLY_CONFIRMED

### 5. Fiscal é bounded context nativo do Teknisa/Odhen

DeliveryOS não deve formar XML fiscal nem conversar diretamente com SEFAZ quando a
rota nativa Teknisa/Odhen for suficiente.

Aplicação TATÁ:
PRODUCTION_DISPATCH != NFCE_AUTHORIZED != DANFE_PRINTED

A sequência TATÁ serve para correlação operacional; nunca substitui número, série,
chave de acesso ou protocolo fiscal.

## Arquitetura mínima recomendada

1. Fonte real Odhen/Teknisa read-only para pedido e roteamento.
2. DeliveryOS:
   - normalização;
   - sequência TATÁ;
   - projeção por praça;
   - comanda semântica;
   - fingerprint/idempotência;
   - conferência digital;
   - estados operacionais.
3. Print contract já existente no TATÁ OS:
   - request;
   - lease;
   - durable accept;
   - spooler evidence;
   - reconciliação.
4. Fiscal nativo Teknisa/Odhen.
5. Painel operacional como projeção dos estados acima.

Nenhum broker dedicado é necessário para esse estágio.

## NÃO construir agora

- Kafka;
- RabbitMQ;
- cluster de mensageria;
- event-sourcing integral do restaurante;
- KDS próprio;
- emissor NFC-e próprio;
- XML/assinatura fiscal no DeliveryOS;
- integração direta DeliveryOS -> SEFAZ;
- segundo motor de roteamento;
- banco compartilhado gravável entre DeliveryOS e TATÁ OS;
- ticket físico de conferência/sacola/kit;
- renderer ESC/POS novo enquanto o caminho real de driver/spooler ainda não foi provado;
- observabilidade pesada (ELK/Prometheus stack) antes de existir volume/problema que pague o custo.

Reabrir qualquer item acima exige um gap real observado que a arquitetura atual não
consiga resolver de forma suficiente.

## Estados mínimos da comanda

PLANNED
-> SUBMITTED/PRE_EFFECT
-> PROVEN_NO_EFFECT_FAILURE
   ou
-> EFFECT_UNKNOWN_REQUIRES_RECONCILIATION
   ou
-> SPOOLER_OBSERVED
-> PHYSICALLY_CONFIRMED (somente quando houver prova física específica)

Regras:
- COMPLETE do Windows sem PRINTED não libera;
- qualquer estado ambíguo bloqueia retry automático;
- PRINTED no spooler não é prova física.

## Estados mínimos do fiscal

NOT_ELIGIBLE_OR_UNKNOWN
-> NATIVE_REQUEST_CANDIDATE
-> REQUESTED
-> AUTHORIZED
-> DANFE_DISPATCHED
-> DANFE_PRINTED/DELIVERED quando houver evidência correspondente

Rejeição/contingência são estados próprios e nunca são normalizados para sucesso.

## UX da comanda física

Prioridade visual:

1. DESTINO/PRAÇA
2. TATÁ + TEKNISA + IFOOD
3. CAIXA/MONTAGEM quando aplicável
4. quantidade + item
5. preparo comprovado
6. observação do item
7. observação de pedido somente quando comprovadamente relevante à produção
8. check final

Regras:
- uma leitura vertical;
- nenhuma informação administrativa/fiscal;
- observação deve saltar visualmente;
- evitar decoração;
- largura e quebra determinadas pelo perfil físico real;
- 58/80 mm continuam perfis distintos.

## UX do painel digital

Um pedido precisa mostrar estados independentes e legíveis, por exemplo:

TATÁ 037
- Sushi 1: enviado / impresso / bloqueado
- Sushi 2: enviado / impresso / bloqueado
- Conferência: pendente / concluída
- Fiscal: aguardando / autorizado / rejeitado
- DANFE: enviado / impresso / desconhecido

Nunca usar um único "OK" para vários efeitos diferentes.

## Critérios pré-Mooca

Deve estar pronto antes:
- cobertura sintética de rotas;
- sequência diária;
- idempotência/fingerprint;
- retry/reconciliação;
- ticket preview;
- filtros de observações;
- handoff TATÁ OS;
- spooler semantics;
- fiscal orchestration zero-effect;
- preflight read-only;
- lista de efeitos proibidos.

## Critérios que só o Mooca pode provar

- fonte Odhen atual;
- semântica real dos IDs;
- origem real de LUNCH/DINNER;
- observações e joins;
- drivers/filas/portas reais;
- status reais do spooler;
- papel/corte/acentos;
- comportamento paper-out/door-open/offline;
- canal real elegível à NFC-e automática;
- gatilho fiscal real;
- versão/compatibilidade fiscal atual;
- caixa NFC-e e Interface;
- DANFE e impressora real.

## Go/no-go da impressão

GO somente se:
- rota real coincide com configuração;
- IDs corretos;
- conteúdo correto;
- driver/fila/porta provados;
- calibração física aprovada;
- estados de erro observados;
- idempotência/retry provados;
- uma prova física controlada aceita.

Qualquer UNKNOWN material => NO-GO.

## Go/no-go fiscal

GO somente depois do GO da comanda e se:
- canal for elegível;
- fluxo nativo Teknisa/Odhen estiver provado;
- caixa NFC-e correto estiver aberto;
- Interface/API necessária estiver funcional;
- compatibilidade regulatória vigente estiver comprovada;
- pedido -> chave/protocolo fiscal puder ser correlacionado;
- rejeição/contingência e retry estiverem observáveis;
- nenhuma emissão duplicada ocorrer em teste controlado.

## Fontes primárias que sustentam estes guardrails

- Toast: KDS, prep stations, expediter, hardwired networking e modifier routing.
- Microsoft: estados de Print Job/Print Queue e distinção COMPLETE x PRINTED.
- AWS Well-Architected: idempotência em operações mutantes.
- Stripe e Square: chaves idempotentes em operações com efeitos financeiros.
- Epson TM-T20III Technical Reference Guide: mídia física 80/58 mm.
- SEFAZ-SP / Portal NF-e: NFC-e obrigatória em SP, protocolo de 17 posições e QR Code v3.
- Teknisa EatTake: NFC-e automática condicionada a caixa NFC-e, Interface e estado do caixa.

## Fronteira atual

Arquitetura pré-Mooca está suficientemente definida.

Mais componentes antes da prova real agora aumentariam a probabilidade de
overengineering e retrabalho.

Próximo passo correto: executar o preflight no CAIXA_MOOCA e colher somente os fatos
que hoje permanecem UNKNOWN.
