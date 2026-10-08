# CLOUD / CROSS-AGENT HANDOFF — DeliveryOS
Atualizado: 2026-10-07
Autoridade humana final: César

## 0. Regra de retomada
Não reiniciar o projeto. Não refazer trabalho já PROVEN. Execução interrompida sem prova volta a UNKNOWN.

Antes de agir:
1. Revalidar VÉRTICE canônico em `cesarspichencoff-cmyk/vertice-runtime.`, branch `vertice-active`, entrada `VERTICE_ENTRY.md`.
2. Revalidar este repo/ref/HEAD.
3. Ler `docs/execution/STATE.json` e `docs/execution/EVIDENCE.jsonl`.
4. Só carregar contexto adicional que possa mudar a missão.

## 1. Fonte DeliveryOS atual
Repo: `cesarspichencoff-cmyk/delviery-os`
Branch: `tmp/tata-comanda-product-adapter-20261006`
HEAD remoto verificado antes deste handoff:
`3e6787c6c090e17a7901ffbdcc0fdb9aa969ad78`

Não assumir que este HEAD continua atual: revalidar antes de escrever.

## 2. Estado PROVEN
### Ponte histórica TATÁ Comanda -> Product System
- `/api/historico` carrega auditoria sanitizada como histórico explicitamente não-live.
- Dia provado 2026-10-05:
  - 195 pedidos
  - 551 linhas
  - 638 unidades
  - receita nativa R$ 38.989,37
  - 191 conciliações financeiras diretas
  - 4 pedidos explicados por R$ 61,00 de taxa de serviço
  - correção do relógio de revisão: 2 pedidos FOS / +10 unidades
- KDS P/F = ciclo local KDS. NÃO é tempo de produção nem de entrega.
- PRODUCTION_TIME e DELIVERY_TIME continuam UNKNOWN.
- Sem PII, endereço, telefone, coordenadas, payload bruto ou texto livre no contrato.

### Permissão SQL read-only WORLD_PROVEN
Principal: `NT SERVICE\TataComandaReader`
Exatamente 29 GRANT SELECT por coluna em:
- HISTPEDCONS
- ITCMD_LOG
- MOVCAIXADLV
- VENDA
- TIPORECE

Provas:
- 29/29 grants alvo
- 0 roles de banco
- 0 permissões não-SELECT inesperadas
- VENDA.DTSAIDAVENDA bloqueada
- INSERT/UPDATE/DELETE/CONTROL em VENDA = false
- serviço permaneceu RUNNING
- nenhuma escrita no banco

Evidência durável:
`data/tata_reader_lifecycle_permission_apply_2026-10-06_v1.json`

### Regressões preservadas
- TATÁ Comanda Product adapter: 9/9 PASS
- Product System: 51/51 PASS
- B7 Human Action Gate: 13/13 PASS
- B5 Offline Queue: 10/10 PASS
- B7 continua CONTRACT_PREPARED_NOT_EXECUTABLE.

## 3. Live Reader — candidato provado, AINDA NÃO INSTALADO
O candidato V2 existe SOMENTE na CAIXA_MOOCA local até o momento deste handoff:

`C:\TATA\comanda-v1\cutover\shadow-v1\live-truth-v1\tata_reader_continuous_watch_candidate_v2.ps1`

SHA256 provado:
`77C16940EFCAF38E380369AD6F17FBC849C67EC191F9617C3C1EF5119DFF31F0`

IMPORTANTE: este arquivo ainda NÃO está duravelmente salvo no GitHub. Quando CAIXA_MOOCA voltar online, recuperar o arquivo e publicar seu conteúdo exato antes/depois do deploy conforme a prova permitir.

### Provas do candidato
Consulta embutida executada efetivamente como:
`NT SERVICE\TataComandaReader`

Resultado:
- PASS
- result set 1: pedido/itens atuais
- result set 2: lifecycle + reconciliação financeira
- result set 3: recebimentos
- nenhuma coluna proibida/PII

Harness isolado:
- TopOrders=3
- MaxPolls=2
- polls: 2
- snapshots: 6
- events: 3
- poll_errors: 0
- changed_snapshots: 0
- sem variação artificial de hash

Eventos de prova continham:
- `order.truth.schema = deliveryos.tata-comanda-live-order-truth.v1`
- KDS local
- financeiro reconciliado
- recibos
- production_time_minutes = null
- delivery_time_minutes = null
- customer_pii_persisted = false
- raw_observation_text_persisted = false
- coordinates_persisted = false

O consumidor legado `live_shadow_consumer_v1.cjs` aceitou o evento enriquecido sem regressão.

## 4. Falha silenciosa pré-existente descoberta
O serviço Windows aparecia RUNNING, e os processos ainda existiam:
- watcher PowerShell
- shadow Node

Mas o reader NÃO estava saudável:
- último request SQL real: 2026-10-05 21:55:51
- checkpoint de polling parado em 2026-10-05 21:55:45
- sessão SQL continuava `sleeping`

Portanto:
SERVICE RUNNING != READER HEALTHY

A tentativa de live deploy foi interrompida ANTES de substituir arquivo/reiniciar serviço porque o Desktop Commander perdeu conexão.

## 5. UNKNOWN / blocker atual
No momento final deste handoff:
- CAIXA_MOOCA offline no Desktop Commander
- Foxxy offline no Desktop Commander
- V2 NÃO instalado
- restart NÃO executado
- rollback NÃO necessário
- reader instalado continua na versão anterior

A conexão pode ter voltado depois; revalidar.

## 6. Próxima missão exata
Quando CAIXA_MOOCA estiver acessível:

1. Revalidar script instalado, checkpoint e processos.
2. Recuperar candidato V2 local e confirmar SHA256 acima.
3. Corrigir a falha silenciosa antes do deploy:
   - heartbeat/reconnect observável do polling;
   - serviço RUNNING sozinho não é gate suficiente.
4. Reexecutar harness limitado após essa alteração.
5. Fazer backup timestamped de:
   - script V1 instalado;
   - checkpoint atual;
   - estado/artefatos necessários para rollback.
6. Instalar V2.
7. Restart controlado do `TataComandaReader`.
8. Provar TODOS:
   - SCM RUNNING
   - watcher novo vivo
   - shadow consumer vivo
   - sessão SQL nova/ativa
   - `last_request_end` avançando
   - checkpoint `LastWriteTime` avançando
   - poll_errors = 0
   - novos eventos com `order.truth`
   - sem PII/observação bruta
   - database_write=false
9. Se qualquer gate falhar: restaurar V1 + checkpoint, restart e provar rollback.
10. Só então registrar WORLD_PROVEN e publicar o script/provas no repo.

## 7. Não atravessar sem nova autoridade
- Não ativar escrita no SQL Server.
- Não habilitar B7/ação humana real.
- Não fazer produção/cutover fora do reader autorizado.
- Não imprimir.
- Não tocar Odhen/fiscal/SEFAZ.
- Não criar gasto.
- Não transformar KDS em tempo de produção/entrega.
- Não remover os três acessos antigos a campos de observação livre sem auditoria/autoridade separada.

## 8. Figma
Figma Full file key:
`dGyF0eRDd4YG8uqyWqU1P4`

Nós já usados:
- Entregas runtime: `20:808`
- B7 Human Action Gate: `21:2`
- B5 Offline Queue contract: `29:2`
- textos de Entregas atualizados: `20:1408`, `20:1410`, `20:1415`, `20:1520`, `20:1522`

B5 Figma: STRUCTURAL_PARITY_PROVEN; não promover isso para screenshot/visual proof.

Não existe ainda prova de uma superfície Figma dedicada para a ponte TATÁ Comanda live. Não inventar uma.

ACESSO: outro agente só terá Figma se o conector/autorização estiver disponível no ambiente dele. O file key/node IDs acima servem como âncoras.

## 9. Ferramentas/conectores desejáveis para o próximo agente
Prioridade:
1. GitHub
2. Desktop Commander / acesso à CAIXA_MOOCA
3. Figma, quando mudança visual realmente pagar o custo
4. execução local de testes

Não assumir que conectores deste ChatGPT são herdados por outro produto/modelo. Verificar cada conexão.

## 10. Estratégia para modelo forte
Usar o modo/modelo de maior raciocínio disponível para:
- auditoria adversarial antes de restart;
- failure-mode analysis do watcher/heartbeat;
- desenho de health check que prove polling real;
- revisão de rollback;
- integração contratual sem misturar histórico e live.

Mas não usar “mais inteligência” para ampliar escopo sem prova: preservar FACT / INFERENCE / UNKNOWN e PROVEN boundaries.

## 11. Definição de conclusão desta frente
Só considerar LIVE_READER_WORLD_PROVEN quando:
- código instalado = código auditado;
- serviço reiniciado;
- polling real avançando após restart;
- novos eventos truth reais produzidos;
- consumer aceita;
- privacidade preservada;
- nenhuma escrita de banco;
- rollback disponível e testável;
- evidência durável publicada no GitHub.
