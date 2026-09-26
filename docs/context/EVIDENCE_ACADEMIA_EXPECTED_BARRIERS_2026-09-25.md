# Evidence — TATÁ Academia Expected Barriers — 2026-09-25

## Objective

Use the current TATÁ Academia as a knowledge source for expected operational
barriers behind recurrent Caixa Pulse episodes, without treating training
content as proof that a procedure was executed.

Canonical Academia snapshot:
- repository: `cesarspichencoff-cmyk/tata-academia`;
- branch: `evolucao/v33-product-pass`;
- HEAD: `4d656c9eb6b3ab4e5314e6a62973c9f7cdac6779`;
- source file: `content-source/worlds_4_6_content.json`;
- source blob: `c1f408fc3d335eadf12cc85fa9efb89101701cc1`.

The current artifact marks the selected claims as FACT. Their underlying
provenance remains visible: some are field-conversation evidence and some are
live-source audits.

Invariant:

`ACADEMIA_FACT != PROCEDURE_EXECUTED_ON_INCIDENT`

## Selected expected barriers

### OMISSION

1. `IDENTIFY_BEFORE_ADVANCE`
   - claim: BOQ-002;
   - item without identifiable comanda/sacola must be confirmed before advancing.

2. `REUNITE_COMPLETE_ORDER`
   - claims: ORDER-001 + BOQ-004;
   - every volume belongs to one order and one identified part does not prove the
     complete order advanced.
3. `PHYSICAL_POST_PRINT_CHECK`
   - claim: COMANDA-005;
   - post-print physical state is not tracked by Odhen/Teknisa and requires floor
     conference.

4. `FINAL_DIVERGENCE_CONFERENCE`
   - claim: CONF-001;
   - conference is the barrier that looks for and corrects divergences before
     delivery.

### WRONG_ITEM

1. `EXACT_PRODUCT_QUANTITY_MATCH`
   - claim: ORDER-002;
   - product and quantity must match the command line; similar name or partial
     quantity is insufficient.

2. `CUSTOMER_OBSERVATION_CHECK`
   - claim: OBS-001;
   - customer observations/alterations must be read and confirmed before release.

3. `MANUAL_CORRECTION_PHYSICAL_CHECK`
   - claim: COMANDA-004;
   - handwritten corrections may not exist digitally and must be checked against
     the physical order.

4. `FINAL_DIVERGENCE_CONFERENCE`
   - claim: CONF-001;
   - final divergence conference applies to both omission and wrong-item risk.

No barrier was mapped yet to delay/logistics, food quality, customer-driven
cancellation, bag-swap or packaging leak. Minimum trustworthy coverage is
preferred over broad inference.
## Kernel contract

New kernel:
`src/contextKernel/expectedBarrier.ts`

For each observed episode it returns:
- mapped expected barriers when knowledge exists;
- Academia claim IDs and pinned source snapshot;
- execution status = UNKNOWN;
- barrier failure proven = false;
- barrier compliance proven = false;
- causal status = UNPROVEN;
- Attention authority = NONE;
- external effect = false.

No procedure is inferred from the wording of the incident itself.

## Real replay

Current canonical Caixa Pulse evidence:
- canonical occurrences: 69;
- mapped to expected barriers: 30;
- not mapped: 39;
- mapped episodes with execution status UNKNOWN: 30.

Mapped by mechanism:
- OMISSION: 22/22;
- WRONG_ITEM: 8/8;
- every other current family: 0 mapped by design.

Barrier-use counts across current episodes:
- FINAL_DIVERGENCE_CONFERENCE: 30;
- IDENTIFY_BEFORE_ADVANCE: 22;
- PHYSICAL_POST_PRINT_CHECK: 22;
- REUNITE_COMPLETE_ORDER: 22;
- CUSTOMER_OBSERVATION_CHECK: 8;
- EXACT_PRODUCT_QUANTITY_MATCH: 8;
- MANUAL_CORRECTION_PHYSICAL_CHECK: 8.
Measured epistemic result:
- barrier failure proven: 0;
- barrier compliance proven: 0;
- direct Attention reasons created: 0;
- external effects authorized: false.

## Manager Investigator implication

The useful question is now narrower.

For an omission episode:

```text
Was the item identified before advance?
Were all volumes reunited?
Was the post-print physical order checked?
Was final divergence conference performed?
What evidence supports each answer?
```

For a wrong-item episode:

```text
Was exact product/quantity checked?
Was the customer observation checked?
Was there a manual correction that existed only on paper?
Was final divergence conference performed?
What evidence supports each answer?
```

Absence of evidence does not mean the barrier failed.

## Next gate

Convert mapped UNKNOWN execution into explicit evidence debt routed by the
Manager Investigator.

Default safe route should prefer future capture over interrupting César when no
trusted source or operational-owner evidence exists.

The system still must not:
- infer employee guilt;
- infer shared root cause;
- call a recorded refund/re-send effective;
- treat recurrence as action failure;
- create a César notification from recurrence/barrier mapping alone.
