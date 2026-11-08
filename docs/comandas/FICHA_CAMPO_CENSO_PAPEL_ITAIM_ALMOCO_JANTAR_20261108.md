# TATÁ Comandas — ficha de campo do papel nativo (Itaim)

**Uso exclusivo em observação PRESENCIAL das vias que já saem normalmente.** César autorizou esse censo visual em 02/11/2026. Esta ficha é **preparação**, não registro de observação: **nenhum pedido foi acompanhado por esta entrega.** Consulta de referência: [protocolo completo, com regras anti-falso-positivo](CENSO_FISICO_PRODUCAO_IFOOD_ITAIM_SEM_EFEITOS_20261102.md). PR #135 permanece DRAFT/HOLD.

## Como preencher sem interferir no restaurante

A equipe já presente acompanha até **20 pedidos consecutivos** no almoço e até **20 no jantar** (ou todos os pedidos disponíveis, se menos de 20), sem escolher só pedidos sem problema. Use **uma cópia desta ficha por turno**, uma testemunha local por impressora acompanhada e um coordenador para conciliar os papéis. **Não gerar pedido de teste, reimprimir, clicar em imprimir, limpar fila, abrir aplicativo/parametrização, mudar serviço, tocar em terminal ou ligar/desligar impressoras.** Se a observação atrapalhar a operação, pare e registre cobertura parcial.

**Cabeçalho:** Data local: ________  Turno: ALMOÇO / JANTAR  Início: ____  Fim: ____  Pessoas acompanhando (referência local, não publicar): ________

**Legenda do quadro (sempre usar o que foi efetivamente visto):**

- **Alias:** somente `A01…A20` para almoço ou `J01…J20` para jantar; a correspondência com a comanda real permanece exclusivamente com a equipe local, nunca no GitHub.
- **Ligação:** `S` mesmo pedido reconhecido nas vias, `N` vínculo divergente, `?` incerto.
- **Praças necessárias:** `S1` sushi 1, `S2` sushi 2, `Q` enrolados quentes, `C` cozinha, ou `?` se desconhecidas. **Praça necessária é definida pelos itens do pedido, não pela impressora onde saiu papel.**
- **Papéis observados:** anotar somente praça e quantidade, p.ex. `S1=1 C=1`, distinguindo conferência em `CX` e eventual `GP/Gestor`; escrever `?` quando impressora não acompanhada. `0` é permitido **somente** se a praça foi observada integralmente para aquele pedido.
- **Itens/qtd e notas:** `S` conferem, `N` divergência, `?` não comparados. Nunca transcrever nomes de produtos, alergias ou texto de observações.
- **Tardio/reprint:** `S/N/?`, sem manipular fila. **Anomalia:** `FALTA`, `DUP`, `ROTA`, `CONTEÚDO`, `NOTA`, `TARDIO`, `GP`, `OUTRA`, `?`, ou `NENHUMA` apenas se coberto. **Cobertura:** `TOTAL`, `PARCIAL`, `?`.

| Nº | Ligação S/N/? | Praças necessárias | Papéis observados | Itens/qtd S/N/? | Notas S/N/? | Tardio/reprint S/N/? | Anomalia | Cobertura |
|---|---|---|---|---|---|---|---|---|
| 01 |  |  |  |  |  |  |  |  |
| 02 |  |  |  |  |  |  |  |  |
| 03 |  |  |  |  |  |  |  |  |
| 04 |  |  |  |  |  |  |  |  |
| 05 |  |  |  |  |  |  |  |  |
| 06 |  |  |  |  |  |  |  |  |
| 07 |  |  |  |  |  |  |  |  |
| 08 |  |  |  |  |  |  |  |  |
| 09 |  |  |  |  |  |  |  |  |
| 10 |  |  |  |  |  |  |  |  |
| 11 |  |  |  |  |  |  |  |  |
| 12 |  |  |  |  |  |  |  |  |
| 13 |  |  |  |  |  |  |  |  |
| 14 |  |  |  |  |  |  |  |  |
| 15 |  |  |  |  |  |  |  |  |
| 16 |  |  |  |  |  |  |  |  |
| 17 |  |  |  |  |  |  |  |  |
| 18 |  |  |  |  |  |  |  |  |
| 19 |  |  |  |  |  |  |  |  |
| 20 |  |  |  |  |  |  |  |  |

## Fechamento por turno — somente fatos agregados, sem clientes

- Pedidos disponíveis na janela: _____; consecutivos efetivamente vistos: _____ / 20; acompanhamento foi realmente consecutivo? `S/N/?`.
- Composição observada: uma praça ____; várias praças ____; composição desconhecida ____.
- Famílias que **de fato apareceram** (não marcar famílias não vistas): `S1` ___ `S2` ___ `Q` ___ `C` ___.
- Todas as praças necessárias acompanhadas até a saída normal e possível papel tardio? `S/N/?`.
- Casos com itens e quantidades comparados: _____; com observações comparadas: _____; casos com ligação visual `S`: _____.
- Total de casos por **tipo de problema**, sem IDs, nomes ou prints: FALTA ___; DUP ___; ROTA ___; CONTEÚDO ___; NOTA ___; TARDIO ___; GP ___; OUTRA ___; não verificados ___.
- Combinados de múltiplas praças e eventual exceção de combinado dupla tiveram destino claro? `S/N/?`.
- Se alguma praça/pedido não foi acompanhado, **nunca completar com zero** ou concluir que o papel não saiu.

**Envio seguro ao projeto:** somente os totais agregados do fechamento de almoço e jantar, sem fotos de comandas, IDs reais, endereços, notas, dados fiscais, nomes ou telefones. Guardar a correspondência local dos aliases, se necessária, apenas sob o controle da operação. Na ausência de testemunho, registrar `PAPER_CENSUS_NOT_YET_COLLECTED`.

## Alcance da evidência e decisão

Mesmo uma amostra sem falhas aparentes **não demonstra** ausência de erros em todos os pedidos, nem identifica o software que iniciou a impressão, nem autoriza alterar a Teknisa. Serve exclusivamente para decidir se vale preservar as vias **nativas de produção** e concentrar a futura implementação apenas na conferência independente. Este resultado não substitui o gate de **completude dos inserts/observações**, a identidade iFood→Teknisa, a segurança do Reader ou a autorização separada de piloto.

**Estado desta ficha:** `PREPARED_NOT_OBSERVED`; `FIRST_DISPATCH=UNKNOWN`; `REAL_ORDER_COMPLETENESS=UNKNOWN`; `PRINT/CUTOVER=HOLD`.
