# GPS — revisão de prontidão, 29/10/2026

## Veredito

GPS ainda não é 10/10 e não está liberado para o piloto. Escopo operacional: Itaim; host Caixa Mooca. Esta revisão não ativa captura, instala APK, muda permissões ou publica produção.

## Corrigido nesta revisão — central de despacho

- Resposta de uma viagem anterior não sobrescreve o foco atual. Cada consulta possui geração própria.
- Limpar seleção invalida consultas em trânsito e remove localização e linha do tempo.
- Falha de rede, resposta negada ou de viagem divergente invalida a posição; não mantém indicação de posição atual.
- Idade exibida avança com o relógio. O cache de tela vence em 30 segundos: perde indicação de posição utilizável e coordenadas. Esse prazo é de cache, não altera a política de precisão/freshness do servidor.
- Console consulta a viagem em foco a cada 20 segundos, com timeout de 10 segundos e sem cache HTTP. Ao ocultar a página, limpa o estado; ao voltar, consulta novamente.
- Mudança de papel limpa seleção e localização antes da alteração de identidade. Snapshot sem viagens também limpa o foco.

Arquivos: `src/entregas/ui/console/dispatch-location.js`, `console.js`; regressões em `src/entregas/pilot/run-dispatch-tests.ts`.

## P1 aberto — sessão Android e callbacks assíncronos

Em `android/app/src/main/java/br/com/tata/entregas/location/TripLocationService.kt`, `beginTrip` grava `tripId` e inicia preparação em coroutine sem geração/cancelamento ligado ao ciclo da sessão. O callback único usa o `tripId` mutável.

Consequências possíveis identificadas por leitura do código, ainda sem reprodução em aparelho:

1. START A seguido de START B pode atribuir lote atrasado de A à viagem B.
2. START seguido de STOP pode deixar uma preparação atrasada gravar `KEY_ACTIVE_TRIP` depois da limpeza, restaurando estado de uma viagem encerrada.

Não foi aplicado remendo parcial: guardar somente startup não resolve callbacks e persistência. Correção precisa vincular preparação, inscrição, callbacks e gravações à mesma geração de sessão; STOP deve invalidar a geração antes da limpeza. A remoção assíncrona de inscrições antigas não pode remover uma inscrição nova.

Regressões necessárias: START A→B com callback atrasado de A; START→STOP antes da gravação Room; falha tardia de inscrição A após início de B; recriação do processo após STOP; START duplicado. Compilar Kotlin e testar o serviço, não apenas presença de texto nos arquivos.

## P2 aberto — cadência adaptativa não conectada ao contexto

`decideNow` passa valores fixos para `stillForS`, `nearUnit`, `nearStop`, `returning` e `moving`. A política possui esses contextos, mas o serviço não os alimenta com evidência operacional. Não anunciar otimização adaptativa completa ou autonomia de bateria comprovada.

## P2 aberto — fila após longo período offline

`android/app/src/main/java/br/com/tata/entregas/sync/SyncWorker.kt` processa um lote de até 100 pontos e retorna sucesso sem verificar o restante; `requestNow` usa KEEP. Com captura encerrada e fila maior, o saldo pode aguardar execução periódica de 15 minutos por lote. Validar drenagem/continuação com 250 pontos, rede restaurada e nenhum evento novo antes de prometer sincronização imediata.

## Evidência local

- Build TypeScript aprovado.
- 33 testes de despacho aprovados, incluindo limpeza com resposta em trânsito, respostas fora de ordem, erro tardio, falha/negação, identidade de viagem e envelhecimento do cache.
- 50 testes GPS, 36 field-readiness, 79 native/consent, 6 leitura canônica de localização e 23 UI aprovados.
- 50 testes de API de dispositivo em servidor local de teste aprovados.
- 43 verificações estruturais Android aprovadas. São verificações do projeto; não compilam nem executam o serviço Kotlin.
- Não havia SDK/Gradle/Kotlin prontos neste ambiente para validar uma alteração do lifecycle Android.
- CI da base anterior `4faf7a220756617cef4cfd78d12c36d962d4ffc1`: produto 40823695709 e Android 40823695713 concluídos com sucesso. Isso não prova ausência dos riscos assíncronos acima nem valida esta revisão nova.

## Prova física ainda necessária

No Xiaomi escolhido, testar: concessão e revogação de localização; início/fim da viagem; tela apagada; economia de bateria; perda de internet e sincronização posterior sem duplicação; reabertura/recriação; ausência de captura após encerramento. Registrar duração, versão do Android, modelo, consumo e pontos esperados/recebidos. Nenhum desses resultados foi presumido nesta revisão.

Próxima prioridade: fechar o P1 Android com regressões executáveis e compilação antes de instalar/ativar GPS no piloto. O acabamento visual não substitui essa evidência.
