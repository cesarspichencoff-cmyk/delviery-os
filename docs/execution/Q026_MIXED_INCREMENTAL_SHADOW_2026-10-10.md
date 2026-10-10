# Q-026 — Projeção incremental com modos mistos e viagem longa (SHADOW)

**Data:** 2026-10-10. **Base:** PR #39, commit `f1741985a0a8c05ec532546a8b767439da40ae6f`, derivada da integração `99b0c72`. **Estado:** apenas pesquisa; nenhum runtime alterado.

## Questão que esta etapa responde

O PR #37 havia demonstrado leitura por cursor para duas unidades e três modos, com event-log antigo sem modo (UNKNOWN), evento corrompido e um fato válido de aparelho sem `trip_id`; mas ainda reunia todos os eventos de cada viagem para chamar `projetar()`. O PR #39 demonstrou um acumulador incremental de tamanho constante para **uma** viagem enorme, mas não testou uma mistura de viagens/modos/unidades. Este teste une ambas as propriedades.

## Experimento executado

Script `tests/product/run-q026-mixed-incremental-long-shadow.ts`. Banco **PostgreSQL 16 descartável**, migrado desde antes de 0003, com:

- **6.000** fatos sintéticos distribuídos em viagens curtas, 2 unidades (`ITAIM`, `LAB-BANCADA`) e três modos (`real`, `simulated`, `control`); empates temporais, relógios suspeitos e fatos recebidos offline.
- **120.000** fatos sintéticos adicionais de UMA viagem (`Q026-ONE-LONG`), misturados ao mesmo escopo `ITAIM/simulated` de outras viagens. Inclui estados, ocorrências, múltiplos dispositivos, empates, sequências nulas, clock `suspect` e recebimento atrasado.
- **1** fato anterior à migration 0003 com `source_mode NULL`: permanece `UNKNOWN`, não entra em projeções.
- **1** fato com `sequence_local` fora da faixa segura: rejeitado pela leitura Q-016.
- **1** fato `gps_batch_received` com `object_type=device` e sem viagem: conta na leitura de aparelho e preserva escopo, sem inventar viagem.

Os **126.003** registros resultam em **126.001 aptos** à leitura Q-016, mas somente **126.000 associados a viagens**. O teste exige exatamente essas contagens. Todos os registros vêm de fixture artificial e de um banco descartável; não são dados da operação.

O cursor `DECLARE ... FETCH FORWARD 257` ordena por unidade/modo/tipo/ID da entidade, fazendo 491 lotes. Cada grupo de viagem usa um acumulador que retém apenas:
- Avanço máximo de estado, última data do fato e da posição confiável;
- `device_id` do último evento segundo comparador canônico (`occurred_at`, `sequence`, `event_id.localeCompare`);
- Número de ocorrências e número de fatos.

A lista de IDs de eventos NÃO é mantida na cópia de apresentação. A transformação da saída usa um objeto `eventos` que só aceita `.length` e gera erro se o view model solicitar qualquer ID individualmente.

## Prova e guardas

[GitHub Actions `38053837479`](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38053837479) — job `mixed-long-vm-equality` **SUCCESS, 7/7 verificações**, TypeScript estrito aprovado.

O log confirma:
- `events=126000`, `long_trip=120000`, `device_only=1`, `unknown=1`, `invalid=1`;
- `groups=72`, `max_group=120000`, `max_buffer=257`, `fetch_size=257`, `batches=491`, `scopes=5`, `filters=4`;
- Comparação com a leitura canônica `lerRealidadeDeEntregas` de TODOS os campos de cada viagem (identidade, unidade, modo, estado, dispositivo, último fato, ocorrências, última posição, frescor, contagem), não apenas contagem;
- `entregasVM()` COMPLETO comparado via `deepEqual` e `JSON.stringify` em quatro seleções (todas, ITAIM, LAB-BANCADA, sem unidade);
- Controles negativos: alterar contagem `+1` da viagem altera UI; apagar escopo apenas com fato DEVICE viola o contrato, embora a UI atual não o apresente diretamente.

**Limite de lote é comprovado, mas isso não basta para demonstrar RSS bounded universal.** O ensaio é funcional, não medição A/B de RSS em processos independentes. As medições reais separadas 120k/300k estão no PR #39. A projeção incremental mantém um objeto por viagem, portanto escala com **número de viagens** e não mantém buffers proporcionais ao comprimento de uma viagem na memória do Node.

## Fronteiras não satisfeitas

1. **Sem snapshot sob append concorrente.** Os dados permaneceram estáticos durante as duas leituras (canônica e sombra). A auditoria independente entregue ao Claude (issue #36) continua aguardando prova verificável.
2. **Sem autorização de substituir Q-016.** O replay mantém cursor, dimensões, quarentena, IDs e auditoria. Este caminho é apenas hipótese de representação derivada para a UI.
3. A prova de memória total do **servidor PostgreSQL** não foi realizada; `ORDER BY` pode demandar memória temporária no banco.
4. **Idempotência** depende da constraint única da tabela. Não foi provada correção contra uma fonte arbitrária sem essa unicidade.
5. Não foram implementados HTTP real, migração, corte/janela de leitura, retenção nem publicação no Itaim.
6. Não foram testadas múltiplas snapshots na mesma leitura; `aparelhos` da realidade foi reaproveitado da referência canônica. É prova de `projecoes`/UNKNOWN/consumo da UI, não da porta de realidade totalmente independente.

**Status:** `CODE_READY + TEST_PASS` para este cenário sintético em SHADOW; não `DEPLOYED` nem `WORLD_PROVEN`. **HOLD**, sem merge, produção, schema, Android, TATÁ Comanda ou despesas novas. Q-026 permanece aberta.
