# TATÁ Comandas — missão autônoma para Claude: decifrar o que chega às impressoras do Itaim

**Data:** 02/11/2026  
**Nova decisão de César:** **NÃO utilizar pessoas para registrar comandas manualmente nem exigir censo humano de papel.** Investigar e provar tudo que for possível autonomamente a partir das evidências e fontes técnicas já existentes, com análise independente por Claude Code. A proposta anterior de censo presencial está **SUPERSEDIDA como plano de execução**. A autorização anterior para observação passiva de papel **não** autoriza automaticamente leitura de payload privado, logs de clientes, captura de impressão ou alteração de equipamento.

**Esta missão é um handoff publicado no GitHub, NÃO um trabalho executado pelo Claude.** Não assumir acesso ao computador operacional a partir do fato de existir uma PR; começar pelo repositório. A documentação e todos os exemplos têm estados próprios de prova.

## Identidade e entrada canônicas

- Repositório: `cesarspichencoff-cmyk/delviery-os` (grafia exata).
- Branch de trabalho de referência: `audit/comandas-attempt-scope-20261102`, PR #130 (**Draft / sem merge / sem deploy**).
- PR #130 deriva da PR #127, branch `audit/comandas-shift-contract-20261026`. Não mexer no HEAD de nenhuma dessas branches ao investigar; usar branch separada para código candidato.
- Ler primeiro `CLAUDE.md`. Para VÉRTICE 2.2, repo `cesarspichencoff-cmyk/vertice-runtime.` (ponto final no nome), branch `vertice-active`, `VERTICE_ENTRY.md`. HEAD canônico revalidado em 02/11: `10efc5185d8c5c6e8c76a98664e8bbca37d71c2b`. O SHA `912a02f` do arquivo Entry é **blob SHA**, não HEAD da branch.
- César confirmou que o dispositivo chamado `CAIXA_MOOCA` é fisicamente **do Itaim**. Nome Windows não determina caixa lógico do Retail, nem seu caminho de impressão.
- Nenhum contato com a Teknisa. Sem novos gastos de infraestrutura.

## Objetivo real (o problema a resolver)

**Descobrir autonomamente, com provas, como as comandas nativas iFood/Teknisa são geradas, quais campos realmente aparecem em cada tipo de via, em qual destino e em qual fluxo (automático, manual, relatório, fiscal), e se podemos manter a produção nativa e construir somente a conferência TATÁ — SEM precisar que funcionários anotem papel.**

Não afirmar que o conteúdo **desejado** pela TATÁ já é o conteúdo **real** impresso. Diferenciar:
`CONFIGURED_ROUTE` ≠ `SOURCE_TEMPLATE` ≠ `COMMANDS_QUEUED` ≠ `WINDOWS_SPOOLER` ≠ `DEVICE_RECEIVED` ≠ `PAPER_PHYSICALLY_OBSERVED`.
Código fonte prova capacidade/forma possível; só uma ocorrência legitimamente observada prova execução daquela rota.

## Matriz exata do que se sabe sobre o conteúdo das saídas

### A. Impressão nativa **de produção/cozinha** da Teknisa (não confundir com relatório de entrega)

**PROVADO no código-fonte do gerador local, NÃO como texto vivo universal de papel:**
- Item: **quantidade e nome**.
- Observação de item na impressão de produção: `TXPRODCOMVEN`, vinculada à linha nativa; não é a mesma coisa que `DSOBSCOMANDA`.
- Destino técnico vem de `printerInfo` e configuração de produto; pode haver `impressoraProducao`, `impressoraProducao2`, `impressoraPuxa`; duas rotas cadastradas não significam duas vias obrigatórias de mesma praça.
- Em determinado ramo `tipoVenda='C'`, o código pode formatar `COMANDA.: DLV_<NRCOMANDA>`.
- **Divergência factual importante:** o documento `docs/Print_Topology_Production_Ticket_Source_Map_V132.md` diz que a via física examinada em 30/09 **NÃO continha** `DLV_<NRCOMANDA>` **nem** `SENHA`. Portanto a presença desses marcadores **não é um invariante** da produção real. Nunca forçar a associação de papel por número curto/horário.
- A via de produção examinada não traz `NRCOMANDAEXT` nem `CDPRODUTO` diretamente segundo o mapeamento de fonte. A embalagem física `CX 240/450/650...` é projeção do motor TATÁ; **não** afirmar que a Teknisa já imprima a caixa TATÁ.
- Não há prova independente de que a primeira produção nativa **DLV_IFO** passe pelo PHP inspecionado. O caminho alternativo ForSale/Delphi/ponte segue `FIRST_NATIVE_DISPATCH=UNKNOWN`.

Fonte: `docs/Print_Topology_Production_Ticket_Source_Map_V132.md`, `docs/comandas/AUDITORIA_TRANSPORTE_NATIVO_TEK_IMPRESSAO_20261027.md`, `docs/comandas/MAPA_ROTINAS_NATIVAS_FORSALE_DELIVERY_IMPRESSAO_20261101.md`.

### B. **Relatorio De Entrega** nativo (possível papel de caixa, **não** cozinha)

**PROVADO na leitura do código do relatório, não a execução atual:**
- Cabeçalho literal `Relatorio De Entrega`.
- `NRCOMANDA`; `NRCOMANDAEXT` condicional para origem de marketplace compatível.
- Produtos com código, nome e quantidade.
- Observação por item **mesclada** de `DSOBSDESCIT` + `DSOBSPEDDIGCMD`: a linha impressa não preserva a proveniência separada dos dois campos.
- Observação da comanda `DSOBSCOMANDA`, usualmente sob `OBS.:`.
- **Não** contém `NRVENDAREST` nem `TXPRODCOMVEN` naquele relatório.
- Campos estruturais pessoais **podem** incluir cliente, telefone, endereço, pagamento e totais; observações de texto livre também podem conter PII. **NÃO transferir texto bruto ao Claude/nuvem, GitHub ou chat**.
- É gerado por `ImpressaoDelivery::imprimeDelivery` e existe ramo **pós-venda** controlado por `CAIXA.IDIMPAUTENTREG='S'`, mais dois caminhos manuais/reimpressão. Desligar esse flag global não neutraliza produção nem reimpressão.
- Impressora do relatório depende de `BUSCA_IMPRESSORA_DELIVERY`/`CAIXA.NRSEQIMPRLOJA7` com fallback `NRSEQIMPRLOJA3`; **não usar esse destino como identidade da primeira via de produção**.

Fontes: `docs/Passive_Print_Log_Shadow_V132.md`; `docs/comandas/AUDITORIA_RAMOS_IMPRESSAO_RELATORIO_DELIVERY_VS_PRODUCAO_20261027.md` (arquivos `ImpressaoDelivery.php`, `Venda.php:469–499`, `MSDEQuery.php:4815–4821` e caminhos manuais identificados).

### C. **Gestor iFood** e **Impressora GP iFood** (dois emissores independentes)

**PROVADO no código instalado em 27/10:** `Impressora GP iFood` 1.2.0 tem servidor local HTTP `POST /print`, porta padrão 4013; `Gestor de Pedidos` 8.10.4 também pode imprimir pelo evento Electron `printOrder` via IPC, sem passar necessariamente pelo endpoint do GP. Ambos usam biblioteca `@ifood/thermal-printer` 1.0.32 e caminho Windows/RAW. O `printOrderReply` pode ser enviado **antes** do resultado assíncrono; `Successfully printed` não é comprovante físico. Um `jobId` também não é papel.

**NÃO PROVADO:** quais campos aparecem no conteúdo real `invoice` impresso no Itaim, quais filas configuradas são usadas por cada app, se a impressão automática está ativa hoje, se GP e Gestor estão efetivamente emitindo, se há sobreposição com o nativo. César relatou que a impressão do Gestor estava desativada como modo normal em 25/10; isso é contexto operacional, não aferição contínua. Nunca ativar essas opções para “testar”.

Fonte: `docs/comandas/AUDITORIA_IFOOD_DOIS_CANAIS_IMPRESSAO_INSTALADOS_20261027.md`.

### D. Fiscal e outros papéis

NFC-e e relatório fiscal pertencem ao Retail/Teknisa e **NÃO podem ser confundidos com via de produção ou de conferência**. Um pedido `DLV_IFO` de 05/10 teve venda fiscal no `CDCAIXA=001`, conforme `docs/Fiscal_Observation_Architecture_2026-10-05.md`, mas esse é o **caixa da venda**. Não confirma `IFO→caixa de origem` nem caminho de impressão de produção. Sem novo acesso SQL. `IDSTCOMANDA=3/P/X` não é semântica comprovada de primeira impressão.

### E. Modelo de impressão **TATÁ proposto / shadow**, NÃO saída que já existe

Fontes: `docs/Production_Ticket_Operational_Spec_V1.md`, `docs/Comandas_Producao_Conferencia_V45_Shadow_20261008.md`, `docs/Comandas_TATA_Replay_Real_ESC_POS_V46_SHADOW_20261008.md`, `docs/Comanda_Conferencia_V43_Shadow_Checkpoint_20261008.md`, `src/production/operationalTicketsV45.ts`, `src/production/operationalTicketEscposV46.ts`, `src/production/productionTicketV2.ts`.

**Produção desejada:** nome da PRAÇA em destaque; TATÁ sequência `001–999` somente quando PERSISTIDA (ex. `037` nos desenhos é FICTÍCIO); hora original; identificadores TEKNISA e iFood quando comprovados; caixa numérica/montagem do motor (não inferida do ticket nativo); QUANTIDADE + PRODUTO COMPLETO em maiúsculas, numa linha quando fisicamente possível; observação **imediatamente abaixo do próprio item**; observação geral separada; ingredientes/finalização apenas com regra comprovada; campo de conferência/finalização; nada de endereço/telefone/pagamento de cliente.
**Conferência TATÁ desejada:** modelos `240/450/650/750/1000/1500/1600`, variantes `C1/C2/C3` só se provadas, `Op. ______` **por caixa**, sacolas, kits por nome+quantidade sem componentes, apenas `GARI/WASABI/TARE` quando explícitos, quantidade de produtos ≠ quantidade de peças. Itens sem embalagem comprovada continuam `A CONFERIR`; separação frio/quente. **É um novo documento independente**, não uma via nativa já demonstrada.
Bobina 80 mm, área útil planejada ~72 mm, fonte B 64 colunas em replay ESC/POS **não calibrado**, acentos, densidade/corte/largura ainda não aprovados em dispositivo físico. `CODE_READY`/`SHADOW_TEST_PASS` ≠ papel real.

### F. Logs naturais, filas, delimitadores e formatos existentes

- `docs/Print_Topology_Production_Ticket_Source_Map_V132.md`: ramo Odhen/Periféricos `PRINT GENERATOR→sendPrint→POST /print→saveItemRequest→arrFila→printDocs→printCommands→LogIMP→formatTX/printer library→destino`. `LogIMP` pode escrever o **texto completo** do comando em arquivos `Log\\<MêsAno>\\<AAAA_MM_DD>_IMP_<modelo>_<porta>.txt` ou nome genérico `_IMP.txt`; pode conter PII.
- `data/tata_reader_passive_print_log_source_proof_20261005_v1.json` e `data/tata_reader_passive_print_metadata_observation_20261005_v1.json`: arquivos `IMP` por destino existiam historicamente em 04/10; alguns registros eram textuais com marcadores `Pedido` e `Mesa`. Para a comanda de referência aberta às 22:58, os arquivos tinham parado de atualizar antes: **não** provaram sua impressão. Não extrapolar que esse log abrange todo `DLV_IFO`.
- `docs/Passive_Print_Log_Shadow_V132.md`: parser sintético existente, mas **a leitura de payload real e sua associação ao pedido não foram atestadas**. Logs brutos podem revelar cliente/endereço/pagamento. Hash, tamanho e data de arquivo comprovam no máximo arquivo/append; **não** papel ou identidade do pedido.
- `docs/comandas/AUDITORIA_TRANSPORTE_NATIVO_TEK_IMPRESSAO_20261027.md`: 3 transportes possíveis em `ImpressaoUtil`: `UTILIZA_IMPRESSAO_PONTE` (HTTP), `UTILIZA_IMPRESSAO_PHP` (direto `fopen/fwrite`), `impressaoDelphi->imprimeArquivo` (arquivo/serviço). Estado ativo por pedido **desconhecido**.
- `docs/comandas/AUDITORIA_ODHEN_HTTP202_FILA_BACKUP_20261027.md`: `res.json({status:202})` é campo do JSON, não comprovado status HTTP; significa entrada na fila própria, **não** papel. Worker pode mandar para **backup** ao falhar/expirar. Fila principal não basta.
- Epson na ponte pode usar DLL nativa `LibraryBridge.getLibrary('epson')` e `IniciaPorta`; não assumir intercepção via spooler Windows, nem desviar impressoras para `NUL`.
- Windows PrintService 307/estado `Printed` indica evento de fila, não prova papel nem identidade do emissor. PrintService pode não ver impressões Epson nativas. No `DELIVERY SUSHI 1`, 1.086 jobs de 22–26/10 foram **retidos** com `KeepPrintedJobs=true`; 204 receberam submissão durante horário de almoço relatado, 870 no jantar, 12 fora. **Não** são 1.086 pendentes nem 204 papéis desperdiçados. Risco: saída tardia ao ligar impressora e duplicação após backlog.
- `docs/comandas/MAPA_ROTINAS_NATIVAS_FORSALE_DELIVERY_IMPRESSAO_20261101.md`: `Pkg_Gpe00002.bpl` exporta slots BSS; `PKG_DLV00100.bpl` importa `ImprimeEntrega`/`DisparaImpressaoNaoFiscal`; `ImpPedido_Producao` tem callsite `E8` observado na vizinhança `btnImprimirClick` (manual). **Não confundir** com primeira via automática `DLV_IFO`. Sem acesso à memória protegida/ACL.

## Impressoras, serviços e identidade física do Itaim

**Cadastro Retail de 30/09, não aferição física presente** (`docs/Teknisa_Product_Printer_Routing_Proof_2026-09-30.md`, `docs/comandas/AUDITORIA_REVALIDADA_IMPRESSORAS_E_JANELAS_20261027.md`):
| Código | Destino físico nominal | Porta/IP cadastrado | Papel lógico |
|---|---|---|---|
| `00009` | `BALCAOSUSHI1` | `192.168.0.142` | Sushi 1 almoço |
| `00003` | `DELIVERY SUSHI 1` | `192.168.0.153` | Sushi 1 jantar |
| `00006` | `BALCAOSUSHI2` | `192.168.0.110` | Sushi 2 almoço; quentes também no jantar |
| `00004` | `DELIVERY SUSHI 2` | `192.168.0.4` | Sushi 2 jantar |
| `00002` | `COZINHA` | `192.168.0.116` | Cozinha almoço e jantar |
| `00007` | `BAR` | `192.168.0.232` | Bebidas/bar quando aplicável |
| não identificado | `CAIXA` | fila Windows `ESDPRT001` observada em 27/10 | eventual relatório/conferência, **não necessariamente exclusiva** |

Servidor Odhen Periféricos da exportação antiga: `192.168.0.24:3000`. Isto é **configuração registrada**, não prova de endpoint ativo nem autorização para conectá-lo.

Horários informados: almoço seg–sex `11:00–15:00`, sáb/dom `11:00–16:30`; jantar `18:00–23:00`. `DELIVERY SUSHI 1/2` relatadas desligadas no almoço; não concluir que houve papel ou que o relógio sozinho seleciona janela ativa. 463 produtos na matriz histórica, 346 com uma rota, 117 com duas, sendo 106 com os dois pares balcão/delivery sushi e **11 exceções de outra natureza**. `COMBINADO DUPLA` também possui exceção a confirmar. Não enviar simultaneamente aos dois membros do par por padrão.

O computador `CAIXA_MOOCA` pertence **fisicamente ao Itaim**, conforme César. A associação lógica `IFO→CDFILIAL 0001/CDLOJA 01→CDCAIXA` continua UNKNOWN. Registro fiscal único de 05/10 indica **candidato `001` como caixa da venda**, não cadastro IFO. Não executar SQL agregado sem autorização separada.

## Restrições não negociáveis (Claude deve conseguir produzir resultados úteis MESMO SEM ACESSO AO CAIXA)

1. **Sem participação operacional manual de funcionários** como método obrigatório, sem ficha de censo por pessoa, sem pedir foto ou transcrição humana de 40 pedidos. **Não recriar esse requisito com outro nome.**
2. Sem instalar watcher/agente no caixa, sem registrar payloads ou novos logs, sem abrir arquivos com nomes/endereços/observações privados, sem capturar conteúdo de impressão, sem screenshot de cliente, sem ler dados fiscais ou credenciais — **salvo autorização posterior específica e mecanismo legítimo**. Não usar canais alternativos para contornar ACL/cota.
3. Sem `POST /print`, imprimir, reimprimir, alterar parâmetros `IDIMPPEDPROD`/`IDIMPAUTENTREG`, ligar GP/Gestor, tocar filas, limpar backlog, iniciar serviço, fazer request para portas, atribuir sequência de produção, SQL operacional, fiscal/SEFAZ, merge/deploy/cutover.
4. Não reproduzir raw print bytes com PII no Git, Claude ou chat. Inverter a solução: somente **metadados estritamente necessários** e parser em sandbox com fixtures sintéticas, ou projeção **local e minimizada** numa fase autorizada separada. O texto livre pode conter PII mesmo depois de remover cabeçalho.
5. Todas as ações de análise offline e código **reversíveis, versionadas e testadas**. Produzir branch própria da PR #130, PR Draft isolada, saída de testes, diff, hashes. Não editar diretamente as PRs #127/#130.
6. **Sem confundir** `SPOOLER_OBSERVED`, `HTTP/queue ACK`, estado Windows, log `IMP` e `PHYSICAL_PAPER_PROVEN`. Sem sensor físico/prova independente, a última fica `UNKNOWN`; não inventar visão do papel.
7. Recursos atuais incluídos/gratuitos antes de soluções pagas; nenhum novo gasto.

## Plano investigativo recomendado para Claude — não censo manual

### Fase 1 — DECIFRAR formatos *por origem* apenas dos arquivos já existentes

Construir a **matriz de campos por via** (produção, entrega, GP, Gestor, fiscal a excluir, TATÁ shadow). Para cada campo: nome original, condição, origem código/linha, presença no comando impresso, marcador de tipo, destino, confiança, dados pessoais, versão de fonte. **Não** afirmar que conhecemos o `invoice` real de GP/Gestor sem fonte que o mostre.

Buscar em `src/shadow/passivePrintLog.ts`, `src/shadow/passivePrintTail.ts`, `src/production/operationalTicketEscposV46.ts`, `docs/Print_Topology_Production_Ticket_Source_Map_V132.md`, `docs/comandas/AUDITORIA_RAMOS_IMPRESSAO_RELATORIO_DELIVERY_VS_PRODUCAO_20261027.md`, fontes e fixtures commitados. Deduplicar linhas de produção que se repetem por `impressoraProducao2`. Não usar `CDPRODUTO` como campo físico se o renderer não o fornece. Confrontar divergência `COMANDA.: DLV_<N>` de código com impressão física observada sem o identificador.

### Fase 2 — COMPARAR caminhos automaticamente em simulação e evidência histórica

Propor e implementar (se viável) **verificador offline de proveniência e coerência**, com fixtures sintéticas e dados históricos já anonimizados:
- distinguir no máximo três classes de identidade: `ORDER_REFERENCE`, `PRINT_SUBMISSION`, `DEVICE_EFFECT_UNKNOWN`; não elevar automaticamente para papel real;
- associar **somente por chave forte/revisão comprovadas**, sem `NRCOMANDAEXT` curto, horário aproximado, nome da fila ou contador de arquivo como identidade única;
- comparar rotas esperadas por item e janela com destinos observados na evidência de metadados **sem alegar que a fila imprimiu**;
- estabelecer o que o log `IMP` cobre e quais caminhos ficam fora (GP/Gestor, Delphi, Epson DLL/backup);
- rejeitar colisões cross-scope e SHA maiúsculo (a PR #130 já corrigiu/testou) e ausência de cobertura;
- preservar distinção entrega vs produção vs fiscal vs reimpressão;
- produzir `SOURCE_PRINT_FORMAT_PROVEN` / `ORDER_TO_SUBMISSION_CANDIDATE` / `INSUFFICIENT_EVIDENCE`, nunca `WORLD_PROVEN` por simulação.

### Fase 3 — caminho autónomo para prova REAL se e somente se há fonte existente legítima

Se não houver fonte real de saída, **não pedir pessoas**; apontar o gate mínimo e desenvolver uma sonda **somente proposta**, estritamente passiva, de baixo impacto e sem conteúdo pessoal. Provar por teste offline que (i) não escreve em fonte, (ii) não transmite dados brutos, (iii) dados sensíveis não chegam ao resultado, (iv) falha do leitor não afeta a impressão, (v) cessa em ACL negada/cota, (vi) não cria job ou toca o spooler. Solicitar autorização específica antes de rodar no caixa se a sonda lê logs/impresões. Não afirmar que telemetria elimina incerteza do papel físico sem sensor ou comprovação independente.

**Decisão arquitetural:** preservar produção nativa se uma evidência automatizada forte demonstrar coerência e exclusividade **no nível de submissão**; declarar que `PAPER_PHYSICALLY_PROVEN` permanece não comprovado sem telemetria de hardware/testemunha independente. Se a implementação exige 10/10 de papel físico, especificar limite da automação atual — não prometer solução mágica.

## Entregáveis materiais, sem mais uma investigação circular

1. Documento curto e preciso com **matriz completa de campos que efetivamente o código manda imprimir por canal**, incluindo os que faltam/que parecem existir mas foram refutados em papel.
2. **Conector/parser shadow** ou prova negativa robusta, autocontido, que reúna dados **sem intervenção humana e sem alterar emissão**, teste diferencial vermelho→verde, CI Linux+Windows. Se não for possível provar runtime, escrever `CODE_ONLY` e por quê.
3. Matriz `campo → fonte → impressão → identidade → praça → evidência de efeito`; qual elo está faltando (sem misturar pedido, fatura, relatório, produção, entrega).
4. Plano de observação digital autônoma com custo zero e **sem depender do censo manual cancelado**; limites de autorização e privacidade.
5. **Veredito 10/10 adversarial:** decidir exatamente o que a análise autônoma resolve e o que não consegue observar, evitando afirmar que a existência de campos em código comprova o papel.
6. Link da PR Draft isolada, HEAD, diffs, runs de CI, evidências; nenhuma chamada operacional ou merge.

**Estado confirmado de partida:** `HUMAN_CENSUS_PLAN=SUPERSEDED_BY_CESAR`; `PRINT_PAYLOAD_FIELDS_SOURCE_LEVEL_PARTIAL`; `NATIVE_FIRST_DLV_IFO_SUBMISSION=UNKNOWN`; `IFO_LOGICAL_CASHBOX=UNKNOWN`; `ACTUAL_PAPER_CONTENT_COMPLETE=UNKNOWN`; `TATA_SEQUENCE_LIVE=UNKNOWN`; `PRODUCTION_ALTERATION_AUTHORIZED=false`. Não converter o desejo de autonomia em prova que não existe.
