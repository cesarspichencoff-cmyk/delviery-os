# Delivery OS Itaim — prova de integração Reader N3 v2 em lançador Windows isolado

**Data:** 06/11/2026. **Escopo:** laboratório sintético, PR #138 DRAFT, base PR #137 DRAFT. **Nenhum teste no CAIXA_MOOCA.**

## O que foi feito

Conectamos o verificador complementar N3 (digest legado PowerShell 5.1) à cadeia de uso único em bancada: checkpoint fictício → seleção privada de uma revisão emitida → arquivo fictício já existente → revisão N2/N3 v2 → recibo sanitizado, sempre HOLD.

Foram adicionados, **sem editar os executores v1 pinados**:

- `labs/reader-proof/native_reader_one_shot_lab_cli_v2.cjs` — executor limitado a GitHub Actions no repositório exato, lab de nome/marcador v2; lê no máximo 256 KiB, valida marcador, caminho e tipos de arquivo, não sobrescreve recibos; não chama rede, SQL, navegador ou impressão.
- `labs/reader-proof/NativeReaderOneShotLabLauncherV2.cs` — compilável `winexe`, recusa explicitamente `CAIXA_MOOCA`; verifica a identidade Git de script e oito dependências; lança Node com `CreateNoWindow=true`, saída e erro drenados, timeout de 12 segundos **exclusivamente no laboratório**. Não é lançador de produção.
- `tests/reporting/build-reader-one-shot-lab-v2-fixture.cjs` e `run-reader-one-shot-lab-v2-tests.cjs` — 10 cenários fim a fim, inclusive apóstrofo PS5.1 autêntico, adulteração de quantidade, falso vínculo de observação com hash refeito, marcador ausente, arquivo excessivo, recibo único e origem falsamente declarada.
- `tests/reporting/verify-reader-one-shot-v2-windows-lab.ps1` — prova de identidade pinada, recusa de script falso e dependência alterada, 10 amostras de janela e foco no Windows descartável e validação de recibo.
- `tests/reporting/prepare-reader-v2-ci-exact-blobs.cjs` — **exclusivo da VM GitHub Windows**: confere o blob Git exato e só restaura LF após demonstrar que o arquivo da VM corresponde precisamente à transformação LF→CRLF; qualquer outro conteúdo falha. Não altera o arquivo Git nem a máquina do caixa.

## Falhas reais descobertas e corrigidas

1. A primeira regressão encontrou fallback de recibo v2 sem `sourceVerified=false`. O executor foi corrigido; o pin SHA1 Git no lançador foi atualizado, **sem remover o teste**.
2. O lançador Windows recusou o script com saída 88 (`ScriptIdentity`). A comparação de bytes comprovou a conversão LF→CRLF em **4/4 novos módulos pinados** no checkout Windows. Uma tentativa de atualizar `.gitattributes` foi bloqueada pela ferramenta. Em vez de relaxar o pin, o preparador **CI-only** comprovou a transformação e restaurou os bytes exatos do commit. Testes de adulteração continuam obrigatórios.

## Prova conclusiva

[GitHub Actions #42173811855](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42173811855) no commit **`341f387e0e67792a2134b5fed16cdb450273ec39`**: `completed/success`, **4/4 jobs**.

- Node estático: `NATIVE_READER_ONE_SHOT_V2_LAB_PASS 10/10 PS51_HASHED_SYNTHETIC_ONLY NO_FIELD_EXECUTION NO_PII`; digest v1 compatível `12/12`, testes N2/N3 legados preservados.
- Preparação Windows: `READER_V2_CI_EXACT_BLOB_PREPARATION_PASS 4/4 EOL_ONLY_RESTORED=4 NO_FIELD_EXECUTION`.
- Pin e negativas: `READER_V2_PINNED_IDENTITY_LAB_PASS 2/2 SCRIPT_PATH_AND_NEW_DIGEST_MODULE`.
- GUI v2: `NATIVE_READER_V2_ONE_SHOT_GUI_LAB_PASS 10/10 LEGACY_PS51_DIGEST_BOUNDED_HOLD NO_VISIBLE_PARENT_OR_CHILD NO_FOCUS_CHANGE NO_PII`.
- Oráculo PowerShell 5.1 real: `NATIVE_READER_PS51_ORACLE_PASS 25/25 REAL_PS51_SYNTHETIC_ONLY MUTATIONS 8/8`.
- GUI antigo (sem mudanças): `NATIVE_READER_ONE_SHOT_NO_CONSOLE_LAB_PASS 10/10 NO_VISIBLE_PARENT_OR_CHILD NO_FOCUS_CHANGE NO_PII`.

Essas são **provas de laboratório em VM Windows**, com dados fictícios e amostragem de janelas. Não provam ausência de flashes submilissegundo nem no desktop real do caixa.

## Limites e decisão

**N3_LAB_INTEGRATED=TEST_PASS. N3_FIELD=HOLD. N2=HOLD. N4=HOLD. HOME=HOLD. PRINT=HOLD. V1_ACCEPTED=0/8.**

O leitor SQL real ainda usa READ COMMITTED com RCSI/SNAPSHOT OFF; paridade de hash não prova completude/atomicidade de cabeçalho, itens e observações. O vínculo real ao iFood não foi atestado. Nenhum arquivo real de comanda foi lido, nenhuma conta/serviço/tarefa/registro SQL foi modificado.

O atual executável v2 **recusa intencionalmente o CAIXA_MOOCA e só funciona como laboratório**. Criar, instalar ou executar uma variante de campo exigiria autorização separada Q-029, prova de canal de invocação silenciosa no desktop real, identidade e rollback; testemunha SQL exige Q-030, plano estimado e orçamento de locks. Os dois bloqueios foram preservados em `docs/execution/PERGUNTAS.jsonl`, sem suposição de autorização.

**Próximo passo útil:** preparar a decisão de autorização de campo com critérios observáveis e plano de rollback. Não transformar este teste CI em aprovação operacional ou substituir o Reader instalado por uma versão experimental.
