export const TALLY_CAPTURE_SURFACE_VERSION =
  "tally-capture-surface@0.1.0";

export interface TallyCaptureSurfaceDescriptor {
  role: "SHIFT_REGISTER" | "OCCURRENCE";
  form_id: string;
  workspace_id: string;
  public_url: string;
  editor_url: string;
  expected_block_count: number;
  expected_sha256: string;
}

export const TALLY_CAIXA_PULSE_REGISTER:
  TallyCaptureSurfaceDescriptor = {
  role: "SHIFT_REGISTER",
  form_id: "eqAKzJ",
  workspace_id: "3xP0bd",
  public_url: "https://tally.so/r/eqAKzJ",
  editor_url: "https://tally.so/forms/eqAKzJ",
  expected_block_count: 76,
  expected_sha256:
    "d452aefd1687d8071e8f1776efc6147c07f846ba468a015e49720379e52dee5c",
};
export const TALLY_CAIXA_PULSE_OCCURRENCE:
  TallyCaptureSurfaceDescriptor = {
  role: "OCCURRENCE",
  form_id: "ZjVv1a",
  workspace_id: "3xP0bd",
  public_url: "https://tally.so/r/ZjVv1a",
  editor_url: "https://tally.so/forms/ZjVv1a",
  expected_block_count: 31,
  expected_sha256:
    "51f07f02436057199af4d8a9782c37945b9bc38a3f9d54db8104abff9b73d251",
};

export const TALLY_CAIXA_PULSE_SURFACES = [
  TALLY_CAIXA_PULSE_REGISTER,
  TALLY_CAIXA_PULSE_OCCURRENCE,
] as const;

export const OCCURRENCE_FIELD_GROUPS = {
  operator: "b20098da-7371-459c-8932-71ffbcf9bf71",
  business_date: "c34fa788-94bf-4207-a18f-e3e18c6a830d",
  shift: "de042c6f-c466-4376-8a07-00f55d0894ef",
  occurrence_type: "5b0794da-93a7-44d3-9ba1-9e9616b2ffb9",
  reference: "b94ae407-8a3b-4fdc-ba7c-d7cc7147276c",
  happened_text: "d51ce650-20de-46d5-9e7b-d0375e34e4bc",
  action_text: "397d4271-7cd9-410f-97cc-ab994daa0b0f",
  status: "fa40a224-0a6e-4bc5-b0bb-0342292f2642",
} as const;

export const OCCURRENCE_HAPPENED_TITLE = {
  title_block_uuid: "9787adda-0d04-4d16-ace4-529dab972b17",
  raw_title: "O que aconteceu?\n",
  normalized_title: "O que aconteceu?",
  mapping_debt: "TRAILING_NEWLINE",
} as const;

export const OCCURRENCE_TYPE_OPTIONS = [
  "Problema no Delivery",
  "Item pausado",
  "Reclamação de cliente",
  "Desconto suspeito",
  "Divergência de caixa",
  "Quebra de equipamento",
  "Problema no salão",
  "Problema com motoboy",
  "Falha no iFood",
  "Falha no app próprio",
] as const;
export const OCCURRENCE_STATUS_OPTIONS = [
  "Em Andamento",
  "Concluído",
  "Necessário Revisão ",
] as const;

export const OCCURRENCE_CAPTURE_SHADOW_BOUNDARY = {
  preserve_existing_group_uuids: true,
  preserve_existing_type_options: true,
  preserve_existing_status_options: true,
  preferred_insertion_after_group:
    OCCURRENCE_FIELD_GROUPS.occurrence_type,
  preferred_insertion_before_group:
    OCCURRENCE_FIELD_GROUPS.reference,
  live_form_edit_authorized: false,
  live_workbook_edit_authorized: false,
} as const;
