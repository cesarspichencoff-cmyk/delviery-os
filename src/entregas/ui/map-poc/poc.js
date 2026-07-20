/**
 * POC isolada MapLibre — não integra domínio definitivo.
 * Tiles demo públicos = apenas demonstração.
 */
function buildNav(target) {
  if (typeof target.lat === "number" && typeof target.lon === "number") {
    return {
      ok: true,
      method: "geo_uri",
      url: `geo:${target.lat},${target.lon}?q=${target.lat},${target.lon}`,
    };
  }
  return { ok: false, reason: "destino_insuficiente" };
}

const $ = (id) => document.getElementById(id);
const mapEl = $("map");
const stateEl = $("viewState");
let map = null;

const STORE = { lon: -46.6559, lat: -23.5614 };
const DELIVERIES = [
  { lon: -46.6482, lat: -23.5678, id: "e1" },
  { lon: -46.6415, lat: -23.5721, id: "e2" },
];

function setState(s) {
  stateEl.textContent = `Estado: ${s}`;
}

function clearMap() {
  if (map) {
    map.remove();
    map = null;
  }
  mapEl.className = "";
  mapEl.innerHTML = "";
}

function showMessage(msg) {
  clearMap();
  mapEl.classList.add("unavailable");
  mapEl.textContent = msg;
}

function initMapLibre() {
  clearMap();
  if (typeof maplibregl === "undefined") {
    showMessage("MapLibre indisponível (script não carregou).");
    setState("tiles_unavailable");
    return;
  }
  // Demo tiles — NOT production infrastructure
  map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors",
        },
      },
      layers: [
        {
          id: "osm",
          type: "raster",
          source: "osm",
        },
      ],
    },
    center: [STORE.lon, STORE.lat],
    zoom: 13,
    attributionControl: true,
  });

  map.on("error", () => {
    setState("tiles_unavailable");
  });

  map.on("load", () => {
    setState("ready");
    // store marker
    // Cores da linguagem cartográfica TATA (experimental)
    new maplibregl.Marker({ color: "#22563C" })
      .setLngLat([STORE.lon, STORE.lat])
      .setPopup(new maplibregl.Popup().setText("Casa (demo anonimizada)"))
      .addTo(map);
    DELIVERIES.forEach((d, i) => {
      new maplibregl.Marker({ color: i === 0 ? "#24603F" : "#B0812F" })
        .setLngLat([d.lon, d.lat])
        .setPopup(
          new maplibregl.Popup().setText(
            `Parada ${i + 1} (demo geo — não é tracking de produção)`,
          ),
        )
        .addTo(map);
    });
    // NÃO desenhar motoboy fictício como dado real
  });
}

function addSimulatedRoute() {
  if (!map) {
    initMapLibre();
  }
  const draw = () => {
    const id = "demo-route";
    if (map.getSource(id)) {
      map.removeLayer("demo-route-line");
      map.removeSource(id);
    }
    map.addSource(id, {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            [STORE.lon, STORE.lat],
            [-46.652, -23.564],
            [DELIVERIES[0].lon, DELIVERIES[0].lat],
            [DELIVERIES[1].lon, DELIVERIES[1].lat],
          ],
        },
      },
    });
    map.addLayer({
      id: "demo-route-line",
      type: "line",
      source: id,
      paint: {
        "line-color": "#22563C",
        "line-width": 4,
        "line-opacity": 0.8,
      },
    });
    setState("ready + rota simulada (não é routing engine)");
  };
  if (map.loaded()) draw();
  else map.on("load", draw);
}

$("btnReady").onclick = () => initMapLibre();
$("btnNoLoc").onclick = () => {
  showMessage("Localização indisponível. A viagem continua sem mapa de posição.");
  setState("no_location");
};
$("btnDenied").onclick = () => {
  showMessage("Permissão de localização negada. Use navegação externa se precisar.");
  setState("permission_denied");
};
$("btnImprecise").onclick = () => {
  showMessage("Sinal impreciso. Não confirmamos chegada só com GPS.");
  setState("imprecise");
};
$("btnOffline").onclick = () => {
  showMessage("Mapa offline / tiles indisponíveis. Self-host PMTiles é necessário em produção.");
  setState("offline / tiles_unavailable");
};
$("btnRoute").onclick = () => addSimulatedRoute();
$("btnNav").onclick = () => {
  const r = buildNav({ lat: DELIVERIES[0].lat, lon: DELIVERIES[0].lon, label: "Parada demo" });
  if (r.ok) {
    const leave = confirm(
      "Você sairá temporariamente do ENTREGAS para o app de mapas. Deseja continuar?",
    );
    if (leave) window.open(r.url, "_blank", "noopener");
  }
};

$("attr").textContent = "© OpenStreetMap contributors · MapLibre GL JS (BSD)";
setState("loading — escolha uma opção");
