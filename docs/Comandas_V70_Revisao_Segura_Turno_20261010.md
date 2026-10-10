# DeliveryOS V7.0 — prontidão do leitor, integridade e renovação segura do turno

**Data:** 2026-10-10. **PR:** #38 (DRAFT).  
**Missão:** avançar das comandas térmicas offline para o evento Windows real sem comprometer o serviço, sem inferir turno, sem perder observações nem emitir impressão.

## 1. Ponto de partida comprovado

Inspeção prévia estritamente passiva em `CAIXA_MOOCA`:
- Serviço `TataComandaReader` em `Running`, com 1.187 arquivos de eventos.
- Amostra de 12/12 pares com revisões correspondentes; nenhum desses 12 estava `ready`.
- Exemplo observado aberto em 2026-10-09 23:01:08 local: decisão bloqueada por `SERVICE_STATE_DATE_MISMATCH_ORDER_DATE`, `SERVICE_STATE_EXPIRED_FOR_ORDER` e `SERVICE_REQUIRED_SUSHI1`.
- Estado de turno instalado lido como `DINNER`, data operacional `2026-10-07`, validade `2026-10-07T23:59:59`. **Não foi alterado.**
- Eventos v1 não trazem prova do texto das observações de clientes/produção; logo, `shadow ready` isolado não equivale a `ticket ready`.

A amostra não comprova a condição de todos os 1.187 pares nem o turno operacional presente.

## 2. Fragilidade da auditoria encontrada e corrigida

A auditoria V6.9 tinha a possibilidade de contabilizar um par como `both_ready_for_existing_shadow` com base apenas em flags e igualdade de revisão, ainda que o fingerprint falhasse ou houvesse bloqueios.

**Correção:** o agregado agora exige, cumulativamente, esquema nativo, `order_key`/`snapshot_hash` iguais, fingerprint SHA-256 do conteúdo da decisão intacto, flags `ready` estritamente verdadeiras, listas de bloqueio vazias, turno comprovado e coincidente nas duas peças, origem de prova não vazia, identificadores de pedido concordantes e mesmo número de itens. A auditoria separa:
- `both_ready_flags_only` — somente afirmação das flags, não é aptidão;
- `untrusted_ready_claims` — flags de pronto rejeitadas pelas demais verificações;
- `both_ready_for_existing_shadow` — concordância para **shadow existente apenas**, nunca permissão de impressão.

A auditoria ainda **não prova observações nem ticket triplo** e não deve ser descrita como aprovação operacional das comandas.

## 3. Contrato de revisão de turno V7.0

`src/production/shiftHumanReviewV70.ts` fornece análise **pura e reversível** de solicitação futura de turno:
- escopo explícito `store_id=0001`, data operacional válida, escolha `LUNCH` ou `DINNER`, `valid_from_local` e `valid_until_local`, sem horas inventadas;
- declaração humana específica com referência e instante declarados — os campos são **autodeclarados**, não há autenticação criptográfica ou verificação do operador;
- impede data passada, revalidação retroativa, janela expirante, incoerência cronológica ou vigência que atravesse a meia-noite;
- `REVIEWABLE_NOT_AUTHORIZED` **não** autoriza mudança de estado, banco, impressora, retomada de serviço ou reprocessamento histórico;
- `BLOCKED` não produz sequer uma proposta para revisão.

**Limite material:** o watcher instalado exige a data do pedido no estado `production-service-shift-state.v2` e possui somente `valid_until_local`, sem `valid_from_local`. Portanto, o V7.0 **não pode converter automaticamente a janela proposta no estado nativo**, pois isso poderia aceitar pedidos anteriores ao início confirmado. Um fluxo de autorização e uma evolução segura desse contrato precisam ser comprovados antes de qualquer atualização do serviço.

## 4. Verificações

- `tools/verificar_auditoria_leitor_v69.js`: **10/10**, inclusive ataques com flags prontas e conteúdo adulterado, segurança de dados, preservação de bytes e horários de modificação.
- `tools/verificar_revisao_turno_humano_v70.js`: **13/13**, incluindo estado vencido, serviço não escolhido, referência humana ausente, data passada, retroatividade, janela noturna cruzando data e ausência de efeito.
- **CI completa:** https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38055394298 — **PASS**. Não houve downgrades dos testes preexistentes.

## 5. Próximo portão operacional

1. Confirmação humana atual do turno real, filial, início e fim efetivos, usando fonte auditável. Não inferir almoço/jantar pelo relógio nem pelo antigo `DINNER`.
2. Demonstrar contrato de turno com início/fim realmente respeitados pelo watcher em modo prova, antes de ativar nova configuração; sem reprocessamento retroativo.
3. Reconciliar evento/decisão de pedido real com observações completas de item e produção **na mesma revisão**, sem armazenar textos sensíveis no repositório.
4. Só após esses passos, validar três comandas completas em SHADOW. Impressão física e deploy/merge exigem fronteira humana separada.

**Estado:** `WORLD_OBSERVED` limitado ao leitor/turno/amostra já lida; `CODE_READY` para auditoria e revisão; `TEST_PASS/OFFLINE` para V7.0. **Não** `DEPLOYED`, **não** `WORLD_PROVEN` das comandas e **não** `HUMAN_ACCEPTED`. `NO_SERVICE_STATE_WRITE/NO_PRINT/NO_MERGE/NO_DEPLOY`.
