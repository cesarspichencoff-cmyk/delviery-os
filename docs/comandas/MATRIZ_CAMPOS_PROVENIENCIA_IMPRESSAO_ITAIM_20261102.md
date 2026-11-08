# TATÁ Comandas — matriz de campos e proveniência da impressão (Itaim, 02/11/2026)

**Base:** `4d914094` (dossiê autônomo). **Branch:** `audit/comandas-print-provenance-20261102`. **Estado:** REVIEW ONLY · DRAFT · HOLD.
**Sem acesso ao caixa nesta sessão** (`list_computer_folders` vazio). Tudo abaixo vem do repositório: código, metadados já commitados e testes. `CAIXA_MOOCA` é o nome remoto do computador físico do caixa **Itaim** (confirmação de César em 22/10, issue #102).

> **Correção de 02/11 (revisão adversarial, PR #131 comentário 6570127632):** (1) as 38 âncoras garantem a presença de trechos versionados, **não** a exaustividade de todos os caminhos de impressão ativos; (2) a igualdade de tamanhos do log é **igualdade numérica de metadados**, não identidade byte a byte nem entrega física; (3) a frase anterior "impossível por desenho" valia só para o **conteúdo impresso** dos documentos analisados — correlação técnica não impressa, derivada da mesma revisão nativa, continua possível e é exatamente o que a cadeia nativa V1 faz (`docs/comandas/CADEIA_NATIVA_E_CANDIDATA_HOMOLOGACAO_20261102.md`).

## 1. Veredito

A análise autônoma resolve **o que cada código manda imprimir, por canal, e com que identidade**. Ela **não** consegue observar papel, nem o primeiro envio real `DLV_IFO`.

O achado que muda o desenho: **nos documentos nativos analisados, nenhum imprime a chave forte de quatro partes**, e a via de **produção nativa não imprime referência incondicional ao pedido**. Pelo **conteúdo impresso** desses documentos, uma via de produção nativa não passa de `SOURCE_PRINT_FORMAT_PROVEN`. Isso não exclui correlação por metadado técnico não impresso de origem, tentativa e revisão, desde que derivada de evidência independente da mesma revisão. Ele só pode vir da fonte nativa (Reader, chave de 4 partes) + roteamento esperado. Ou de um documento que **carregue a chave por desenho** — a conferência TATÁ.

## 2. Matriz por canal (completa em `data/comandas_print_field_matrix_20261102_review_only.json`)

38 afirmações, cada uma presa a um trecho **literal** do documento-fonte; o verificador falha se o trecho sumir ou mudar.

| Canal | O código manda imprimir | Refutado / ausente | Referência ao pedido |
|---|---|---|---|
| Produção nativa (PHP `ImpressaoPedido`) | quantidade + nome; `TXPRODCOMVEN` por item; destino `printerInfo`; envia a produção, produção 2 e puxa, sem seleção por horário | `COMANDA.: DLV_<N>` existe só no ramo `tipoVenda='C'` **e não estava no papel observado em 30/09**; `SENHA` idem; sem `NRCOMANDAEXT`, `CDPRODUTO`, caixa TATÁ | **nenhuma incondicional** |
| Relatório de Entrega | cabeçalho `Relatorio De Entrega`; `NRCOMANDA`; itens com código/nome/qtd; obs. de item **mesclada** (`DSOBSDESCIT+DSOBSPEDDIGCMD`); `OBS.:` da comanda; cliente/telefone/endereço/pagamento possíveis | sem `NRVENDAREST`, sem `TXPRODCOMVEN` | `NRCOMANDA` (chave parcial); `NRCOMANDAEXT` condicional (fraca) |
| Gestor iFood (IPC) / GP iFood (HTTP :4013) | `invoice` por `@ifood/thermal-printer`, RAW no spooler Windows | **layout desconhecido** — nenhuma fonte no repositório mostra os campos | desconhecida |
| Fiscal NFC-e | — | excluído: não é produção nem conferência | — |
| TATÁ (shadow) | **medido** no renderizador: banner `TESTE - NAO PRODUZIR`, `PRODUCAO <praça>`, `IFOOD x \| TEKNISA y`, `CONFERENCIA`, `Op. ____`; sequência só quando persistida; sem corte | sem endereço/telefone/pagamento (medido) | iFood + Teknisa + sequência — **parcial até a sequência persistida** |

## 3. Achados novos, só com metadados já commitados

**3.1 O log genérico do bridge é a soma exata dos logs por impressora.** Em 04/10, `2026_10_04_IMP.txt` tem **1.055.322 bytes = soma dos 6 arquivos `_IMP_16_<IP>`**, e sua última escrita coincide com a do último destino. Leitura (igualdade **numérica** de metadados, não identidade de bytes): o volume registrado pelo bridge Odhen naquele dia está todo contabilizado em **6 impressoras de produto** (`00002 COZINHA`, `00003/00004 DELIVERY SUSHI 1/2`, `00006/00009 BALCÃO SUSHI 2/1`, `00007 BAR`). `00001 CAIXA` e `00005 BALCAOSUSHI0`, ambas atendidas pelo bridge, registraram **zero bytes**. Se o Relatório de Entrega passasse pelo bridge para o CAIXA naquele dia, o log genérico seria maior. *Limite:* um dia; não cobre GP/Gestor, ForSale/Delphi, impressão via fila Windows nem backup Epson.

**3.2 Endereço duplicado no cadastro.** `192.168.0.232` é o IP de `00007 BAR` **e** de `00010 CAIXA2` (este sem servidor de periféricos). Nenhum documento registrava isso. O arquivo `_IMP_16_192.168.0.232` resolve para BAR só porque CAIXA2 não é atendida pelo bridge. *Hipótese a verificar:* algo enviado a "CAIXA2" por outro caminho sai fisicamente na impressora do BAR.

**3.3 Arquivo natural de envios reais.** A fila Windows `DELIVERY SUSHI 1` retém os trabalhos impressos (`KeepPrintedJobs=true`; 1.086 jobs de 22–26/10). Cada job retido é **um envio**, com enquadramento natural — o problema de framing do log `IMP` não existe ali. *Hipótese a verificar por metadados:* `Printed` numa porta TCP/IP costuma indicar bytes entregues ao endereço; os 204 jobs do almoço podem ter chegado a um equipamento ligado. Falseável pelos eventos de erro/sucesso do PrintService daquela fila na janela do almoço.

## 4. Mecanismo autônomo (implementado e testado; não executado no caixa)

| Peça | Faz | Nunca faz |
|---|---|---|
| `tools/comandas_print_document_census_v1_offline.cjs` | decodifica ESC/POS em memória; classifica por marcadores com fonte; devolve só enums e contagens; escada `INSUFFICIENT_EVIDENCE` → `SOURCE_PRINT_FORMAT_PROVEN` → `ORDER_TO_SUBMISSION_CANDIDATE` | devolver texto, hash do conteúdo ou identificador; reconhecer layout iFood; promover horário, código curto, fila ou contador a identidade |
| `tools/comandas_imp_bridge_reconciliation_v1_offline.cjs` | reconcilia tamanhos genérico×destinos, resolve IP→impressora pelo cadastro, lista impressoras silenciosas e colisões | ler conteúdo de log |
| `tools/comandas_print_census_local_runner_v1.cjs` | lê `IMP` ou jobs retidos **somente leitura**, imprime **um** agregado no stdout | escrever arquivo, abrir rede, criar processo, tocar fila, repetir após negação, chamar parcial de completo |
| `src/shadow/passivePrintLog.ts` (correção) | só projeta como Relatório de Entrega o bloco com o cabeçalho certo | aceitar via de mesa/produção como relatório |

**Propriedades provadas por teste** (`tools/verificar_comandas_print_provenance_v1_offline.cjs`, 24/24): (i) só chamadas de leitura; bytes, tamanho e hora da fonte inalterados; (ii) nenhum módulo de rede, processo ou impressora carregado; (iii) canários de PII e identificadores ausentes da saída, também pela CLI; (iv) falha de leitura para sem lançar, e o handle não impede o logger de anexar ou rotacionar (Linux local; Windows na CI desta PR); (v) `EACCES`/`EPERM` param na hora, sem fallback; cotas param e marcam `complete=false`; (vi) sem spooler, job ou `printDirect`.

O decodificador reproduz **byte a byte** o `text_trace` do renderizador TATÁ V4.6 sobre um pedido arquivado real — prova do decodificador, não de layout nativo.

**Vermelho → verde por HEAD** (cópias limpas): em `f6e6e58` (só testes) o parser passivo aceita a via de mesa com **zero** bloqueios e o kit não existe; em `50bb565` ambos passam (`passive-print-log-v132: ok`, `24/24`).

**Regressão local, todos os passos `run:` do job Linux, isolados:**

| Árvore | Executados | Passaram | Falharam (ambiente) |
|---|---:|---:|---:|
| base `4d914094` | 133 | 131 | 2 |
| `50bb565` | 135 | 133 | 2 |

As 2 falhas são as mesmas nas duas árvores (sem `pwsh` aqui; V8.37 só em runner hospedado). Diferença de status: **zero**. Testes principais do `CLAUDE.md` (`build`, `typecheck`, `demo`, `teste_fonte_real`, `verificar_dados_primarios`): saída 0.

## 5. Gate — o que exige autorização específica de César (nada executado)

| Gate | Comando (no caixa, somente leitura) | Responde | Pré-condição |
|---|---|---|---|
| **G1 · censo `IMP`** | `node comandas_print_census_local_runner_v1.cjs --mode=imp-log --root=<Log\MêsAno> --registry=runtime_printer_map_v1.json --authorization-ref=<ref>` | por impressora e dia: há Relatório de Entrega no bridge? a produção traz `DLV_`? quanto é mesa? | Node disponível no caixa (**UNKNOWN**; o bridge é Node, mas não presumir); leitura de `Log` (já houve `EPERM` antes: se negar, para) |
| **G2 · jobs retidos** | `--mode=spool-job <arquivos dos jobs retidos>` | tipo de documento de cada envio a `DELIVERY SUSHI 1`, inclusive no almoço | mapear job→arquivo de spool no host (**UNKNOWN**); diretório de spool exige privilégio: se negar, para |
| **G0 · só metadados** | tamanhos/horários do dia + `reconcileImpBridgeDayV1` | cobertura do bridge por dia; impressoras silenciosas | ferramenta existente `monitor_imp_printer_metadata_only.ps1` |

Saída de todos: contagens e enums. Texto livre nunca sai da máquina.

## 6. 10/10 adversarial

| Pergunta | Estado |
|---|---|
| Campos que cada código manda imprimir | **SOURCE_LEVEL** (matriz ancorada) — iFood: UNKNOWN |
| Formato realmente enviado por impressora | **CODE_READY** (G1/G2 pendentes de autorização) |
| Ligar via de produção nativa ao pedido pelo conteúdo **impresso** | sem chave forte impressa nos documentos analisados; correlação não impressa da mesma revisão segue possível |
| Primeiro envio nativo `DLV_IFO` | UNKNOWN |
| Papel físico | UNKNOWN — nenhuma automação desta PR vê papel |
| Sequência TATÁ persistida | UNKNOWN |

**Decisão de arquitetura que sobrevive:** manter a produção nativa é defensável **no nível de envio** se G1/G2 mostrarem formato e destino coerentes. A conferência TATÁ precisa **carregar a chave de 4 partes + sequência persistida**, porque é o único papel que pode amarrar o pedido.

## 7. Segurança

Efeitos `false`: impressão, spooler, fila, porta, serviço, caixa, Retail, SQL, sequência, fiscal, credencial, leitura de log ou payload, merge, deploy, contato com fornecedor. `PAPER_WORLD_PROVEN=UNKNOWN` · `NATIVE_FIRST_DLV_IFO_SUBMISSION=UNKNOWN` · `10/10=NOT_PROVEN`.

## Auditoria de `LOG/logImpressao` em 08/11 — cupom não equivale à primeira via de produção

Leitura **passiva e limitada** no PC físico Itaim (`CAIXA_MOOCA`), sem SQL, processo, CMD/PowerShell, token, spooler, serviço, exportação de payload ou alteração de arquivo:

- A árvore já existente `C:\Teknisa\LOG\logImpressao\NRORG_5315\` contém pastas `CDFILIAL_0001_CDCAIXA_003` até `010`. Na subpasta `2026_11`, arquivos datados `08-11-2026.txt` estavam presentes nos caixas `004`, `005`, `006`, `008` e `010`. Ausência de arquivo no dia em outras pastas não atesta inatividade desses caixas nem origem `IFO`.
- Metadados desses cinco arquivos, respectivamente: `004=19.221 bytes/652 linhas`, `005=15.079/513`, `006=24.828/846`, `008=13.009/444`, `010=3.621/124`; os tamanhos e contagens são **metadados de log, não número de cupons/impressões**. O `006` teve última modificação por volta de **15:42:43 BRT** (18:42:43Z) no momento da consulta.
- Trechos pequenos dos arquivos `004` e `006` mostram estrutura `respostaTransmissao` / `dadosImpressao` / `DSQRCODE` / `TEXTOCUPOM1VIA` (cupom/documento de transmissão), inclusive um cabeçalho com itens; as amostras examinadas de `004/006/008` não apresentaram marcador literal `iFood` ou `DLV_IFO`. Não foram lidos integralmente nem correlacionados com pedidos; nenhum texto integral de cupom, QR, código fiscal, cliente, item ou destino foi persistido neste registro.

**Veredito limitado:** este `logImpressao` **não é evidência suficiente da primeira via nativa de produção `DLV_IFO` nem de papel físico entregue**. O nome do diretório, suas pastas de caixa e a ocorrência de `TEXTOCUPOM1VIA` não identificam o sincronizador iFood. Não confundir esse log de cupom/transmissão com os logs específicos de bridge `IMP` e de praça; mesmo estes, isoladamente, não provam papel recebido. Manter os canais diferenciados na matriz e evitar reler conteúdos de cupom com dados sensíveis apenas para obter status de impressão.

**Caminhos com potencial de mudar a decisão:** censo visual passivo já autorizado para testar saída nativa real, e vínculo oficial Retail `IFO → unidade → loja/caixa` quando acessível por fonte legitimamente autorizada. O primeiro não comprova o commit completo no SQL; o segundo não demonstra saída física. `FIRST_NATIVE_DISPATCH=UNKNOWN`, `PAPER_CENSUS_NOT_YET_COLLECTED`, `PRINT/CUTOVER=HOLD`.

## Metadados atuais do bridge de produção — almoço de domingo 08/11/2026

Leitura **apenas de nomes e metadados** (sem abrir conteúdo dos arquivos) no PC físico Itaim, pasta preexistente `C:\TEKNISA\odhen-perifericos\Log\112026\`, arquivo do dia `2026_11_08_IMP.txt` e seis destinos `2026_11_08_IMP_16_*.` A associação dos arquivos às praças usa o mapa versionado `data/runtime_printer_map_v1.json` capturado em 30/09, **não** um novo inventário da configuração atual.

| Arquivo/estação indicada pelo mapa | Tamanho da fonte | Última escrita UTC observada |
|---|---:|---|
| Geral `IMP` | 430.485 bytes | 18:37:17 |
| BALCAOSUSHI2 | 88.304 bytes | 18:37:17 |
| COZINHA | 99.610 bytes | 18:37:16 |
| BALCAOSUSHI1 | 68.091 bytes | 18:37:16 |
| DELIVERY SUSHI 1 | 44.879 bytes | 18:01:15 |
| DELIVERY SUSHI 2 | 40.441 bytes | 18:14:14 |
| BAR / CAIXA2 (**IP compartilhado no mapa; destino físico não atestado**) | 89.160 bytes | 18:36:20 |

**Igualdade aritmética observada:** `88.304+99.610+68.091+44.879+40.441+89.160=430.485` bytes, igual ao arquivo geral. Não foi comprovada igualdade byte a byte, exaustividade dos logs, número de submissões ou entrega física. Não foram lidos os conteúdos.

**Achado que muda a observação:** os metadados de `DELIVERY SUSHI 1` e `DELIVERY SUSHI 2` têm última escrita às **15:01:15** e **15:14:14 BRT**, respectivamente, dentro do almoço de domingo (até 16h30 segundo horário operacional informado). O projeto registrava essas impressoras como **informadas desligadas no almoço**, mas **não revalidou o estado de energia nem a identidade do autor do log hoje**. Portanto, nenhuma das duas pode ser chamada de fisicamente ativa, emitente de pedido iFood ou origem de impressão duplicada com base neste dado. Um log `IMP` é registro do bridge e pode conter categorias diversas.

**Decisão:** reforçar no censo já autorizado a verificação visual de eventual saída tardia de `DELIVERY SUSHI 1/2` **somente quando ocorrer naturalmente**, sem ligar impressora, consultar fila, reimprimir ou criar pedido de teste. Se a cobertura da praça não existir ou não puder ser observada, marcar `UNKNOWN/PARCIAL`, jamais 0 ou conformidade. `PRINT_PHYSICAL=UNKNOWN`; `IFO_FIRST_DISPATCH=UNKNOWN`; `STAGE_3=IN_PROGRESS`; `PRINT/CUTOVER=HOLD`.

