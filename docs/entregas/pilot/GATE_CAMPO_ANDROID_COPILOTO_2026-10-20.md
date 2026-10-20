# Gate de campo — Android do motoboy + Entregas + Copiloto

**20/10/2026 · Procedimento preparado, NÃO executado · DRAFT/HOLD / NO-GO operacional**

Este é o **roteiro atual** para decidir se o piloto pode sequer começar. Substitui, para decisões de campo, os trechos sobre GPS pelo navegador, Android inexistente ou piloto HTTP dos runbooks de 2026-07. Não autoriza instalação, geolocalização, configuração, exposição na rede ou uso em produção.

## 1. Onde estamos — prova e limite

| Item | Evidência existente | Estado |
|---|---|---|
| Código Android: WebView com geolocalização desligada; serviço nativo `TripLocationService`; fila Room/WorkManager | `MainActivity.kt`, `TripLocationService.kt`, `SyncWorker.kt`, `AndroidManifest.xml` | Implementado no candidato; **não homologado fisicamente** |
| Vínculo de identidade | `DeviceSession` obtém ator de sessão da plataforma; delegação confere ator e aparelho; `recordTermAcknowledgement` não substitui ator | Testes locais e gates de estrutura, não validação de servidor de campo |
| Regressões e laboratório | Android JVM 108/108 no checkpoint técnico anterior; 21 mutantes cobertos em **execuções parciais** com restauração (não foi executada uma suíte monolítica); ponte Chromium 31/31 no lote anterior; [GitHub Actions 39431532854](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/39431532854), HEAD `1daef32`: 40/40 etapas e PG 13/13 | **PROVA TÉCNICA**, não aceitação operacional |
| Execução instrumentada em Android físico | APK/instrumentados compilaram; `adb devices -l` no Foxxy em 20/10 não listou aparelhos | **PENDENTE** |
| Termo legal efetivo e recibo remoto | Sem termo de campo, publicação e recibo na sessão real comprovados. `receiptJson` exibe cópia **local Room**, não comprova recibo do servidor | **BLOQUEADO** |
| Aceite remoto de termo/políticas pelo worker | `SyncWorker.kt` usa cliente do piloto sem credencial humana nas rotas legadas; 401 conserva o aceite pendente, **sem confirmação remota** | **PENDENTE DE INTEGRAÇÃO/AUTORIZAÇÃO** |
| Rejeição terminal de eventos do piloto | `SyncWorker.kt` marca `ApiResult.Rejected` como `failed`; a DAO reenvia `failed` na fila por `sequenceLocal` e limite 100. Uma recusa efetivamente terminal pode ocupar a fila indefinidamente. **Não mudar para `rejected` sem separar revogação/autorização de erro de domínio e provar que nenhum fato válido se perde.** | **BLOQUEADOR DE REGRESSÃO** |
| HTTPS, dispositivo autorizado e servidor de laboratório/preview escolhidos | Nenhuma prova de host, certificados e autorização aplicada ao celular físico | **PENDENTE** |
| Mesmos fatos na plataforma, Entregas e Copiloto | Gates com Postgres e dados sintéticos existem; viagem e pedido reais não foram observados | **PENDENTE DE PROVA DE CAMPO** |

**Regra de verdade:** código pronto ≠ APK instalado ≠ serviço rodando ≠ fato recebido ≠ motoboy/loja aceitaram. `UNKNOWN` nunca vira zero, pedido associado, entrega feita ou `real` por suposição.

## 2. Antes de conectar qualquer celular — portões

Cada linha precisa de evidência datada e autorização correspondente. Deixar **PENDENTE** até observar.

| Portão | O que demonstrar | Situação |
|---|---|---|
| A. Aprovação do ensaio | César define ambiente, participante voluntário, responsáveis, janela e **pré-autorização de parada emergencial no próprio aparelho** (retirar permissão de localização, encerrar o app, colocar em modo avião ou recolher o aparelho em incidente); sem alterar servidor sem autorização específica | PENDENTE |
| B. Fonte legítima | Identificador de pedido/viagem com proveniência conferida; chave externa Teknisa/Neemo não inferida de número semelhante; nenhum novo watcher | PENDENTE |
| C. Termo e retenção | Identidade legal, conteúdo, prazos, versão/hash e aprovação humana específicos; recusa não pode ser contornada | PENDENTE |
| D. Infraestrutura | Duas URLs explícitas (piloto/plataforma), HTTPS com CA do sistema para variante `pilot`, host/flags definidos, unidade isolada; `DELIVERYOS_SOURCE_MODE=simulated` ou `control` declarado no ensaio, nunca `real` por conveniência | PENDENTE |
| E. Identidade | `device_id` **e** `device_proof_sha256` públicos conferidos por canal administrativo separado, cadastro `identity.device` consistente com ator `motoboy_interno`/unidade; nunca transferir segredo bruto/token para o documento | PENDENTE |
| F. Persistência | Banco/credenciais isolados, fatos de ensaio classificados somente `simulated`/`control` na origem e no log durável, plano de limpeza e rollback; não reclassificar histórico retroativamente | PENDENTE |
| G. Contingência | Sem rede, revogação, recusa 4xx, encerramento remoto offline ou GPS inesperado têm responsável, ação local de parada pré-aprovada e critério de bloqueio definido | PENDENTE |

Sem todos os portões autorizados e comprovados, **NÃO instalar, ligar GPS, ativar rede LAN nem iniciar piloto**. A variante de campo é **`pilot` assinada sob custódia aprovada** (`applicationIdSuffix=.pilot`, URLs corretas e SHA conferido); **NUNCA usar `debug` com motoboy**, pois ele confia em CAs de usuário e habilita depuração WebView. Chave de assinatura e certificado público do host ainda não foram definidos. Nenhuma ação neste documento altera banco, flags ou aparelhos.

## 3. Sequência de homologação supervisionada

Marcar `OK` apenas se **ação + observável + evidência** forem verificados na mesma revisão/ambiente. Uma execução simulada vale `LAB_OK`, nunca `CAMPO_OK`.

| ID | Faça SOMENTE após autorização | Prova mínima e limite |
|---|---|---|
| F01 | Conferir APK variante `pilot`, assinatura/custódia, SHA, `applicationId`, URLs piloto/plataforma e HTTPS confiável; comparar identidade em canal distinto | `device_id` + `device_proof_sha256` conferidos contra cadastro, ator/unidade iguais; nunca instalar `debug` no participante |
| F02 | Abrir a tela sem viagem e observar permissões | Geolocalização WebView desligada; nenhum ponto/captura fora da viagem; **sem deslocar participante sem consentimento** |
| F03 | Apresentar termo vigente e oferecer **recusa** | Checkbox desmarcado; sem permissão ou GPS após recusa; registrar só código/estado, nunca material sensível |
| F04 | Repetir apenas em nova sessão permitida, com aceite explícito | Versão/hash, ator e aparelho vinculados; **recibo do Room não basta**: exigir confirmação autenticada **no servidor** da mesma revisão |
| F05 | Verificar permissão precisa e flag; deixar viagem ainda não iniciada | Não ligar captura antes do `trip_started` autorizado; ausência/negação impede coleta |
| F06 | Atribuir uma viagem **do próprio motoboy** e confirmar saída pelo domínio | `trip_id`, ator, unidade e origem são coerentes; recusa do domínio **não** liga GPS |
| F07 | Iniciar captura nativa autorizada e observar notificação de serviço | Servidor, Android e tela registram a **mesma** viagem; não usar GPS do browser |
| F08 | Interromper rede em ambiente controlado e gerar evento permitido | IDs, sequência e `occurred_at` preservados no Room; `pending`/`failed` **não é comprovadamente enviado** (`failed` pode ser reenviado); sem alegar sucesso antes do recibo |
| F09 | Restaurar rede e solicitar sincronização na mesma sessão autorizada | Delegação plataforma→piloto usa token restrito; recibo por `event_id`; sem duplicatas, evento com estado confirmado |
| F10 | Consultar Entregas e Copiloto **no mesmo ambiente** | Mesma projeção e `source_mode=simulated`/`control` conferido no evento durável; falta de fonte = indisponível/UNKNOWN, nunca inventar pedido |
| F11 | Encerrar viagem de modo autorizado com o aparelho **online**; bloquear/reabrir tela | Serviço e notificação param; nenhum ponto aceito após término; reinício não reativa viagem encerrada. **Offline remoto é cenário separado e bloqueador.** |
| F12 | Simular falha/revogação em bancada sem agir no cadastro de produção | Sessão incorreta, ator divergente, aparelho divergente e 401/403 não autorizam envio; fila local preservada |
| F13 | Em ambiente isolado, encerrar a viagem no servidor **enquanto o Android está offline** | O código atual mantém captura quando a rede não consegue confirmar fim remoto; **NÃO supor parada imediata**. Classificar exposição/retensão/recusa dos pontos e obter decisão humana antes de campo |
| F14 | Em Android 14+, interromper o processo em viagem ativa e observar retorno do serviço sob permissões reais | Foreground service em segundo plano pode sofrer restrição while-in-use; não declarar recuperação garantida. Reinício completo do aparelho também não tem receiver comprovado |

**Não usar** o teste antigo que manda abrir Chrome HTTP, iniciar `navigator.geolocation`, instalar certificados desconhecidos, caminhar fora de viagem para “testar privacidade”, nem criar Trip canônica a partir de formulário legado. O runtime atual de interesse é **Android nativo + interface WebView**; qualquer fallback deve ser projetado e autorizado separadamente.

**Limitação crítica:** compilar instrumentados não prova F01–F14. Android em primeiro plano com `foregroundServiceType="location"` e `ACCESS_BACKGROUND_LOCATION` ausente tem intenção de acompanhar a viagem; comportamento com tela bloqueada, economia de bateria, reinício e permissões varia por aparelho e continua **PENDENTE**.

## 4. Critérios de parada e rollback

- **P0 imediato:** captura sem consentimento ou após parada local verificada, troca de ator/aparelho, recibo/modo de fonte falsificado, endereço/GPS vazando em log comum. Vazamento de token entre servidores deve ser validado por teste técnico/observabilidade autorizada, sem interceptar TLS do participante.
- **Bloqueio do gate:** termo não publicável ou sem recibo autenticado, 401/403, HTTPS inválido, falta de origem de pedido, duplicata, perda de evento offline, Copiloto confundindo `simulated` com `real`; **F13 remoto-offline**, reinício FGS e política de rejeições definitivas da fila ainda sem prova adequada.
- **Falha transitória:** registrar motivo, manter fila e não reexecutar silenciosamente com outro ator. Estado `failed` não é sucesso.
- Havendo incidente durante ensaio **previamente autorizado**, o responsável **executa imediatamente** a parada local pré-aprovada do portão A (retirar permissão, encerrar app, modo avião ou recolher aparelho), comunica César e registra o resultado. Não aguardar nova aprovação para a resposta local já autorizada. Mudança de flags de servidor, exclusão, reconfiguração ou restauração exigem autorização específica; este texto não executa rollback.

## 5. Registro mínimo — uma ficha por execução

Preencher sem nomes, telefones, endereços, coordenadas, conteúdo de tokens ou PII. Guardar prova sensível **fora do Git**, em canal de acesso restrito aprovado; nunca em issue pública.

| Campo | Valor observado |
|---|---|
| Data e responsável autorizado | PENDENTE |
| Ambiente e URL de evidência (sem segredo) | PENDENTE |
| SHA exato do APK/código e CI associada | PENDENTE |
| Modelo Android/versão e identificador pseudônimo | PENDENTE |
| Unidade, papel e status de vínculo | PENDENTE |
| Origem e correlação do pedido/Trip (IDs opacos) | PENDENTE |
| Termo: versão/hash, aceite/recusa e recibo remoto | PENDENTE |
| F01–F14: OK / FALHOU / PENDENTE / NÃO APLICÁVEL, com evidência por linha | PENDENTE |
| Contagem offline antes/depois, recibos, `source_mode=simulated/control` e resultado F13/F14 | PENDENTE |
| Falhas, rollback realizado e prova de não coleta pós-viagem | PENDENTE |
| Aprovação humana explícita para eventual próxima etapa | **NÃO CONCEDIDA** |

**Decisão atual: NO-GO para instalação e campo.** Não confundir documentação, CI ou simulação com liberação de produção. A [issue de integração #103](https://github.com/cesarspichencoff-cmyk/delviery-os/issues/103) fixa iFood API como **não dependência** da V1 e mantém TATÁ Comandas em frente separada.
