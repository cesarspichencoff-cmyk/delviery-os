# V8.43 — Correção de escopo: horários já vêm na comanda

**Estado: decisão de requisito registrada / revisão somente documental / implantação HOLD.**

## Fonte operacional esclarecida por César — 20/10/2026
1. "O que muda a operação é o horário".
2. "Os horários vêm na comanda, não precisa se preocupar com isso".

**Interpretação limitada e suficiente:** o DeliveryOS não precisa criar nem administrar um mecanismo de aprovação diária de almoço/jantar, nem deduzir turnos pelo relógio, nem construir uma tabela paralela de horários. A comanda já apresenta a informação de horário necessária no contexto operacional mencionado por César. **Não foi comprovado nesta etapa** qual campo/relógio é a fonte técnica desse dado, nem se todo caminho de ingestão o preserva; não inventar esses detalhes.

## Corrige duas premissas sucessivas
- **V8.42 — aprovação humana por mudança de turno:** requisito **rejeitado para a operação diária**; protocolo de assinatura, testemunha e nonce não deve ser incorporado como etapa necessária para a comanda.
- **Primeira edição V8.43 — classificação automática por tabela de horários:** **também rejeitada como complexidade sem necessidade**. Não construir resolvedor `LUNCH/DINNER`, tabela de janelas, configuração de horários por unidade, lógica de fronteira de turno, autenticação de configuração de horários ou validação adicional de horários como novo pré-requisito sem uma necessidade operacional específica e comprovada.
- A correção não equivale a apagar arquivos já versionados ou a declarar o código legado dispensável sem análise de dependências.

## Comportamento esperado, sem funcionalidades inventadas
- Processar e representar a comanda com fidelidade à informação efetivamente recebida, incluindo os horários que **já constam nela**, sem substituir por uma estimativa do relógio de processamento.
- Evitar decisões de roteamento, retenção ou impressão **baseadas em autorização de turno** que César não solicitou. Não adicionar uma nova tarefa de aprovação à equipe.
- Seguir o foco já contratado: ingestão correta, dados e quantidades de cada comanda, proteção contra duplicidade/ordem indevida, estabilidade, regras de produção/embalagem e as três vias de impressão — cada uma com as provas e autorizações necessárias.
- A segurança permanece ligada aos efeitos reais: mudanças em serviços, ACL, SQL/fiscal, impressoras e implantação requerem as permissões operacionais específicas. Não confundir isso com uma autorização para trocar almoço por jantar.

## Consequência técnica — somente diagnóstico, não patch
`src/production/serviceShiftState.ts` contém `LUNCH | DINNER`, exige `clock_inference_used === false` e valida estado explícito `valid_from_local`/`valid_until_local`; registros anteriores também indicam um watcher Windows V2 que consome esse estado. **Há potencial descompasso** entre uma dependência de estado de turno implementada no código e a operação descrita por César.

**Próximo trabalho útil**: examinar em revisão offline se essa dependência é realmente necessária ao fluxo de comandas ou se gera bloqueios artificiais; mapear quem a produz/consome, seus efeitos e regressões de remoção. Preservar tudo que já funciona. Não remover `HOLD` de outros riscos sem a prova correta, nem mudar `clock_inference_used` para contornar a verificação.

Não pressupor que o horário da comanda automaticamente determina `LUNCH`/`DINNER`: **não foi pedido**. Não estabelecer horários, validar turnos ou classificar pedidos em novos turnos como objetivo deste projeto, salvo requisito confirmado posteriormente.

## Auditoria direcionada para reduzir retrabalho — 20/10/2026
- A análise de `runtime/shadow/live_shadow_consumer_v2_candidate_v713.cjs` revelou que `event.service_resolution?.service` é consumido para decidir entre códigos de rota de sushi (`00009/00003` e `00006/00004`). Quando esse valor falta, o candidato adiciona os bloqueadores `SERVICE_REQUIRED_SUSHI1_*` ou `SERVICE_REQUIRED_SUSHI2_*`.
- **Consequência:** a lógica de seleção de rota pode ter utilidade operacional real. Não remover nem inventar uma substituição até verificar se o dado necessário já chega com a comanda/evento e quais saídas físicas representa. O relato de César não autoriza supor que o campo `service_resolution` já vem preenchido: isso é uma questão de integração, não de horário de funcionamento.
- A suíte V8.42 de aprovação humana foi retirada do CI em Linux e Windows, e os dois módulos de testes criados exclusivamente para ela foram removidos da branch por estarem fora do escopo. Os testes V8.36–V8.41 e as demais barreiras de segurança permanecem; **não houve alteração no consumidor de comandas**, no Windows real ou na impressão.
- Prioridade real: conferir origem dos dados da comanda, regras de roteamento físico e destino das impressoras, idempotência e as três vias; evitar mais código de autorização/turnos sem requisito comprovado.

## V8.44 — conserto pontual em erros de entrada, sem nova lógica de turnos
**Prova de código:** o candidato não instalado `runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs` só transportava `event.blockers` quando `ready_for_downstream_shadow` era falso. Assim, um evento contraditório com `ready=true` e falhas declaradas poderia produzir uma decisão que **omitisse o erro de origem**. A presença ou ausência de outras barreiras ainda podia bloquear a decisão; não afirmar que imprimiria.

**Mudança mínima na mesma PR:** o candidato V714 agora transporta os bloqueadores de evento e serviço mesmo com `ready=true`; rejeita listas de bloqueadores ausentes/malformadas; mantém `UPSTREAM_EVENT_NOT_READY` quando necessário. O teste `tools/verificar_identidade_bytes_v714.js` foi ampliado com seis condições adversariais e uma condição consistente, usando pedidos sintéticos, sem efeito de impressão. A verificação já existente no Linux passou a ser exigida também em CI Windows.

**Foco e limites:** nada de horários novos ou aprovação por turno; `DTHRABERMESA` é um campo de horário presente no envelope de exemplo do leitor, **não uma prova por si só de sua confiabilidade em todos os pedidos reais**. Os bloqueadores de `event.service_resolution` devem ser preservados até se provar o contrato de roteamento físico de sushi. V8.44 afeta apenas o consumidor SHADOW V714 não instalado. **CI do commit novo deve ser observado antes de alegar TEST_PASS.** Nenhum teste confirma física das três vias, nem autoriza merge/deploy.

## V8.46 — separar comanda legível de impressora fisicamente disponível (20/10/2026)

**Diagnóstico por execução real de CI, não suposição:** a primeira tentativa de validar `printer_ip` como requisito de toda comanda derrubou o teste positivo V7.22 (V2 → V6.8 → três vias), porque as impressoras **sintéticas** do replay têm somente `printer_code` e `printer_name`, deliberadamente sem IP. A execução devolveu `BLOCKED` em `V68_PAIR_GATE`, prova de uma regressão de escopo do patch, não de falha na impressão real.

**Correção mínima:** o candidato SHADOW V714 mantém os bloqueios V8.45 para rota duplicada e código de destino ambíguo; V8.46 passa a validar **somente o código de cinco dígitos e o nome não vazio** do destino lógico. A ausência de endereço de rede **não impede a geração sem efeitos físicos** das três vias em preview. No teste `verificar_identidade_bytes_v714.js`, cenários de IP ausente, vazio ou com espaços continuam `print=false/spooler_write=false`; código/nome inválido deve bloquear. Não há consulta de rede nem tentativa de validar impressora.

**Fronteira para produção:** o endereço correto, estado de rede, mapeamento código→impressora física, sistema spooler, papel realmente entregue e três vias requerem **pré-validação física independente e autorização específica**; nunca converter uma prova semântica da comanda em autorização para transmitir bytes. Não introduzir aprovação diária de turno ou horários paralelos. Todos os testes CI deste commit ainda precisam da conclusão explícita antes de declarar V8.46 TEST_PASS.

## Teste de aceite futuro, só se houver mudança técnica necessária
- Fluxo de uma comanda recebida para conferência e três vias com seus dados originais e horário já presente; não gerar autorização humana de turno nem recálculo desse horário.
- Verificar em sandbox os caminhos que hoje dependem de estado de turno; testar se são requisitos reais, se podem impedir pedidos legítimos ou causar regressão.
- Preservar idempotência, ordem, integridade, recuperação e controles já úteis, separando isso de mecânicas de turno não solicitadas.
- As cinco fontes independentes V6.8, testes físicos no Itaim, paridade Windows, testes SQL/fiscal pertinentes e autorização operacional permanecem pendentes na medida aplicável. Nenhum teste novo foi executado por esta revisão documental.

## Evidência e fronteira
**Comprovado nesta etapa**: premissa informada por César, leitura dos arquivos existentes e correção documental na branch de revisão. **Não comprovado**: alterações de execução, integração de horário no fluxo real, aceite de impressão, passagem automática de turno, instalação ou resultado na CAIXA_MOOCA.

PR #107 continua em DRAFT/HOLD, sem merge/deploy. Não tocar na CAIXA_MOOCA, ACL, arquivos de turno, serviços, SQL, fiscal, pedidos, impressão ou Teknisa com base nesta correção.

## Rastreabilidade
- `src/production/serviceShiftState.ts` — gate explícito de estado de serviço, que deverá ser reavaliado quanto à necessidade.
- `docs/COMANDAS_V842_AUTORIZACAO_HUMANA_TESTEMUNHA_INDEPENDENTE_REVIEW_ONLY.md` — estudo técnico histórico não aplicável como requisito de aprovação diária.
- `docs/COMANDAS_V841_SEPARACAO_CUSTODIA_TURNO_REVIEW_ONLY.md` — evidências de permissões prévias são preservadas como observações de segurança, não como justificativa de burocracia de turno.

**Aprendizado operacional:** antes de acrescentar autorização, inferência temporal ou configuração paralela, verificar se o dado já está na comanda e se há um efeito real que justifique a nova função. Sem diferença operacional demonstrável, não construir.


## V8.48 — a dupla de impressoras não é prova de alternância almoço/jantar (20/10/2026)

**Correção de uma hipótese anterior:** o consumidor de revisão assumia que as duplas de código `00009/00003` e `00006/00004` eram impressoras *alternativas*, selecionadas por `LUNCH/DINNER`. A configuração oficial do produto comprova somente a presença dos dois destinos; não comprova que sejam mutuamente exclusivos ou qual deles imprimiria em determinado horário.

**Nova evidência de código em máquina autorizada, somente leitura:** `C:\TEKNISA\odhenPOS\backend_74000\vendor\odhen\api\src\Service\ImpressaoPedido.php`, SHA-256 `BECAE373377F965C2DD2B8AB1DE9A904C71C6B820EB35980A894279C28670E52`.
- Linhas 805–882: `indexaProdutosPorImpressora` constrói estruturas distintas `impressoraProducao` e `impressoraProducao2`.
- Linhas 1046–1063: a segunda origem usa `B_NRSEQIMPRPROD2`, com inclusão independente de produtos.
- Linhas 214–247: existem laços separados para `impressoraProducao` e `impressoraProducao2`, ambos capazes de chamar `montaPedido`, sujeitos aos seus próprios filtros de parâmetro de impressão.
- Não há seleção `LUNCH/DINNER` nesse trecho. A evidência é **fonte encontrada no disco**, não prova de qual caminho foi executado por um pedido integrado, nem de que ambas as impressoras receberam papel. Outros consumidores ou configurações ainda podem importar.

**Decisão prudente para o candidato SHADOW, NÃO instalado:**
- Nunca escolher um dos dois destinos apenas porque `event.service_resolution.service` declara `LUNCH` ou `DINNER`, mesmo com a declaração estruturalmente coerente.
- Quando o produto exigir uma dessas duplas, registrar `SUSHI1_DUAL_PRODUCTION_ROLE_UNPROVEN_*` ou `SUSHI2_DUAL_PRODUCTION_ROLE_UNPROVEN_*` e não projetar nenhum dos dois destinos como selecionado. Rotas independentes e produtos de destino único continuam disponíveis só para diagnóstico; `ready=false` e nenhuma impressão.
- **Não** converter essa descoberta em impressão nas duas impressoras: isso também requer prova de caminho executado, efeitos, ordem e prevenção de duplicidade.
- **Não** remover a barreira global de estado de serviço do watcher instalado: o problema de ingestão e o roteamento do papel são duas fronteiras diferentes. O evento pode preservar fielmente `DTHRABERMESA` sem que isso prove qualquer mapeamento de impressora.
- Testes de regressão usam pares sintéticos, `LUNCH`, `DINNER`, ausente, inventado, evidência contraditória, rotas únicas e cozinha independente. CI específico permanece pendente de observação após o commit.

**Próximo teste discriminatório, sem efeitos:** localizar como o pedido iFood realmente entra no código de impressão Odhen (rotina invocada, relação dos campos A/B com os códigos de impressora, filtros aplicáveis), confrontar com a configuração oficial da loja e com uma revisão real; somente então definir os destinos lógicos permitidos. Até esse resultado, a hipótese `LUNCH -> BALCÃO` / `DINNER -> DELIVERY` está retirada do candidato de revisão.
