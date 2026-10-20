# Comandas V8.49 — contingência independente Gestor iFood x Teknisa (REVIEW ONLY)

**Data:** 20/10/2026. **Escopo:** proteger pedidos contra falhas de integração/impressão da Teknisa, sem perda silenciosa, sem duplicação de produção e sem ações no iFood ou na loja. PR #107 DRAFT/HOLD.

## 1. Comprovação externa, não confundir as duas capacidades do iFood

**Impressão nativa do Gestor de Pedidos:** o iFood documenta que o Gestor pode imprimir pedidos automaticamente quando uma impressora não fiscal está configurada, e manualmente pelo ícone de impressora. Registra itens, observações e o identificador do pedido. Isso é uma possibilidade no produto, **não é prova** de que esteja ativa ou fisicamente funcional na unidade.

- iFood para Parceiros, *Gestor de Pedidos* (atualizado em 07/07/2025): https://blog-parceiros.ifood.com.br/gestor-de-pedidos-ifood/comment-page-6/
- iFood para Parceiros, *Aceite automático* (documentação da navegação): https://blog-parceiros.ifood.com.br/aceite-automatico/ — `Gestor > Ajustes > Impressão > Impressão automática de pedidos`. **Este documento não autoriza alterar esse ajuste**; o aceite automático é outra função, não confundir com impressão.

- iFood para Parceiros, *Impressora para iFood* (17/02/2026): https://blog-parceiros.ifood.com.br/impressora-para-ifood/

**Eventos e consulta por API:** são um canal técnico diferente, dependente de autorização, credenciais, aplicação homologada e política do iFood. A documentação oficial oferece webhook/polling, `GET /orders/{id}` e deduplicação por ID de evento; descreve webhook com entrega ao menos uma vez, sem garantia de ordem e janela limitada de retentativas. A API **não imprime automaticamente no Gestor** e um `ACK` ou confirmação HTTP não prova papel.

- https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/webhook-overview
- https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/workflow
- https://developer.ifood.com.br/pt-BR/docs/guides/order/events/delivery-methods/webhook/signature

Não criar uma integração API clandestina por automação de interface, sessão, login, token ou scraping. Não implementar polling/webhook produtivo sem consentimento e autorização de acesso aplicáveis.

## 2. Arquitetura de segurança — duas trilhas, uma única responsabilidade de produção

1. **Gestor iFood — canal de custódia da origem:** mostrar o pedido mesmo se a integração Teknisa atrasar. Uma impressora vinculada ao Gestor pode gerar a via original de contingência; **não assumir** que a impressão é automática no modo de integração atualmente ativo até confirmação no equipamento real.
2. **Teknisa / leitor — canal integrado:** evento, identidade, praça, observações, quantidade, classificação, sacola/kit e reconciliação V6.8 em ambiente de revisão.
3. **Conciliação — canal de comparação, não um terceiro emissor:** cruzar o mesmo pedido por UUID completo, unidade e itens/observações, identificar divergências ou ausência *nas capturas observadas*, registrar alertas candidatos para o responsável.
4. **Sem duas ordens de produção automáticas:** uma via direta do Gestor não deve acionar, duplicar ou suplantar três vias do TATÁ; duas bandejas físicas com o mesmo pedido precisam de reconciliação humana antes de processar ou reimprimir. Uma fila vazia, ACK de API, spooler aceito ou campo `printed=true` **não** prova nem ausência nem entrega de papel.
5. **Independência real depende da topologia:** mesmo Windows, mesmo spooler, mesma impressora, mesmo switch/rede ou mesmo nobreak representam falha comum. Caminho Gestor de contingência deve usar conexão/dispositivo/teste físico próprio quando possível, sem nova compra ou instalação autorizada nesta etapa.

## 3. Bloqueio de identidade encontrado

No DeliveryOS, `data/tata_reader_ifood_sequence_mapping_proof_20261005_v1.json` comprova, no escopo observado, que `NRCOMANDAEXT` transporta o **ID curto do iFood** no pedido `DLV_IFO`; isso **não prova o UUID completo**.

`docs/Checklist_Fonte_Continua_iFood.md` considera o UUID completo obrigatório para o join confiável e registra o ID curto como repetível. Logo, igualar `NRCOMANDAEXT` ao número mostrado pelo Gestor **não pode** liberar uma declaração de mesma ordem, nem disparar impressão.

O futuro vínculo precisa nascer de evidência confiável e verificável da origem iFood/relatório e do pedido correspondente na Teknisa, mantendo UUID, ID curto, loja, revisão, itens e escopo temporal correto. Não completar UUID com inferência nem presumir uma relação autenticada a partir de um JSON autodeclarado.

## 4. Código implementado — somente comparador puro de revisão

- `tools/comandas_ifood_gestor_contingencia_v849_offline.cjs`
- `tools/verificar_comandas_ifood_gestor_contingencia_v849_offline.js`
- `.github/workflows/deliveryos-thermal-shadow-gate.yml` (Linux + Windows)

Contrato de duas capturas **minimizadas**:
- `gestor`: `deliveryos.ifood-gestor-observation.v1`; `store_id`, `order_uuid` (ou `null`, nunca inventado), `display_id`, `status`, `snapshot_complete`, `items[{name,quantity,observations[]}]`, `order_observations[]` e afirmação opcional `paper_claimed`.
- `teknisa`: `deliveryos.teknisa-order-observation.v1`; `store_id`, `order_key`, `ifood_order_uuid` (ou `null`), `ifood_display_id`, `snapshot_complete`, `items[]`, `order_observations[]` e `paper_claimed`.

**Nenhuma dessas afirmações JSON autentica origem real ou pessoa.** O comparador só devolve um hash de referência, códigos de motivo e alertas, sem nomes, observações, CPF, endereço, telefone, número bruto de pedido ou UUID em sua saída. O hash de pedido só é gerado a partir de UUID completo; se a única identidade for o ID curto, não se exporta nem mesmo seu hash enumerável. Receber captura **não** significa que o Gestor tenha sido consultado por este trabalho.

Condições discriminadas, sempre `HOLD` ou `MATCH_CANDIDATE_HOLD`:
- Gestor capturado e Teknisa não capturada → investigar possível lacuna de integração/atraso; **não** declarar pedido perdido;
- Teknisa capturada e Gestor não capturado → investigar cobertura/canal iFood;
- diferença de unidade, ID curto, UUID, itens, quantidades, observações por item, observações gerais de pedido ou status → **alerta crítico**, sem correção automática;
- coincidência de ID curto, mas ausência de UUID completo de qualquer lado → `FULL_IFOOD_UUID_JOIN_NOT_PROVEN`;
- coincidência de UUID + itens + observações → **candidato de conciliação**, não prova de origem autenticada nem autorização de papel;
- afirmação de impressão em ambos os canais → risco de duplicidade física, exigir reconciliação; jamais reimprimir automaticamente;
- pedido ainda `PLACED`, cancelado, concluído ou agendado fora da janela → não inferir permissão de produção; a validação temporal de agendados segue pendente.

A comparação de nomes/observações exige igualdade literal normalizada; diferenças de nomenclatura iFood x Teknisa geram revisão manual em vez de inventar um mapeamento semântico.

**Efeitos estritamente falsos:** consulta API, ACK, confirmação/cancelamento, SQL, escritas na Teknisa, serviço Windows, impressão, spooler, número TATÁ e retry automático.

## 5. Plano operacional de contingência (NÃO ATIVADO)

**Etapa A — observação passiva:** no computador/dispositivo realmente usado para o Gestor, verificar em leitura autorizada se ele segue exibindo pedidos durante lentidão da Teknisa e se existe impressora Gestor já vinculada. Conferir identidade do equipamento e se a impressão é automática no modo integrado atual. Nenhum clique que imprima nesta etapa.

**Etapa B — prova independente de mesma ordem:** obter uma captura minimizada do pedido iFood e da Teknisa, com UUID ou mapeamento independente efetivamente comprovado, todos os itens, quantidades e observações. Testar pedidos normais, combos, modificadores, cancelados, atualizados e agendados; replays e colisões de ID curto. Verificar se relatórios/buscas são completos para o período; ausência de evidência **não** é ausência de pedido.

**Etapa C — procedimento humano de falha:** se o Gestor exibir uma ordem e a Teknisa não, a operação deve manter a ordem visível e verificar seu status no Gestor; imprimir manualmente a via de contingência **somente quando a loja autorizar a rotina, em impressora previamente validada**, identificando-a como contingência, mantendo controle de duplicidade; não esperar pela Teknisa como única fonte de verdade e não processar pedidos cancelados. Ao recuperar a integração, reconciliar antes de qualquer segunda impressão ou liberação de via.

**Etapa D — aprovação futura:** validar end-to-end duas impressoras/caminhos fisicamente independentes, falha de internet/Windows/Teknisa, fila, reinício, atraso de evento, papel, divergência e retorno à normalidade; registrar aceite operacional de César. Autorização específica exigida para impressão, instalação, deploy e cutover. Não prometer zero perda com só teste de software.

## 6. Prova e lacunas

- **FACT externo:** o Gestor oferece impressão direta e a API oferece mecanismos próprios de eventos (links acima).
- **FACT interno histórico:** `NRCOMANDAEXT` é o ID curto na evidência observada; o UUID não está provado no evento Windows instalado.
- **CODE_READY / TEST_PASS a confirmar pelo HEAD:** comparador de revisão e casos adversariais em ambiente efêmero, sem acesso real ao iFood.
- **UNKNOWN:** credenciais/homologação API; disponibilidade atual do Gestor; impressora Gestor já configurada; comportamento de impressão enquanto PDV está integrado; papel físico; canal independente real; join UUID do pedido vivo; atraso e cobertura de eventos atuais.
- **HOLD:** sem imprimir, instalar, mudar Gestor/Teknisa/iFood, confirmar/cancelar/despachar pedidos, mexer em fiscal ou SEFAZ, fazer merge/deploy ou ativar API.

**Objetivo operacional:** se a integração Teknisa falhar, o pedido continua sendo identificável pelo iFood e a equipe dispõe de uma rota de contingência verificável, sem fabricar provas nem duplicar produção.


## V8.50 — correção de estado pelo operador e evidência live da CAIXA_MOOCA (20/10/2026)

**Correção humana de César:** a impressão nativa do Gestor de Pedidos iFood **já estava ativada por muitos dias e continuava ativa ontem, 19/10**. Essa informação operacional vem de quem responde pela loja, portanto não deve ser substituída pela suposição de que o canal nunca foi ativado. É uma **declaração operacional de configuração/uso**, distinta de verificação de papel por pedido.

**Prova técnica READ-ONLY, CAIXA_MOOCA, 20/10 às 09:39–09:40 -0300:**
- `Get-Process` e `Win32_Process` identificaram **6 instâncias `Gestor de Pedidos.exe`** e **3 instâncias `Impressora GP iFood.exe`**. As três instâncias GP iniciaram às **21:27:56–21:27:59 de 19/10**; seis processos Gestor iniciaram às **21:28:08–21:31:40 de 19/10**. Continuavam em execução durante a consulta de 20/10.
- Inspeção anterior de **13/10** já identificara 6 processos Gestor e 3 `Impressora GP iFood`, demonstrando presença do ecossistema em outra data; a amostra anterior de poucos segundos sem eventos não autoriza negar seu uso no restante dos dias.
- `Microsoft-Windows-PrintService/Operational` na CAIXA_MOOCA estava **habilitado** e registrou **368 eventos ID 307** em **19/10** (139 às 19h, 92 às 20h, 90 às 21h, 46 às 22h, 1 às 23h), distribuídos por **duas filas de impressão** (365 e 3 eventos). **98 eventos ocorreram após 21:27:56**, instante mais antigo de abertura dos processos GP atualmente vivos.
- A revisão segura das estruturas de `DocumentPrinted` omitiu títulos brutos e PII: todos os 368 títulos observados tinham 22 caracteres e nenhum continha marcador explícito `iFood`/`Gestor`/`GP`; os nomes das duas filas também não contêm marcador `iFood`/`Gestor`. Portanto, é **provada atividade de impressão no Windows naquele dia**, mas **não é provada a atribuição desses 368 trabalhos ao Gestor** nem a saída física de papel em seus equipamentos.
- A consulta limitada à retenção atual do canal encontrou esses 368 eventos ID 307 em 19/10, **não prova ausência de impressões em outros dias**. O Gestor pode imprimir por outro caminho e as filas podem ter nomes genéricos.
- Nenhuma configuração foi lida/escrita, nenhuma impressão solicitada, serviço reiniciado, spooler limpo, pedido real identificado ou login efetuado. Nenhum texto bruto de trabalho, item ou consumidor foi armazenado na evidência de revisão.

### Ajuste no próximo gate

**Não iniciar projeto de instalação/configuração do Gestor**: os dois aplicativos já estão presentes e rodando. A partir do sistema existente, descobrir de modo não destrutivo qual destino/driver/canal a `Impressora GP iFood` utiliza e se os pedidos do dia efetivamente produzem um evento auditável próprio. Aproveitar primeiro logs/telemetria históricos permitidos e a experiência de César, sem configurar duas impressões automáticas por acidente.

- Estado do app no host às 09:40 do dia 20: **PROCESS_RUNNING_PROVEN**, com início em 19/10.
- Configuração histórica de impressão contínua: **USER_REPORTED_OPERATIONAL_ACTIVE**. Não descartar; prova de interface/configuração preservada separadamente como ainda não carregada.
- Atividade de spooler Windows em 19/10: **307_EVENT_PROVEN_FOR_TWO_UNATTRIBUTED_QUEUES**.
- Impressão nativa GP x impressão Teknisa em trabalhos específicos, segunda rota fisicamente independente, integridade por pedido e nenhuma duplicação: **UNKNOWN_NEEDS_RECONCILIATION**.

**Plano V8.49 permanece DRAFT/HOLD e sem ativação adicional.** A correção diz respeito à premissa e prioridade: preservar o fluxo que já funciona e comprová-lo sem substituir configurações existentes.


## V8.51 — auditoria reproduzível da Impressora GP, sem atribuição artificial (20/10/2026)

### Prova no computador real, sem alterar a operação

Investigação da **CAIXA_MOOCA** por consulta remota, leitura de metadados e execução em memória do script da PR, sem escrever arquivo, instalar driver, reconfigurar impressão, fazer login, consultar conteúdo de pedidos ou enviar bytes ao spooler.

**Software instalado:** `Gestor de Pedidos.exe` 8.10.4.892 (seis processos) e `Impressora GP iFood.exe` 1.2.0.405 (três processos). Ambos instalados em `Program Files`; componentes Electron com executável e `resources/app.asar` próprios. Gestor mantém conexões 443; isso não prova entrega de evento nem impressão.

**Fonte Windows correta, schema inspecionado:** `Microsoft-Windows-PrintService/Operational`, evento 307, `Event.UserData.DocumentPrinted.Param5` = fila Windows; `Param6` = porta; `Param4` = proprietário/conta, **não** fila. Todos os 368 trabalhos do dia 19/10 tiveram `Param5` compatível com as filas instaladas. O título (`Param2`) era genérico/único, sem discriminar aplicativo.

**Distribuição em 19/10, 19–23h:** 368 eventos 307 distribuídos por **sete filas**, sendo seis com driver Epson e uma com driver Elgin. Contagem por fila (sem nome bruto): **114, 89, 68, 62, 22, 9 e 4** (soma 368). **98 eventos após 21:27:56**, hora em que iniciaram os processos GP ainda ativos no momento da consulta. **Não interpretar a diferença de horário como autoria de impressão**: os processos podem ter reiniciado e diversas aplicações podem compartilhar filas. **Não interpretar 368 eventos como 368 pedidos distintos ou papéis entregues**.

**Aplicativos e logs existentes:**
- `%APPDATA%\order-manager-printer\logs\main.log`: 49 linhas, última modificação 19/10 21:28:00; leitura agregada não identificou registro por pedido, confirmação de papel ou termos básicos de impressão. **Ausência de marcador não é prova de ausência de uso**, já que pode haver outro canal/formatos.
- `%APPDATA%\Gestor de Pedidos\log.log`: aproximadamente 10.816 linhas, modificado em 20/10; leitura apenas por categorias agregadas, sem imprimir linhas/IDs/consumidores. O arquivo não forneceu prova de envio do GP, nem mapeamento iFood/Teknisa com UUID confiável.
- `%APPDATA%\Gestor de Pedidos\local-storage.json` existe, mas inspeção por **nomes de chaves não expôs uma configuração explícita de impressão**; nenhuma credencial, token, cookie ou valor de configuração foi extraído ou publicado.
- `Get-Printer` encontrou impressoras Epson e Elgin, além de outros drivers. Nenhuma fila utilizada tinha identificador explícito `iFood` no nome. **Isso não nega que o GP use uma fila de nome genérico.**

**Nova auditoria permanente na PR:**
- `tools/comandas_gp_ifood_print_provenance_v851_readonly.ps1`: leitor por **dia local delimitado** de eventos 307, metadados dos aplicativos/filas e última modificação do log GP. Nenhum conteúdo de documento, endereço, cliente, nome de usuário, URL, pedido, token, senha ou fila é exportado; filas são pseudonimizadas. A saída faz distinção explícita entre evento de impressão Windows e prova de origem iFood, que continua `false`. Nenhuma ação ou efeito permitido.
- `tools/verificar_comandas_gp_ifood_provenance_v851_static.js`: proteção estática adversarial contra ler títulos/contas dos documentos, assumir autoria, alegar prova física, consultar API, imprimir, reconfigurar spooler ou escrever arquivos. Validação de sintaxe PowerShell e teste em memória no host constituem provas separadas.

**Validação local real 20/10 às 10:10 (-03:00):** execução diretamente em memória do conteúdo versionado em GitHub retornou `print_event_log_status=READABLE_BOUNDED`, `print_event_count=368`, `queue_groups=7`, `gp_process_instances=3`, `gestor_process_instances=6`, `gp_program_version=1.2.0.405`, `gestor_program_version=8.10.4.892`, `print_source_attribution_proven=false`, `gp_auto_print_setting_proven=false`, `physical_paper_proven=false`, `order_join_proven=false`, **todos os efeitos falsos**. Nenhum ajuste operacional nem arquivo gravado.

### Decisão técnica

**A impressão via GP pode servir como redundância contra uma falha *da integração da Teknisa*, mas não equivale ainda a redundância comprovada contra falha do Windows, do spooler, da rede ou da impressora física.** Os dois aplicativos foram observados na **mesma CAIXA_MOOCA**, portanto essa máquina permanece um possível ponto de falha comum. Além disso, o código V8.49 não tem coletor autenticado de pedidos GP: só compara duas capturas já fornecidas e verificadas externamente.

**Portão seguinte antes de habilitar automação:** prova de origem por pedido no canal iFood (identidade, itens, notas, status e revisão), vínculo auditável à identidade Teknisa, confirmação de configuração GP atualmente ativa por observação autorizada e teste de queda da Teknisa com captura/saída física supervisionada **mediante autorização distinta**. Não criar duas vias automáticas sem mecanismo de deduplicação durável, não imprimir etiquetas fiscais, não tratar log ID 307 como garantia de papel.

**Estado:** PROVEN software presente e log 307 no host, `UNKNOWN` autoria GP por pedido; PR #107 DRAFT/HOLD, no merge/no deploy/no print.
