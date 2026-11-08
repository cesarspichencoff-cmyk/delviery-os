# TATÁ Comandas — ficha mínima B0.5 de origem iFood/ForSale (Itaim)

**Situação:** procedimento preparado em 01/11/2026, **NÃO EXECUTADO NO RETAIL**. Aplicável apenas a consulta acompanhada por responsável com permissão legítima. Não é autorização para acessar configurações, nem evidência de primeira impressão. PR #127 permanece DRAFT/HOLD.

## Objetivo e fronteira

Resolver **em qual filial, loja e caixa a integração `IFO` cria a comanda ForSale**; não presumir que o computador `CAIXA_MOOCA` seja o emissor. O resultado escolhe o **alvo técnico para investigação B1** (primeiro despacho nativo de produção), sem imprimir, alterar parâmetros, ler pedido ou consumir sequência.

**Permissões necessárias:** alguém já autenticado e autorizado a visualizar essas telas, com responsável acompanhando. Nenhum token, senha, cookie, sessão, documento do cliente, código de autorização, número de venda ou foto completa de tela deve ser coletado. Se a tela exigir **Editar**, elevar privilégio, abrir aba **Token** ou revelar segredo: **interromper** e registrar apenas `ACCESS_DENIED_OR_SENSITIVE_SCREEN`.

## Rota decisória conforme manual da Teknisa

**A — A origem `IFO` está vinculada à unidade Itaim?**

Em `Parametrização → Vendas → Integração → Cadastro de Integração`, localizar o identificador **IFO**, conferir apenas que a **Unidade** pertinente é a do Itaim e ler o indicador **Utiliza Loja e Caixa do Vendedor Padrão**. **Não editar, ativar, desativar ou salvar.** O exemplo do manual (filial 0005) é fictício para a TATÁ; não copiar valores de exemplo.

- **`NÃO`:** segundo o manual, a aba **Unidade** exige **Loja** e **Caixa** por filial. Conferir apenas o par de códigos não sensíveis caso apareça numa superfície já liberada, **sem abrir `Token`**. Se os valores só aparecerem numa tela com token, marcar `MAPPING_NOT_VISIBLE_WITHOUT_SECRET`; não tentar alternativa.
- **`SIM`:** **não** atribuir o pedido ao caixa local por inferência. Consultar a unidade Itaim em `Parametrização → Vendas → Parâmetros de Gestão de Vendas → Delivery`, aba **Parâmetros**, e localizar apenas o **código do Vendedor Padrão** (sem dados de consumidor). Depois, em `Parametrização → Vendas → Caixa → Cadastro de Caixa`, filtrar **Unidade + Loja** e, para os caixas com modalidade delivery, verificar **Parâmetros → Vendedores Associados**. A identidade de vendedor deve bater **exatamente**. Se houver zero ou múltiplos caixas candidatos, **não escolher por nome, estação ou horário**; `SELLER_CASHBOX_AMBIGUOUS_OR_MISSING`.

**B — Existe sincronização de delivery centralizado?**

A documentação mostra `Cadastro de Caixa → Parâmetros → Frente de Caixa → Frente Caixa (3) → Sincronização com Delivery`, indicador **Realiza sincronização com Delivery Centralizado**. Só observar se esse indicador estiver disponível **sem editar**. O valor `SIM`/`NÃO` não identifica o executável emissor, não atesta a topologia e **não autoriza mudança**.

**C — Como delimitar o próximo alvo?**

Com `IFO`, unidade, loja, caixa e vínculo de vendedor quando aplicável **observados** (sincronização centralizada é verificação adicional opcional), o próximo alvo é o **componente/serviço de integração legitimamente identificado para aquele caixa**, a localizar por fonte de instalação/versão permitida. Não presumir `FosExp.exe`, `Account::order`, `ImpressaoDelivery`, Gestor iFood, GP iFood ou uma fila Windows como primeiro despacho só porque estão instalados.

## Registro mínimo sem dados pessoais

Não salvar uma exportação indiscriminada de configuração. Uma nota técnica separada, autorizada e revisada pelo responsável pode conter apenas os campos abaixo; **a ficha em si não declara seus valores presentes na operação**:

| Campo observável | Valor seguro permitido | Significado |
|---|---|---|
| unidade | `0001` se realmente observada | Escopo da consulta, não configuração presumida |
| projeto de integração | `IFO` / `NOT_VISIBLE` | Nome do conector, não credencial |
| loja e caixa via vendedor padrão | `SIM` / `NÃO` / `UNKNOWN` | Define qual ramo consultar |
| vendedor padrão | código interno não identificável de cliente, ou `UNKNOWN` | Somente no ramo `SIM` |
| loja/caixa candidatos | códigos mínimos, se não sensíveis e autorizados | Evidência, não identificação do emissor |
| vendedor associado ao caixa | `MATCH` / `NO_MATCH` / `AMBIGUOUS` / `NOT_VISIBLE` | Sem nome de funcionário ou dado pessoal |
| sincronização centralizada | `SIM` / `NÃO` / `NOT_VISIBLE` | Não comprova emissão |
| evidência da tela | data local e referência de superfície consultada | Sem screenshot integral, token ou conteúdo de pedido |
| acesso | `VIEW_ONLY` / `ACCESS_DENIED` / `SECRET_SCREEN_REQUIRED` | Impede reconsulta indevida |

**Resultado por classe:** `B05_UNVERIFIED` (até observação real); `B05_MAPPING_AMBIGUOUS_HOLD` (zero/múltiplos candidatos, vínculo inconsistente, tela protegida); ou `B05_MAPPING_REVIEWED_ONLY` (vínculo visual coerente, autorização/versão atuais verificadas). **Nenhuma das classes significa `FIRST_NATIVE_DISPATCH_PROVEN`, `PRINTED` ou liberação operacional.**

## O próximo B1, depois do B0.5

Pedir aprovação **específica da fonte**, dispositivo e método read-only para verificar um **evento natural** da mesma revisão de comanda `DLV_IFO` com: chave composta nativa, primeira tentativa distinta de reimpressão, componente/callsite e hash, transporte efetivo (ponte/PHP/arquivo), praça, destino principal e backup. Usar metadados mínimos; não criar pedido, monitorar indiscriminadamente, capturar payload ou habilitar reimpressão. Se não for possível sem segredo ou mudança em produção, parar.

O B1 não substitui a sequência TATÁ de 3 dígitos persistida sob chave forte, ausência de emissão dupla, preservação fiscal/mesa/balcão e piloto físico com autorização específica.

## Referências e ressalva de versão

- [Teknisa — Manual Integração iFood 4.2.0](https://ead.teknisa.com/wp-content/uploads/2025/11/Manual-Integracao-Teknisa-iFood.pdf), seções **3.a (Vendedor Padrão)**, **3.d (Caixa Associado ao Vendedor)**, **5.b (Identificador IFO / loja e caixa padrão)**, **5.d (Loja e Caixa por filial)** e **7.a (sincronização centralizada)**.
- [Auditoria do caminho de impressão e seus transportes](AUDITORIA_TRANSPORTE_NATIVO_TEK_IMPRESSAO_20261027.md).
- [Protocolo de leitura passiva e efeitos permitidos](PROTOCOLO_OBSERVACAO_PASSIVA_PRIMEIRO_DESPACHO_20261028.md).

A interface documentada usa exemplos e prints históricos de outra unidade. A documentação **não comprova os valores ou a disponibilidade real** do Retail do Itaim em 2026. Se a UI for diferente, não improvisar ações de configuração.

**Estado:** `B05_UNVERIFIED`; `FIRST_NATIVE_DISPATCH=UNKNOWN`; `PR_DRAFT_HOLD=true`; `PHYSICAL_PRINT_NOT_PROVEN=true`. **Nenhuma consulta, escrita, login ou impressão executados por este arquivo.**


## Validador offline da transcrição — 01/11/2026

O contrato `tools/comandas_ifo_retail_mapping_v1_offline.cjs` e sua suíte `tools/verificar_comandas_ifo_retail_mapping_v1_offline.cjs` verificam **somente dados de demonstração ou transcrição futura explicitamente autorizada**; não consultam a interface da Teknisa nem contêm credenciais. A verificação exige ramo `DEFAULT_SELLER` ou `PER_UNIT` consistente, exatamente **um** caixa candidato **na filial e loja nativas `0001/01`**, códigos no formato permitido, loja compatível com o Reader (`0001/01`). O indicador de sincronização centralizada pode permanecer `UNKNOWN` sem bloquear **somente a revisão da associação**: sua ausência continua impedindo afirmar topologia e primeiro emissor. Ausência de vendedor, dois caixas associados, loja divergente, campos desconhecidos ou informações sensíveis embutidas produzem `HOLD`.

Mesmo para uma transcrição sintética completa, o máximo é `MAPPING_CANDIDATE_REVIEW_ONLY`: a fonte é declarada por quem preencheu, **não foi autenticada independentemente**, e não comprova que a integração esteja ativa, qual host faz a primeira tentativa nem se houve impressão. O validador não emite número de caixa ou vendedor como resultado e preserva `can_print=false`, `can_authorize_cutover=false` e `live_native_first_dispatch_proven=false` em todos os caminhos. A integração na CI verifica apenas a regressão de código no Linux e Windows.

**Limite importante:** a regra de uma associação única é condição conservadora de seleção de **um candidato para investigação**, não alegação de que o Retail real proíba caixas múltiplos. Se existirem vários, o procedimento deve descobrir a regra legítima que determina a origem, não selecionar arbitrariamente a primeira opção nem alterar o cadastro.


### Ajuste do escopo da associação por loja

O Reader só pode avaliar uma comanda de `CDFILIAL=0001` e `CDLOJA=01` nesta revisão. Associações do mesmo vendedor ou filial com a **loja 02** não são uma duplicidade de caixa da loja **01**. A rotina offline primeiro restringe o vínculo ao vendedor (quando aplicável) e depois à **loja 01**, exigindo **um único caixa candidato nessa loja**. Dois caixas na loja 01 continuam `HOLD`; ausência de loja 01, associação inexistente ou formato inválido também continuam `HOLD`. Mesmo com um candidato, o resultado permanece exclusivamente `MAPPING_CANDIDATE_REVIEW_ONLY` e não autentica o Retail, o host ou o despacho.

A sincronização centralizada é observação **opcional** para esta etapa; quando o campo estiver ausente ou declarado `UNKNOWN`, o resultado mantém `centralized_delivery_flag_claim=UNKNOWN`. Um valor ausente não é inferido como `SIM` ou `NÃO` nem autoriza nenhuma operação.

## Confirmação humana do equipamento físico — 02/11/2026

**Nova evidência de autoridade humana:** César confirmou explicitamente que o computador remoto denominado `CAIXA_MOOCA` é um computador **do Itaim**. Essa declaração encerra a incerteza sobre a **localização física do equipamento**. O nome Windows do host permanece `CAIXA_MOOCA`, sem inferência de que pertença à unidade Mooca. Evidência de origem: confirmação do responsável na conversa do projeto em 02/11/2026.

**Essa confirmação NÃO equivale a** comprovar que esse host é o **caixa lógico** do Retail, que seja o emissor configurado da origem `IFO`, nem que seu processo seja o primeiro despachante. As provas B0.5 ainda exigem filial, loja, caixa e o ramo de parametrização via vendedor padrão ou por unidade. `PHYSICAL_PC_UNIT=ITAIM_OPERATOR_CONFIRMED`; `IFO_LOGICAL_CASHBOX=UNKNOWN`; `FIRST_NATIVE_DLV_IFO_DISPATCH=UNKNOWN`.

**Consulta passiva de processos no computador confirmado como Itaim:** `list_processes` do acesso autorizado encontrou `Perifericos.exe` (1 instância), `FosExp.exe` (1), `Gestor de Pedidos.exe` (6), `Impressora GP iFood.exe` (3), `spoolsv.exe` (1), entre outros. Nesse instantâneo **não** foram listados `FosImp.exe` ou `FosSinc.exe`, observados em instantes anteriores. Lista instantânea **não** comprova processo permanentemente ausente, configuração de impressão ligada, múltiplas impressões, gargalo de operação, papel impresso, origem IFO ou o componente responsável. Não inferir que múltiplas instâncias do Gestor/GP geram duplicatas.

**Roteamento corrigido:** não suspender a investigação pela palavra `MOOCA` do nome do dispositivo; prosseguir no host comprovadamente Itaim, mas manter o `B05_UNVERIFIED` para o **cadastro lógico Retail** e `PILOT=HOLD`. Não solicitar novo contato com a Teknisa, conforme decisão expressa de César. Preservar leitura passiva, sem acesso a parâmetros protegidos, tokens, SQL, documentos de clientes, processamento real, fila de impressão, serviço, instalação ou qualquer emissão física.

**Próximo passo verificável:** localizar uma superfície **legítima, já autenticada e estritamente visual** do Retail que exiba `IFO → filial/unidade → loja/caixa`; se existir, transcrever somente códigos não sensíveis e a referência da tela, sem clicar em editar/salvar, aba Token ou abrir segredo. Se a interface não for alcançável pela ferramenta conectada, registrar `B05_SOURCE_ACCESS_UNAVAILABLE` e não substituir esse dado por nome de computador ou processo.

## Evidência passiva de diretórios de venda — não equivale a vínculo IFO (08/11/2026)

**Leitura estritamente passiva, somente metadados/contagens, no `CAIXA_MOOCA` (host físico do Itaim).** Não houve CMD, PowerShell, SQL, consulta ao Retail, leitura de token, gravação em disco, alteração de processo/serviço, acesso ao spooler, impressão ou cópia de pedido.

- A árvore existente `C:\Teknisa\LOG\vendaApi\NRORG_5315\` contém diretórios `CDFILIAL_0001_CDCAIXA_003`, `004`, `005`, `006`, `007`, `008`, `009` e `010`. **Não foi identificado diretório `001` ou `002` nesse nível**; trata-se de presença/ausência de pasta observada, não de inventário de todos os caixas cadastrados, ativos ou conectados ao iFood.
- No `...\CDFILIAL_0001_CDCAIXA_003\2026_11\`, há arquivos de 06/11/2026 já existentes (`06-11-2026.txt` e `VENDAS_06-11-2026.txt`). Trechos amostrados por leitura passiva do arquivo principal **não exibiram ocorrência literal de `DLV_IFO` ou `iFood`** na amostra. Não foi analisado o arquivo todo, nem realizada reconciliação de pedidos.
- O log nativo `C:\Teknisa\LOG\logException\NRORG_5315\logException_06_11_2026.txt` (731 bytes, 5 linhas declaradas no metadado) registra erro de deadlock em `SQL_ITENS_DETALHADOS` às **21:12:59 BRT**, compatível com o incidente já documentado. **Não contém marcador literal iFood/DLV_IFO na leitura feita.** Isso confirma o erro SQL registrado, não o fluxo de ingestão ou causalidade do Reader.
- Em `C:\ProgramData\TataComandaReader\state\reader-heartbeat-v1.json`, registro existente atualizado em **08/11/2026 04:20:31 BRT**, último lote `#14506` `OK`, contador cumulativo de falhas `605`, falhas consecutivas `0`, sem efeito de impressão ou escrita SQL declarado. Um heartbeat não comprova paridade integral entre pedidos do iFood e a Teknisa.

**Difference check contra o candidato já observado:** `data/tata_reader_closed_delivery_fail_closed_and_native_fiscal_8332_20261005_v1.json` documenta **uma** venda fiscal de origem `DLV_IFO` com `CDCAIXA=001` em 05/10/2026 (filial/loja não atestadas nessa fonte). A existência de pastas de logs `003–010` em outro subsistema e data **não desmente** esse fato, nem prova que a integração use `003` ou `001`. `FISCAL_SALE_CASH_ID != INTEGRATION_SYNCHRONIZER_PROVEN`.

**Decisão e próximo portão:** `B05_UNVERIFIED` permanece. Não investigar a origem do iFood por presença de pasta, nome de processo `FosSinc`, código de caixa na venda fiscal ou consulta SQL improvisada. O único portão de identificação é um **vínculo real `IFO → unidade → loja/caixa`**, em fonte de configuração já autorizada e legível sem acessar a aba Token, editar, elevar privilégios ou perturbar caixa. Se indisponível, registrar `B05_SOURCE_ACCESS_UNAVAILABLE`. A investigação de primeira impressão e qualquer extensão da candidata `SERIALIZABLE` permanecem `HOLD`.

## Verificação do observador local e acesso ao Retail (08/11/2026)

**Fatos observados passivamente (CAIXA_MOOCA = PC físico do Itaim), sem execução de código ou SQL:**

- `C:\ProgramData\DeliveryOS-Itaim-Observer\status.json`: registrado em `2026-11-08T07:39:40Z`, `state=OUTSIDE_SERVICE_WINDOW`, `sourceMode=CONTROL_DIAGNOSTIC_NOT_REAL_PROOF`, `liveSourceVerified=false`, `operationalOrderTotal=null`, `noActionExecuted=true`, `customerDataExported=false`.
- `...\last-window-status.json`: registrado em `2026-11-08T01:59:39Z`, `state=UNAVAILABLE`, `reason=SOURCE_REVISION_PENDING`, `sourceMode=CONTROL_DIAGNOSTIC_NOT_REAL_PROOF`, `liveSourceVerified=false`, `operationalOrderTotal=null`.
- Trechos dos arquivos já instalados `observer.cjs`, `copiloto_tata_reader_adapter_v1.cjs` e `copiloto_tata_file_feed_v1.cjs` demonstram que este mecanismo usa os **eventos/checkpoint locais do TATÁ Reader**, adapta as revisões e exige fonte autenticada. Sua estrutura **não constitui um observador independente da entrada de pedidos iFood no Retail**. O estado `UNAVAILABLE` não comprova ausência de pedidos no restaurante, apenas impossibilidade desse observador de atestá-los na janela registrada.
- Tentativa de descobrir sessão de navegador já conectada: a superfície Browser informou que não há contexto de origem autorizado nesta conversa, e o conector Opera informou estar desconectado. **Nenhuma página do Retail foi aberta**, nenhum login/token foi usado, nenhuma tela foi manipulada. `B05_RETAIL_UI_ACCESS=UNAVAILABLE_IN_CURRENT_CHAT`.

**Confronto de evidências:** o Reader pode estar `RUNNING` e seu contador de batches avançar enquanto esse observador permanece `CONTROL_DIAGNOSTIC_NOT_REAL_PROOF`. Os dois sinais não são uma reconciliação independente `pedido aceito no iFood → comanda completa na Teknisa`. Não promover um status local, nome de processo, pasta de logs ou campo autoemitido a prova de configuração `IFO → loja/caixa`.

**Decisão:** manter `B05_UNVERIFIED`, `INGRESS_IFOOD_RUNTIME=UNKNOWN`, `N2_B_COMPLETENESS=UNKNOWN`, `STAGE_3=IN_PROGRESS`, `STAGE_4=NOT_AUTHORIZED`, `PRINT/CUTOVER=HOLD`. O próximo salto exige fonte **independente** e legitimamente acessível da integração (vínculo real Retail `IFO → unidade → loja/caixa` e, posteriormente, evidência do início/final do pedido). Sem esse acesso, não repetir caminho equivalente no observador, nem realizar captura, instrumentação ou SQL no caixa.

