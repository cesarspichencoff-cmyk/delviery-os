export const TALLY_SHADOW_PILOT_VERSION =
  "tally-shadow-pilot@0.1.0";

export const TALLY_SHADOW_PILOT = {
  source_live_form_id: "ZjVv1a",
  shadow_form_id: "eq4lae",
  workspace_id: "3xP0bd",
  public_url: "https://tally.so/r/eq4lae",
  editor_url: "https://tally.so/forms/eq4lae",
  isolated_sheet_id: "1Je2SRuugKx2FK1N39ShGwuUYWgNDO6YKEqHA1xicI-Q",
  isolated_sheet_name: "Página1",
  expected_block_count: 57,
  expected_sha256:
    "de5bd059926fb9d5b066ad760adcc7b7e7d0f545534f3186c018fb726d0d2db3",
  live_form_modified: false,
  live_workbook_modified: false,
  live_cutover_authorized: false,
} as const;

export const TALLY_SHADOW_HEADERS = [
  "Submission ID",
  "Respondent ID",
  "Submitted at",
  "Operador",
  "Data",
  "Turno",
  "Tipo de Ocorrência",
  "Subtipo operacional",
  "Verificações - Item faltando [Item identificado antes de seguir]",
  "Verificações - Item faltando [Todos os volumes reunidos]",
  "Verificações - Item faltando [Conferência física após impressão/ajuste]",
  "Verificações - Item faltando [Conferência final antes da saída]",
  "Verificações - Item errado [Produto e quantidade conferiam]",
  "Verificações - Item errado [Observações do cliente conferidas]",
  "Verificações - Item errado [Correção manual conferida fisicamente quando aplicável]",
  "Verificações - Item errado [Conferência final antes da saída]",
  "Pedido / Mesa / Referência",
  "O que aconteceu?\n",
  "Ação Tomada?",
  "Status",
] as const;

type Cell = string | null | undefined;
export type TallyShadowRow = readonly Cell[];

export interface TallyShadowSerializationProof {
  version: typeof TALLY_SHADOW_PILOT_VERSION;
  header_sequence_exact: boolean;
  item_missing_route_exact: boolean;
  wrong_item_route_exact: boolean;
  other_route_exact: boolean;
  conditional_exclusivity_proven: boolean;
  legacy_happened_header_preserved: boolean;
  test_rows_found: number;
  live_form_modified: false;
  live_workbook_modified: false;
  live_cutover_authorized: false;
}

const ANSWER_VECTOR = [
  "Sim",
  "Não",
  "Não consegui confirmar",
  "Não se aplica",
] as const;

function normalized(cell: Cell): string | null {
  return cell === undefined || cell === null || cell === ""
    ? null
    : String(cell);
}

function sliceEquals(
  row: TallyShadowRow,
  start: number,
  expected: readonly Cell[],
): boolean {
  return expected.every(
    (value, offset) =>
      normalized(row[start + offset]) === normalized(value),
  );
}

export function proveTallyShadowSerialization(
  headers: readonly string[],
  rows: readonly TallyShadowRow[],
): TallyShadowSerializationProof {
  const headerSequenceExact =
    headers.length === TALLY_SHADOW_HEADERS.length &&
    headers.every(
      (header, index) => header === TALLY_SHADOW_HEADERS[index],
    );

  const operatorIndex = TALLY_SHADOW_HEADERS.indexOf("Operador");
  const subtypeIndex =
    TALLY_SHADOW_HEADERS.indexOf("Subtipo operacional");
  const missingStart = 8;
  const wrongStart = 12;

  const findTest = (operator: string) =>
    rows.find((row) => normalized(row[operatorIndex]) === operator);

  const itemMissing = findTest(
    "VERTICE_SHADOW_TEST_ITEM_FALTANDO",
  );
  const wrongItem = findTest("VERTICE_SHADOW_TEST_ITEM_ERRADO");
  const other = findTest("VERTICE_SHADOW_TEST_OUTRO");

  const itemMissingRouteExact =
    !!itemMissing &&
    normalized(itemMissing[subtypeIndex]) === "Item faltando" &&
    sliceEquals(itemMissing, missingStart, ANSWER_VECTOR) &&
    sliceEquals(itemMissing, wrongStart, [null, null, null, null]);

  const wrongItemRouteExact =
    !!wrongItem &&
    normalized(wrongItem[subtypeIndex]) === "Item errado" &&
    sliceEquals(wrongItem, missingStart, [null, null, null, null]) &&
    sliceEquals(wrongItem, wrongStart, ANSWER_VECTOR);

  const otherRouteExact =
    !!other &&
    normalized(other[subtypeIndex]) === "Outro" &&
    sliceEquals(other, missingStart, [
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);

  return {
    version: TALLY_SHADOW_PILOT_VERSION,
    header_sequence_exact: headerSequenceExact,
    item_missing_route_exact: itemMissingRouteExact,
    wrong_item_route_exact: wrongItemRouteExact,
    other_route_exact: otherRouteExact,
    conditional_exclusivity_proven:
      itemMissingRouteExact && wrongItemRouteExact && otherRouteExact,
    legacy_happened_header_preserved:
      headers[17] === "O que aconteceu?\n",
    test_rows_found: [itemMissing, wrongItem, other].filter(Boolean).length,
    live_form_modified: false,
    live_workbook_modified: false,
    live_cutover_authorized: false,
  };
}
