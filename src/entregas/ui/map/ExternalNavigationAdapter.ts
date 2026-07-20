/**
 * Adapter de navegação externa — piloto.
 * Não depende de uma única marca; sem API paga.
 */

export type NavTarget = {
  /** Grau decimal; opcional se só houver texto de busca */
  lat?: number;
  lon?: number;
  /** Texto de destino (sem PII desnecessária em logs) */
  label?: string;
};

export type ExternalNavResult =
  | { ok: true; method: string; url: string }
  | { ok: false; reason: string };

/**
 * Gera URL de abertura. O app avisa que o usuário sairá temporariamente.
 */
export function buildExternalNavigationUrl(
  target: NavTarget,
  preferred: "geo" | "google_free_web" | "apple_maps" | "osm" = "geo",
): ExternalNavResult {
  const { lat, lon, label } = target;
  const hasCoord =
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon);

  if (preferred === "geo" && hasCoord) {
    const q = label ? `(${encodeURIComponent(label)})` : "";
    return {
      ok: true,
      method: "geo_uri",
      url: `geo:${lat},${lon}?q=${lat},${lon}${q}`,
    };
  }

  if (hasCoord) {
    // Fallbacks web sem chave de API (não são “infra de produção”)
    if (preferred === "osm") {
      return {
        ok: true,
        method: "openstreetmap_web",
        url: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`,
      };
    }
    if (preferred === "apple_maps") {
      return {
        ok: true,
        method: "apple_maps_web",
        url: `https://maps.apple.com/?daddr=${lat},${lon}`,
      };
    }
    // google free web directions — sem token; usuário pode ter app instalado
    return {
      ok: true,
      method: "maps_web_fallback",
      url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`,
    };
  }

  if (label && label.trim()) {
    const q = encodeURIComponent(label.trim());
    return {
      ok: true,
      method: "search_fallback",
      url: `https://www.openstreetmap.org/search?query=${q}`,
    };
  }

  return { ok: false, reason: "destino_insuficiente" };
}

export function openExternalNavigation(
  target: NavTarget,
  preferred?: "geo" | "google_free_web" | "apple_maps" | "osm",
): ExternalNavResult {
  const built = buildExternalNavigationUrl(target, preferred);
  if (!built.ok) return built;
  if (typeof window !== "undefined") {
    window.open(built.url, "_blank", "noopener,noreferrer");
  }
  return built;
}
