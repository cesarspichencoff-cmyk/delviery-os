/**
 * LAB · MODO DE VALIDAÇÃO — o repositório
 * ============================================================================
 * `ValidationRepository` é a fronteira, e ela existe por um motivo concreto: a
 * persistência de hoje é local e experimental, e a de amanhã não vai ser. A
 * interface não conhece IndexedDB, não conhece `window` e não conhece rede — a
 * implementação pode ser trocada sem reescrever o Modo de Validação.
 *
 * O contrato, inteiro:
 *
 *   abrir()                  -> Promise<void>
 *   listar()                 -> Promise<Registro[]>          ordem estável
 *   listarDoCenario(id)      -> Promise<Registro[]>
 *   salvar(registro)         -> Promise<Registro>            cria ou atualiza
 *   remover(validation_id)   -> Promise<void>
 *   limpar()                 -> Promise<void>
 *   limparCenario(id)        -> Promise<void>
 *
 * Duas regras que valem para qualquer implementação:
 *
 *   1. `salvar` é IDEMPOTENTE por `validation_id`. Avaliar de novo a mesma
 *      leitura CORRIGE o registro; não empilha um segundo.
 *   2. a ordem de `listar()` é estável — `created_at`, e `validation_id` como
 *      desempate. Um resumo que muda de ordem a cada leitura é um resumo que
 *      ninguém consegue conferir.
 */

/** A chave natural de uma avaliação: uma leitura, dentro de um cenário. */
export function chaveNatural(scenario_id, reading_id) {
  return `${scenario_id}::${reading_id}`;
}

export function ordenar(registros) {
  return [...registros].sort(
    (a, b) =>
      String(a.created_at).localeCompare(String(b.created_at)) ||
      String(a.validation_id).localeCompare(String(b.validation_id)),
  );
}

/**
 * Implementação em memória. Ela NÃO é um espelho de teste do IndexedDB: é o
 * caminho que o gate exercita fora do navegador, e é o que garante que a regra
 * de idempotência e de ordem viva na fronteira, e não dentro do banco.
 */
export class MemoryValidationRepository {
  #porId = new Map();

  async abrir() {
    /* nada a abrir */
  }

  async listar() {
    return ordenar([...this.#porId.values()]);
  }

  async listarDoCenario(scenario_id) {
    return (await this.listar()).filter((r) => r.scenario_id === scenario_id);
  }

  async salvar(registro) {
    // Idempotência pela chave natural: a mesma leitura, no mesmo cenário,
    // ocupa um registro só. O `validation_id` e o `created_at` do primeiro são
    // preservados — corrigir uma avaliação não apaga quando ela nasceu.
    const chave = chaveNatural(registro.scenario_id, registro.reading_id);
    const anterior = [...this.#porId.values()].find(
      (r) => chaveNatural(r.scenario_id, r.reading_id) === chave,
    );
    const final =
      anterior !== undefined
        ? {
            ...registro,
            validation_id: anterior.validation_id,
            created_at: anterior.created_at,
          }
        : registro;
    this.#porId.set(final.validation_id, final);
    return final;
  }

  async remover(validation_id) {
    this.#porId.delete(validation_id);
  }

  async limpar() {
    this.#porId.clear();
  }

  async limparCenario(scenario_id) {
    for (const [id, r] of [...this.#porId.entries()]) {
      if (r.scenario_id === scenario_id) this.#porId.delete(id);
    }
  }
}
