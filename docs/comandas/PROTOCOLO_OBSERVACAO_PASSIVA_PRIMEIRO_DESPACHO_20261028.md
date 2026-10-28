# TATÁ Comandas — protocolo mínimo para comprovar o primeiro despacho nativo (sem efeitos)

**28/10/2026 | ITAIM | PR #127 DRAFT/HOLD | fase de evidência, NÃO de cutover**

## 1. Estado e motivo deste documento

Checkpoint de código em `7a96340a0b8cf2e72c6521e46e25cf6b0db18251`: CI hospedada `40774682927` `success` (130 passos Linux; 117 Windows). Esses testes são **offline**, não atestam via impressa nem primeiro despacho real.

Em inventário de dispositivos Remote Desktop Commander, consultado em 28/10: `CAIXA_MOOCA` online; `Foxxy` offline. O nome de dispositivo **não comprova unidade física/escopo de autorização**. Embora inspeções estáticas anteriores tenham usado `CAIXA_MOOCA`, este checkpoint não revalidou a associação do dispositivo à operação de Itaim. **Nenhum computador operacional foi acessado nesta etapa; nenhuma coleta real foi feita.**

O primeiro evento `DLV_IFO` que cria uma tentativa de impressão de produção segue **UNKNOWN**. A documentação de `docs/comandas/AUDITORIA_PRIMEIRO_DESPACHO_MARKETPLACE_FORSALE_20261027.md` demonstra que importação de marketplace, criação de comanda ForSale, relatório de entrega, saída GP/Gestor, aceitação Odhen e status Windows não são intercambiáveis com esse evento. `tools/comandas_native_first_dispatch_correlation_v1_offline.cjs` só valida coerência de *alegações* com o Reader; não identifica o emissor real.

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

**Estado neste checkpoint:** `CODE_CI_PASS`; `SOURCE_FIRST_DISPATCH_UNKNOWN`; `DEVICE_UNIT_NOT_REVERIFIED`; `NO_LIVE_READ`; `NO_PRINT`; `PILOT_HOLD`.

**Arquivos correlatos:** `docs/comandas/AUDITORIA_TRANSPORTE_NATIVO_TEK_IMPRESSAO_20261027.md`; `docs/comandas/AUDITORIA_ESCOPO_IDIMPPEDPROD_CAIXA_COMPARTILHADO_20261027.md`; `docs/comandas/PILOTO_PEDIDO_REAL_CRITERIOS_ACEITE_20261026.md`.
