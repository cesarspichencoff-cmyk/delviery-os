# Comandas térmicas V7.2 — trava de desenho, SEM redesenho

**Data:** 10/10/2026. **Branch/PR:** `feat/thermal-v63-packaging-bridge-shadow-20261010` / [PR #38](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/38). **Efeito:** apenas testes e documentação; sem modificação dos renderers, impressoras ou serviço Windows.

## Regra de execução

O pedido humano atual foi **preservar o desenho aprovado** enquanto a integração do leitor avança. Nenhuma necessidade de desenvolvimento do leitor autoriza substituir o layout, fonte, sequência, tamanho, corte, alinhamento ou conteúdos com valores inventados. Um eventual ajuste visual exige comparação com a origem, teste óptico e aceite humano separados.

## Referências canônicas revalidadas

**Figma original acessível somente em leitura:** `https://www.figma.com/design/nEjHuoJg2dMOqOzyutxXZ4`

- **PRODUÇÃO:** nó/página `30:2` — `V4.4 MASTER · PRODUÇÃO 80MM`. Exemplo nó `30:3` `PRODUÇÃO V4.4 • SUSHI + DEPENDÊNCIA`, frame **302×278**, com banner `SIMULAÇÃO · NÃO PRODUZIR`, praça, identificação iFood/TEKNISA/hora, caixas/quantidades, observações e dependência de Cozinha, e sequência TATÁ ao final. A página também tem os modelos de Cozinha, finalização e caso ainda não comprovado.
- **CONFERÊNCIA:** nó/página `20:2` — `V4.3 FINAL · ITENS MAIÚSCULOS 1 LINHA`. Exemplo nó `20:9`, frame **302×280**: identificação, caixas físicas independentes com `Op. ________`, quantidade/nome, observações, sacola/kit/acompanhamentos e sequência TATÁ ao final. Há outros cenários no mesmo master, inclusive separação S1/S2, revisão substitutiva, nomes longos e casos com regras desconhecidas.
- São **dimensões no Figma de referência**, **não** equivalência automática em milímetros ou pixels da Epson. O renderer SVG V6.0 usa largura 302, margens x=16/288 e as fontes de referência `Barlow Condensed` / `Atkinson Hyperlegible Mono`. O renderizador Epson usa fontes nativas e outra geometria — não confundir os dois. O relatório de primeira foto real `docs/Auditoria_Optica_CAIXA_V54_Foto_20261008.md` mantém legibilidade/contraste/nota crítica como PARCIAL/UNKNOWN; nenhuma segunda folha foi autorizada nesta etapa.

## Prova adicionada

`tools/verificar_desenho_comandas_v72.js` compara a execução **atual** do replay histórico de `gerar_prova_figma_v60_offline.js` com os SHA-256 originalmente publicados no relatório V6.5:

| Via histórica | Caixas / linhas | SHA-256 SVG congelado |
| --- | --- | --- |
| Cozinha | 2 / 2 | `041151f766725456d5487578375ac7c011c6bfa113ceaa52e1976a56d90e9db8` |
| Sushi | 4 / 4 | `87ea691d76e57dca24ef104671c53119b53dfc60ec3d5d12739d1c864babd88f` |
| Conferência | 6 / 6 | `f7a4cd64b85f3611abd5259c30d97f53d2cd7fcb9b3732faef50f794071d79a2` |

Também exige estrutura específica de caixas/itens, rubrica por caixa, recursos exatos `Sacola G + 3 Kit Kids + 1 Kit Quente`, fontes/margens de referência, número de sequência TATÁ, **ESC/POS offline `340/538/849` bytes** na fixture histórica, `ready_for_operational_print=false` e zero efeitos de spooler/corte/impressão. Não foi regenerado nenhum golden para forçar aceite.

**CI atual:** [run 38072086008](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38072086008) = **SUCCESS**. Log: `THERMAL_DESIGN_LOCK_V72=12/12; SVG_GOLDENS_MATCH; NO_PRINT; NO_FIGMA_PIXEL_PARITY_CLAIM`; V7.1 `12/12` e gate semântico V5.10 `25/25` também verdes.

## Exatamente o que isso NÃO comprova

- Igualdade de pixel/fonte entre Figma vivo e os três SVGs: **não** foi estabelecida por screenshot comparison, raster de fonte idêntica ou OCR.
- Igualdade de pixel, legibilidade ou contraste no papel Epson real: **não** estabelecida. O SVG histórico não é um bitmap TM-T20X.
- Autorização para imprimir comanda em CAIXA Itaim ou qualquer outra impressora: **NÃO**.
- Aplicação do motor candidato Academy PR #50, aceitação de turno atual, observações por `snapshot_hash` real, integração do serviço e produção: **PENDENTES**.

## Rota seguinte sem alterar o layout

1. Reusar o par nativo V6.8 e probes anteriores. Antes de renderizar pedido atual, exigir prova de identidade, revisão, turno, rota, cada observação e regra da embalagem/kits.
2. Se a prova do pedido atual falhar, gerar só diagnóstico sanitizado; **não fabricar uma comanda visual aparentemente correta com itens desconhecidos**.
3. Quando houver prova de ponta a ponta com dados reais, renderizar pelos **mesmos** `makeProduction/makeConference` e `renderOperationalTicketsProofV46`, sujeito ao gate V7.2 e eventuais novos casos. Não alterar mestre Figma, nem atualizar golden sem revisão.
4. Teste óptico final e aceite humano, exclusivamente mediante autorização específica para **CAIXA Itaim**. Antes disso `NO_PRINT / NO_SPOOL / NO_MERGE / NO_DEPLOY / NO_STATE_WRITE`.

**Estado:** `CODE_READY + OFFLINE_TEST_PASS`; o desenho histórico permanece idêntico segundo SHA dos SVGs. **Não** `FIGMA_PIXEL_PARITY_PROVEN`, `EPSON_PHYSICAL_ACCEPTED` ou `WORLD_PROVEN`.
