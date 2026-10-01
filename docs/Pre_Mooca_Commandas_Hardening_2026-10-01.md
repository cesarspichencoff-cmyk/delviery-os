# Comandas — hardening pré-CAIXA_MOOCA — 2026-10-01

## Objetivo

Reduzir retrabalho antes da primeira leitura live e da calibração física.
Nenhuma mudança deste pacote autoriza impressão, spooler write, Odhen write,
efeito fiscal ou cutover.

## Estado comprovado neste branch

- rota física continua baseada em CDPRODUTO -> configuração Retail -> impressora;
- pares de salão/delivery de Sushi 1 e Sushi 2 são alternativas por serviço;
- serviço não é inferido do relógio;
- serviço usado para selecionar uma alternativa exige evidência + source_ref;
- IFOOD + TEKNISA + TATA continuam obrigatórios no ticket de produção;
- observação de pedido permanece separada de observação de item;
- ingredientes de produção aceitam somente:
  - HUMAN_CONFIRMED_RULE;
  - LOCAL_RECIPE_VALIDATED;
  - REAL_OBSERVED;
- estimativas e evidências UNKNOWN nunca viram instrução de preparo;
- sacolas, kits, componentes de kit e complementos continuam fora da comanda;
- preview de texto existe para TM-T20 em 80 mm / Font A (48 colunas) e
  58 mm / Font A (35 colunas), sem bytes ESC/POS e sem efeito físico;
- destino Sushi sem caixa de montagem bloqueia o preview;
- cada intenção semântica possui fingerprint SHA-256 determinístico;
- replay do mesmo conteúdo preserva fingerprint;
- mudança material de conteúdo muda fingerprint;
- tentativa anterior ambígua ou observada no spooler bloqueia retry automático;
- confirmação física anterior bloqueia nova submissão do mesmo intent;
- calibration-ready agora exige também variante real do equipamento e
  comportamento observado com tampa aberta.

## Por que estes pontos foram antecipados

Referências externas usadas como comparação de arquitetura, não como verdade da
operação TATÁ:

- Toast: prep stations e dispositivos são dimensões separadas; itens/modificadores
  podem ser roteados somente à estação relevante.
- Toast/Square: dining/fulfillment context pode alterar o roteamento da cozinha,
  portanto o contexto de serviço deve ser explícito, não deduzido silenciosamente.
- Epson TM-T20: 80 mm e 58 mm possuem geometrias diferentes; status inclui
  papel, offline/tampa e outros estados que precisam de prova por dispositivo.
- AWS/Square: operações com efeito e retry precisam de identidade idempotente;
  resultado ausente não prova ausência do efeito.

## Provas executadas no Foxxy

No HEAD deste pacote, em worktree limpo:

- TypeScript typecheck: PASS
- production-ticket-e2e-shadow-v1: PASS
  - snapshot Odhen sintético minimizado;
  - zero vazamento do marcador privado;
  - roteamento por CDPRODUTO;
  - exclusão de item sem comanda própria;
  - seleção de serviço;
  - ticket semântico;
  - preview 80/58;
  - retry ambíguo bloqueado.
- production-print-plan-v1: PASS
- production-ticket-v2: PASS
- expected-routing-v1: PASS
- production-printer-preflight-static-v1: PASS

## Ainda depende obrigatoriamente do CAIXA_MOOCA

1. Revalidar a fonte Odhen atual e seus hashes.
2. Provar acesso read-only antes de ler um pedido real.
3. Ler um pedido mínimo com NRCOMANDA, NRCOMANDAEXT e CDPRODUTO.
4. Fechar todos os canais reais de observação sem perda nem vazamento de PII.
5. Descobrir de onde vem, por pedido, a resolução LUNCH/DINNER.
6. Confirmar modelo/variante real, largura de papel, fila, driver e porta de cada
   impressora usada.
7. Validar encoding/acentos, densidade, tamanho, feed e corte em papel real.
8. Observar paper-out, cover-open, offline e spooler.
9. Persistir/correlacionar o ledger de tentativas no runtime correto antes de
   permitir retries automáticos.
10. Fazer uma única prova física controlada somente após autorização explícita.

## Fronteira

PREVIEW_READY != CALIBRATION_READY != SUBMITTED != SPOOLER_OBSERVED != PRINTED

Nenhum item acima muda o fluxo produtivo atual.
