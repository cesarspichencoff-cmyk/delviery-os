# TATÁ Reader — observed product identity crosswalk — 2026-10-04

## Result

For the two product rows already present in the proven real-order chain, the local Teknisa field `TEKNISA.PRODUTO.CDARVPROD` exactly equals the compact Retail routing code that had previously been obtained only as a candidate through the historical name bridge.

Observed:

| SQL internal product | CDARVPROD | Prior Retail compact candidate | Result |
| --- | --- | --- | --- |
| `0000001459` | `9150003000` | `9150003000` | exact |
| `0000001641` | `9600001000` | `9600001000` | exact |

For these same two rows:

- `CDPRODINTE = null`;
- `CDPRODESTO = null`.

## What is now proven

For these two observed products only:

`TEKNISA.PRODUTO.CDPRODUTO -> TEKNISA.PRODUTO.CDARVPROD -> Retail routing code`

is directly evidenced by the real local database.

The previous name-based bridge is no longer required to identify these two products.

The compact values canonicalize to:

- `9150003000 -> 9.15.00.030.00`;
- `9600001000 -> 9.60.00.010.00`.

Both canonical codes exist in the current routing snapshot.

## What is not yet proven

Do not generalize this two-row result to the full product catalog yet.

Still UNKNOWN:

- whether every routable local product has a non-null `CDARVPROD`;
- whether `CDARVPROD` is unique for every relevant product;
- whether all 463 current routing codes are represented by `CDARVPROD`;
- whether a local product can have an unexpected/non-routing `CDARVPROD`;
- whether the field is safe as global runtime authority without a fail-closed validation rule.

Therefore the correct status is:

`PROVEN_EXACT_FOR_TWO_OBSERVED_PRODUCTS`

not:

`PROVEN_GLOBAL_PRODUCT_IDENTITY_RULE`.

## Next gate

`PROVE_CDARVPROD_GENERALIZATION_BOUNDARY`

The next useful proof should measure the field's coverage, uniqueness and membership against the current 463-product routing snapshot, still read-only and with no print/fiscal effect.

Until then, runtime may use this evidence for deterministic replay of the two observed products, but not as an unrestricted catalog-wide identity rule.
