/**
 * LAB · MODO DE VALIDAÇÃO — persistência local em IndexedDB
 * ============================================================================
 * Implementação de `ValidationRepository` para o navegador. **Só aqui** o Lab
 * conhece a API do navegador; o resto do Modo de Validação fala com a
 * interface.
 *
 * Nada sai deste navegador. Não há requisição, não há identidade, não há
 * sincronização — e o servidor do Lab não teria como receber: ele recusa todo
 * método que não seja GET ou HEAD.
 *
 * Idempotência pela chave natural (`cenário::leitura`) é resolvida por ÍNDICE
 * do próprio banco, e não por varredura de memória: assim ela sobrevive a duas
 * abas escrevendo, que é justamente o caso em que uma varredura falharia.
 */

import { chaveNatural, ordenar } from "./repositorio.js";

const BANCO = "deliveryos-lab-operacao-viva-v4";
const VERSAO = 1;
const LOJA = "validacoes";
const INDICE_NATURAL = "por_chave_natural";
const INDICE_CENARIO = "por_cenario";

function promessa(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha no IndexedDB"));
  });
}

export class IndexedDbValidationRepository {
  #db = null;

  /** `true` quando este navegador consegue persistir. */
  static disponivel() {
    return typeof globalThis.indexedDB !== "undefined";
  }

  async abrir() {
    if (this.#db !== null) return;
    if (!IndexedDbValidationRepository.disponivel()) {
      throw new Error(
        "Este navegador não expõe IndexedDB. A validação não pode ser salva, e fingir que foi seria pior do que dizer isto.",
      );
    }
    this.#db = await new Promise((resolve, reject) => {
      const req = globalThis.indexedDB.open(BANCO, VERSAO);
      req.onupgradeneeded = () => {
        const db = req.result;
        const loja = db.objectStoreNames.contains(LOJA)
          ? req.transaction.objectStore(LOJA)
          : db.createObjectStore(LOJA, { keyPath: "validation_id" });
        if (!loja.indexNames.contains(INDICE_NATURAL)) {
          loja.createIndex(INDICE_NATURAL, "chave_natural", { unique: true });
        }
        if (!loja.indexNames.contains(INDICE_CENARIO)) {
          loja.createIndex(INDICE_CENARIO, "scenario_id", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Falha ao abrir o banco local"));
    });
  }

  async #transacao(modo) {
    await this.abrir();
    return this.#db.transaction(LOJA, modo).objectStore(LOJA);
  }

  /** O que sai do banco não carrega a chave derivada — ela é detalhe do índice. */
  #limpar(linha) {
    if (linha === null || linha === undefined) return linha;
    const { chave_natural, ...registro } = linha;
    void chave_natural;
    return registro;
  }

  async listar() {
    const loja = await this.#transacao("readonly");
    const linhas = await promessa(loja.getAll());
    return ordenar(linhas.map((l) => this.#limpar(l)));
  }

  async listarDoCenario(scenario_id) {
    const loja = await this.#transacao("readonly");
    const linhas = await promessa(loja.index(INDICE_CENARIO).getAll(scenario_id));
    return ordenar(linhas.map((l) => this.#limpar(l)));
  }

  async salvar(registro) {
    const chave = chaveNatural(registro.scenario_id, registro.reading_id);
    const loja = await this.#transacao("readwrite");
    const anterior = this.#limpar(await promessa(loja.index(INDICE_NATURAL).get(chave)));
    // Corrigir uma avaliação preserva o id e a hora em que ela nasceu. Só
    // `updated_at` anda — a correção é o dado mais valioso, e apagar quando ela
    // começou tiraria justamente a antecedência do registro.
    const final =
      anterior !== undefined && anterior !== null
        ? {
            ...registro,
            validation_id: anterior.validation_id,
            created_at: anterior.created_at,
          }
        : registro;
    await promessa(loja.put({ ...final, chave_natural: chave }));
    return final;
  }

  async remover(validation_id) {
    const loja = await this.#transacao("readwrite");
    await promessa(loja.delete(validation_id));
  }

  async limpar() {
    const loja = await this.#transacao("readwrite");
    await promessa(loja.clear());
  }

  async limparCenario(scenario_id) {
    const loja = await this.#transacao("readwrite");
    const chaves = await promessa(loja.index(INDICE_CENARIO).getAllKeys(scenario_id));
    for (const k of chaves) await promessa(loja.delete(k));
  }
}
