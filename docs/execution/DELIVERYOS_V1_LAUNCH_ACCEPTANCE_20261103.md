# Delivery OS V1 — contrato mínimo de lançamento do Itaim

**Decisão de César em 03/11/2026:** o lançamento não pode ser somente Entregas, Copiloto Shadow ou demonstração. A V1 somente recebe proposta de liberação quando **a Home/Copiloto realmente recebe pedidos, interpreta praças, distingue produção/pronto/expedição e acompanha o módulo Entregas**, com evidência em operação real autorizada. Melhorias não críticas podem vir como updates **depois**.

**Estado observado na criação:** PR #137 `d71c44c51479c9e5b2257d1d4e813326f03c4826`, branch `feat/gestor-shadow-observer-20261103`, DRAFT/HOLD; PR #135 TATÁ Comandas DRAFT/HOLD. Este documento é requisito de produto **e critérios de prova propostos**, não afirma que integração está implantada.

## Hierarquia e limites preservados

- Home `/` = Copiloto operacional central; `/copiloto` = superfície Shadow; Entregas = módulo prioritário secundário. A autoridade de Calmo/Ambiente/Foco permanece na **Operação Viva**, com **uma** orientação prioritária. Não criar segundo motor, dashboard, mais alertas ou usar protótipo antigo como visual de produção.
- Itaim exclusivamente; nomenclatura de ambientes: **Caixa, Sushi, Quentes, Cozinha, Conferência, Motoboy**. Quentes e Cozinha não são sinônimos. As oito praças internas do motor exigem mapeamento material item→praça/ambiente, com a ambiguidade já registrada em `docs/Mapa_Ambientes_V1.md`.
- Não habilitar API, software house, parceria, licença ou ferramentas de integração **oficiais** iFood/Teknisa. Não adquirir infraestrutura. Não interferir no aplicativo dos fornecedores, nos pedidos em produção, no SQL do caixa, na impressora ou GPS sem autorização específica.
- **Precisão indispensável:** não depender de **integração oficial** não significa que um registro de pedido originado na plataforma de terceiro seja um fato nativo independente. Registrar proveniência. Para ler automaticamente pedidos/itens de terceiros sem API oficial, a alternativa preferencial é **reusar o Reader nativo existente, estritamente read-only, apenas se autorizado e comprovado**, e receber seus eventos pela cadeia própria TATÁ; isso mantém **dependência da disponibilidade dos dados de origem**, embora não da ferramenta oficial. Se esse acesso não puder ser legitimamente executado, nenhuma proposta de “captura por tela/OCR” pode se declarar cobertura total; será necessário um canal de entrada próprio e verificável, sem etapa manual por pedido no pico.
- Nada de rodar ou reativar tarefas com CMD/PowerShell visíveis no caixa. Trabalho preparatório no Foxxy/GitHub; acesso ao host operacional exige efeito e aprovação delimitados.
- Documentos de produto e estética vinculantes: `docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md`, `docs/product/DELIVERYOS_PRODUCT_CONSTITUTION.md`, `docs/design/VISUAL_REFERENCE_HIERARCHY.md`, `docs/Modelo_Operacional_Consciencia_DeliveryOS.md`. Esta especificação de lançamento não cria nova autoridade sobre essas fontes.

## Matriz de aceite — TODOS obrigatórios para declarar V1 completa

| ID | Capacidade de lançamento | Prova operacional exigida | Estado em 03/11 |
| --- | --- | --- | --- |
| L1 | **Pedidos reais do Itaim:** número/identidade interna, revisões, horário, itens, quantidades e observações fiéis | Origem/unidade autenticadas; captura completa de uma revisão real autorizada com campos e quantidades reconciliados; identidade distinta de UUID iFood | **HOLD** — Reader candidato omite observações e completude |
| L2 | **Praças por item:** Sushi, Quentes, Cozinha e demais áreas sem colisão de rótulo | Mapa produto→praça validado no catálogo real, exceções identificadas; teste de itens multiárea e instruções do cliente sem troca de praça | **HOLD** — mapa Quentes/Cozinha ambíguo; classificação de exceções incompleta |
| L3 | **Ciclo de produção:** na praça, aguardando, pronto em praça, pedido consolidado pronto, na conferência, liberado para saída | Provar cada transição com fonte/recibo e comparação com o fluxo físico; diferenciar estado do cabeçalho, itens e conferência | **HOLD** — estados nativos 3/P/X têm semântica real ainda não homologada; não inventar “pronto” |
| L4 | **Copiloto Home:** produção/expedição/praças atualizadas, Calmo/Ambiente/Foco, recomendação única e fundamento | Navegador real mostrando fatos frescos, fontes, atraso, primeira ação humana e estados desconhecidos; sem sintéticos em produção | **HOLD** — código/motores em parte implementados; alimentação real e Home completa não comprovadas |
| L5 | **Conferência e sacolas:** pedido correto, kits, quentes/frios, observação crítica, lacre e pronto para expedição | Identidades vinculadas, prova do ato físico; não transformar impressão em `pronto`; não prescrever duas sacolas sem regra comprovada | **HOLD** — fronteira físico↔evento próprio ainda não atestada |
| L6 | **Entregas:** viagem própria, motoboy, saída, chegada, entrega, status, GPS consentido e offline/reenvio | APK/Room/worker real em Xiaomi, reenvio e reinício sem duplicidade, recibo de servidor e ator; sem regressão de autorização | **HOLD** — testes Node/ficção passaram; aparelho e fluxo completo não |
| L7 | **Jornada integrada:** pedido→praças→pronto→conferência→motoboy→entrega→Copiloto | No mesmo cenário com pedido real autorizado, conferir sequência, frescor, integridade, correlação e retorno à normalidade após exceções | **HOLD** — provas separadas não são jornada integrada |
| L8 | **Operação silenciosa e segura:** sem popups CMD/PowerShell, sem writes/prints involuntários, sem vazamento de dados | Observação no Windows Itaim e iPhone/Xiaomi com consentimento, desligamento/rollback comprovado, aprovação humana | **HOLD** — não verificado na versão final |

**Status total:** 0/8 linhas com prova ponta a ponta de campo exigida; isso **não apaga** testes unitários e verificações de laboratório anteriores. Não transformar `CODE_READY` ou `CI_PASS` em `WORLD_PROVEN`.

## Rota de implementação mais curta — sem recomeçar do zero

### 1. Fonte nativa e Reader existente (caminho crítico)
Procurar primeiro o watcher nativo **já construído** e sua saída protegida, sem novo monitor e sem tela do Gestor como fonte canônica. Alinhar a candidata de TATÁ Comandas da PR #135 com o contrato de consumo já escrito: seleção de `DSOBSCOMANDA`, `DSOBSDESCIT`, `DSOBSPEDDIGCMD`, `TXPRODCOMVEN`, `observation_rows`, `observation_scan_complete` apenas após captura integral, chave de quatro partes e hash SHA-256 canônico com paridade PowerShell↔Node inclusive apóstrofo, acento e ordem de campos. Preservar contagem de itens/linhas, provar não truncamento, evitar dados pessoais em logs/chats.

**Não** alterar serviço instalado ou banco no escuro. Primeiro validar candidata offline; após gate de escopo, verificar instalada/identidade/bytes e **uma** revisão real do Itaim em modo de leitura. Quando SQL transacional consistente for necessária, verificar recursos já existentes; não ativar opções de banco em produção por conta própria. Fonte externa continua rotulada como tal.

### 2. Descoberta de estado real — sem chamar P de pronto por palpite
Existem estados nativos `3`, `P`, `X` e transições entre eles. O significado de cada estado, cancelamento, revisão e `pronto` deve ser provado por observação supervisionada de pedidos, não por suposição de enum. Distinguir:
- item iniciado / item pronto por praça;
- comanda ainda em produção / comanda pronta;
- comanda conferida, lacrada ou pronta para motoboy;
- retirada / saiu / entregue (recibo Entregas).
Se o sistema de origem não entrega `pronto por praça`, não criar esse fato a partir de `pedido pronto`. Produzir a informação por um evento próprio em fluxo TATÁ existente, sem preencher vários campos no pico.

### 3. Mapeamento real de praças
Reaproveitar catálogo e classificação do TATÁ Comandas/Academia, sem presumir equivalência entre `cozinha_quentes` e o rótulo operacional `Quentes`. Resolver os itens ambíguos por evidência de via/prática da unidade, preservar múltiplas praças e quantidades, não contar uma linha duas vezes. `Caixa` e `Conferência` sem cobertura de fila devem aparecer `sem medição automática`, não verde.

### 4. Home Copiloto existente, sem segunda inteligência
Projetar fatos atestados e frescos pela cadeia já presente para a **Operação Viva** e a Camada de Decisão preexistente. Sinais com cobertura incompleta não recebem prioridade operacional factual. Testar:
- pedido pendente em praça, situação resolvida, pedido pronto confirmado;
- pedido preso por uma praça (apenas se item/estado são comprovados);
- conferência/lacre/observação pendente e pronto aguardando motoboy (apenas após recibos);
- atualização atrasada, origem indisponível, divergência e pedido cancelado;
- regra de **Foco único**, outros riscos ainda visíveis, e `desconhecido` não produz `Calmo`.

### 5. Entregas e jornada de ponta a ponta
Reusar Room/WorkManager + contratos de eventos/recibos, nunca `SimulatedCopilotoConsumer` como produção. Verificar fluxo Android no Xiaomi, identidade do ator e unidade, divergência de dois aparelhos, estados offline locais versus ACK do servidor, GPS só autorizado e no escopo da viagem. Depois cruzar a viagem com pedido e lacre por identidade comprovada, sem casar apenas número ou proximidade de hora.

### 6. Gate de campo e autorização
A sequência é **Foxxy isolado → navegador real de QA → verificação read-only autorizada no Itaim → teste acompanhado iPhone/Xiaomi → ensaio almoço e jantar → revisão adversarial de evidências → decisão humana de piloto**. Não fazer merge/deploy, ligar serviços, imprimir, acessar pedidos de clientes ou autorizar captura de GPS como subproduto deste documento.

## Regras de eficiência e updates
- **Sem reescrever mecanismos aprovados**: adaptar interfaces e contratos mínimos na PR de TATÁ Comandas e no Delivery OS; não comprar ferramentas nem criar terceiro coletor.
- **Caminho crítico L1→L2/L3→L4/L5→L6→L7/L8.** L6 pode evoluir em paralelo, mas nenhum lançamento parcial deve ser renomeado como completo.
- A cada checkpoint registrar: `PR + SHA`, mudança efetiva, prova executada, lacuna real e próximo teste; medir progresso por capacidades aceitas, **não** por número bruto de testes.
- Regras que podem mudar jornada, sentido do Foco, semântica de ambientes, integração e ações físicas seguem sujeitas à aprovação humana; não confundir solicitação de finalizar com autorização de efeitos sensíveis.

## Pesquisa de referência (mecanismo, não prova do nosso software)
- Microsoft: listas virtualizadas não expõem todos os itens à árvore UI Automation: https://learn.microsoft.com/en-us/windows/desktop/WinAuto/uiauto-workingwithvirtualizeditems
- Microsoft SQL Server: leituras consistentes dependem da configuração e nível de isolamento; `READ UNCOMMITTED` pode ver alterações não confirmadas: https://learn.microsoft.com/pt-br/sql/t-sql/statements/set-transaction-isolation-level-transact-sql?view=sql-server-ver17
- Android: persistência local, sincronização, conflitos, WorkManager: https://developer.android.com/topic/architecture/data-layer/offline-first

**Fronteira de prova no momento deste documento:** CONTRATO_DE_LANÇAMENTO=REGISTRADO; LEITURA_REAL=UNKNOWN; PRAÇAS_REAIS=UNKNOWN; PRONTO_POR_PRAÇA=UNKNOWN; HOME_PONTA_A_PONTA=UNKNOWN; ANDROID_CAMPO=UNKNOWN; DEPLOY=NO; WORLD_PROVEN=NO; HUMAN_ACCEPTED=NO.
