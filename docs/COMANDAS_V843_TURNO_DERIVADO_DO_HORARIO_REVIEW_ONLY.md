# V8.43 — Operação por horário, sem aprovação diária de turno

**Status: CORREÇÃO DE REQUISITO / DESENHO PARA REVISÃO / HOLD. Não instalado.**

## Origem da correção
Em 20/10/2026, César esclareceu a regra de negócio: **"o que muda a operação é o horário"**. A hipótese introduzida nas V8.32–V8.42 de que toda passagem ALMOÇO↔JANTAR exigiria autenticação/assinatura humana independente **não representa a intenção operacional**. Não inferir novos horários ou aprovação diária. Esta correção substitui essa hipótese funcional; não apaga evidências anteriores nem autoriza mudança no caixa.

## Regra de negócio corrigida
- **A operação é determinada automaticamente pelo horário do pedido**, comparado com as janelas publicadas da unidade, e não por um botão, uma aprovação de gerente por período ou um estado manual escrito a cada troca.
- Uma eventual autorização humana deve existir para **alterar a configuração de horários ou executar uma exceção administrativa**, se a política real assim exigir; **não** para operar dentro de uma janela já configurada.
- O conceito de turno em código deve ser tratado como **classificação temporal derivada** para cada pedido, não como comando operacional de cutover.
- É necessário confirmar os horários efetivos e a fonte canônica dessas regras antes de configurar valores: **UNKNOWN**. Não usar horários exemplificativos como horários reais.
- A fonte de tempo de cada pedido, sua confiabilidade e o fuso da unidade exigem prova. O simples relógio atual do computador não reclassifica pedidos anteriores.

## Descoberta técnica concreta
`src/production/serviceShiftState.ts` define `LUNCH | DINNER` e exige `clock_inference_used: false`: o consumidor deliberadamente rejeita derivação do serviço pelo relógio e valida um estado explícito com `valid_from_local`/`valid_until_local`. O watcher Windows V2 segue regra equivalente de estado preexistente. Assim, **o código atual não implementa automaticamente a regra de negócio corrigida**. Não mudar uma flag para `true`: seria bypass de uma barreira anterior sem fonte de horários e sem paridade do watcher.

Os relatórios anteriores V8.40/V8.41 sobre permissão do leitor sobre arquivos de estado/evidência permanecem observações válidas; sua conclusão sobre necessidade de aprovação humana a cada turno fica **supersedida como premissa de negócio**.

## Menor rota de implementação segura (não executada)
1. **Descobrir a configuração de horários já existente**, por unidade, dia da semana e exceções (feriados, intervalos, fechamento), e confirmar que é a regra operacional pretendida. Não inventar horários de almoço/jantar.
2. **Fonte do pedido**: preservar timestamp de abertura efetiva com origem e offset/fuso `America/Sao_Paulo` quando for aplicável à unidade; distinguir horário de recebimento, criação e processamento; definir regra para eventos atrasados. Nunca classificar pelo horário em que o watcher processou posteriormente o pedido.
3. **Resolver puro**: dado (`timestamp` confiável do pedido, `unidade`, `versão da tabela de horários`), produzir `LUNCH`, `DINNER` ou `UNKNOWN` com justificativa. Janelas [início, fim), sem sobreposição; suportar meia-noite/data operacional apenas se a regra confirmada exigir; horários inválidos ou ambíguos não viram defaults silenciosos.
4. **Auditar regras**: versão, quem/quando alterou a configuração, mecanismo de rollback e teste de regressão. Proteger edição administrativa das regras quando for relevante; não exigir aprovação humana a cada transição de horário.
5. **Paridade e fallback**: comparar classificação pura com fixtures reproduzíveis e com o contrato do watcher; não alterar o watcher real antes de teste, compatibilidade, rollback e autorização de implantação. O estado explicitamente assinado V8.42 pode ser conservado como pesquisa histórica de exceção administrativa, sem bloquear a classificação diária.
6. **Não afetar produção automaticamente**: frente a tabela não validada, timestamp sem origem ou conflito, marcar `UNKNOWN/HOLD` na NOVA rota em shadow; não afirmar que isso implica parar a operação existente. A decisão sobre comportamento de produção exige gate específico.

## Testes necessários antes de instalar
- Início inclusivo/fim exclusivo, todas as transições, fronteira de segundos/frações.
- Dias da semana, fechamento, lacunas intencionais, sobreposições indevidas.
- Janela que atravessa meia-noite, se realmente houver; data operacional correta.
- Fuso e offsets, mudança de offset quando aplicável, timestamp de fonte vs processamento.
- Pedido atrasado, pedido sem timestamp, horário alterado durante o dia, configurações versionadas.
- Paridade Node/Windows, processo supervisor e leitor, rollback sem alteração de ordens passadas.
- Cinco fontes independentes V6.8, teste físico das três vias Itaim e demais gates históricos de produção **continuam pendentes**.

## Disposição do V8.42
**V8.42 = HISTÓRICO TÉCNICO / PREMISSA OPERACIONAL SUPERSEDIDA.** O revisor sintético e seus testes não demonstram a necessidade de aprovar trocas; podem ser reusados só se houver um requisito real de exceção administrativa. Não conectar o protocolo de aprovação ao ciclo diário nem exigir que César identifique um aprovador para cada almoço/jantar. Evitar novos investimentos nesse caminho antes da correção temporal.

## Fronteira de autoridade e prova
Este documento é uma correção de requisito e plano de implementação, não CODE_READY, TEST_PASS da nova rota, DEPLOYED ou WORLD_PROVEN. Não alterados: computador CAIXA_MOOCA, arquivos reais de turno, fiscal, SQL, pedidos, impressão, serviços, ACL, configurações operacionais, fornecedores. PR #107 segue DRAFT / UNMERGED / HOLD; nenhum custo novo.

### Rastreamento
- `src/production/serviceShiftState.ts` — rejeita explicitamente clock inference.
- `src/production/shiftHumanReviewV70.ts` — proposta humana explícita anterior, sem autorização real.
- `docs/COMANDAS_V841_SEPARACAO_CUSTODIA_TURNO_REVIEW_ONLY.md` — evidências técnicas anteriores preservadas.
- `docs/COMANDAS_V842_AUTORIZACAO_HUMANA_TESTEMUNHA_INDEPENDENTE_REVIEW_ONLY.md` — rota supersedida como regra diária.
