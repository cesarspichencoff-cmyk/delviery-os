# Roteamento seletivo por horário e praça — prévia offline V1

**27/10/2026 · ITAIM · PR #127 · revisão sem efeitos físicos**

## Problema demonstrado
A configuração histórica da Teknisa (463 produtos) contém **87** produtos com `BALCAOSUSHI1 + DELIVERY SUSHI 1`, **19** com `BALCAOSUSHI2 + DELIVERY SUSHI 2` e **11 outros** com duas rotas de natureza diferente. A regra operacional validada com a gestão prevê Balcão no almoço e Delivery no jantar para as famílias correspondentes, com exceções para quentes e combinado dupla. A fila DELIVERY SUSHI 1 continha 204 submissões registradas em horário de almoço no recorte examinado, embora todas as 1.086 entradas retidas estivessem com estado `Printed` por `KeepPrintedJobs=true`; **não** há prova de 204 papéis efetivamente desperdiçados ou de jobs pendentes.

O planejador anterior em `src/production/productionPrintPlan.ts` bloqueia os pares completos sem escolher destino. É uma proteção contra impressão duplicada, **não** a solução final de roteamento seletivo. Nunca simplesmente retirar essa trava ou transmitir à lista inteira de impressoras cadastradas.

## Implementação entregue nesta rodada

- `tools/comandas_window_station_select_v1_offline.cjs`: **adaptador opcional somente em memória** que recebe a projeção original `projectExpectedRouting`, horário **local do pedido alegado como originário da Teknisa**, revisão identificada por SHA e **uma regra de praça por item associada ao código exato do produto**; nunca escolhe categoria por nome.
- Para um item elegível `COMBINADOS`, escolhe como **candidato** `00009` no almoço e `00003` no jantar. Para `ENROLADOS`, `00006` no almoço e `00004` no jantar. **Suprime o outro membro do par na prévia**, não altera o cadastro original.
- `ENROLADOS_QUENTES` permanece em `00006` no jantar se essa for sua rota exclusiva. Quando houver conflito de roteamento não resolvido, ou classe `COMBINADO_DUPLA_EXCEPTION`, a saída é `HOLD`, jamais reinterpretação por heurística.
- Cozinha (`00002`) independente e outros destinos distintos não são apagados por uma alternância sushi. Uma ausência de destino ativo configurado **não pode inventar uma impressora substituta**. Nenhum subconjunto de vias passa pelo preflight quando há ao menos uma classe/rota de item conflitante.
- Janela usada como **candidata operacional documentada**, não confirmação física de abertura de uma Epson: segunda a sexta `11:00 ≤ almoço < 15:00`, fim de semana `11:00 ≤ almoço < 16:30`, todos os dias `18:00 ≤ jantar < 23:00`. Faixas fora das janelas = `HOLD`. As datas/horas são **do registro local de origem**, nunca relógio do PC.
- A prévia passa pela função existente `planProductionPrintIntents`, **após** remover apenas as alternativas indevidas na cópia da projeção. A regra legada de bloqueio de pares **permanece intacta na entrada de produção**, e qualquer caminho sem esse adaptador continua bloqueado.
- Exige coincidência entre `context.order_time` exibido e o horário usado para calcular a janela; e vínculo `item_index + product_code` para cada categoria. Não faz classificação automática nem atesta, sozinho, a origem do dado.
- Resposta sempre `print_authorized=false`, `ready_for_operational_print=false`, `live_window_verified_here=false` e `effects.print=false`. O planejador também retorna `ready_for_physical_print=false`, mesmo quando é possível montar uma prévia legível.

**Campo de turno legado:** o adaptador ignora metadados antigos de `service_resolution` na prévia; somente o horário do pedido informado na origem orienta a escolha candidata. Um estado vencido indicando jantar não redireciona uma comanda de almoço, não libera papel e não recria aprovação diária. Esse comportamento foi coberto por teste adversarial adicional.

**Limite deliberado:** os campos de origem, snapshot e regra são **alegações fornecidas ao adaptador offline**. Ele não abre Reader real, não comprova pin do motor de classificação, assinatura da fonte, power-state, janela efetiva de energização, evento da primeira via, sequência TATÁ persistida nem coincidência real com um job Windows. Não está conectado ao consumidor instalado. Uma fixture que declara `TEKNISA_ORDER_SOURCE_CLAIM` não se torna automaticamente prova de integridade da origem.

## Prova executada

Em cópia descartável no Foxxy no commit `4870efeb7c0f30eb832d7eb79071f1a949919092`, a compilação TypeScript e **28/28 testes** `tools/verificar_comandas_window_station_select_v1_offline.cjs` passaram. Casos: abertura de almoço, fronteira 15h, fim de semana 16h29/16h30, jantar 18h–22h59, 23h, calendário inválido, fonte ou loja ausente, classe divergente, dupla, quentes, cozinha independente, alternativa faltante, produto divergente, horário de prévia divergente, matriz 463/106/11 e integração com planejador sem efeitos.

O teste foi adicionado ao workflow de CI Linux/Windows. **Só declarar CI aprovada após conclusão no HEAD exato**.

## Próxima ligação técnica — dependências reais

1. Derivar `order_local_day/time` e `snapshot_sha256` do **mesmo** Reader V2 observado e validado, não de parâmetro sem checagem. Não depender de `production-service-state.json` vencido.
2. Associar código nativo de cada item a categoria/praça por **versão de catálogo homologada**, com exceções explícitas (especialmente duplas e quentes); o histórico não autoriza promoção genérica por nome.
3. Verificar o período real de utilização das impressoras e sua exclusividade com o emissor da Teknisa. A janela comercial publicada não prova que o hardware estava/está ligado exatamente naquela hora.
4. Integrar o adaptador ao consumidor candidato **somente quando as provas anteriores estiverem presentes**, sem efeito físico, e manter a fonte iFood exclusivamente no cruzamento da conferência.
5. Depois de provas e autorização específica, piloto de uma comanda real com controle de duplicidade, número TATÁ persistido, destino por praça, papel conferido e mecanismo de interrupção.

**Estado: CODE_READY + TEST_PASS_OFFLINE; não DEPLOYED, não print-ready, não papel confirmado. Nenhuma fila ou configuração física alterada.**
