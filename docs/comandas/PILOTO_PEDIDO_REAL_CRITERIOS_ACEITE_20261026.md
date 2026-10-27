# TATÁ Comanda — protocolo do primeiro pedido real (piloto com autorização separada)
**26/10/2026 | DRAFT / HOLD | sem instalação, impressão ou escrita em produção**

## Objetivo de aceite
Um único pedido **real e legitimamente observado** no Itaim percorre duas trilhas que compartilham a revisão nativa, mas **não** a dependência de conciliação iFood: **duas vias de produção**, cada uma derivada exclusivamente do pedido/itens/observações da **Teknisa** e de seus roteamentos nativos comprovados; **uma via de conferência no caixa**, que cruza a identificação independente **iFood × Teknisa** na mesma unidade/dia/revisão. O resultado do cruzamento aparece **somente na conferência**: discrepância/ausência do iFood bloqueia ou sinaliza a conferência, mas não impede a projeção das vias de produção a partir de dados nativos válidos. Sequência TATÁ persistida e não duplicada é requisito antes de exibir número real em qualquer via. Documento fiscal permanece isolado. Nenhuma via recebe autorização física nesta PR.

## Fase 0 — pré-voo sem efeitos (executável antes de autorizar piloto)
1. Confirmar `CAIXA_MOOCA` real, saúde do leitor, versão e hashes dos arquivos e supervisor, sem tocar na aplicação de caixa.
2. Comprovar integridade da fonte nativa **Teknisa→Reader** para as duas vias de produção. **Somente para a conferência**, procurar evidência independente iFood da mesma loja/dia/ID curto e confrontar com a Teknisa; fonte iFood ausente, divergente ou ambígua = `HOLD_IFOOD_CROSSCHECK` na conferência, **não** bloqueio global da produção. Sem API nova ou credenciais.
3. Comprovar chave composta, revisão, itens, quantidades, observações item por item, cancelamentos e alergênicos. O número curto iFood sozinho não é chave forte.
4. Comprovar motor Academia em versão aceita, correspondência código↔nome↔classificação↔praça para os itens do pedido; discrepância/sem prova = `A DEFINIR` apenas em caixa/sacola/kit depois de efetiva avaliação, nunca em item/quantidade/iFood/seq TATÁ.
5. Determinar origem autorizativa da sequência 3 dígitos; até 26/10 a fonte observada tinha `bindings=0`. Testar idempotência/casos negativos exclusivamente em cópia, sem criar `001` na operação.
6. Provar destino lógico e papel das impressoras A/B por evidência nativa independente; `LUNCH/DINNER` não decide automaticamente. **César confirmou: em 25/10 a saída de comandas do Gestor iFood estava DESATIVADA; impressão simultânea em dias anteriores foi contingência de erro, não rotina.** Antes de ativar qualquer saída, verificar quem realmente imprime no dia do piloto; não inventar uma segunda via nem pressupor que o Gestor esteja imprimindo.
7. CI ou replay isolado sobre commit exato, rollback, exclusividade de processos V1 supervisor / V2 leitor, atomicidade/restart, consentimento para qualquer alteração.

## Fase 1 — autorização humana específica e estreita
Só depois de Fase 0 aprovada, apresentar identificação da unidade, dispositivo, janela, pedido de teste deliberadamente escolhido, lista exata de arquivos/serviços a alterar (se houver), sequência e destino, plano de reversão, quem supervisiona o papel e quem tem poder de STOP. **NÃO usar autorização geral de “continue” como autorização física.** Uma autorização de leitura não autoriza vinculação de sequência, serviço, SQL, spooler ou impressão.

## Fase 2 — observação/aceite físico (não autorizado)
Em janela acordada, uma única tentativa por identidade de pedido e por via, com teste anti-reimpressão e recibo externo quando aplicável. Sem paper/output independentemente observável: `NOT_WORLD_PROVEN`. Se houver duplicação de vias, divergência de sequência, erro de observação, falha do leitor, reclassificação arbitrária, destino ambíguo, estado de rollback sem prova ou outra condição inesperada: `STOP/HOLD`; preservar evidências e não dar retry automático. Evidência óptica e aceite humano da operação são obrigatórios antes de marcar `PHYSICAL_ACCEPTED`.

## Atualização de origem independente e impressão, 26/10
O relatório individual do iFood oferece 314 pedidos, 311 códigos curtos coincidentes com a Teknisa DLV_IFO no mesmo dia, 3 apenas iFood, 6 apenas Teknisa. Essa fonte NÃO inclui composição de itens; ligação UUID completo↔nativo permanece aberta. Referência: `docs/comandas/CONCILIACAO_IFOOD_TEKNISA_20261025_CORRECAO_HUMANA.md`. Não pedir repetidamente planilha com itens como se a exportação permitisse essa granularidade.

## Status atual
- Leitor: `RUNNING` observado no host.
- Consumidor: `ready_count=0`, `blocked_count=2047`; não reproduzir recibos shadow como se fossem pedidos impressos.
- Códigos investigados: 14/14 conferem com cache de identidade e nome de 05/10, 0/14 têm alias; 1/14 sem rota; fontes antigas precisam de atualização autorizada.
- Sequência TATÁ: `bindings=[]`; sem autorização de persistência.
- Código candidato: offline tests PASS para partes da cadeia, CI hospedada e implantação sem prova do HEAD exato.
- Pilot readiness: **HOLD**; **physical effects = 0**.

**Aceite 10/10 só depois de `CODE_READY + CI/TEST_PASS + DEPLOYED + WORLD_PROVEN + HUMAN_ACCEPTED` sem obrigação crítica aberta.**


## Rota de validação viável com a exportação oficial real (proposta de revisão, não autorização)

**Limite conhecido e confirmado por César:** a exportação oficial do iFood fornece 314 identificadores/horários/situações, **sem linhas de itens ou observações**. Portanto a exigência de comparar *automaticamente* cada item iFood contra a Teknisa a partir dessa planilha é **inexequível com essa fonte**. Não pedir outra planilha equivalente nem promover campos inexistentes.

A proposta de menor complexidade separa as provas, sem inventar vínculo:
1. **Presença independente do pedido:** exportação oficial iFood + `DLV_IFO` na Teknisa com mesma loja/dia/código curto sem colisão. Para 25/10, 311 são candidatos únicos, não UUID autenticado. Três só-iFood e seis só-Teknisa ficam em HOLD individual até explicação de recorte/origem, sem matching por horário.
2. **Conteúdo operacional primário:** o banco nativo Tecnisa (linhas `ITCOMANDAVEN` e observações por origem) é a fonte de produtos e quantidades. O Reader V2 deve preservar exatamente a chave composta, o hash da revisão e a coleção completa de itens/notas, com releitura sem discrepância. A prova anterior SQL↔Reader foi 5/5 **revisões**, não cinco pedidos independentes nem prova do conteúdo iFood.
3. **Revisão independente de conteúdo, se necessária para efeito:** no piloto supervisionado, comparar localmente no aplicativo oficial já autorizado, **para a mesma comanda visível**, os itens/quantidades/observações relevantes do pedido selecionado com a prévia nativa. Não criar API nova, não ler sessão, cache ou credenciais, não automatizar clique remoto nem exportar PII. Se a tela/fonte não estiver disponível, registrar `IFood_ITEM_PARITY=UNKNOWN`, não simular equivalência; não autorizar impressão autônoma por esse dado.
4. **Primeira via versus reimpressão:** manter independente da semântica `IDSTCOMANDA`. Os arquivos PHP observados mostram impressão de mesa após `commit`, reimpressão dedicada e relatório de entrega separado; **não provam evento de cozinha do iFood**. Para um piloto autorizado, o disparo deve ser controlado por uma identidade/revisão explícita, não `P`, `X`, turno ou timestamp aproximado. Antes de qualquer automatismo, atestar quem emite e se já houve efeito sobre essa mesma revisão; status de spooler sozinho não prova papel.
5. **Número e saída física:** sequência TATÁ real ainda `bindings=0`; não renderizar `001` como atribuído. Para fase de efeito futuro, exigir binding persistido atômico com releitura independente, roteamento nativo homologado das duas vias de produção, impressora de caixa da única via de conferência, coexistência sem duplicidade, exclusividade e STOP/rollback sob autorização humana próxima do efeito. A indisponibilidade da fonte iFood **não** transfere o bloqueio da conferência para as duas vias de produção.

**Decisão proposta para revisão:** permitir investigação e **prévia não produtiva** sobre conteúdo SQL↔Reader provado, mesmo que a exportação iFood não contenha itens; isso não é `IFood_ITEM_PARITY=PROVEN`, não prova `PRINT_EVENT`, nem libera sequência, produção automática, instalação ou papel. A Fase 1/2 de autorização específica permanece intacta.


## Correção da autoridade humana — 26/10: cruzamento iFood somente na conferência

Esta correção **substitui qualquer redação anterior neste projeto que exigia prova independente do Gestor iFood para liberar a projeção de uma via de produção**, ou que eliminava as duas vias de produção.

| Via | Origem dos itens, quantidades e observações | Comparação iFood × Teknisa | Destino proposto |
|---|---|---|---|
| Produção 1 | Teknisa nativa/Reader V2, revisão exata | **Não exigida** | Praça de produção conforme roteamento comprovado |
| Produção 2 | Teknisa nativa/Reader V2, mesma revisão | **Não exigida** | Praça de produção conforme roteamento comprovado |
| Conferência | Composição da Teknisa nativa/Reader V2 | **Exigida somente aqui**, confrontando presença/ID curto/dia/loja com fonte independente iFood; composição externa permanece UNKNOWN quando não disponível | Uma impressora do caixa, a comprovar |

Os três tickets podem exibir o mesmo número curto de origem nativa; isso **não equivale** a executar cruzamento independente nas duas vias de produção. Uma falha na conciliação externa não pode contaminar decisão de origem de produção; uma falha real de integridade da Teknisa, por outro lado, bloqueia os três. A impressão de conferência deve evidenciar discrepância/pendência de conciliação de forma apropriada e não afirmar identidade UUID ou equivalência de itens quando não comprovadas. **Não aprovar automaticamente impressão de uma conferência inconciliada.**

Para 27/10, **não é necessário ativar a via impressa do Gestor iFood** para implementar essa arquitetura; a fonte independente poderá ser obtida pelo mecanismo legítimo já existente/consulta supervisionada. A ativação do Gestor somente como mecanismo de prova teria risco de duplicação, sem valor demonstrado nesta etapa. Não modificar a configuração por esta orientação.

Ensaio offline: `tools/comandas_view_source_scope_v1_offline.cjs` e `tools/verificar_comandas_view_source_scope_v1_offline.cjs`. A política de segregação é de **evidência/revisão**, não um interruptor operacional: **nenhum campo de saída autoriza impressão, deploy ou sequência**. A coesão de identificadores entre três projeções V8.71 permanece importante, mas não é atestado independente do Gestor iFood. A trilha de produção efetiva exige ainda evento/fonte native, exclusividade, roteamento, cancelamento, sequência real e teste físico supervisionado.


### Implementação incremental: isolamento também no renderizador offline

A política de três vistas foi conectada a um **adaptador de prévia**: `tools/comandas_scoped_view_preview_v1_offline.cjs`. Ele reaproveita o renderizador nativo V4.6/V8.71 para obter as duas vias de produção e a conferência a partir do mesmo conteúdo Tecnisa, sem mudar a regra de coerência interna; **somente depois** aplica ao resultado da conferência a eventual falta de conciliação externa iFood. As duas vistas de produção são preservadas byte a byte no replay fictício quando o documento oficial está ausente ou divergente.

- `tools/verificar_comandas_scoped_view_preview_v1_offline.cjs` executa nove cenários no renderer compilado: ausência e divergência de iFood afetam só conferência; perda da revisão nativa, colisão interna e bloqueio semântico legítimo seguem bloqueando todos; source/replay intactos.
- O adaptador é **OFFLINE/REVIEW_ONLY**, não está ligado ao Reader ou ao serviço instalado; não confundir bytes ESC/POS gerados *em memória* com emissão física.
- **Não** remover o veto global a erros reais da fonte Teknisa; ele ainda protege todas as vias. Não alterar identificadores nativos de produção para refletir dados independentes do Gestor iFood; a conciliação fica no envelope separado da conferência.
