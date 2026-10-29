# TATÁ Comandas — protocolo mínimo para comprovar o primeiro despacho nativo (sem efeitos)

**28/10/2026 | ITAIM | PR #127 DRAFT/HOLD | fase de evidência, NÃO de cutover**

## 1. Estado e motivo deste documento

Checkpoint de código em `7a96340a0b8cf2e72c6521e46e25cf6b0db18251`: CI hospedada `40774682927` `success` (130 passos Linux; 117 Windows). Esses testes são **offline**, não atestam via impressa nem primeiro despacho real.

Em inventário de dispositivos Remote Desktop Commander, consultado em 28/10: `CAIXA_MOOCA` online; `Foxxy` offline. O nome de dispositivo **não comprova unidade física/escopo de autorização**. Embora inspeções estáticas anteriores tenham usado `CAIXA_MOOCA`, este checkpoint não revalidou a associação do dispositivo à operação de Itaim. **Nenhum computador operacional foi acessado nesta etapa; nenhuma coleta real foi feita.**

O primeiro evento `DLV_IFO` que cria uma tentativa de impressão de produção segue **UNKNOWN**. A documentação de `docs/comandas/AUDITORIA_PRIMEIRO_DESPACHO_MARKETPLACE_FORSALE_20261027.md` demonstra que importação de marketplace, criação de comanda ForSale, relatório de entrega, saída GP/Gestor, aceitação Odhen e status Windows não são intercambiáveis com esse evento. `tools/comandas_native_first_dispatch_correlation_v1_offline.cjs` só valida coerência de *alegações* com o Reader; não identifica o emissor real.

### Atualização da inspeção permitida — bloqueio de conector

A automação preexistente `TATÁ Comandas — integridade` (`6adeeea21c488191968835b158d9855a`) delimita acesso **somente ao host exatamente `CAIXA_MOOCA`**, e exclusivamente aos quatro arquivos agregados já existentes:
- `C:\\ProgramData\\TataComandaReader\\state\\reader-heartbeat-v1.json`
- `C:\\ProgramData\\TataComandaReader\\evidence\\shadow-consumer-status.json`
- `C:\\ProgramData\\TataComandaReader\\evidence\\reporting-projector-status.json`
- `C:\\ProgramData\\TataComandaReader\\state\\production-service-state.json`

Em 28/10/2026, uma tentativa de leitura **somente desses arquivos** retornou `Desktop Commander monthly usage limit` em todos os casos. **Quatro solicitações tentadas; zero conteúdos de arquivos recebidos; nenhuma evidência nova de saúde do Reader.** O conector indicou expressamente não repetir/reconectar. Consequentemente, não há base para inferir mudança de `ready_count`, estado do serviço, frescor de heartbeat, projeção nem primeira impressão. Esta autorização antiga de integridade **não se estende** a capturas individuais de impressão, logs de spooler, banco ou configuração Retail; ela tampouco prova que `CAIXA_MOOCA` seja fisicamente o equipamento autorizado para a primeira via do Itaim.

**Conduta:** interromper tentativas pelo mesmo conector; não usar outro conector ou sessão para burlar a cota ou a proteção. Um futuro acesso deverá respeitar o mecanismo e autorização apropriados. Até lá, `READER_HEALTH_FRESHNESS=UNKNOWN`, `FIRST_NATIVE_DISPATCH=UNKNOWN`, `PILOT=HOLD`.

## 2. Fronteira de autorização e identidade do equipamento

Antes de ler qualquer fonte viva: (a) confirmar por evidência externa a **unidade, dispositivo, papel e permissões** do host; (b) aprovar explicitamente o escopo limitado da fonte de leitura; (c) não contornar controles de acesso. Disponibilidade de um equipamento, nome `CAIXA_MOOCA` ou aprovação genérica de continuação **não autorizam** leitura de configurações protegidas, pedidos privados, filas de impressão, credenciais, logs ou banco.

Fases distintas:
- **A — diagnóstico documental/offline:** ler somente código, documentação já autorizada e artefatos sintéticos; está autorizado para esta PR e foi executado.
- **B — inspeção passiva real delimitada:** depende de equipamento/unidade e mecanismo de recepção legitimamente identificados, autorização específica e controles de privacidade. **NÃO EXECUTADA**.
- **C — alteração de emissor / piloto físico:** requer autorização separada, sequência TATÁ persistida, destino homologado, verificação de papel, STOP e rollback. **NÃO AUTORIZADA**.

## 3. Ordem da investigação: reduzir hipóteses, não juntar falsos positivos

1. **Localizar em fonte legítima o componente que transforma pedido externo em comanda native `DLV_IFO`**. Identificar arquivo/versão e caminho que chama o emissor **antes** de assumir que o evento vem do PDV, de `FosExp.exe` ou de `ImpressaoPedido.php`. Uma busca negativa em 133 PHP é limitada à árvore examinada.
2. **Distinguir primeiro despacho de impressão / reimpressão / relatório / fiscal / importação de pré-pedido**, registrando exatamente a função/canal, a origem, a chave composta `CDFILIAL|CDLOJA|NRVENDAREST|NRCOMANDA` e a revisão nativa. Não inferir impressão pelo status `3/P/X`, pelo timestamp ou pelo campo `NRCOMANDAEXT`.
3. **Determinar o transporte realmente ativo para a chamada identificada**, não pela mera presença do código: `UTILIZA_IMPRESSAO_PONTE` (HTTP `/print`), `UTILIZA_IMPRESSAO_PHP` (porta direta) ou `impressaoDelphi` (arquivo/serviço), e verificar se há backup. Se ponte Odhen estiver envolvida, diferenciar Epson DLL nativa de Windows spooler. `HTTP JSON status:202`, fila própria e `PRINTED` do Windows **não** confirmam papel.
4. **Correlacionar uma ocorrência natural previamente autorizada** (não criar pedido, não solicitar segunda via), em janela curta, por chave nativa, revisão e tentativa única da praça. Para as duas vias de produção, usar origem Teknisa; cruzamento iFood × Teknisa pertence **somente à conferência**. Se o caminho não permitir correlação não invasiva, registrar `UNKNOWN` e parar.
5. **Procurar confirmação independente de destino/efeito** pelo canal explicitamente permitido, com separação de origem e custódia de observação. Assinatura criada pela mesma fonte, recibo HTTP, título de fila, `status=P` ou relato de configuração isolado não bastam. Não publicar ID, nomes, notas, endereço, conteúdo de ticket, dados fiscais, tokens ou caminhos sensíveis.

## 4. Evidência mínima por camada (não confundir níveis)

| Camada | Prova mínima | Resultado quando ausente |
|---|---|---|
| Origem nativa | Fonte e versão do criador da comanda `DLV_IFO`; correspondência estável de unidade e revisão | `NATIVE_CREATION_UNKNOWN` |
| Despachante | Callsite preciso, canal, referência da primeira tentativa versus reprint e hash da fonte permitida | `FIRST_DISPATCH_UNKNOWN` |
| Praça/destino | Estação lógica, caminho de transporte efetivamente ativo, destino principal e reserva, titularidade da fila | `ROUTE_AND_BACKUP_UNKNOWN` |
| Efeito | Observação independente e não invasiva sobre a tentativa específica; distinguir aceite/fila/dispositivo/papel | `EFFECT_UNKNOWN` |
| Sequência e coexistência | Binding TATÁ atômico e verificado, ausência de emissão duplicada, rota antiga e rollback por escopo | `CUTOVER_HOLD` |
| Operação | Impressão física supervisionada e aceite humano de cada via somente em fase específica | `WORLD_NOT_PROVEN` |

O primeiro resultado aceitável de B pode ser **`READONLY_SOURCE_TRACE_PROVEN`** quando a cadeia de callsite/identidade for autenticada independentemente. Isto **não** equivale a `PRINTED`, `PHYSICAL_ACCEPTED` ou autorização de cutover.

## 5. Rotas expressamente vedadas

- Não trocar `IDIMPPEDPROD` global do caixa por `N`: afeta potencialmente mesa, balcão e reimpressão; um override exclusivo `DLV_IFO` não foi comprovado.
- Não mudar `IDIMPAUTENTREG` esperando desligar a primeira via; ele trata relatório pós-venda, há caminhos manuais.
- Não redirecionar Epson para `NUL` presumindo Windows spooler. Sem prova da cadeia, desvio não intercepta DLL nativa, PHP/TCP ou Delphi.
- Não habilitar impressão GP/Gestor como método de diagnóstico: pode criar segunda emissão.
- Não capturar payload `/print`, conteúdo de jobs, IDs de clientes, credenciais, dados fiscais ou pedidos sem escopo específico.
- Não executar POST, SQL, escrita de sequência, serviço, porta, spooler, reinício, deploy, merge, fallback ou reprint.
- Não contornar negativa de configuração do Retail: controle de segurança é fronteira de parada.

## 6. Critério de saída desta fase

A investigação B é **parcial** se apenas identificar fonte/callsite, mas faltar transporte ou tentativa. É **HOLD** se a unidade não for comprovada, se a inspeção exigir outra permissão, se a única observação for de fila ou se a revisão mudar entre capturas. Só avançar a proposta de piloto **depois** da prova da cadeia de origem e canal, sequência persistida/escopo forte, roteamento de duas praças + uma conferência, exclusividade de emissor, rollback e autorização explícita para o efeito físico.

**Estado neste checkpoint:** `PREVIOUS_CODE_CI_PASS`; `SOURCE_FIRST_DISPATCH_UNKNOWN`; `DEVICE_UNIT_NOT_REVERIFIED`; `AGGREGATE_READ_ATTEMPTED_BLOCKED_BY_CONNECTOR_LIMIT`; `NO_LIVE_FILE_CONTENT`; `NO_PRINT`; `PILOT_HOLD`. Nova CI do commit documental deve ser verificada separadamente.

**Arquivos correlatos:** `docs/comandas/AUDITORIA_TRANSPORTE_NATIVO_TEK_IMPRESSAO_20261027.md`; `docs/comandas/AUDITORIA_ESCOPO_IDIMPPEDPROD_CAIXA_COMPARTILHADO_20261027.md`; `docs/comandas/PILOTO_PEDIDO_REAL_CRITERIOS_ACEITE_20261026.md`.

## 7. Retomada de 29/10/2026 — decisão sem e-mail, evidência pública e próximo passo

**Decisão operacional explícita de César:** não usar e-mail para conduzir o TATÁ Comandas. Minutas de comunicação anteriores são histórico, **não** uma pendência a enviar. Não pesquisar caixa de entrada/rascunhos, não preparar nem enviar mensagens ao fornecedor e não apresentar o e-mail como pré-requisito. Um eventual suporte por canal diverso requer decisão própria; não há contato autorizado nesta fase.

**Nova checagem de fontes oficiais, sem acesso à loja:**
- [Teknisa — APIs e integrações](https://www.teknisa.com/api): `/order` capta pré-pedido de delivery; a listagem de `/orderStatus` inclui estados como `em produção` e `cupom impresso`. **Nenhum desses estados, isoladamente, identifica o callsite ou prova primeira via de cozinha `DLV_IFO`, destino, reserva, revisão exata ou papel.**
- [Teknisa/EatTake — Integração Order API](https://ajuda.teknisa.com/eattake/integracao-pdv-teknisa/integracao-order-api): o texto descreve operação autônoma até a cozinha **para aquela integração documentada**. É evidência de arquitetura possível, **não** de que o Itaim utilize o mesmo emissor ou ponto de disparo.
- [Microsoft — prncnfg](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/prncnfg): `keepprintedjobs` retém documentos já processados para possível resubmissão. Portanto a contagem de registros `Printed` retidos não mede pedidos únicos, trabalhos pendentes ou papéis comprovadamente produzidos.

**Checkpoint do software revalidado:** PR #127 `OPEN/DRAFT/HOLD`, HEAD `7def2cc5f27c5bdbc89c1fbf33d1d0b0f54a9347`; [GitHub Actions 40805004939](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/40805004939) concluiu `success`, 130 etapas Linux e 117 Windows. Tudo **offline**; fonte nativa viva e papel continuam não comprovados.

**Rota mínima de avanço sem e-mail e sem contorno de acesso:**
1. Continuar a revisão offline dos pontos de origem já examinados, mantendo como `UNKNOWN` o componente de primeira tentativa real. Não converter status da Order API, documentação de parceiro ou presença de executável em atestado de impressão.
2. Quando existir mecanismo legítimo e permissão **específica** para um único equipamento e fonte, comprovar em leitura passiva: unidade/host, versão/callsite de despacho `DLV_IFO`, chave composta + revisão, primeira tentativa, praça, transporte ativo e destino reserva. A cota mensal do acesso remoto permanece limite; **não** testar outra conta/conector para contorná-la.
3. Resolver separadamente a classificação corrente de itens sem prova, a distribuição física por caixas/praças e a persistência idempotente do número TATÁ. As duas produções usam fonte nativa; iFood independente somente na conferência. Preservar mesa, balcão, relatório e fiscal.
4. Somente após prova suficiente, apresentar um piloto supervisionado com autorização **separada**, uma tentativa por via, prevenção de duplicação, reconciliação de backlog/reprint, observação física e rollback. Nenhuma impressão ou alteração é aprovada por este documento.

**Efeitos desta atualização:** documentação exclusivamente; nenhum e-mail, pedido, arquivo de produção, serviço, configuração, sequência, impressora, spooler, SQL, fiscal, deploy ou merge alterado. `FIRST_NATIVE_DISPATCH=UNKNOWN`; `WORLD_PROVEN=false`; `PILOT=HOLD`.


## 8. Confirmação humana da unidade e encaminhamento presencial — 29/10/2026

**Confirmação recebida diretamente da gestão em 29/10/2026:** o computador identificado como `CAIXA_MOOCA` pertence operacionalmente à unidade **TATÁ Sushi Itaim**. A gestão também confirmou a possibilidade de viabilizar uma **verificação presencial, acompanhada por responsável autorizado, somente em leitura**. Registrar como `HUMAN_CONFIRMED_DEVICE_UNIT=ITAIM` e `ONSITE_READONLY_CHECK_FEASIBLE=YES_BY_HUMAN`; **não** transformar em prova independente da identidade técnica do host, sessão conectada, permissão de ler todo o equipamento, saúde atual do Reader ou autorização de escrita.

**Prova técnica mais recente antes desta anotação:** HEAD `a261fb4db97c451b37e270aa57804c6b4d6bbfdd`, workflow [40832966333](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/40832966333) = **SUCCESS** (Linux 130/130, Windows 117/117), somente testes offline. A PR #127 segue **OPEN/DRAFT/HOLD**, sem merge, deploy ou papel. A confirmação humana resolve somente `DEVICE_UNIT_UNCONFIRMED_BY_MANAGEMENT`, não `FIRST_NATIVE_DISPATCH_UNKNOWN`.

### Pré-voo presencial mínimo para a fonte já delimitada (B0)

**Escopo inicial:** responsável fisicamente presente valida na própria máquina o nome do dispositivo e sua vinculação ao Itaim, sem divulgar nomes de usuário ou credenciais. Se permitido pelas regras locais, inspeciona **somente metadados/estado agregados já previstos** nestes quatro arquivos existentes; não cria nem altera arquivos:

1. `C:\ProgramData\TataComandaReader\state\reader-heartbeat-v1.json` — existência, data de atualização, estado/versão do Reader.
2. `C:\ProgramData\TataComandaReader\evidence\shadow-consumer-status.json` — estado agregado do consumidor; não publicar identificadores de pedidos.
3. `C:\ProgramData\TataComandaReader\evidence\reporting-projector-status.json` — estado agregado da projeção, sem extrair conteúdo de comandas.
4. `C:\ProgramData\TataComandaReader\state\production-service-state.json` — estado agregado do serviço de produção, sem iniciar/parar serviço.

**Saída admissível:** para cada um, somente `PRESENT/MISSING/ACCESS_DENIED`, data de atualização, validade de JSON e campos agregados de saúde sem dados pessoais; registrar versão/identidade de host apenas de forma minimizada. Uma coleta é `B0_PROVEN` **somente após** revisão dos dados efetivamente observados e atuais, nunca por confirmação verbal de possibilidade. Se qualquer campo carregar pedido, cliente, endereço, observação, sessão ou segredo: não reproduzir o valor; parar a extração e registrar apenas `REDACTION_REQUIRED`. Não ler arquivo inexistente via técnica alternativa ou mexer em ACL.

**A etapa B0 não prova o primeiro despacho de produção.** A investigação B1 (evento nativo `DLV_IFO` → primeira tentativa → praça/transporte/destino principal e backup) só ocorre com fonte e escopo de leitura explicitamente identificados, proteção de dados e autorização correspondente, evitando pedidos de nova via. A etapa C (piloto físico e qualquer mudança) continua separada.

**Conector remoto:** a cota mensal anteriormente informada continua restrição. A disponibilidade/uso de outra máquina ou conta não será usada para contorná-la; a verificação presencial é uma operação local com responsável autorizado, não uma tentativa de reconexão por trás do bloqueio. Nenhuma visita, coleta, acesso, script local ou comando operacional foi executado por esta atualização documental.

**Estado após esta anotação:** `UNIT=ITAIM_HUMAN_CONFIRMED`; `B0_ONSITE=NOT_YET_EXECUTED`; `READER_LIVE_HEALTH=UNKNOWN`; `FIRST_NATIVE_DISPATCH=UNKNOWN`; `PILOT=HOLD`; `PHYSICAL_PRINT=NOT_PROVEN`. Preservadas as duas vias de produção nativas, a conferência independente iFood somente no caixa, os controles de caixas/itens/seqüência e o isolamento fiscal. O canal de e-mail permanece fora do plano.
