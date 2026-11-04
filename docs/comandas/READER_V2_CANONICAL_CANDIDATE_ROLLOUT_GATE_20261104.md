# Reader Itaim — atualização canônica do V2: checkpoint e limite seguro de implantação (04/11/2026)

**Decisão operacional:** manter o Reader ativo, com dados apenas em leitura, sem impressão; a atualização do hash será **substituição controlada do MESMO worker**, não segundo coletor. **Esta candidata é REVIEW_ONLY e explicitamente bloqueada no CAIXA_MOOCA.**

## O que foi reutilizado e descoberto

- A inspeção administrativa real está consolidada em `docs/comandas/ITAIM_REAL_READER_SQL_SOURCE_PROOF_20261104.md` (checkpoint contemporâneo nesta PR). **Não repetir SQL de catálogo, sessões, amostras de eventos ou tentativa de ACL.** Ela comprovou sessão SQL da conta Reader, `RCSI=OFF`, `SNAPSHOT=OFF`, isolamento `READ COMMITTED`, sem `rowversion` nas quatro tabelas examinadas. **Integridade transacional por revisão permanece NÃO PROVADA**; não ligar RCSI global nem experimentar `SERIALIZABLE` sem medir risco para o POS.
- O arquivo `bin/tata_reader_continuous_watch_candidate_v1.ps1` instalado é o **supervisor**. O worker configurado e monitorado é `bin/tata_reader_continuous_watch_candidate_v2.ps1` (17.871 bytes, SHA-256 esperada `92b33e82ed72426be46fe20bcb2a4f4557f9716108886f89e15a4e262c506d44`, conforme supervisor/inspeção). A auditoria do watcher V1, que afirmava **não haver notas**, não descreve o V2: a versão instalada seleciona `DSOBSCOMANDA`, `DSOBSDESCIT`, `DSOBSPEDDIGCMD`, `TXPRODCOMVEN` e emite `observation_rows`. O marcador `observation_scan_complete=true` é uma afirmação do produtor, não prova de um snapshot atômico.
- O arquivo `state/production-service-state.json` com data de 14/10 não rege o V2. O worker lê `bin/production-service-weekly-policy.json`, efetivo desde 26/10 com a regra semanal do Itaim já autorizada.
- A observação remota read-only do checkpoint (sem republicar identificadores) encontrou **250 entradas distintas**, todas `emitted_hash=snapshot_hash`, **zero pendências na amostra**, e todas com digest antigo **maiúsculo**. Registros observados do intervalo 02/11–03/11; isso não é inventário de pedidos ainda ativos e não significa que todos os itens estejam prontos.
- A auditoria administrativa paralela mediu amostras de eventos reais com paridade de SHA **após lowercase** e revelou que o V2 filtra origem ampla `DLV[_]% `; a fronteira do Copiloto exige exclusivamente `DLV_IFO`. Nenhuma amostra com apóstrofo comprova a identidade entre serializações; os testes de caracteres especiais já tinham constatado diferença no PowerShell.

## Código preparado, não executável no caixa

- `tools/tata_reader_continuous_watch_v2_canonical_candidate_REVIEW_ONLY.ps1`: fonte de trabalho derivada de **leitura não destrutiva** do V2 instalado. Mantém supervisão atual e identidade SQL, captura de 17 campos, e efeitos limitados. **Não equivale a um novo binário ou versão assinada e não foi instalada.**
- Reusa, sem cópia da implementação, `tools/comandas_reader_canonical_json_v1_REVIEW_ONLY.ps1`, serializador PowerShell/Node já testado em 64/64 verificações laboratoriais anteriores. Não apenas faz `ToLower()`: calcula SHA-256 no JSON canônico, preservando as notas Unicode/apóstrofo.
- Restringe **a candidata** à origem `DLV_IFO` em vez de aceitar outros `DLV_*`, sem tocar a consulta comercial em execução.
- A versão antiga de checkpoint não registra `hash_contract_version`; ao mudar de hash, todas as 250 entradas podem parecer “alteradas” e disparar uma nova emissão. A candidata **falha antes do SQL** com `CHECKPOINT_HASH_MIGRATION_REQUIRED` se a versão não for `NODE_CANONICAL_JSON_SHA256_V1`. Uma instalação acidental no `CAIXA_MOOCA` também é bloqueada por guarda de review. **Não** interpretar essas travas como uma migração já implementada.

## Testes efetivamente executados no Foxxy isolado

**Ref validada da candidata:** `e782c21172f053df7a8bd9a275624a9ce870078a`; worktree destacado em `comandas-v2-canonical-review-20261104`.

- `node tools/verificar_reader_v2_canonical_upgrade_offline.cjs`: **5/5 PASS**, incluindo parser PowerShell real e execução **somente da função `Load-Checkpoint` extraída por AST**, em arquivos temporários sintéticos. Rejeitou o checkpoint legado, aceitou somente o contrato versionado e preservou o comportamento de checkpoint novo.
- Serialização PowerShell/Node com acentos, apóstrofos e controles: **16/16 PASS**.
- Ligação entre itens e três observações canônicas: **1/1 PASS**.
- Montagem nativa de observações: **24/24 PASS**.
- Política de isolamento com metadados falsos e sem SQL: **23/23 PASS**.
- A compilação TypeScript da PR #135 foi executada em Foxxy com dependências já existentes, sem erro. A primeira tentativa dos testes antigos nesse novo worktree falhou porque não havia `dist`; corrigida com compilação e reexecutada com sucesso. Não foi necessário instalar pacote nem modificar a máquina comercial.

Nenhuma dessas provas avalia leitura atual de pedido sob SQL efetivo, resultados de alias iFood, KDS físico, pronta por praça ou implantação. Não equivalem à auditoria SQL administrativa paralela.

## Condições obrigatórias antes da próxima intervenção no Reader

1. **Revisão de diff e integridade:** confrontar a candidata com os bytes instalados e com o supervisor; preparar bundle versionado/pinado, preservar uma única instância e evidenciar alteração mínima (hash + filtro de origem).
2. **Isolamento de consulta:** encontrar mecanismo que confira revisão nativa íntegra sob o SQL atual **RCSI OFF / SNAPSHOT OFF** com custo e impacto aceitáveis. Não executar `ALTER DATABASE`, não presumir que duas leituras idênticas são prova formal de snapshot e não abrir locks prolongados sem autorização/prova.
3. **Migração de checkpoint, sem duplicidade:** construir ensaio offline sobre dados inteiramente fictícios que preserve continuidade e não reemita nenhum dos 250 registros antigos como novos; definir política para pedidos abertos durante a migração, backup, restauração, verificação de digest/arquivo e rollback.
4. **Drenagem e recuperação:** o supervisor atual pode encerrar processos filhos; demonstrar checkpoint estável, cópia íntegra, tempo máximo, retorno e ausência de pop-ups antes de parar/reiniciar serviço.
5. **Somente depois**, avaliação controlada real do Itaim sob a identidade do Reader; conteúdo de pedido real exige escopo próprio e proteção de PII. Conferência/iFood e “pronto físico” continuam gates separados. A Home do Delivery OS não deve declarar operação viva antes deles.

**Estado:** `READ_PROTECTED_PATHS=YES`; `SQL_SESSION_IDENTITY=PROVEN_BY_OTHER_ADMIN_AUDIT`; `CANONICAL_V2_REVIEW_CANDIDATE=CODE_READY`; `CANONICAL_SAFETY_TESTS=PASS`; `RCSI_OFF=OBSERVED`; `ROWSET_ATOMICITY=UNKNOWN`; `CHECKPOINT_MIGRATION=NOT_IMPLEMENTED`; `LIVE_READER_CUTOVER=NO`; `PRINT=NO`; `RELEASE=HOLD`.
