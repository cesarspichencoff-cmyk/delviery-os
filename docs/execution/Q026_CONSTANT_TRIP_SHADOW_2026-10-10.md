# Q-026 — Memória limitada em uma viagem muito longa (SHADOW)

**Data:** 2026-10-10. **PR:** [#39](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/39). **Tipo:** pesquisa isolada com PostgreSQL 16 descartável, teste e CI. **NÃO é um novo leitor operacional.**

## Problema comprovado

No PR #32 e no PR #37, `FETCH 4096` limita a quantidade de linhas entregues de cada vez pelo banco, mas a implementação agrupa todos os fatos de uma viagem antes de chamar a função canônica `projetar()`. **Uma viagem com 120.000 eventos ocupa um buffer de 120.000 eventos**, apesar do tamanho de fetch. Descartar vetores de IDs na saída **não remove** essa dependência de memória durante a projeção.

## Hipótese diferente

Para a **representação de viagens na tela**, os campos necessários podem ser calculados diretamente durante `FETCH` sem ordenar nem guardar o histórico completo da viagem:

- `estado`: maior avanço de estado por ranking de `trip_created`, `trip_started`, `arrival_detected`, `delivery_confirmed`, `trip_return_started`, `trip_returned`, `trip_closed`.
- `ocorrencias_abertas`: soma de `occurrence_created`.
- `fatos`: soma de eventos válidos da viagem (não há `eventos[]` neste modelo).
- `ultimo_fato_em`: maior instante `occurred_at`; em caso de empate, texto normalizado pela porta SQL.
- `ultima_posicao_em`: maior `instanteConfiavel`, sem confiar no relógio suspeito.
- `device_id`: último evento com dispositivo seguindo **o mesmo comparador** do replay original: `occurred_at`, depois `sequence`, depois `event_id.localeCompare`. A sombra guarda apenas o candidato máximo.
- `frescor`: a mesma função pura `classificarFrescor` do runtime, usando o mesmo `agora`.

**Pré-condição crítica:** `platform.event_log` impõe unicidade da chave de idempotência para evitar duplicatas que a função canônica ignoraria. Este experimento **não inclui** um `Set` com todas as chaves; portanto, **não é equivalente fora da fonte de dados que garante a unicidade**. Tampouco calcula quarentena de versão, cursor, dimensões ou o replay Q-016.

## Provas executadas

[GitHub Actions 38053336473](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38053336473): **5/5 jobs SUCCESS** no commit `a4e4e2228a710042f206d8fa9b01b0471f900213`, dois volumes × duas variantes em processos/runner PostgreSQL separados, com um comparador que reprova hash, quantidade de eventos e lote inválidos.

| Eventos em **uma viagem** | Variante | Pico RSS do processo Node | Tempo da fase | Digest de apresentação |
| ---: | --- | ---: | ---: | --- |
| 120.000 | incremental | **139,1 MiB** | 855 ms | `68ddffa46d37f6d6e191572abf0150f526f52dcd9f38dd9030fbf29586559a65` |
| 120.000 | replay Q-016 + projetar | 252,8 MiB | 875 ms | mesmo hash |
| 300.000 | incremental | **139,9 MiB** | 2.574 ms | `e2cda6aea973e7f8d643bff1da33815307ac59a3196ee7ee30bf9be3ac749270` |
| 300.000 | replay Q-016 + projetar | 448,1 MiB | 2.867 ms | mesmo hash |

Economia observada do **pico RSS do Node**: **45,0%** para 120k e **68,8%** para 300k. O pico da variante incremental ficou aproximadamente estável (139,1 → 139,9 MiB), consistente com o uso fixo de um único acumulador e lotes de tamanho máximo 4.096. É **prova empírica nesses dois volumes**, não demonstração de O(1) com qualquer sequência malformada e qualquer consumidor. O PostgreSQL, seus buffers e possíveis ordenações no servidor **não estão incluídos** nas medidas do processo Node. Tempo é uma única amostra por variante/runner; não há prova robusta de latência.

O fixture usa timestamps iguais em grupos grandes, sequências empatadas/ausentes, sete IDs de dispositivos (alguns ausentes), ocorrências, transições de estado, `trip_closed`, relógios `suspect` e horário de recebimento deslocado. O resultado contém estado, dispositivo, evidências contadas, último fato/posição e frescor — **todos comparados em um SHA-256 dos mesmos campos na mesma ordem de chaves**. Os eventos são todos de um modo/uma unidade/uma viagem (`simulated/ITAIM/ONE-LONG`).

## Limites e riscos abertos

1. **Não alterar replay Q-016**. Ele continua fonte de recuperação e auditoria, com vetor de eventos, cursores, quarentena e dimensões. A otimização é candidata a uma **porta independente e explícita da interface**, não substituto de `projetar()`.
2. **Snapshot inconsistente sob append concorrente:** aguardando prova adversarial separada; [issue Claude #36](https://github.com/cesarspichencoff-cmyk/delviery-os/issues/36). Não há validação de uma mesma snapshot para `aparelhos`, contagens, dados de último lote e viagem.
3. **Deduplicação e corruptelas:** a hipótese conta com constraint UNIQUE de idempotency_key e instantes válidos decodificados. Não há prova de comportamento com fonte sem unicidade, versões incompatíveis, duplicatas retornadas ou linhas inválidas.
4. **Escopo vazio:** PR #37 comprovou que um escopo com evento de dispositivo mas sem viagem precisa ser preservado mesmo quando não altera a UI no fixture. Aqui se estuda uma única viagem, não a totalidade dos escopos.
5. **Janelas e retenção:** Q-026 humana continua aberta; nenhum cutoff foi escolhido. História sem `source_mode` permanece UNKNOWN na porta forense, não foi reclassificada.
6. **Sem dados operacionais, HTTP, produção, hardware Android, implantação ou custos novos.**

**Arquivos:** `tests/product/run-q026-constant-long-trip-shadow.ts` e `.github/workflows/deliveryos-q026-constant-trip-shadow.yml`. Nenhum arquivo `src/`, UI, Android, SQL migration, lockfile, `main` ou integração modificado.

**Status:** `CODE_READY + TEST_PASS` **somente para esta hipótese em shadow**; `WORLD_PROVEN`, `DEPLOYED` e autorização de merge **não** conferidos. PR **DRAFT / HOLD**.
