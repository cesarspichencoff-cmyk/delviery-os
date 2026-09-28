/**
 * Camada 0 · Normalização de itens (não é estoque — é entender de que o pedido DEPENDE).
 *
 * Um item da comanda depende de "itens-base" críticos que travam o fluxo.
 * Ex.: "Temaki Salmão" → salmão; "Hot Roll" → hot; "Kit p/1" → hashi/shoyu/gengibre/wasabi.
 * Padrão da casa fica AQUI, num lugar só, fácil de ajustar — sem mexer no resto.
 */
export type Categoria = "kit" | "sushi_quente" | "peixe" | "sache" | "bebida" | "embalagem" | "outro";

/**
 * Dependências normalizadas dos kits vigentes.
 * Esta camada rastreia presença de componentes críticos, não quantidade física.
 * "shoyu" representa a dependência comum; sachê/garrafinha e quantidades pertencem
 * ao motor canônico de kits, não a este normalizador.
 */
const COMPONENTES_KIT: Record<string, string[]> = {
  simples: ["hashi", "shoyu", "shoyuzara", "guardanapo"],
  p1: ["hashi", "shoyu", "shoyuzara", "guardanapo"],
  p2: ["hashi", "shoyu", "shoyuzara", "guardanapo"],
  quente: ["hashi", "shoyu", "guardanapo"],
  kids: ["hashi", "shoyu", "shoyuzara", "guardanapo", "adaptador"],
  sobremesa: ["colher de sobremesa", "guardanapo"]
};

function componentesKit(nome: string): string[] {
  const n = nome.toLowerCase();
  if (/sobremesa/.test(n)) return COMPONENTES_KIT.sobremesa;
  if (/kids?/.test(n)) return COMPONENTES_KIT.kids;
  if (/quente/.test(n)) return COMPONENTES_KIT.quente;
  if (/p\/?\s*2|p2/.test(n)) return COMPONENTES_KIT.p2;
  if (/p\/?\s*1|p1/.test(n)) return COMPONENTES_KIT.p1;
  if (/simples/.test(n)) return COMPONENTES_KIT.simples;
  return [];
}

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

  if (cat === "kit") componentesKit(nome).forEach((c) => out.add(c));
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
