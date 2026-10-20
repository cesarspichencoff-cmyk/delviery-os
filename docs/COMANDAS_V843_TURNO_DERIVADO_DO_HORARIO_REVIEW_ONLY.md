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
