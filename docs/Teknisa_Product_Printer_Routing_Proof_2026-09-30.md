# Teknisa Product → Printer Routing Proof — TATÁ Itaim — 2026-09-30

## Status

**CURRENT_CONFIG_PROVEN**

Current Retail exports from store `0001 - TATA ITAIM` were crossed without changing Teknisa or triggering print.

Source artifacts:
- `Cadastro-de-Loja---Produtos-por-Loja.xlsx` — SHA-256 `f4cb1569a4c8752b831db97c2d5444bfea8c0d6fb06c0c79d83ada3bb0722737`
- `Cadastro-de-Loja---Impressoras-por-Loja.xlsx` — SHA-256 `c998375c36ee3060836ba7ad46af0a9f807f5a307e55dee40cf67881b7a40ba1`
- consolidated cross-check `TATA_Itaim_Matriz_Roteamento_Producao.xlsx` — SHA-256 `d8f3c7e2fa0acae4ca0506315e973c3bb75f3bbd602b9441eb8894454cedea50`

## Proven topology

| Code | Teknisa name | IP | Port | Peripherals server |
|---|---|---|---|---|
| 00002 | COZINHA | 192.168.0.116 | LPT3 | 192.168.0.24:3000 |
| 00003 | DELIVERY SUSHI 1 | 192.168.0.153 | — | 192.168.0.24:3000 |
| 00004 | DELIVERY SUSHI 2 | 192.168.0.4 | — | 192.168.0.24:3000 |
| 00006 | BALCAOSUSHI2 | 192.168.0.110 | LPT5 | 192.168.0.24:3000 |
| 00007 | BAR | 192.168.0.232 | LPT6 | 192.168.0.24:3000 |
| 00009 | BALCAOSUSHI1 | 192.168.0.142 | LPT4 | 192.168.0.24:3000 |

The registry also contains unused/currently-unlinked printer entries; see `data/runtime_printer_map_v1.json`.

## Product routing

- products exported: **463**
- resolved to at least one production target: **463 / 463**
- one target: **346**
- two targets: **117**
- no target: **0**
- puxa active in exported product routing: **0**
- backup active in exported product routing: **0**

Examples:
- `9.15.00.075.00 — COMBINADO SALMAO 1 PESSOA`
  - production 1: `00009 BALCAOSUSHI1 → 192.168.0.142`
  - production 2: `00003 DELIVERY SUSHI 1 → 192.168.0.153`
- `9.15.00.076.00 — COMBINADO SALMAO 2 PESSOAS`
  - same two targets.

## Correction of previous inference

The earlier metadata-only inference:
- `.153 = BALCAO_SUSHI_1`
- `.142 = fiscal candidate`

is superseded.

Current Teknisa configuration proves:
- `.153 = DELIVERY SUSHI 1`
- `.142 = BALCAOSUSHI1`

Therefore IMP file-size growth alone must not be used to infer printer identity or print type.

## Architectural consequence

For routing identity, the safer deterministic path is now:

`real delivery item CDPRODUTO → current product-routing table → printer code/name → IP → configured Peripherals server`

Production-ticket text is no longer required to discover the expected station for an item.

A separate runtime observation is still needed only if DeliveryOS must prove that a specific physical print actually occurred. Expected routing and physical-print confirmation are different facts.

## Effect boundary

This proof performed no:
- Teknisa write;
- database write;
- print;
- fiscal action;
- service installation;
- cutover.
