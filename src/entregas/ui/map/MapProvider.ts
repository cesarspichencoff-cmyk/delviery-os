/**
 * Contrato de provedor de mapa — substituível.
 * Implementação POC: MapLibre + estilo demo (não produção).
 */

export type MapPoint = {
  id: string;
  lat: number;
  lon: number;
  /** loja | entrega | outro — sem PII */
  kind: "store" | "delivery" | "other";
  label?: string;
};

export type MapViewState =
  | "loading"
  | "ready"
  | "no_location"
  | "imprecise"
  | "permission_denied"
  | "tiles_unavailable"
  | "offline";

export interface MapProvider {
  readonly name: string;
  mount(container: HTMLElement): Promise<void>;
  unmount(): void;
  setPoints(points: MapPoint[]): void;
  setSimulatedRoute(coords: Array<[number, number]>): void;
  setViewState(state: MapViewState): void;
  /** Atribuição obrigatória (OSM etc.) */
  getAttribution(): string;
}

/** Dados anonimizados SP — não são pedidos reais */
export const DEMO_SP_POINTS: MapPoint[] = [
  {
    id: "loja",
    lat: -23.5614,
    lon: -46.6559,
    kind: "store",
    label: "Loja (demo)",
  },
  {
    id: "e1",
    lat: -23.5678,
    lon: -46.6482,
    kind: "delivery",
    label: "Parada 1 (anon.)",
  },
  {
    id: "e2",
    lat: -23.5721,
    lon: -46.6415,
    kind: "delivery",
    label: "Parada 2 (anon.)",
  },
];

export const DEMO_ROUTE: Array<[number, number]> = [
  [-46.6559, -23.5614],
  [-46.652, -23.564],
  [-46.6482, -23.5678],
  [-46.6415, -23.5721],
];
