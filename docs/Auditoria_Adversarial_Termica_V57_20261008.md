# DeliveryOS — Auditoria adversarial de segurança térmica V5.7 (SHADOW)

**Data:** 08/10/2026. **Branch:** `feat/thermal-v54-caixa-photo-visual-qa-20261008` (PR #21). **Sem impressão, cutover, alteração de driver, densidade, fila ou estoque.**

## Classe de falha identificada: caracteres aparentemente invisíveis

O renderer térmico, o planejamento de observações e o inspetor independente de bytes permitiam indevidamente dois caracteres não confiáveis para comandas:

| Entrada de teste | Antes da V5.7 | Correção aplicada |
|---|---|---|
| DEL ASCII (0x7F), caractere de controle | Aceito por 3/3 validadores | Rejeitado por 3/3 |
| SOFT HYPHEN (U+00AD / 0xAD), separador invisível/discricionário | Aceito por 3/3 validadores | Rejeitado por 3/3 |

**Falha reproduzida antes da correção** com `node tools/verificar_caracteres_invisiveis_v57.js`: `REJECTED_CASES=0/2`, saída não-zero. **Após a correção:** `REJECTED_CASES=2/2`, saída zero. Os bytes ESC/POS do renderer tornam-se vazios se contiverem tais caracteres; a proposta de notas retorna `BLOCKED`; o inspetor independente rejeita os bytes de controle correspondentes.

Arquivos corrigidos sem alteração produtiva:
- `src/production/operationalTicketEscposV46.ts` — validação de caracteres `line()`.
- `tools/planejar_observacoes_legiveis_v56.js` — validação preventiva das observações.
- `tools/escposByteInspectorV51.js` — inspeção independente dos bytes.
- `tools/verificar_caracteres_invisiveis_v57.js` — teste de reprodução e regressão.

**Causa raiz:** o pressuposto `latin1/CP1252 codificável = caractere visível e adequado para operação` era falso. A correção exige legibilidade sem caracteres de controle/invisíveis. Ela não constitui certificação da tabela da impressora nem do papel instalado.

## Outro defeito adversarial confirmado, mas NÃO CORRIGIDO

O inspetor independente `tools/escposByteInspectorV51.js` aceita `GS ! 0x22` (3x altura, 3x largura), apesar de os modelos aprovados usarem apenas o padrão normal ou 2x. O comando forjado foi interpretado como `scale_width=3`, `scale_height=3`, com `errors=[]` e `pass=true` porque um único caractere cabia nos 576 pontos. Isso demonstra que a validação atual **não é uma lista restrita de ampliações aprovadas**.

O arquivo `tools/verificar_integridade_termica_v57.js` contém o teste RED reproduzível. Ele retorna erro no caso `UNSUPPORTED_CHAR_SIZE` até que o inspetor tenha política de escala restrita. A tentativa de aplicar essa correção foi **bloqueada pela segurança da ferramenta**, por isso **não foi reexecutada por outro caminho**, nem houve alteração encoberta.

O mesmo arquivo contém teste de reinicialização `ESC @` no meio do documento que deve ser investigado após resolução do primeiro teste RED. Não interpretar esse segundo teste como aprovado ou executado: a execução parou na primeira falha.

**Portão:** proteger a política de comandos aceitos no inspetor, executar o RED até passar com aprovação explícita do caminho permitido e depois rodar novamente a regressão completa. Não declarar a cadeia de qualidade `10/10` enquanto houver teste adversarial confirmado falhando.

## Regressões que passaram após corrigir os caracteres invisíveis

- V5.6 notas: 20/20 PASS.
- V5.1 parser Epson oficial: 19/19 PASS.
- V5.0 geometria: 12/12 PASS.
- V5.1 legibilidade do catálogo: 8/8 PASS.
- V5.5 tipografia: 13/13 PASS.
- V4.9 Sushi Quente: 18/18 PASS.
- Teste específico V5.7 invisíveis: 2/2 casos rejeitados por três camadas.

As provas são `CODE_TEST_PASS` em ambiente SHADOW para os critérios acima. São **insuficientes para provar** a política completa de segurança ESC/POS, qualidade óptica no papel, impressão física em todas as praças ou operação automática.

## Autoridade e continuidade

César autorizou testes físicos **somente na impressora `CAIXA`** do Itaim. A segunda folha comparativa V5.4 continua sem impressão comprovada devido ao bloqueio de segurança do serviço; **não repetir impressão ou tentar caminho alternativo**. Nenhuma ação real de impressão foi feita nesta auditoria.

A estrutura dos PRs #16 → #17 → #18 → #19 → #20 → #21 está preservada. A presente correção aditiva permanece no PR #21 para evitar implementação paralela, sem merge/deploy/cutover. A outra conversa deve comparar HEAD e incorporar somente as diferenças ausentes.

**Resultado honesto:** duas falhas de caracteres invisíveis corrigidas e testadas; uma classe de ampliação de fonte **RED / OPEN**; conformidade física e qualidade máxima ainda `UNKNOWN`.
