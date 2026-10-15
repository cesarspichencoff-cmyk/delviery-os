# DeliveryOS G1 — contrato de turno v2, somente laboratório

Data: 15/10/2026. Estado: **LAB_TEST_PASS**, **PRODUCTION_NO_GO**.

## Problema que esta entrega reduz
Na CAIXA_MOOCA o watcher **v2 de fato executado** possui hash SHA-256 conferido com o supervisor: `A58E428826D70EDF27763C3FA47893608305A7FB48F973EE1F84F02E5DA19C5C`. Ele exige janela de turno completa `valid_from_local` e `valid_until_local`, data/unidade coerentes e proveniência de confirmação. O atualizador legado v1 encontrado na loja escreve schema v2 mas não informa `valid_from_local`. Usá-lo diretamente **não** é uma solução segura. Rastreamento: issue #121.

## Entrega versionada
- `tests/tata-reader/lab/write-service-state-v2-fixture.ps1`: **escritor sintético**, não um atualizador de produção. Opera somente em diretório filho direto do TEMP com nome `deliveryos_g1_lab_*` e sentinela `.deliveryos-g1-lab`. Rejeita reparse points, fontes que não comecem com `LAB_SYNTHETIC:`, data incoerente e intervalo vazio. Estado possui `lab_only=true`, `store_id=0001` e revisão individual. O campo `evidence=HUMAN_CONFIRMED_RULE` aqui testa **somente a forma do contrato**: não representa uma confirmação humana real.
- `tests/tata-reader/lab/run-service-state-v2-lab-tests.ps1`: testes positivos e negativos, abertura/fechamento de janelas, alternância almoço/jantar, ausência de `valid_from` no formato legado, tentativas sem marcador, fonte não sintética e falhas injetadas.
- `.github/workflows/deliveryos-g1-service-state-v2-lab.yml`: job Windows Server 2022 com PowerShell 5.1, sem segredos, banco, loja, túnel, API iFood, conexões operacionais ou comandos sobre `C:\ProgramData`.

## Resultado
Primeiro GitHub Actions (38700769115): **FAIL**, 19 primeiras verificações PASS, mas a substituição atômica de um arquivo existente falhou no .NET Framework porque `File.Replace` recebeu backup nulo. Isso **não** foi uma falha no watcher de produção.

Correção `dd27be5`: backup transitório com caminho concreto dentro do laboratório. Novo GitHub Actions **[38700880350](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38700880350) = SUCCESS**, com **32/32 testes PASS** e `G1_LAB_NO_PRODUCTION_STATE=PASS`. O histórico sintético contém `PREPARED` e `COMMITTED` por revisão. Se ocorre interrupção após a preparação, a tentativa posterior para e exige auditoria, sem inventar uma conclusão.

## Limites explícitos
- **Não existe atomicidade conjunta entre dois arquivos** (estado e journal). A sequência `PREPARED → estado atômico → COMMITTED` é detectável, mas um crash entre etapas exige revisão manual. Isso é o limite de prova do laboratório, não transação de banco.
- O teste utiliza um **verificador temporal independente que reproduz as regras observadas do watcher v2**, mas não executa o arquivo instalado no computador da loja. Não prova correção do watcher ou da compatibilidade binária end-to-end.
- Não lê nem reconcilia pedidos reais. Um novo estado de jantar **não requalifica almoço passado** nem recupera os 76 eventos bloqueados, pois o leitor instalado consulta o estado corrente. O tratamento histórico exige prova e desenho próprios.
- Não há comprovante de operador/turno real, nem mecanismo de publicação autorizado, assinatura, autenticação ou rollback produtivo.
- Não está ligado à Home nem ao Gestor, não resolve acesso multiunidade da API e não prova um Android físico.

## Próxima obrigação de G1 antes de qualquer implantação
Desenvolver e auditar um componente de produção distinto e explicitamente autorizado, capaz de consumir confirmação legítima de loja/turno, manter proveniência e histórico, responder ao watcher v2 do mesmo hash e realizar um ensaio supervisionado com rollback. Primeiro testar o caso de falha de escrita/journal e a convivência com turnos históricos. **Não copiar este fixture writer para C:\ProgramData**, não executar o gravador v1, não reprocessar eventos automaticamente, não inferir horário pelo relógio.

G0 candidato de UI: PR #120, CI remoto verde na HEAD atual. G1 ainda bloqueado; G2/G3 parciais laboratoriais; G4/G5 NO_GO.
