# Copiloto — instante da abertura do pedido

## Resultado

O adaptador de eventos do TATÁ agora consegue interpretar `DTHRABERMESA` local mediante uma política explícita fornecida pelo chamador confiável. Implementação somente na branch de revisão, sem instalação no caixa ou publicação de pedidos reais. O motor TATÁ existente continua sendo reutilizado.

A política exige schema `deliveryos.source-time-policy.v1`, unidade/códigos da fonte iguais ao escopo, campo `DTHRABERMESA`, base `NATIVE_LOCAL_WALL_TIME`, zona `America/Sao_Paulo` e referência de evidência. O conteúdo do evento não pode fornecer essa política. Uma referência textual não autentica ninguém: a integração futura precisa validar origem, configuração e identidade antes de chamar o adaptador.

O resolvedor puro consulta Intl com zona, calendário, números e ciclo de horas explícitos. Para datas 2000–2099, enumera os offsets ISO em minutos e exige um único candidato que reproduza os campos locais. Preserva até sete casas de fração, não usa a zona do computador e rejeita lacunas/duplicidade de horário de verão. Calendário inválido, horário 24:00, segundos 60, offset inválido e offset desconhecido -00:00 são recusados. Instantes já explícitos válidos continuam preservados.

O retorno registra a base temporal e a referência de evidência separadamente. Não altera o evento original, seus blockers, `sourceMode`, checkpoint ou estados de prontidão. Sem política, a hora sem offset continua bloqueada. Nenhuma política de produção foi criada nesta etapa.

## Evidências

- `node tests/tata-reader/run-copilot-reader-adapter-tests.cjs`: 15 famílias PASS, incluindo cadeia adaptador → motor TATÁ → projeção Copiloto, preservação de frações, isolamento de escopo, rejeição de política embutida no evento, fusos UTC/Tóquio/Los Angeles, calendário e horário de verão.
- `node tests/tata-reader/run-copilot-orders-tests.cjs`: 9 famílias PASS.
- A suíte de adaptador já integra o CI de produto; os novos testes entram no mesmo comando.
- Consulta somente de metadados dos três arquivos nativos mais recentes no Mooca: último `modifiedUtc=2026-10-27T02:04:24.9431538Z`, anterior à instalação da regra semanal. Os três continuavam bloqueados pela regra histórica e tinham abertura sem offset. Nenhum conteúdo de pedido foi exportado. Não houve reset/replay para fabricar evento novo.
- Os dois CIs do commit anterior a221d00e passaram: runs 40455004434 e 40455004481. Isso não comprova o CI deste delta.

Referência técnica: [ECMA-402 — DateTimeFormat](https://tc39.es/ecma402/2025/). A especificação exige explicitar timeZone para evitar o padrão da máquina. A escolha da zona da fonte depende da configuração confiável do projeto, não da documentação pública.

## Caminho para uso real

1. Concluir o chamador autenticado, configuração temporal e procedência da fonte real do Itaim; nenhuma senha compartilhada do proxy será apresentada como identidade individual.
2. Observar um evento nativo novo válido e provar a cadeia de leitura limitada até a tela do copiloto, com identificação de informação antiga/indisponível e sem inferir pedido pronto pelo status de item.
3. Resolver recibos PostgreSQL por unidade e transporte Android; validar o Xiaomi físico, consentimento e funcionamento durante a entrega antes de habilitar GPS.
4. Antes de operação, comprovar backup recorrente e cópia criptografada fora do host. O backup local já restaurado não precisa ser refeito para desbloquear desenvolvimento do copiloto.

Nenhuma dependência paga foi introduzida. A conversão pura resolve um bloqueio técnico; ainda não equivale a leitura operacional instalada. Os horários e o vínculo Itaim permanecem decisões confirmadas.
