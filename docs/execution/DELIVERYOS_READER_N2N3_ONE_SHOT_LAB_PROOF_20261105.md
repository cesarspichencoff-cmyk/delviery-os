# Delivery OS Itaim — recibo N2/N3 de uso único, prova sem console em laboratório

**Checkpoint:** 05/11/2026. **Etapa:** L1/8, N2/N3 **ainda HOLD em campo**. PR [#137](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/137), branch `feat/gestor-shadow-observer-20261103`, DRAFT/HOLD. O objetivo é transformar o verificador puro existente num **caminho de execução local, de uma revisão**, sem exportar conteúdo de clientes ou criar janela de terminal. Este documento é prova de **laboratório**, não autorização para usar no caixa.

## Implementação versionada e identidade das fronteiras

1. `runtime/reporting/native_reader_n2n3_sanitized_receipt_v1.cjs`: verificador puro da revisão já preparado, que utiliza `normalizeVerifiedLegacyNativeHashV1` e `native_reader_producer_contract_review_v1.review`. Nenhuma leitura de arquivo/SQL ou saída de payload. Mesmo se passar, mantém `state=HOLD`, `ordersPublishable=0`, `sourceIdentityVerified=false` e `n2ObservationReadIndependentlyComplete=false`.
2. `labs/reader-proof/native_reader_one_shot_lab_cli_v1.cjs`: **somente LAB**, lê um único `synthetic-event.json` sob diretório temporário de nome exato `deliveryos-reader-proof-lab`, com `LAB_ONLY.txt` de valor obrigatório. Recusa hostname `CAIXA_MOOCA` e diretório errado, acesso por links simbólicos, arquivos acima de 256 KiB, nova leitura após troca aparente de metadados e substituição de recibo existente. Escreve exclusivamente `receipt.json` limitado a 2048 bytes, em modo exclusivo; não emite stdout, stderr, IDs de pedidos, notas nem hash de pedido. Buffer de leitura é zerado em `finally` (não significa garantia de apagar todos os objetos JS em memória).
3. `labs/reader-proof/NativeReaderOneShotLabLauncher.cs`: aplicativo Windows compilado com `/target:winexe`, que recusa execução no `CAIXA_MOOCA` como **primeira condição**, exige raiz/marcador de laboratório, executa **um** processo `node.exe` com `UseShellExecute=false`, `CreateNoWindow=true`, `RedirectStandardOutput/StandardError=true` e descarta as saídas. Termina com código de estado sem imprimir caminhos ou conteúdo.
4. `tests/reporting/build-reader-one-shot-lab-fixture.cjs`: evento **inteiramente fictício** com dois campos relevantes para prova: item e observação contendo apóstrofo/acentuação, SHA legado uppercase recomputável. Não contém dados de clientes reais.
5. `tests/reporting/run-reader-one-shot-lab-tests.cjs`: **10/10 testes** de input limitado, alteração do hash, diferença PowerShell/apóstrofo, erro JSON, links externos, falta de marcador, não sobrescrita, privacidade e claims falsos de fonte real.

## Provas no ambiente correto

[GitHub Actions #41970189987](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41970189987), commit de CI `05e4bfe54540e836f781feb7eaf814b5cc316f85`: **completed/success, quatro jobs**.

- Linux contratos: `NATIVE_READER_ONE_SHOT_LAB_PASS 10/10 SYNTHETIC_ONLY`.
- Windows: compilou o lançador GUI sem subsistema de console, executou-o com **um processo Node filho**, conferiu recibo sem informações pessoais, mediu em **dez amostras** a ausência de janela superior visível nos PIDs do lançador e do filho, e comparou a janela em foco antes/depois. Log: `NATIVE_READER_ONE_SHOT_NO_CONSOLE_LAB_PASS 10/10 NO_VISIBLE_PARENT_OR_CHILD NO_FOCUS_CHANGE NO_PII`.
- Os jobs de contratos anteriores, Edge V3 e Reader por praça também passaram.

**Limite de validade:** dez amostras e checagem de código não provam a ausência absoluta de qualquer flash submilissegundo nem que o mecanismo será silencioso em sessão Windows diferente. `LAB_ONLY` e recusa do hostname fazem parte da proteção, mas não provam credenciais, SID, ACL, integridade SQL, cobertura iFood ou autorização de produção.

## O que NÃO foi feito

- Nenhum aplicativo/script/binário novo foi copiado para, iniciado ou instalado no `CAIXA_MOOCA`.
- Nenhum arquivo de pedido, observação, cliente ou SQL operacional foi aberto pelo executor.
- Nenhuma nova tarefa, serviço, extensão, leitor, impressão, janela do Gestor, desbloqueio do projetor, deploy, merge ou cutover.
- O conteúdo privado não foi transferido ao ChatGPT. Testes usaram somente fixtures fictícias de CI.

## Próximo gate de campo, separado

1. **Escopo e autoridade:** decidir uma variante explicitamente autorizada que possa ler **somente uma** revisão já emitida sob a identidade correta do Reader, sem acesso SQL adicional e com limites de tamanho, tempo, diretório e retorno. O programa atual de LAB **não é essa variante**; não remover o guard de caixa apenas para executar.
2. **Invisibilidade e rollback no Windows real:** obter canal de invocação intrinsecamente sem console, com identidade/permissão mínima, ensaio supervisionado e interrupção observável. Não usar `start_process` remoto nem CMD/PowerShell no caixa, porque essa superfície não demonstrou ausência de popup.
3. **Recibo e prova independente:** gerar o recibo local sanitizado, comparar contagens, joins, SHA canônico e fim de leitura com evidência de fonte/consulta **independente**. `observation_scan_complete=true` autodeclarado não atesta esgotamento SQL.
4. **N4 e N5:** identificar autenticamente origem/frescor e estabelecer que o conjunto visível corresponde ao escopo Itaim `DLV_IFO`, sem inferir 100% de cobertura a partir de `TOP 50`. Só depois da autorização distinta de publicação permitir que a Home reflita pedidos reais.

**Resultado:** `CODE_READY + LAB_TEST_PASS`. `DEPLOYED=NO`; `FIELD_PROVEN=NO`; `N2/N3=HOLD`; `V1_ACCEPTED=0/8`.
