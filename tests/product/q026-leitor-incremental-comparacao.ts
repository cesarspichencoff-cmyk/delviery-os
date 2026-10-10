/**
 * Q-026 — como as provas comparam a leitura INCREMENTAL com a CANÔNICA.
 * Somente teste.
 *
 * Tudo da `RealidadeDeEntregas` entra na comparação, com duas exceções
 * declaradas: `versao` (que DEVE diferir: a leitura incremental nunca se passa
 * pela canônica) e os ids de `eventos` (comparados pela contagem: o leitor
 * incremental não os carrega; eles estão no replay da Q-016).
 */

import assert from "node:assert/strict";

import type { UiSnapshot } from "../../src/entregas/ui/adapters/UiApplicationFacade";
import { PORTA_DE_REALIDADE_VERSION, type RealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import { LEITURA_INCREMENTAL_VERSION } from "../../src/platform/leitura/realidade-de-entregas-incremental";
import type { ViagemProjetada } from "../../src/platform/projections/operacao-viva";
import { entregasVM } from "../../src/product/viewmodels/entregas-vm";

const SNAP = { trips: [], occurrences: [], connection: "online", pending_sync: 0, last_error: null } as unknown as UiSnapshot;

export function viagemCompacta(v: ViagemProjetada) {
  return {
    trip_id: v.trip_id,
    unit_id: v.unit_id,
    estado: v.estado,
    device_id: v.device_id,
    ultimo_fato_em: v.ultimo_fato_em,
    ocorrencias_abertas: v.ocorrencias_abertas,
    source_mode: v.source_mode,
    fatos: v.eventos.length,
    ultima_posicao_em: v.ultima_posicao_em,
    frescor: v.frescor,
  };
}

/** A leitura inteira, com `eventos` pela contagem e sem `versao`. */
export function forma(r: RealidadeDeEntregas) {
  return {
    fonte: r.fonte,
    lida_em: r.lida_em,
    aparelhos: r.aparelhos,
    historico_sem_modo: r.historico_sem_modo,
    projecoes: r.projecoes.map((p) => ({ unit_id: p.unit_id, source_mode: p.source_mode, viagens: p.viagens.map(viagemCompacta) })),
  };
}

/** A view model REAL de Entregas, em JSON, para cada filtro de unidade. */
export function vms(r: RealidadeDeEntregas, agora: Date, unidades: readonly (string | null)[]): string[] {
  return unidades.map((unidade) =>
    JSON.stringify(entregasVM(SNAP, agora.toISOString(), null, { disponivel: true, realidade: r }, { unidade })),
  );
}

export function iguais(
  canonica: RealidadeDeEntregas,
  incremental: RealidadeDeEntregas,
  rotulo: string,
  agora: Date,
  unidades: readonly (string | null)[],
): void {
  assert.equal(canonica.versao, PORTA_DE_REALIDADE_VERSION);
  assert.equal(incremental.versao, LEITURA_INCREMENTAL_VERSION, `${rotulo}: a leitura incremental se passou pela canônica`);
  const a = forma(canonica);
  const b = forma(incremental);
  assert.deepStrictEqual(b, a, `${rotulo}: leitura diverge`);
  assert.equal(JSON.stringify(b), JSON.stringify(a), `${rotulo}: JSON da leitura diverge`);
  assert.deepStrictEqual(vms(incremental, agora, unidades), vms(canonica, agora, unidades), `${rotulo}: view model diverge`);
}
