# TATÁ Comandas — G3: Academy motor differential (production vs candidate)
**Data:** 2026-10-26. **Status:** OFFLINE_AB_PROVEN / CANDIDATE_TEST_PASS / GENERAL_CI_RED / HOLD.

## A/B de dois motores em ambiente isolado
Executado no Foxxy sem conexão com CAIXA_MOOCA, SQL, pedidos reais, spooler, impressão ou implantação.

| Motor | Repositório/ref | SHA observado |
|---|---|---|
| Publicado | tata-academia / evolucao/v33-product-pass | 6396427220b5eb2e2d1a570ef58437a4d302ff49 |
| Candidato | tata-academia / fix/thermal-kids-tataki-source-20261010, PR #50 | 030b44dabd95c836b38275016512488a98784245 |

Entradas idênticas no motor em memória, sem dados de clientes:

| Cenário | Publicado | Candidato |
|---|---|---|
| COMBINADO KIDS sozinho: size/status | null / UNKNOWN | M / FACT |
| Tataki com family=dupla, subfamily=tataki, station=duplas: categoria | sashimi | dupla_dyo |
| Temaki + Tataki acima: kits | UNKNOWN / [] | FACT / Kit p/1 |

A candidata aplica correções com escopo humano explícito; não se autoriza classificar Tataki a partir do nome sem family/subfamily/station comprovados.

## Testes da revisão EXATA
No snapshot do SHA 030b44..., isolado, rodaram:
- tests/thermal-kids-tataki-regression.mjs: **23/23 PASS** (inclui negativos, UNKNOWN parcial e guardas de quantidade).
- tests/embalagem.mjs: **124/124 PASS**.
- tests/kits_logic_v2.mjs: **PASS**.
- node --check lib/packaging-current.js: **PASS**.

## Limite do resultado
No GitHub, os dois workflows do HEAD da PR #50 permanecem FAILURE (IDs 39936786816 e 39936786868). Os logs retornaram BlobNotFound no conector e não houve identificação confiável da causa. Assim, TEST_PASS dirigido não substitui gate global, code review e aprovação da integração.

O Comandas PR #107 está pinado no blob Git 3167c309f02a0ad5a84fb43043b8866e3bee873c / SHA-256 local 1e4cf2475edb586d5dae88388d2adc7cf02013b00ec93c0371e. Não substituir por PR #50 automaticamente; primeiro resolver CI, produzir diff pin↔candidato, preservar fixtures negativas e rodar V2→V6.8→três vias em runner isolado com a revisão exata. Identidade e turno continuam portões independentes.

**Efeitos:** nenhum no caixa, SQL, turno, impressora, spooler, sequência ou fiscal. Sem merge/deploy.