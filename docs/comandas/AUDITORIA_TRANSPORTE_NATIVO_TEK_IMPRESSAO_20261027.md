# TATÁ Comandas — auditoria do transporte real de impressão da Teknisa

**27/10/2026 · ITAIM / CAIXA_MOOCA · PR #127 · observação passiva de código PHP, nenhum job aberto ou emitido**

## Hipótese que a análise falsificou

A ideia de substituir as vias antigas por uma **impressora virtual sem papel** é viável em determinados arranjos, mas **não pode ser aplicada só porque as impressoras físicas aparecem como filas Windows**. O código da Teknisa instalado na caixa permite **três caminhos de transporte** e o modo realmente ativo é selecionado por parâmetros de execução. Uma porta local Windows `NUL` **não intercepta automaticamente** chamadas HTTP, escrita direta em portas ou arquivos enviados a outro despachante.

### Evidência na CAIXA_MOOCA (somente leitura)

Arquivos instalados e fingerprints SHA-256 lidos no host, todos com mtime 09/06/2026 17:01Z:

| Componente | SHA-256 | Prova delimitada |
|---|---|---|
| `vendor/odhen/api/src/Service/ImpressaoPedido.php` | `BECAE373377F965C2DD2B8AB1DE9A904C71C6B820EB35980A894279C28670E52` | Organiza `impressoraProducao`, `impressoraProducao2` e `impressoraPuxa`, e entrega ao serviço de impressão |
| `vendor/odhen/api/src/Lib/ImpressaoUtil.php` | `F04B0EE353BC0044C4307098298AA8901B1B4F3999B8220FE0051F6214B711A0` | Obtém os parâmetros `UTILIZA_IMPRESSAO_PONTE`, `UTILIZA_IMPRESSAO_PHP`; seleciona o caminho na execução |
| `vendor/odhen/api/src/Remote/Printer/Printing.php` | `982B3061ACE42E2D084B89C240C86D5775C3FE0C0DD8A4FC87CB7473E4D29B30` | `sendPrint()` chama a ponte com `curl->request('/print', {printerInfo, commands})` |

**Ramos nativos efetivamente encontrados no código:**

1. `UTILIZA_IMPRESSAO_PONTE` verdadeiro → `configuracaoPonte` / `sendPrint` → requisição **HTTP `/print`** para a URL de periféricos configurada, com dados de impressora e comandos. Para uma via não fiscal, `imprimeNaoFiscal` também usa `requisicaoPonte` em determinadas condições. **Não foi feita requisição HTTP** durante a auditoria.
2. Sem ponte e com `UTILIZA_IMPRESSAO_PHP` verdadeiro → `impressaoPhp` usa `fopen($porta, 'w')`, `fwrite` e `fclose`. `$porta` é escolhido a partir de `DSIPIMPR` ou `CDPORTAIMPR`. **Não prova** que essa porta seja uma fila Windows: ela pode ter outra semântica no host.
3. Sem ponte e sem PHP → `impressaoDelphi->imprimeArquivo($fileName, $text)`, após a criação do diretório de impressão. A cadeia que recebe esse arquivo e decide o destino **não foi rastreada**, logo não se supõe que passe pelo spooler Windows.

O ramo ponte tem **prioridade** quando está ativo, independentemente do segundo parâmetro. A presença dos três ramos no PHP não diz qual foi usado na impressão dos pedidos reais de outubro. **Valores ativos atuais dos dois parâmetros, transporte do periférico e eventuais caminhos secundários permanecem UNKNOWN**. A verificação das filas Windows já feita anteriormente não resolve essa identidade causal.

Este documento **não afirma** que `ImpressaoPedido.php` seja o primeiro evento disparador de produção para `DLV_IFO`; o elo pedido iFood → tentativa de impressão precisa de prova independente. Nem o caminho do Gestor iFood foi atestado. A documentação relata que em 25/10 sua impressão estava desligada, sem prova atual de configuração ou outras saídas.

## Alteração efetivamente codificada

O módulo puro `tools/comandas_teknisa_transport_census_v1_offline.cjs` agora verifica **declarações de revisão** de:
- loja/unidade nativa Itaim;
- fingerprint dos três arquivos de origem;
- flags de runtime tipadas estritamente como booleanos com evidência/fingerprint;
- destino efetivo da via específica, distinguindo `WINDOWS_SPOOLER_QUEUE`, `DIRECT_OR_NETWORK_PORT`, `FILE_BRIDGE` e `UNKNOWN`;
- compatibilidade entre o modo PHP ativo alegado, o caminho final e a proposta de `UPSTREAM_PRINT_OFF` ou `WINDOWS_NUL_REDIRECT`.

Se as flags estiverem ausentes ou incorretas, o resultado é **HOLD**. Se a fonte alegar ponte HTTP mas não provar que a própria ponte envia à fila Windows que seria desviada para NUL, o resultado é **HOLD**. O mesmo vale para o despachante Delphi. Se o transporte final for TCP/IP direto ou arquivo sem fila Windows, **NUL não é caminho interceptador**.

Mesmo quando a estrutura se alinha, o resultado é **REVIEW_CANDIDATE_ONLY**: não há atestação independente do host, porta modificada, papel suprimido ou autorização. A NUL é somente destino sem papel; não é gatilho de leitura de pedido, evento de produção ou recibo físico.

O módulo `tools/comandas_legacy_virtual_cutover_review_v1_offline.cjs` passou a **exigir esse pré-voo compatível com a ação proposta** como condição necessária, além das provas existentes de Reader, primeira via, sequência TATÁ persistida, estação/hora, classificação, fiscal e relatórios essenciais, exclusividade do emissor e rollback. A sugestão de redirecionar uma via antiga jamais vira permissão operacional apenas porque um fixture declara prova.

## Evidências de teste

- `tools/verificar_comandas_teknisa_transport_census_v1_offline.cjs`: **20/20 PASS**, três modos, tipagem, flags ausentes, destinos diretos, HTTP/Delphi sem prova da fila downstream, snapshots inválidos e `NUL` jamais sendo gatilho.
- `tools/verificar_comandas_legacy_virtual_cutover_v1_offline.cjs`: **32/32 PASS** após integração: transição em sombra, duas origens independentes, nenhuma desativação fiscal, provas ausentes e incompatibilidade entre modo nativo e proposta de desvio.
- Execução no **Foxxy em clone descartável**, commit `05426dbd2ac962526b73c7c37b8934d925f3fa9d`, `OFFLINE_TRANSPORT_REGRESSION=SUCCESS`, sem execução operacional no caixa.
- Os dois scripts foram incluídos no workflow Linux/Windows; **não declarar CI integral até sucesso no HEAD exato**.

## Próximo passo comprovável e seu limite

O próximo censo, **passivo e com escopo de fonte definido**, precisa obter apenas o modo ativo de impressão de pedidos na integração da Teknisa, o nome/identidade do serviço periférico que recebe `/print` caso a ponte esteja ativa, se essa ponte usa realmente as filas Windows vistas no caixa ou IP direto, e se o GP/iFood tem saída separada. Evitar exportar URLs com credenciais, payloads, nomes de clientes, documentos, números de pedidos, configuração fiscal ou registro bruto de impressão.

**Não desativar `UTILIZA_IMPRESSAO_PONTE` por conta própria:** é um seletor de transporte, não uma comprovada opção de "não imprimir comandas". Trocar esses parâmetros pode deslocar impressão para o ramo PHP/Delphi, não suprimir o trabalho. Não criar NUL, monitor virtual, port mirror, proxy TCP ou desligar filas físicas antes de provar que a alteração cobre exatamente as vias antigas e não atinge notas fiscais/relatórios.

**Fronteira de ação:** NO PRINT / NO PRINTER CONFIG CHANGE / NO WINDOWS QUEUE READ/WRITE / NO NETWORK REQUEST / NO TEKNISA PARAM CHANGE / NO IFOOD CHANGE / NO SEQUENCE WRITE / NO DEPLOY / PR DRAFT-HOLD.
