/**
 * Camada 0 · Normalização de itens (não é estoque — é entender de que o pedido DEPENDE).
 *
 * Um item da comanda depende de "itens-base" críticos que travam o fluxo.
 * Ex.: "Temaki Salmão" → salmão; "Hot Roll" → hot; "Kit p/1" → hashi/shoyu/gengibre/wasabi.
 * Padrão da casa fica AQUI, num lugar só, fácil de ajustar — sem mexer no resto.
 */
export type Categoria = "kit" | "sushi_quente" | "peixe" | "sache" | "bebida" | "embalagem" | "outro";

/** Composição de kit (padrão da casa — ajustável). */
const COMPONENTES_KIT = ["hashi", "shoyu", "gengibre", "wasabi"];

export function categoria(nome: string): Categoria {
  const n = nome.toLowerCase();
  if (/\bkit\b|combo/.test(n)) return "kit";
  if (/hot|ebiten|quente|tempura|guioza|frit/.test(n)) return "sushi_quente";
  if (/salmão|salmao|atum|peixe|polvo|skin/.test(n)) return "peixe";
  if (/shoyu|shoyo|hashi|gengibre|wasabi|sachê|sache/.test(n)) return "sache";
  if (/coca|refri|refrigerante|água|agua|suco|bebida|cerveja|guaraná|guarana/.test(n)) return "bebida";
  if (/sacola|embalagem|caixa/.test(n)) return "embalagem";
  return "outro";
}

/**
 * Itens-base críticos de que um item da comanda depende.
 * Retorna nomes normalizados em minúsculas (a "linguagem" de disponibilidade).
 */
export function componentesCriticos(nome: string): string[] {
  const n = nome.toLowerCase();
  const cat = categoria(nome);
  const out = new Set<string>();

  if (cat === "kit") COMPONENTES_KIT.forEach((c) => out.add(c));
  if (cat === "sushi_quente") out.add("hot");
  if (cat === "peixe") {
    if (/salmão|salmao/.test(n)) out.add("salmão");
    else if (/atum/.test(n)) out.add("atum");
    else out.add("peixe");
  }
  if (cat === "bebida") out.add("bebida");
  if (cat === "sache") {
    for (const s of ["shoyu", "hashi", "gengibre", "wasabi"]) if (n.includes(s)) out.add(s);
  }
  // toda sacola que sai consome embalagem (padrão: 1 por pedido — somado no nível do pedido)
  return [...out];
}

/** Um item é crítico se depende de pelo menos um item-base crítico. */
export function ehCritico(nome: string): boolean {
  return componentesCriticos(nome).length > 0;
}
