# V5.6 — Observações longas legíveis, sem perda de significado (SHADOW)

Data: 08/10/2026. Continuação direta da branch `feat/thermal-v54-caixa-photo-visual-qa-20261008`, PR #21. Nenhuma impressora ou motor ativo alterado.

## Problema reproduzido

O renderer existente `src/production/operationalTicketEscposV46.ts` imprime cada `OBS:`, `FINALIZAR:` e `AGUARDAR COZINHA:` em **uma única linha**, preferencialmente na fonte A e com alternativa B. Se a linha ultrapassar 64 caracteres, o renderer bloqueia **todos os bytes da comanda** para não cortar texto. Essa proteção contra truncamento é correta, mas a indisponibilidade de um pedido com observação longa é um risco operacional.

Teste controlado: uma observação artificial de mais de 64 caracteres anexada a um item do replay real arquivado foi bloqueada pela V4.6: `LINE_EXCEEDS_64_COLUMNS:OBS`, bytes 0. Isso **não demonstra ocorrência real em pedido vivo**.

## Solução proposta para prova óptica, não produção

`tools/planejar_observacoes_legiveis_v56.js` planeja linhas sem tocar no renderer:

- Preserva 100% das palavras e sua ordem após normalização de espaços e caixa alta; não elimina `SEM`, `NÃO`, ingredientes, acentos, negações ou restrições.
- **Nome do produto e quantidade ficam intactos, em linha única**. As observações seguem associadas ao `source_item_index` original.
- Prioriza Font A nativa de 48 colunas, maior e mais legível. Para palavra indivisível que não caiba na A, admite B de 64 colunas apenas quando a palavra inteira couber.
- Primeira linha `OBS: ...`, continuação `OBS > ...`. Para outras classes, `FINALIZAR > ...` e `COZINHA > ...`. Cada marcador contém caracteres visíveis, sem depender de espaços iniciais.
- **Falha encontrada e corrigida no teste:** `OfflinePrinter.line()` remove espaços iniciais com `.trim()`; portanto, marcador de continuação apenas recuado não funciona no papel. O marcador explícito sobrevive ao renderer e à inspeção independente dos bytes.
- Se houver Unicode não compatível com o conjunto de caracteres verificado, palavra maior que a capacidade Font B, excesso de linhas ou qualquer perda detectada na reconstrução: status `BLOCKED`, sem nenhuma linha liberada.
- Nenhum fator de escala, negrito, comprimento em papel ou taxa de leitura foi aprovado fisicamente nesta etapa.

## Prova digital

`tools/verificar_observacoes_legiveis_v56.js`: **20/20 verificações PASS**, incluindo reprodução do bloqueio anterior, preservação de `SEM`, acentos, continuação por categoria, índice do item, limites de largura e leitura independente dos bytes ESC/POS.

`tools/gerar_prova_observacoes_v56_offline.js`: amostra sintética `TESTE C - NAO E PEDIDO`, título de produto sem alteração, 3 linhas de anotação, sequência `997`. Produz somente arquivos `.escpos`, `.txt`, `.svg` geométrico e manifesto em diretório temporário. **380 bytes**, SHA-256 `187b6ae05b1e9494004a81f6e67064a8c19abbef9a32fe40417b0d0312ab89f0`. NÃO enviou bytes a qualquer fila e não há efeito em estoque, fiscal, driver, densidade ou corte.

Esse SVG é geometria aproximada, **não** renderização nativa Epson nem comparação com o papel. Não inserir a prova sintética como pedido real nem afirmar uma observação real omitida.

## Riscos e portões

1. A solução V5.6 está isolada em `tools`, **não está integrada** em `src/production/operationalTicketEscposV46.ts`. Evita alteração produtiva sem aceite.
2. Necessária inspeção física da legibilidade de `OBS >`, `FINALIZAR >`, `COZINHA >` no ambiente escuro. Fonte B permanece como exceção de legibilidade.
3. O comparativo V5.4 ainda não foi impresso: houve bloqueio de segurança da ferramenta e não é permitido contorná-lo. A nova amostra V5.6 também é offline e não foi impressa.
4. **Única fila autorizada para qualquer futuro teste físico: `CAIXA` do Itaim**. Nenhuma impressão em Cozinha, Bar, Sushi ou Delivery.
5. Após prova física aceita, reconciliar esta proposta com a branch mais avançada e validar regressão total para produzir nota longa, nota curta, fontes, acentos e conteúdo fiel. Não executar merge/deploy/cutover a partir deste estudo.

Estado: `SIMULATED_TEST_PASS` para V5.6, `PAPER_OPTICAL_UNKNOWN`, `PRODUCTION_UNCHANGED`.
