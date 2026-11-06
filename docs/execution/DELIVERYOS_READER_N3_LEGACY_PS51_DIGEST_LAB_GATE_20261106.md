# Delivery OS Itaim — N3: hash legado PowerShell 5.1 (laboratório 06/11/2026)

## Resultado comprovado

O verificador complementar distingue hash legítimo gerado pelo ConvertTo-Json -Depth 12 -Compress do Windows PowerShell 5.1, diferença de serialização e alteração de conteúdo. Também avalia estrutura de itens/observações separadamente do hash. Toda saída continua HOLD e nunca autoriza despacho, publicação ou impressão.

Evidência exata: GitHub Actions https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42171144632, commit 2b4bb290cd8b79f571f32e8435043938ef36b7e0, completed/success, 4/4 jobs.

- Testes puros Node: NATIVE_READER_LEGACY_PS51_DIGEST_PASS 12/12 SYNTHETIC_ONLY.
- Testes legados preservados: NATIVE_READER_N2N3_SANITIZED_RECEIPT_PASS 11/11 SYNTHETIC_ONLY.
- Oracle PS 5.1 real no Windows GitHub: NATIVE_READER_PS51_ORACLE_PASS 25/25 REAL_PS51_SYNTHETIC_ONLY MUTATIONS 8/8 NO_FIELD_EXECUTION NO_PII.
- Regressão anterior de no-console: NATIVE_READER_ONE_SHOT_NO_CONSOLE_LAB_PASS 10/10 NO_VISIBLE_PARENT_OR_CHILD NO_FOCUS_CHANGE NO_PII.

O oráculo executou 14 fixtures fictícias: apóstrofo, sinais de ângulo, ampersand, NEL, U+2028, U+2029, acentos, emoji, CR/LF/tab, mistura, sem notas, campos nulos e dois itens. Não foram usados arquivos de comanda, SQL, sessões Chrome, credenciais, GPS ou impressoras.

## Arquivos adicionados na branch isolada

- runtime/reporting/native_reader_legacy_ps51_digest_v1.cjs — base ordenada e emulação estrita do subconjunto confirmado pelo PowerShell 5.1. Recusa tipos não cobertos; guarda contra divergência com snapshotHash canônico.
- runtime/reporting/native_reader_n2n3_sanitized_receipt_v2.cjs — recibo de até 2.048 bytes, sem IDs, hash, arquivo, nome ou observação; hash canônico e legado são comparados independentemente; revisão estrutural feita em cópia apenas na memória.
- runtime/reporting/native_reader_existing_event_binding_v2.cjs — seleciona revisão emitida pelo binding v1; exporta somente bucket de estabilidade (2, 3-9, 10-99, 100+) e veredito sanitizado.
- tests/reporting/run-native-reader-legacy-ps51-digest-tests.cjs — 12 testes fictícios.
- tests/reporting/fixtures/ps51_legacy_event_oracle_LAB_ONLY.ps1 — fonte sintética PowerShell 5.1 com veto explícito ao CAIXA_MOOCA e marcador de laboratório.
- tests/reporting/run-native-reader-legacy-ps51-oracle-diff-tests.cjs — diferencia oito mutações adversariais usando saída do PS5.1 real.
- .github/workflows/deliveryos-silent-fixture-windows.yml — exclusivamente na branch de auditoria, gatilho temporário de push e execução dos testes novos em Linux/Windows; não altera a PR #137 ou produção.

Comparativo do commit-base 85d68758... até 2b4bb290... verificou que nenhum dos seis módulos existentes pinados pelo lançador foi modificado. O novo avaliador NÃO é carregado automaticamente por um executável de produção e ainda não existe versão de campo aprovada.

## Limites inegociáveis

- N3 LAB_TEST_PASS não equivale a N3 FIELD_PROVEN. O corpo de Hash-Text do V2 instalado não foi recolhido e o conteúdo de nenhuma revisão real com caracteres especiais foi lido; o padrão PS5.1 foi inferido do V1, do código observado e das amostras históricas.
- N2 permanece HOLD: SQL READ COMMITTED, RCSI/SNAPSHOT OFF; estabilidade de polls e hash consistente não são prova de leitura atômica de cabeçalho, itens e notas, nem de atomicidade do aplicativo Teknisa.
- N4 permanece HOLD: identidade real iFood, abrangência, frescor e ciclo 3/P/X não atestados.
- UI/segurança permanece HOLD: o teste sem console na VM não garante invisibilidade na sessão da caixa. Não instalar, criar tarefa/serviço, imprimir, tocar SQL ou executar o código no CAIXA_MOOCA sem autorização específica.
- O recibo da nova versão exporta somente contagens, códigos internos e booleanos de classe de caracteres. A privacidade de execução de campo continua exigindo validação independente.

## Autorizações futuras independentes

Q-029: autorização nova, separada e explícita para disponibilizar e executar uma única vez, com operador presente e sem console, a versão de campo do avaliador pinada, lendo no caixa uma revisão já emitida e produzindo exclusivamente recibo sem conteúdo privado. O consentimento anterior para leitura condicional não autorizou instalar ou iniciar novos programas.

Q-030: autorização independente para testemunha SQL só de contagens no mesmo pedido, identidade mínima legítima, plano/índices revisados e limite de tempo/locks verificado. Não usar conexão administrativa ou SERIALIZABLE como atalho. Concordância de contagens isoladas não comprova atomicidade geral.

Estado: N3_LAB_ORACLE=PASS 25/25; N3_NODE=PASS 12/12; N3_FIELD=HOLD; N2=HOLD; N4=HOLD; HOME=HOLD; PRINT=HOLD; V1_ACCEPTED=0/8.
