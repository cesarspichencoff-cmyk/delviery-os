# TATÁ Comandas — CI V8.59 Windows: guarda estrutural da saída sem falsos positivos por relógio

**07/11/2026 · PR #135 · somente CI em Windows descartável, sem acessar o CAIXA_MOOCA.**

## Evidência de falha e limite de interpretação

No commit `681f07d2`, a CI [#42399142894](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42399142894) confirmou a conciliação **36/36 em ambos os sistemas**; Linux terminou `success`. O Windows concluiu com `failure` exclusivamente no passo **TATÁ Comanda first-attempt read-only Windows fixture V8.59**, após o teste 21. A assertiva linha 36 de `tools/verificar_tata_comanda_native_first_attempt_v859_windows.cjs` lançou `NO_CUSTOMER_OR_ORDER_DATA_EXPORTED`.

A assertiva antiga procurava as sequências `9627`, `SEM CEBOLINHA` e `0000348850` em **todo o JSON de saída**, incluindo o campo legítimo `observed_at_utc`. Como o monitor monta o horário `[DateTime]::UtcNow.ToString('o')` com sete dígitos fracionários, é possível que os quatro dígitos `9627` ocorram **casualmente no horário UTC**, não como valor de pedido. Esse cenário explica uma fonte plausível de falso positivo, mas **não demonstra que foi exatamente o que ocorreu no run**, pois a CI deliberadamente não exporta o JSON bruto ao log. Também não descarta uma violação efetiva, que a nova checagem precisa continuar detectando.

Essa mesma assertiva V8.59 já tinha falhado de modo intermitente em commits anteriores sem alteração do código da ferramenta. A contramedida não é repetir a CI até ficar verde nem apagar a verificação de privacidade.

## Contra-rota implementada

Alteração **somente** do verificador Windows sintético `tools/verificar_tata_comanda_native_first_attempt_v859_windows.cjs`, não do programa PowerShell read-only `tools/tata_comanda_native_first_attempt_v859_readonly.ps1`:

1. Parsing JSON **antes** da privacidade; campos de saída sob **allowlist exata de 34 chaves**, com checagem de tipo, contagens não negativas e limites do tamanho da amostra.
2. `observed_at_utc` com data ISO UTC de sete dígitos e horário válido; não confundir seus dígitos com identificador real.
3. Códigos de bloqueio sob **allowlist de 16 motivos internos estáticos**, em vez de permitir texto arbitrário. Estado do diagnóstico e estado da sequência também limitados a enums previstos.
4. Verificação estrita dos campos `effects` e `privacy`: somente chaves conhecidas e todos os valores `false`; flags de autorização/prova continuam `false`.
5. Contraprova sintética: timestamp válido contendo `9627` deve passar; campos extras `order_id`, nota injetada, situação contendo ID fictício e uma contagem textual devem **falhar**. Nenhum identificador, nome, texto de pedido, caminho real ou arquivo operacional é publicado.

O novo teste **não autentica** a fonte, não torna válidos os estados nativos `3/P/X`, não demonstra impressão física, não confere quantidade de pedidos iFood e não converte a CI em prova de operação. Mantém os testes anteriores, tornando a verificação de saída mais específica, determinística e adversarial.

## Gate

O requisito para declarar a correção concluída é a **CI inteira Linux + Windows aprovada no SHA novo**, inclusive a regressão V8.59 e a conciliação 36/36. Não ocultar ou reclassificar a execução anterior com `failure`. Nenhum CMD, PowerShell, SQL, spooler, processo, instalação, impressão, merge ou deploy foi acionado no caixa operacional.

`STAGE_3=IN_PROGRESS` · `DIAGNOSTIC_OUTCOME=LAB_ONLY` · `IFood_TEKNISA_INGESTION_CAUSE=UNKNOWN` · `PRINT=HOLD` · `CUTOVER=HOLD`.
