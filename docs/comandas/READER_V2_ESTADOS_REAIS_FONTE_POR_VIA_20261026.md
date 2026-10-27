# TATÁ Comandas — prova read-only Reader V2 com estados nativos observados

**Data:** 26/10/2026. **PR #127**, candidato isolado. **Escopo confirmado:** duas vias de produção pela fonte **Teknisa**, uma via de conferência no caixa com cruzamento **iFood × Teknisa somente nessa via**.

## Falha histórica corrigida na direção, sem afrouxar a autorização

A V8.57 (prévia de conteúdo essencial) exigia `IDSTCOMANDA='A'` e `IDSTPRCOMVEN='A'`. A fonte PHP instalada indica `A` ligado a pedido agendado, e a amostra passiva de 650 revisões recentes registrou cabeçalhos `3/P/X/4` e itens predominantemente `4`, além de `6` e `3`; **não apareceu `A`**. Desse modo, prévias positivas sintéticas V8.57 não são prova de compatibilidade com as revisões reais.

O novo módulo `tools/comandas_reader_v2_view_evidence_v1_offline.cjs` **não substitui a V8.57 nem libera outro estado para imprimir**. É um validador puro de evidência para Reader V2 já observado, com resultados agregados sem nomes de produtos, pedidos, cliente, observação ou IDs individuais.

## O que comprova estruturalmente, em memória

- Uma única chave **`CDFILIAL|CDLOJA|NRVENDAREST|NRCOMANDA`**, `NRCOMANDAEXT` curto e origem `DLV_IFO` coincidentes nos dois envelopes `event`/`decision`.
- Os hashes `snapshot_hash` e `decision.fingerprint` recalculados com as rotinas existentes do Reader V8.57; tampering sem recálculo bloqueia.
- Data válida, mesma quantidade e identidade de linhas (ID do produto, código canônico em forma compacta ou pontuada, índice 1-based, quantidade positiva inteira), ausência de duplicações na linha.
- Observações completas: `observation_scan_complete=true` em ambos; ligações exatas por `source_field` e índice de item; comparação de observação geral; recusa de note-joint falso, perda, adulteração e duplicação por campo.
- Cabeçalho `3/P/X` e item `4` apenas para **revisão de evidência**, nunca como evento de primeira via. Cabeçalho `4`, item `6` e estados não atestados dão `HOLD`; não inferir da designação `P` que saiu papel nem da transição `X→P` que houve reimpressão.

Após validação estrutural, o módulo emite **apenas metadados de fonte**, vinculando as três vistas à mesma revisão nativa e repassando o candidato de exportação iFood exclusivamente para a política de conferência. O ID curto apresentado nas duas vias de produção nasce da Teknisa, **não** de cruzamento externo. A ausência ou divergência do iFood mantém as duas vistas de produção em `NATIVE_ONLY_REVIEW` e somente a conferência em `HOLD`.

## Limites que os testes não transformam em fatos

1. `snapshot_hash` e `decision.fingerprint` são **autoconsistência calculada** dos dois envelopes; não provam origem de um processo independente ou autenticidade de escrita da Teknisa. Quem puder falsificar simultaneamente ambos ainda consegue produzir uma alegação consistente. Por isso `source_independently_attested=false`.
2. A regra de status **não** determina se pedido/itens devem realmente sair na cozinha. `first_production_event_proven=false` mesmo quando o item 4 é estruturalmente legítimo. Não há timer ou watcher que automaticamente dispare uma via.
3. O arquivo real de sequência TATÁ observado anteriormente não tinha bindings. Este validador não exige binding **para estudar a fonte**, porém mantém `sequence_binding_proven=false` e não inventa 001 nem permite prévia física com número fictício.
4. A fonte oficial iFood disponível pode confirmar presença/ID curto/loja/dia como **candidato**, mas não contém lista de produtos, notas ou a ligação UUID nativa. Por isso `ifood_item_parity_proven=false` e `ifood_source_authenticated_here=false`, mesmo com alegação positiva.
5. Fonte SQL↔Reader foi anteriormente examinada passivamente em **5 revisões**, não em pedidos completos da exportação. A amostra não autoriza generalizar fidelidade para 100% da operação.
6. As três vias físicas continuam desativadas; praça atual, impressora do caixa, evento de primeira via, controle de reimpressão, sequência persistente, papel Epson e aceite humano permanecem **não provados**.

## Casos negativos da nova suíte

`tools/verificar_comandas_reader_v2_view_evidence_v1_offline.cjs` verifica 34 cenários positivos e adversariais: cabeçalhos reais, item 4, cancelamento 6, cabeçalho 4, estados incertos, nota adulterada (incluindo hashes refeitos), quantidade, produto, duplicidade, conflito de origem/loja/dia/ID, exportação iFood errada e ausência de binding, com zero efeitos.

**Frente de prova:** fonte nativa consistente `≠` evento de impressão `≠` impressora autorizada `≠` papel físico. O CI da PR comprova testes sintéticos em ambiente isolado, não implantação. Sem instalação, SQL, spooler, serviço, sequência, fiscal ou impressão.
