# TATÁ Comanda — estados nativos e transições (26/10/2026)

**Fonte:** leitura passiva autorizada no host Windows real `CAIXA_MOOCA`; eventos já emitidos em `state/reader-events-v1`. **Classificação da prova: observação de estados, NÃO interpretação de negócio.**

## Resultado read-only
Das 350 revisões mais recentes consultadas foram encontrados **177 valores únicos da chave composta** `CDFILIAL|CDLOJA|NRVENDAREST|NRCOMANDA`; **155 chaves tiveram mais de um estado observado**. Contagens por **revisão**, não por pedido único:
- `DLV_IFO`: `3=140`, `P=153`, `X=49`, `4=2`.
- `DLV_NMO`: `3=4`, `P=2`.

Agrupando por chave e ordenando pelo campo `observed_at`, os padrões de sequência mais frequentes de chaves com múltiplos estados foram: **`3 → P` (105)**, **`3 → X` (19)**, **`3 → X → P` (16)**, **`X → P` (13)** e **`3 → P → 4` (2)**. Esses padrões descrevem somente a janela amostrada: não são necessariamente o ciclo completo, e revisões adicionais fora das 350 podem ter ocorrido antes/depois.

**Não existe autorização para atribuir `P = concluído`, `X = cancelado`, `3 = aberto` ou `4 = fiscal`.** Observação de sequência temporal não substitui especificação nativa validada ou comportamento físico independente. Não deduzir elegibilidade para impressão a partir do número de ocorrências ou transição.

Em uma amostra separada das 100 revisões mais recentes, todas eram de 26/10; 42 `DLV_IFO/3`, 46 `DLV_IFO/P`, 10 `DLV_IFO/X`, 2 `DLV_NMO/3`. **Nenhuma tinha `IDSTCOMANDA=A`**, enquanto a candidata do watcher só marca pedido sem bloqueio de situação se o status for `A`. Dessa forma, corrigir apenas a dependência diária LUNCH/DINNER **não** permite declarar o leitor apto para produção. Todos os 100 eventos tinham bloqueio legado de turno, e todos tinham `ready=false`.

Consulta da metadata de FK/lookup nativa não encontrou tabela de definição dos códigos. Pesquisa textual estritamente nos scripts `src/` e `routes/` do aplicativo Odhen local (28 arquivos com extensões selecionadas) não encontrou definição de `IDSTCOMANDA`. Tentativa posterior de metadados SQL estendidos foi inconclusiva devido a exceção. Pesquisa pública direcionada pelo nome de coluna tampouco encontrou definição verificável. **STATUS_SEMANTICS = UNKNOWN.**

## Engenharia preventiva na PR #127
Arquivos:
- `tools/comandas_native_status_lifecycle_review_v1_offline.cjs`
- `tools/verificar_comandas_native_status_lifecycle_v1_offline.cjs`

O analisador recebe envelopes normalizados em memória e emite **apenas agregados**, sem retornar chaves, IDs, notas, clientes, UUIDs ou textos de pedidos. Ele distingue total de revisões de chaves únicas, normaliza a ordem temporal, ignora repetição de hash idêntico, rejeita conflito de status/origem no mesmo hash e rejeita estados conflitantes com o mesmo timestamp, pois não há prova da ordem entre eles. Também rejeita escopos incompletos ou entrada excessiva.

A saída tem sempre `print_authorized=false`, `sequence_authorized=false`, `status_semantics_proven=false` e `classification_authorized=false`. **Não é um motor alternativo de impressão e não lê banco, spooler, API ou filesystem**.

**Verificação Foxxy:** 17/17 testes sintéticos passaram com a versão publicada na PR. Teste integrado nos dois jobs Linux e Windows da workflow de Shadow; a CI do novo HEAD só pode ser considerada aprovada após consulta da execução hospedada correspondente. A versão anterior do watcher patch `fdcba78f` teve CI Linux/Windows verde (run `40411421046`), mas nenhuma aprovação dessa versão prova commits posteriores.

## Próximo desbloqueio legítimo
É necessário demonstrar, por fonte Teknisa/Gestor ou teste operacional isolado e validado pela autoridade humana, **quais eventos/status são elegíveis para produzir comanda** e quais exigem retenção. Isso deve ser versionado como contrato de estado nativo, incluindo casos adversariais de atualização tardia, cancelamento, pedido parcial, revisão e reimpressão. Não implementar o mapeamento somente por inferência de estatística.

Depois disso: classificador/praças atuais, autorização independente da sequência TATÁ com idempotência, rollback, janela de manutenção específica e teste físico supervisionado. A saída de comandas do Gestor iFood estava desligada em 25/10, por confirmação de César; impressão simultânea havia sido contingência, não rotina.

**Estado:** REVIEW_ONLY / DRAFT / HOLD. Nenhuma alteração em produção, sem vínculo de sequência ou impressão. `CI_PASS` não é `WORLD_PROVEN`.

## Correção de ambiguidade temporal — 27/10/2026

Na revisão offline, foi detectada uma lacuna: o analisador descartava toda reaparição de um `snapshot_hash` já visto no pedido, mesmo quando outra revisão havia surgido entre as duas observações. A sequência observada `A(hash1) → B(hash2) → A(hash1)` não prova, por si só, que o sistema nativo realmente voltou ao estado A: o terceiro envelope pode ser reenvio tardio de um snapshot antigo. Produzir uma transição `B → A` ou ignorar o reaparecimento ocultaria essa incerteza.

**Contrato de correção:** repetições consecutivas do mesmo hash continuam deduplicadas; reaparição **não consecutiva** do mesmo hash retorna `HOLD: NONCONSECUTIVE_SNAPSHOT_REAPPEARANCE_AMBIGUOUS` para o lote, sem inventar transição. A análise nunca autoriza impressão, sequência, classificação nem interpretação de negócio dos estados. Dois testes adversariais foram incluídos na suíte Linux/Windows já existente. A mudança é somente em arquivo de análise offline; não modifica Reader, serviços, impressão ou dados reais. A aprovação hospedada do HEAD exato deve ser verificada separadamente.

**Direção operacional confirmada por César em 27/10:** avançar internamente sem contatar a Teknisa; a consulta preparada permanece não enviada. O desenvolvimento pode progredir com código, replays, reconciliação offline e evidências já legitimamente disponíveis, mas não pode trocar ausência da primeira via nativa por presunção. A supressão da via antiga e o piloto físico continuam bloqueados enquanto esse evento, destinos/reserva, sequências, caixas e rollback não estiverem provados por mecanismo válido.
