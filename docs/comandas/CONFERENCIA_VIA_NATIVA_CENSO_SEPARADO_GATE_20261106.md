# Conferência Itaim — prova própria da via nativa, sem duplicação (06/11/2026)

## Motivação factual

César confirmou em 06/11 que já sai uma comanda da **Teknisa** na Conferência, com **produtos, quantidades e observações** necessários à montagem. Isso é evidência **humana relatada** da existência e utilidade de conteúdo. Não é um censo de todos os pedidos, não comprova todas as notas/revisões em todos os turnos, nem a ausência de folhas adicionais, atrasos ou duplicações.

No escopo atual, **não propor segunda impressão TATÁ só para repetir conteúdo que a via nativa já mostra**. Priorizar valor que falta — indicação de kits, caixas, sacolas e incompatibilidades térmicas — na prévia sombra, após vincular o catálogo e as regras com segurança. Manter nativas Cozinha/Sushi/Conferência em operação intocadas.

## Lacuna do classificador anterior

O agregador `tools/comandas_passive_paper_census_review_only.cjs` v2 aceita amostras agregadas de almoço/jantar das praças e pode devolver `D1_SAMPLE_CONFORME_RELATADA_NAO_AUTENTICADA` sem uma declaração **separada e verificável** de que a impressora de Conferência foi efetivamente acompanhada. `stations_covered=ALL_REQUIRED` é auto declarada; não é medição explícita de papel na Conferência.

Isso não é um defeito de impressão observado. É uma **lacuna de discriminação de evidências** que se torna relevante após a confirmação da via nativa.

## Novo gate offline, sem trocar v2

`tools/comandas_native_conference_paper_census_review_v1.cjs` recebe **somente dados agregados** sob esquema fechado `tata.comandas.native-conference-paper-census-review.v1`:
- a amostra `production_sample` v2 intacta;
- uma observação específica `conference_observations` para almoço e jantar com: visto ou não, origem **relatada** como Teknisa/outro/desconhecida, papel de Conferência **não fiscal**, acompanhamento da caixa durante toda a amostra, vínculo visual ao mesmo pedido, quantidade de pedidos relacionados, itens/quantidades e notas conferidos, **uma via por pedido**, saída tardia acompanhada e eventual segunda via TATÁ.

Classificação:
- `D0_EVIDENCE_INSUFFICIENT`: não observou, faltou turno, identidade, praça, correspondência de quantidade ou comparação, origem desconhecida ou amostra insuficiente.
- `D2_CONFERENCE_OR_PRODUCTION_ANOMALY_REPORTED`: falta de papel, via somente fiscal, origem diferente, itens/notas divergentes, duplicação ou segunda via TATÁ **relatadas**, inclusive se outra parte da amostra ainda for insuficiente.
- `D1_NATIVE_CONFERENCE_SAMPLE_REPORTED_NOT_AUTHENTICATED`: ambos os turnos de produção v2 e Conferência com amostras **relatadas completas**. Isto **não** autentica o papel nem sua origem real, não prova ausência universal de duplicação nem dá aceite.

Todos os resultados devolvem `review_status=HOLD`, `native_conference_paper_world_proven=false`, `complete_native_revision_semantics_proven=false`, `tata_conference_print_authorized=false`, `production_print_change_authorized=false` e permissões de efeito sempre falsas. Não armazenar nenhum pedido, nota, identificador de cliente, código fiscal ou fotografia no GitHub.

## Como aproveitar a observação já conhecida

O relato positivo de César **não deve ser perdido** nem convertido artificialmente em 20/20 pedidos. O próximo dado que realmente altera a decisão é **frequência, unicidade e tempo** da via nativa, comparando pedidos consecutivos do almoço/jantar nos quais a equipe já observa a saída natural de papel. O protocolo físico já autorizado está em `docs/comandas/CENSO_FISICO_PRODUCAO_IFOOD_ITAIM_SEM_EFEITOS_20261102.md`. Não pedir novamente se a via contém produtos/quantidades/observações em geral: isto já foi respondido; no censo só confirmar a paridade por pedido observado.

A ferramenta somente **classifica relatos fornecidos**. Ela não observa impressoras, não pode ser chamada de prova real e não será executada no `CAIXA_MOOCA`. O trabalho foi feito exclusivamente no GitHub; CI com entradas fictícias, sem SQL, PowerShell, instalação ou impressão.

**Bordas:** `STAGE_3=IN_PROGRESS`, `STAGE_4=NOT_AUTHORIZED`, `REAL_PAPER_CENSUS=PARTIAL_HUMAN_REPORT_UNATTESTED`, `TEKNISA_NATIVE_OUTPUT=PRESERVE`, `TATA_CONFERENCE_PRINT=HOLD`, `CUTOVER=HOLD`.

## Gate temporal acrescentado na revisão

A testemunha específica da Conferência deve trazer `day` (AAAA-MM-DD) e `window` (ALMOCO/JANTAR) correspondentes **exatamente** à mesma data e turno da amostra v2 de produção. Um registro de outro dia não pode satisfazer o turno só porque seus agregados de contagem parecem iguais. Recusa de calendário inválido ou dia divergente = D0. A correspondência declarada de data ainda não prova observação física.
