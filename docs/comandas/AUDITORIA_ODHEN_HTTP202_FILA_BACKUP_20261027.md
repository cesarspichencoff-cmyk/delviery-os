# Odhen Periféricos — campo JSON status 202, fila e impressora reserva

**27/10/2026 · TATÁ Comandas · PR #127 · inspeção somente de código instalado na CAIXA_MOOCA**

## Descoberta material

**Precisão de protocolo:** a função examinada usa `res.json(response)` com um campo `status: 202`; ela **não chama `res.status(202)`** nesse trecho. O status HTTP efetivo depende do servidor/middleware e não foi medido. Não declarar que a resposta tem HTTP status 202.

A ponte Odhen de impressão mantém uma fila própria e reconhece o recebimento de solicitações antes de existir confirmação de papel físico. Além disso, o worker pode encaminhar determinados trabalhos a **outra impressora, de backup**, caso haja erro ou timeout. O projeto não pode tratar `/print` retornou `status: 202` no JSON como impresso nem considerar suprimida uma comanda antiga apenas porque sua primeira impressora foi neutralizada.

## Evidência localizada e limites

- `C:\TEKNISA\odhen-perifericos\routes\imp.js:10–45` — `router.post('/print')` valida o modelo/porta, chama `printer.saveItemRequest(printerInfo, req.body.commands)` e responde pelo método `res.json(...)` com o campo `status: 202` e mensagem `Impressao salva com sucesso`. Esse retorno provém da **submissão para armazenamento/fila interna**, não da verificação de saída de papel.
- `src/IMP/index.js:90–113` — `saveItemRequest` registra `printerInfo.commands`, `date`, `servico` e opção `printerInfo.impBackup`, e chama `dbModel.saveItem`. A descrição/identidade do pedido iFood e a primeira via **não são atestadas por esse trecho**.
- `src/IMP/index.js:114–125` — quando `impBackup` existe, `enviaDocImpBackup` cria destino alternativo e envia `process.send({cmd:'enviaDocImpBackup', ...})`. O destino de backup real da unidade **não foi lido nem comprovado**.
- `src/IMP/index.js:156–220` — o worker usa `printCommands`, remove da fila após resolução, marca `ERROR` em falhas e pode chamar `enviaDocImpBackup` quando o item com erro persistente é retirado (linhas 171–180) ou quando expira o timeout ao tentar abrir a porta (linhas 203–218). Os ramos que encaminham backup estão presentes no **código instalado**. Isso não prova quantos foram executados no período.
- `src/IMP/PrinterLibraryHandler.js:145–148` — Epson usa biblioteca de fabricante. A presença de uma fila Windows para a Epson não comprova que essa biblioteca a utilize como caminho real; `NUL` permanece alternativa não demonstrada para esse backend.

Essas fontes já foram verificadas por hash SHA-256 nesta investigação, conforme [auditoria de transporte](AUDITORIA_TRANSPORTE_NATIVO_TEK_IMPRESSAO_20261027.md). Não foram consultados pedidos, clientes, payloads da ponte, banco da fila, logs de impressão ou configurações contendo credenciais. Não foi executado `POST /print`.

## Correção implementada, sem efeitos operacionais

- Novo `tools/comandas_peripheral_bridge_ack_backup_v1_offline.cjs`: módulo puro que trata `HTTP_202_QUEUED` como confirmação **somente da aceitação na fila** e exige censo explícito tanto da rota principal quanto da **possível rota de backup** antes de admitir uma candidatura de revisão de cutover. Se a existência/estado da reserva não estiver demonstrado, responde `HOLD`. Mesmo com alegações positivas, `ready_for_cutover=false`, `can_change_peripheral=false`, `all_physical_legacy_outputs_suppressed=false` e nenhum efeito.
- `tools/verificar_comandas_peripheral_bridge_ack_backup_v1_offline.cjs`: **19/19** cenários de regressão, incluindo backup ativado/desconhecido, reserva não coberta, fonte fiscal indevida, `202` falsamente promovido a papel e claims de autorização sem efeito.
- Integração a `tools/comandas_legacy_virtual_cutover_review_v1_offline.cjs`: sempre que o modo alegado for `PONTE_HTTP_PRINT`, o censo de fila/backup é necessário; ausência ou conflito retorna **HOLD**, mesmo se os outros nove gates de transição forem alegados. Os testes de cutover passaram **49/49**. Testes anteriores de modo nativo **24/24** e transporte **23/23** mantidos.
- CI Linux/Windows ampliada com a nova suíte. Prova local em checkout descartável Foxxy, commit `50fa29e7676e231588ff12ed7e7f2e25fac9ab2d`; `BRIDGE_BACKUP_REGRESSION=SUCCESS`. CI hospedada do HEAD final deve ser conferida separadamente.

## Atualização de segurança: backlog antigo continua existindo após desligar a origem

A ponte Odhen pode salvar o job em fila interna antes de imprimi-lo e, conforme erro/timeout, enviá-lo ao backup. Portanto **suprimir apenas novas submissões antigas não remove jobs antigos já aceitos**. A futura passagem ao emissor único exige comprovar **o censo de jobs antigos pendentes** e a reconciliação de **tentativas ambíguas**, independentemente de o destino principal e o backup terem sido mapeados.

O módulo `comandas_peripheral_bridge_ack_backup_v1_offline.cjs` passou a retornar `HOLD: QUEUED_OR_AMBIGUOUS_OLD_JOBS_NOT_RECONCILED` se qualquer evidência de backlog/reconciliação estiver ausente. Este é um contrato de revisão **sem leitura de banco, fila, spooler ou log**: entradas declaradas em fixture não representam prova da loja. Os testes passaram **19/19** no módulo e **49/49** no contrato de transição em clone descartável Foxxy no commit `9bbc91340e1099136b1ae1301e2f873feb9b8b96`. O código não limpa fila, não considera `status:202` do JSON como papel e não autoriza alternância automática dos emissores.

## Efeito sobre o plano operacional

Antes de desativar a via antiga do delivery, deverá ser comprovado **quem envia a primeira via de `DLV_IFO`**, qual backend está ativo, a configuração real dos destinos principal e reserva, e se o mecanismo de supressão abrange **ambos** sem afetar mesa, balcão, fiscal ou relatórios essenciais.

A ordem de preferência continua: suprimir de modo **específico na origem** se houver opção independente para as vias antigas do delivery; não usar `IDIMPPEDPROD=N` na configuração compartilhada do caixa; não criar uma porta `NUL` para impressoras Epson com backend não comprovado; e nunca interpretar `202`, `Printed` virtual ou job removido da fila como recibo físico.

**Estado:** prova de código + regressões offline. Nenhuma emissão, alteração do caixa, fila, Epson, Odhen, Tek, GP/iFood, sequência TATÁ, SQL, fiscal, deploy ou merge. PR DRAFT/HOLD.
