/** Papéis humanos autorizados a consultar coordenadas/rota. */
export const ROUTE_VIEWER_ROLES = [
  "gerente",
  "lider_delivery",
  "operador_expedicao",
] as const;

export type RouteViewerRole = (typeof ROUTE_VIEWER_ROLES)[number];

export function canSeeRoute(role: string | undefined): boolean {
  return (ROUTE_VIEWER_ROLES as readonly string[]).includes(role ?? "");
}
