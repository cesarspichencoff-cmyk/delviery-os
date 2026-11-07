# TATÁ Comandas — decisão técnica: encontrar o primeiro despacho sem duplicar vias

**Data:** 01/11/2026 · **Unidade:** Itaim (`0001/01`) · **PR:** #127 DRAFT/HOLD · **Tipo:** pesquisa pública + revisão dos arquivos do projeto, **sem acesso operacional novo**.

## Resposta objetiva

**Caminho preferencial: provar a origem nativa `DLV_IFO` → geração da comanda ForSale → callsite da primeira solicitação de produção → transporte ativo → destino e backup.** Usar inicialmente somente código/artefatos já existentes e, quando houver autorização específica e mecanismo legítimo, leitura passiva e minimizada de uma ocorrência natural. Não tentar localizar o evento por status, número curto, título no spooler nem por criação de uma segunda via.

**Não há prova hoje** do componente/versão de primeira tentativa em produção, do seu transporte efetivo, da exclusividade do emissor antigo, da sequência TATÁ V2 persistida ou do efeito físico. Esta decisão não libera implantação nem captura em host.

## Por que essa rota venceu

### Evidência de fonte oficial, delimitada

1. [Teknisa — APIs do Retail](https://www.teknisa.com/api) descreve `POST /order` como captação de **pré-pedido** que depende de caixa PDV para virar venda. `/orderStatus` informa rótulos `em produção` e `cupom impresso`, mas não fornece a identidade causal da primeira chamada de impressão, a praça, o backup ou prova de papel.
2. [Teknisa — Manual de Integração iFood v4.2.0](https://ead.teknisa.com/wp-content/uploads/2025/11/Manual-Integracao-Teknisa-iFood.pdf), página impressa **3**, declara que a integração vai autonomamente até a **geração da comanda ForSale**. Não diz que a geração da comanda é a chamada de impressão de produção e não demonstra o runtime desta loja.
3. [Teknisa — Retail delivery](https://www.teknisa.com/produtos/retail/delivery) descreve pedido entrando no PDV e seguindo à produção, um modelo geral, não o callsite exato do Itaim.
4. [Microsoft — PrintService evento 307](https://learn.microsoft.com/en-us/answers/questions/1332280/identify-printer-usage-statistics-in-a-certain-ser): útil para trabalhos que passam pelo Windows PrintService quando o log está habilitado; **não captura necessariamente impressões diretas** nem identifica o pedido ForSale nativo e tampouco atesta papel.
5. [Microsoft — Sysmon](https://learn.microsoft.com/en-us/windows/security/operating-system-security/sysmon/sysmon-events) e [Process Monitor](https://learn.microsoft.com/en-us/sysinternals/downloads/procmon): podem detalhar processo, origem, conexões e atividade de arquivo, **mas geram telemetria de sistema**, potencialmente sensível, e requerem disponibilização/configuração/captura autorizada. Não são primeira escolha nem comprovam papel isoladamente.

### Evidência local já preservada na PR

- `docs/comandas/TOPOLOGIA_EVENTO_IMPRESSAO_ORIGEM_NATIVA_20261026.md`: `Account::order` após `commit` inicia a via de **mesa**, `GeneralFunctions::reprintPedido` é **reimpressão**, `ImpressaoDelivery` em `Venda.php` é **relatório pós-venda**. Busca em **133 arquivos PHP** encontrou `DLV_IFO` apenas no cabeçalho do relatório; isso **não** prova inexistência de integração fora desse universo.
- `docs/comandas/AUDITORIA_TRANSPORTE_NATIVO_TEK_IMPRESSAO_20261027.md`: três trilhas condicionais da Teknisa: `UTILIZA_IMPRESSAO_PONTE` HTTP `/print`; `UTILIZA_IMPRESSAO_PHP` porta direta; `impressaoDelphi` arquivo/serviço. A ponte Odhen tem fila própria, caminho Epson DLL e backup possível. O modo efetivo da primeira via `DLV_IFO` continua **UNKNOWN**.
- `docs/comandas/AUDITORIA_IFOOD_DOIS_CANAIS_IMPRESSAO_INSTALADOS_20261027.md`: GP iFood HTTP e Gestor iFood IPC são dois caminhos próprios, separados do nativo Teknisa. Presença/ACK não é uso real nem papel.
- `data/tata_reader_passive_print_log_source_proof_20261005_v1.json` + `data/tata_reader_passive_print_metadata_observation_20261005_v1.json`: sete logs IMP observados encerraram a gravação **antes** da abertura da comanda de referência. O teste `verificar_comandas_imp_historical_temporal_gate_v1_offline.cjs` exclui esses logs como prova do despacho **dessa comanda** sem concluir que impressão não ocorreu.
- `tools/comandas_native_first_dispatch_correlation_v1_offline.cjs` já valida consistência de alegações Reader/primeira tentativa/journal; suas flags de fonte independente permanecem falsas.

## Decisão de sequência (custo, risco e poder de prova)

| Ordem | Fonte/método | O que pode resolver | Limite e decisão |
|---|---|---|---|
| **1 — agora** | Busca nos arquivos, hashes, contratos e código já obtidos | Refinar hipóteses, excluir falsos gatilhos e identificar função de destino | **Aprovado para revisão offline.** Não autentica runtime |
| **2 — primeiro gate vivo, não executado** | B0 presencial/legítimo de somente leitura dos quatro agregados do Reader **já delimitados**, com identidade do host e ACL respeitada | Saúde atual, compatibilidade de versão e condições de inspeção | Exige permissão e canal legítimos; `EPERM` e cota anteriores **não devem ser contornados**. B0 não identifica first dispatch |
| **3 — gate vivo específico, não autorizado** | B1, **fonte nativa de integração previamente identificada**, metadados minimizados da chamada de primeira produção e correlação de **uma ocorrência natural** pela chave `CDFILIAL|CDLOJA|NRVENDAREST|NRCOMANDA`, revisão e praça | Pode provar o elo entre a comanda e um pedido de primeira tentativa, quando acompanhado de custódia independente | Exige aprovação de fonte, aparelho, alcance, identidade, privacidade e meio de leitura. Não buscar payload integral ou credenciais |
| **4 — auxiliar, somente se B1 justificar** | Log Windows PrintService **já habilitado** ou log nativo Odhen existente, observando apenas metadados autorizados | Identificar eventual caminho de fila e destino/backup | Não usar como única prova nem extrapolar para Epson DLL/porta direta. Não habilitar log/alterar fila sem autorização |
| **5 — último recurso** | Instrumentação temporária direcionada (ex.: Procmon/Sysmon), se necessária | Correlacionar processo e chamada quando não houver logs preexistentes suficientes | **Não executar agora**: envolve coleta nova, risco de dados sensíveis/custo operacional; aprovação separada, janela, filtro mínimo, retenção, STOP e rollback |

### Critérios de saída de B1

A evidência precisa vincular **a mesma revisão** da comanda `DLV_IFO`, um callsite **efetivamente invocado**, a primeira tentativa distinta de reprint, uma praça/destino principal, backup conhecido e um evento compatível na mesma janela. A origem do código (hash/versão), a identidade da unidade e a custódia dos registros têm de ser independentes das simples alegações do consumidor. Sem isso: `FIRST_NATIVE_DISPATCH=UNKNOWN`.

O efeito de papel **não** se prova por `/orderStatus`, `IDSTCOMANDA`, `NRCOMANDAEXT`, `FosExp.exe`, `printOrderReply`, resposta JSON `status:202`, `PrintService/307` nem timestamps aproximados. Os dois tickets de **produção** continuam exclusivamente ligados aos itens/quantidades/observações nativos da Teknisa; a comparação independente iFood × Teknisa afeta **somente a conferência**. Não selecionar impressora pelo horário, não desligar parâmetro compartilhado `IDIMPPEDPROD`, não presumir que `NUL` intercepte Epson nativa ou que desativar GP desative o Gestor.

### Portão posterior — separado

Mesmo com `READONLY_SOURCE_TRACE_PROVEN`, ainda faltam sequência TATÁ de três dígitos **persistida sob chave nativa forte e relida**, reconciliação de cancelamento/retry, produção sem duplicidade, identidade de duas praças e uma conferência, preservação fiscal/mesa/balcão, autorização humana expressa e teste físico supervisionado. A observação da operação não pode liberar efeitos automaticamente.

**Situação:** `FIRST_NATIVE_DISPATCH=UNKNOWN`; `NATIVE_PRINT_TRANSPORT_ACTIVE=UNKNOWN`; `PERSISTED_SEQUENCE_V2=UNKNOWN`; `LIVE_PRINT_AUTHORIZED=false`; `PILOT=HOLD`.

**Ações realizadas para esta decisão:** pesquisa pública, leitura de material versionado, revisão e novos testes offline. **Não realizados:** acesso ao host, captura de pedidos, mudança de acesso, download/instalação de ferramenta, contato com Teknisa, envio de e-mail, SQL, serviço, spooler, impressão, merge ou deploy.


## Refinamento de 01/11 — primeiro verificar vínculo pelo Retail sem segredo (B0.5)

Uma fonte oficial já disponível descreve duas superfícies administrativas pré-existentes **para a integração**, com potencial de reduzir a busca no host antes de recorrer a observação de processos:

1. **Retail → Parametrização → Vendas → Parâmetros de Gestão de Vendas → Parâmetros de Integração e Aplicativos**, projeto iFood: o manual mostra abas **Projeto**, **Unidades Participantes** e **Mapeamento de Produto**. Só interessa **identificador de projeto (IFO)** e vínculo de unidade; **não** abrir credenciais, token, detalhes de pedidos ou cadastro de consumidor.
2. **Retail → Parametrização → Vendas → Integração → Cadastro de Integração**, identificador `IFO`, aba **Unidade**: o manual da Teknisa descreve a opção **Utiliza Loja e Caixa do Vendedor Padrão** e, se desabilitada, uma associação individual de loja e caixa por unidade. Visualizar o estado, sem clicar em Editar, Salvar ou qualquer comando; **não abrir a aba Token**. O exemplo do manual usa filial fictícia 0005 e interface de 2021, **não prova** a localização ou a configuração atual da filial Itaim em 2026.

**Por que este B0.5 antecede B1:** a cadeia de primeira impressão depende de saber qual PDV/caixa efetivamente recebe o pedido iFood da unidade. Se a associação ativa for diversa daquela suposta pelo Reader, qualquer investigação de primeiro despacho em outro host produzirá falso negativo. A inspeção de interface é mais estreita do que habilitar log de impressão, monitor ou capturar rede.

**Escopo e validade:** rota **apenas planejada**, não executada; nenhum login ou clique foi feito. Requer sessão legítima já autorizada, profissional presente e permissão específica de visualizar a configuração; caso a interface atual não exponha o vínculo, haja restrição de acesso, ou a informação seja ambígua, permanecer `UNKNOWN`. Registrar somente: unidade exibida, se integração `IFO` aparece vinculada, se a fonte de loja/caixa é padrão ou específica, identificador mínimo de loja/caixa quando permitido, versão/data da observação, e eventual desvio entre unidade confirmada e Reader; **não capturar tela completa com segredos**. A origem do parâmetro `IDIMPPEDPROD` é compartilhada com mesa/balcão, logo não alterá-lo.

**Fonte:** [Manual Integração Teknisa × iFood 4.2.0, páginas impressas 18–23](https://ead.teknisa.com/wp-content/uploads/2025/11/Manual-Integracao-Teknisa-iFood.pdf). A descrição de caminhos é **documentação de produto**, não observação na máquina.

### Conjunto mínimo de evidências após B0.5

- **Vínculo comprovado da integração:** `IFO`/unidade/loja/caixa em fonte autorizada + identidade técnica do host.
- **Transição comprovada do pedido:** uma chave composta nativa e uma revisão estável lidas por via permitida; sem ID curto como chave única.
- **Primeira tentativa comprovada:** componente+hash/versão+callsite e entrada realmente executada, diferenciada de impressão manual e reimpressão; ponte, PHP direto ou arquivo/serviço explicitamente indicado.
- **Destino e efeito:** praça/backup independentes da hipótese, sem interpretar API `cupom impresso`, status do Windows ou `202` como papel.
- **Operação:** sequência TATÁ atômica, exclusividade, rollback, teste físico e aceite humano precisam de autorização posterior; nenhum item anterior os autoriza.

**Caminho escolhido:** B0.5 (vínculo de integração por interface legítima) → B1 (observação nativa pontual, previamente autorizada) → validação de efeito e sequência → piloto físico expressamente autorizado. Se B0.5 não estiver acessível, não contornar permissão; voltar a `UNKNOWN` e solicitar autorização para **uma fonte específica**, nunca acesso genérico ao host ou monitor permanente.

**Dois atalhos desqualificados:** (a) repetir a mesma busca literal em 133 PHP já revisados; (b) repetir o acesso aos quatro arquivos do Reader que retornaram `EPERM` com outra conta/ferramenta. Nenhum dos dois muda a falta de prova do primeiro despacho. 


### Teste de hipótese que pode mudar o host investigado

O mesmo manual lista em **Problemas Frequentes → Caixa sincronizador não encontrado** a opção **Sincronização com Delivery → Realiza sincronização com Delivery Centralizado** dentro de **Cadastro de Caixa** (parâmetros da Frente de Caixa 3). O manual orienta a alterá-la em caso de erro; **aqui não há diagnóstico de erro nem autorização de alteração**. A opção é citada somente como pista: caso a integração atual esteja ligada a outro caixa ou a sincronização centralizada, o rastro do primeiro emissor pode não estar no computador chamado `CAIXA_MOOCA`, apesar de esse equipamento pertencer ao Itaim.

Se houver permissão legítima de **visualizar** essa tela no escopo B0.5, registrar apenas a presença do vínculo e do parâmetro (quando visível, sem dados sensíveis); jamais ativar/desativar sincronização, acessar áreas protegidas ou inferir qual processo efetivamente imprime apenas pelo valor da opção. Isso ajuda a escolher corretamente o alvo de B1 e evita repetir busca negativa no host errado.

**Fonte delimitada:** Manual oficial de Integração Teknisa × iFood 4.2.0, seção 7a (página impressa 26). A edição do manual não comprova a instalação nem os parâmetros atuais do Itaim.


## Atualização de evidência — ramo obrigatório Vendedor Padrão → Caixa (01/11/2026)

A leitura adicional do manual oficial identificou um elo que faltava à ficha inicial **B0.5**: quando `Utiliza Loja e Caixa do Vendedor Padrão = SIM`, o manual requer localizar o **Vendedor Padrão** em `Parâmetros de Gestão de Vendas → Delivery` **e verificar a associação desse vendedor** em `Cadastro de Caixa → Unidade+Loja → Parâmetros → Vendedores Associados` (seções **3.a e 3.d**, além de **5.b**). **Não é correto escolher um caixa apenas pelo nome do computador, pelo destino de entrega ou pela flag de sincronização.** Se não houver uma associação inequívoca, `B05_MAPPING_AMBIGUOUS_HOLD`.

Quando `Utiliza Loja e Caixa do Vendedor Padrão = NÃO`, loja e caixa são atribuídos por unidade na integração. Se os dados estiverem visíveis apenas na aba **Token** ou exigirem editar configuração, a checagem **para** sem abrir o segredo. A flag **Realiza sincronização com Delivery Centralizado** é pista de arquitetura, **não prova identidade de processo ou emissor**.

**Procedimento enxuto, sem efeito e sem conteúdo de cliente:** [Ficha B0.5 — origem IFO Itaim](FICHA_B05_ORIGEM_IFO_ITAIM_SOMENTE_LEITURA_20261101.md). Essa ficha identifica precisamente o próximo B1 e evita repetir buscas em fontes que não geram a primeira via. `B05_UNVERIFIED` até observação atual legitimamente autorizada; nenhum dado de configuração do Itaim foi obtido por esta pesquisa.


## Rota de destravamento revisada — evidência paralela + entrega incremental sem papel (01/11/2026)

### Nova evidência real, delimitada

- Em \`CAIXA_MOOCA\`, a lista de processos contém \`Fos\`, \`FosImp\`, \`FosSinc\` e \`FosExp\`, todos em execução na observação local. Isso é mais forte que apenas encontrar binários instalados, mas ainda **não** demonstra o callsite \`DLV_IFO\` ou uma primeira tentativa.
- A instalação Odhen Periféricos contém \`version.json\` com \`5.8.2\` (declaração do pacote, não identidade de instância nem confirmação do transporte ativo).
- \`Get-WinEvent -ListLog Microsoft-Windows-PrintService/Operational\` retornou **IsEnabled=True**, **RecordCount=2058** e **MaximumSizeInBytes=1052672**. **Só metadados do canal** foram lidos: nenhum registro/evento, nome de documento, usuário, endereço, spooler ou pedido foi acessado. A capacidade pequena impede prometer retenção de eventos até uma investigação futura. Canal habilitado não prova que os envios da Teknisa passem pelo spooler.
- A conexão do navegador da sessão atual **não estava disponível** para ler a interface Retail: Browser exigiu contexto da extensão conectada; Opera informou conector desconectado. Não houve tentativa de login por outro canal ou de ultrapassar ACL.
- O manual oficial *Teknisa × iFood 4.2.0* descreve recebimento até geração de comanda ForSale, enquanto a documentação da *Order API* menciona envio à cozinha. **São integrações/documentos distintos**; não converter a segunda descrição em prova do evento iFood/IFO desta unidade.
- A review oficial Retail agosto/2025 descreve alteração de timing para **pedidos TAA Mobile em dinheiro**, imprimindo cozinha após cupom fiscal. Esse caso **não é a origem iFood**; serve como alerta para não presumir gatilho universal de impressão por código de status ou nome de executável.

### Romper a dependência sequencial sem relaxar prova

Há **duas rotas independentes de descoberta**, que podem ser pesquisadas simultaneamente em vez de repetir testes de classificação:

**Rota A — fonte administrativa/fornecedor:** identificar \`IFO\` + filial \`0001\` + loja \`01\` + caixa, via interface Retail legítima; \`Vendedor Padrão → Vendedores Associados\` quando essa for a configuração. Se a tela estiver inacessível, solicitar ao suporte Teknisa a identificação documental exata do caixa, do componente que gera primeira impressão, do transporte e de uma **supressão de produção exclusiva IFO** que preserve mesa/balcão/fiscal. Resposta do suporte é prova de contrato/versão declarada; o runtime da unidade ainda exige verificação.

**Rota B — observação pontual de evento natural, somente depois de autorização de fonte e privacidade:** o canal PrintService já habilitado é um **candidato auxiliar**, não um leitor de origem nativa. Uma observação real válida teria de ligar a chave/revisão nativa \`CDFILIAL|CDLOJA|NRVENDAREST|NRCOMANDA\` a uma tentativa de **primeira produção** (não relatório de entrega, reprint ou cupom fiscal), com componente, praça/destino/backup e fonte autenticada, sem payload de cliente. Se evento 307 não expuser chave causal ou se o trabalho for TCP/arquivo/Epson direto, registrar **INDETERMINATE**. Nunca correlacionar só por hora ou inventar identidade pelo nome da fila. Não habilitar log, ampliar retenção, consultar eventos históricos ou instrumentar processos sem autorização específica.

**A/B não são atalho de autorização:** evidência causal do evento e evidência do caixa lógico têm de convergir antes de suprimir qualquer via; nenhuma observação isolada habilita impressão, mudança de configuração, sequência ou deploy.

### Entrega incremental útil enquanto B1 está pendente

**Etapa D0 — conferência digital em sombra, sem papel:** reaproveitar o modelo existente \`tools/comandas_shadow_station_board_v1_offline.cjs\` e as prévias com escopo da conferência; não criar outro motor e não supor que estão ligados ao Reader vivo. Objetivo: demonstrar visualmente roteiro por praça, revisão, quantidades e observações apenas quando a fonte nativa e a classificação estiverem válidas; conciliação independente iFood fica em painel de conferência, em estado **PENDENTE** quando faltar. Esse modo não atribui \`001\` real, não inicia trabalho de produção, não muda o ForSale e não gera impressão. A implantação em dispositivo operacional requer autorização separada, fonte de leitura legítima e política de privacidade.

**Etapa D1 — hipótese de implantação de menor efeito, apenas após prova física da linha de base:** se os tickets nativos já cumprirem as duas vias de produção e **não houver** via de conferência equivalente, uma primeira homologação futura **poderia preservar integralmente o emissor nativo** e adicionar apenas a conferência, com uma única emissão autorizada/observada. Não assumir que as duas vias nativas já existem ou são corretas; sem contagem de papel, destino, conteúdo e deduplicação atestados, D1 permanece **HOLD**. A ausência de conciliação iFood bloqueia **somente a conferência**.

**Etapa D2 — substituição controlada da produção TATÁ:** somente após comprovar supressão seletiva de vias nativas IFO sem afetar outras origens e fallback, implementar sequência TATÁ V2 atômica com chave forte e releitura, idempotência por revisão/praça, dois tickets de produção + um de conferência, reversão testada e piloto físico supervisionado. Não usar \`IDIMPPEDPROD\`, \`IDIMPAUTENTREG\` ou mudanças globais de fila como interruptor geral.

**Decisão atual:** buscar A e preparar escopo B sem ativar B; D0 somente em revisão isolada. \`IFO_RETAIL_LIVE_MAPPING=UNKNOWN\`, \`NATIVE_FIRST_DISPATCH=UNKNOWN\`, \`D1=HOLD\`, \`D2=HOLD\`. Sem mudança operacional no caixa, sem captura de eventos, sem mensagem enviada ao fornecedor, sem merge ou deploy.

## Decisão operacional posterior — descoberta interna, sem contato com fornecedor

**Instrução atual de César:** descobrir a origem do primeiro despacho com investigação própria. Não enviar, preparar envio, agendar ou depender de atendimento com a Teknisa. A minuta histórica de consulta fica suspensa. Nenhum pedido de contato foi enviado.

### Nova evidência do CAIXA_MOOCA (somente leitura, sem PII exportada)

- O canal PrintService/Operational já estava habilitado. Foi feita uma consulta limitada, em memória, aos registros de ID 307 da última hora, devolvendo **somente contagens por nomes de filas conhecidos**. Na observação delimitada foram 154 eventos, não truncados pelo limite de 600: BALCAOSUSHI1 25, BALCAOSUSHI2 23, DELIVERY SUSHI 1 25, DELIVERY SUSHI 2 15, COZINHA 25, CAIXA 35, demais 6. São eventos do Windows, **não 154 pedidos independentes, papéis físicos ou despacho comprovado da Teknisa**.
- Outra janela móvel de uma hora, distinta da consulta anterior, teve 141 registros 307. Foi classificado **apenas em memória** se os títulos continham marcadores de origem; zero continham IFO, iFood, ForSale, FosImp, FosExp, Odhen, Teknisa, Pedido ou Comanda. Nenhum nome de trabalho, ID de cliente, documento, usuário, pedido ou título foi exportado. A diferença 154/141 é de amostras temporais móveis, não regressão ou perda comprovada.
- O evento 307 identifica a fila e parâmetros de trabalho no spooler, mas não atesta isoladamente o processo solicitante, nem captura necessariamente TCP/Delphi/Epson diretos. Portanto **PRINTSERVICE_307_ONLY não é testemunha suficiente do primeiro despacho DLV_IFO**. Não repetir investigações equivalentes como se o evento 307 fosse a prova causal. A documentação Microsoft de MS-RPRN confirma a estrutura de campos de fila/usuário/documento e não inclui o componente de origem ForSale.
- Consulta de nomes de módulos em memória de FosImp retornou **Acesso negado**: nenhuma elevação de privilégio ou rota alternativa foi tentada. O processo Fos está associado a explorer.exe como pai visível; os pais de FosImp, FosExp e FosSinc estavam indisponíveis ou encerrados na consulta, o que não demonstra quem imprime.

### Rota própria escolhida, sem tentar desligar nada

**C1 — fonte da configuração real:** usar exclusivamente uma sessão legítima de leitura do Retail para confirmar a associação atual da integração IFO à unidade 0001/loja 01/caixa ou vendedor padrão. Sem aba Token, exportação de pedidos, abertura de arquivo protegido, login por contorno ou alteração.

**C2 — linhagem de uma impressão natural:** com fonte/evento previamente delimitados e autorização de privacidade, correlacionar a **mesma revisão nativa** do Reader com uma tentativa de produção e com destino, backup e exclusividade. PrintService 307 é somente evidência auxiliar de fila, nunca a identidade causal. Se não houver campo que una a revisão à tentativa, manter UNKNOWN; não aproximar por relógio nem inspecionar dados pessoais.

**C3 — valor sem papel:** continuar com prévia digital isolada e renderizador existente para revisão de quantidade, observação, praça e conteúdo, sem vínculo automático com produção. Avaliar eventual piloto adicionando apenas conferência depois de verificar o papel nativo, sem criar terceira emissão apenas por hipótese. Nenhuma saída física ou numeração persistida sem aceite posterior.

**Lacuna declarada:** IFO_REAL_MAPPING=UNKNOWN; FIRST_NATIVE_DISPATCH=UNKNOWN; ATOMIC_TATA_SEQUENCE=UNPROVEN; PHYSICAL_PRINT=NOT_PROVEN; PRINTSERVICE_ONLY=INSUFFICIENT; PILOT=HOLD. A PR permanece isolada; proibição de merge, serviço, filas, impressões, SQL, fiscal, captura de tráfego, segredos e alterações de Retail.

### Evidência nova de importações nativas PE — principal pista do callsite

Uma leitura estática limitada à **tabela de importações de arquivos binários já instalados** no CAIXA_MOOCA, sem executar/decompilar ou exportar conteúdos, confirmou:

| Binário local | Importação real de DLL | Funções de impressão confirmadas na tabela de importações | Outros indícios por busca de literais locais |
|---|---|---|---|
| FosImp.exe | winspool.drv | OpenPrinterA, StartDocPrinterA, WritePrinter, EndDocPrinter, GetPrinterA, ClosePrinter | marcador FosImp; não identificados iFood/IFO/DLV_IFO nessa lista de marcadores |
| PKG_IMP00000.bpl | winspool.drv | OpenPrinterA, StartDocPrinterA, WritePrinter, EndDocPrinter, GetPrinterA, ClosePrinter | marcadores iFood, IFO e DLV_IFO |
| FosSinc.exe | não foi identificada importação direta de winspool.drv | nenhuma dessas seis APIs em sua lista de importação direta | marcadores iFood, DLV_IFO e IFO |
| FosExp.exe | não foi identificada importação direta de winspool.drv | nenhuma dessas seis APIs em sua lista de importação direta | marcador IFO |
| Pkg_Dlv00000.bpl | não foi identificada importação direta de winspool.drv | nenhuma dessas seis APIs em sua lista de importação direta | marcador IFO |

**Distinção de confiabilidade:** os marcadores por busca de literais nos bytes são indícios de referências embarcadas; para os dois primeiros arquivos, a existência de importações winspool foi **confirmada independentemente por leitura da estrutura PE**, incluindo a enumeração das seis funções. A ausência de uma API importada diretamente não descarta carregamento dinâmico ou uso de biblioteca intermediária.

**Hipótese operacional priorizada, ainda não comprovada:** FosSinc (marcadores da integração iFood) e PKG_IMP/FosImp (APIs de envio ao spooler Windows) merecem investigação de ligação. Não foi provado que FosSinc chama PKG_IMP, que FosImp carrega PKG_IMP, que algum deles recebe a revisão nativa ou que originou qualquer evento 307. A inspeção de módulos do processo FosImp retornou acesso negado; esse bloqueio foi respeitado.

**Identidade de bytes desta amostra:** FosImp.exe SHA-256 ACB10F7B0F6BC5531FA3A36C1036F9A49973426E2F95930F6E2BE5166910570B; PKG_IMP00000.bpl SHA-256 5D2B1B672867FB78B71B1A4BAA185E4754C57ED4A253FEF8C5C7CFFA68646D49; FosSinc.exe SHA-256 EED7C1C11A6DDC5A8E9A9D327DAC91744AE6534478CD5505ADAE975D438BA401. Esses fingerprints vinculam o achado estático a arquivos concretos, não à execução de uma comanda.

**Resultado:** CANDIDATE_PRINT_API_COMPONENTS_IDENTIFIED; NATIVE_IFO_CALLSITE_EXECUTION=UNKNOWN; NO_PRINT=TRUE. O próximo método precisa obter evidência do **vínculo causal de uma revisão com a chamada e a praça** por mecanismo legítimo e minimizado; não reiniciar a inspeção indiscriminada ou promover PE import em prova de uso.
