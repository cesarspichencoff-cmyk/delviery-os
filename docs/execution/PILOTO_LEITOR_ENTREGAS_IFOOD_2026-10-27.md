# Integração do leitor ao servidor Entregas e sequência do piloto

## Resultado desta revisão

O servidor implantável `tools/entregas_pilot_server.ts` agora compõe, por opção explícita, a sessão individual, o cadastro privado, a autorização Itaim e o leitor de arquivos pelo motor TATÁ. Antes, essa composição só existia no teste HTTPS isolado. A nova integração não foi instalada no Caixa Mooca.

`ENTREGAS_OPERATOR_CONFIG` aponta para arquivo absoluto fora dos arquivos públicos. Ausência ou exemplo `enabled=false` mantém a leitura desligada. As rotas `/copiloto/pedidos/`, `/api/operator/*` e `/api/copiloto/orders` ficam reservadas mesmo desligadas: não caem no servidor estático legado nem recebem a injeção de token em localStorage. A leitura individual não concede comandos do Entregas; o token legado não concede leitura individual.

Quando configurada, a tela do console oferece link para a leitura. O health informa `copiloto_orders_configured`, não disponibilidade real da fonte ou integração operacional completa; `copiloto` permanece false. Nenhum pedido lido é convertido automaticamente em pronto, viagem, entrega ou localização.

## Configuração necessária para instalação

Schema `deliveryos.operator-pilot.v1`, `unitId=ITAIM`, `enabled=true` e `publishEnabled=true`. Os demais campos são obrigatórios:

| Campo | Origem e validação |
|---|---|
| `authBase` | URL HTTPS do provedor existente; nenhum provedor novo |
| `appOrigin` | Origem HTTPS exata, igual a `ENTREGAS_PUBLIC_URL` |
| `rosterFile` | Cadastro privado com conta existente e concessão vigente |
| `sourceRoot` | Diretório absoluto do leitor, fora dos arquivos públicos |
| `scope` | Itaim, códigos nativos da unidade/loja, evidência do vínculo e modo explícito real/control/simulated |
| `scope.sourceTimePolicy` | Política v1 para DTHRABERMESA, America/Sao_Paulo, NATIVE_LOCAL_WALL_TIME, mesmo escopo e referência de evidência |
| `sourceModeEvidenceRef` | Evidência da classificação da fonte; não inferida de ready=true |
| `approvalRef` e `expiresAt` | Referência e vencimento UTC canônico da janela de publicação |
| `maxAgeMs` | Limite explícito entre 1 e 300 segundos; o limite autorizado ainda precisa ser escolhido para o piloto |

O módulo recusa configuração parcial, unidade diferente, origem divergente, arquivo público/relativo, arquivo grande, link simbólico ou mudança observada durante a leitura. Alterar/remover o arquivo ou atingir o vencimento bloqueia novas leituras sem parar o Entregas. Para aceitar uma configuração diferente é necessário reinício revisado; o cadastro de pessoas já é relido por consulta. Metadados/hash não oferecem proteção contra administrador malicioso; a instalação continua exigindo ACL privada.

O exemplo versionado é deliberadamente desligado. O candidato privado anterior permanece inativo e é de preparação de acesso, não deve ser usado diretamente como este novo schema. Nenhum e-mail ou subject real foi incluído no repositório.

## Prova automatizada local

`tests/tata-reader/run-operator-pilot-tests.cjs` executa o servidor Entregas compilado como processo filho, em loopback e com arquivos descartáveis. Um preload somente do teste substitui fetch por provedor sintético fechado; não há código enviado por e-mail nem acesso ao Neon.

Nove famílias passaram: opt-in; 13 configurações inválidas; bloqueio das rotas desligadas e aliases; isolamento da UI/token legado; login sintético até itens lidos pelo motor no servidor implantável; bloqueio da fonte sem reutilizar resultado anterior; revogação do cadastro; alteração da configuração; vencimento sem reinício. A sessão de leitura recebe 401 ao tentar comando do Entregas. Tipo/quantidade dos itens e procedência simulada foram conferidos; dados privados sentinela não saem na resposta.

Regressões locais: HTTPS 6; cadastro 8; sessão 15; autorização 9; feed 19; diagnóstico HTTP 8; boot Itaim 8 recusas + 1 aceitação; despacho HTTP 15. TypeScript compilou. CI completo desta revisão ainda pendente; a última revisão anterior verde é 6dec9dc.

## Limite externo encontrado

O conector de acesso remoto respondeu que a cota mensal foi atingida e orientou não repetir nem reconectar. Não houve execução do comando no host nesta tentativa. Nenhuma instalação, restart, alteração de domínio, ativação de cadastro, OTP real, impressão, escrita no Odhen/SEFAZ ou publicação de pedidos foi feita. Nenhum serviço pago foi contratado. Retomar a instalação quando houver acesso autorizado disponível; não confundir teste local com prova no caixa.

## Sequência de aceitação preservada

1. **Leitor → copiloto:** validar classificação/horário da fonte, origem do provedor e login humano; instalar reversivelmente; conferir uma comanda conhecida com sua revisão, perda de fonte e revogação, sem divulgar dados privados nos registros de prova.
2. **Entregas:** conferir associação explícita do pedido à expedição, autorização e persistência da viagem, recuperação após reinício e isolamento de simulado/real. A leitura da comanda sozinha não prova prontidão. GPS só pode ser declarado após termo, identidade do Xiaomi e teste físico de localização/offline/segundo plano.
3. **Gestor do iFood:** qualificar a captura disponível na sessão da loja e os identificadores que a fonte efetivamente emite. Reutilizar contratos existentes; provar deduplicação e associação antes de unir pedidos. O projeto já distingue o ciclo externo do pedido de etapas internas da cozinha (DECISIONS D79/D80 e QUALIFICACAO_PRODUTORES_VIVOS). A tela `ifood-handoff` não comprova captura do Gestor. Não aceitar, cancelar ou despachar pedido automaticamente, nem inferir trabalho por praça a partir do estado geral.

O piloto completo continua pendente desses testes reais. Esta revisão elimina a lacuna de composição do servidor; não declara o conjunto pronto para produção.
