# ADR — Mapas, GPS e roteamento (ENTREGAS)

| Campo | Valor |
|---|---|
| Status | **Proposto para piloto / aceito para POC** |
| Data | 2026-07-20 |
| Escopo | Zero licença paga obrigatória; self-hosting possível |

## 1. Decisão

| Camada | Escolha | Licença típica |
|---|---|---|
| Render web/PWA | **MapLibre GL JS** | BSD-3 |
| Dados base | **OpenStreetMap** (+ atribuição) | ODbL |
| Tiles demo | Tiles públicos OSM **somente demo** | ToS do provedor demo |
| Tiles produção-alvo | **PMTiles / tiles self-host** | Própria infra |
| Roteamento self-host (futuro) | **Valhalla** (flexível) ou **OSRM** (rápido car/bike) | MIT / BSD |
| Localização PWA | **Geolocation API** | N/A |
| Piloto navegação | **Adapter de app externo** (geo URI / intent) | N/A |

**Não usar nesta fase (nem como “default permanente”):** Google Maps pago, Mapbox pago, HERE pago, chave free transitória como produção.

## 2. Comparativo resumido

### Renderização

| | MapLibre GL JS | Leaflet + raster | Mapbox GL JS (pago) |
|---|---|---|---|
| Licença | BSD (fork OSS) | BSD | Proprietária + tokens |
| Custo licença | Zero | Zero | Pago em escala |
| Self-host tiles | Sim (PMTiles etc.) | Sim | Lock-in tokens |
| Qualidade visual | Alta (vector) | Boa (raster) | Alta |
| Substituição | Adapter de map engine | Adapter | Difícil |

### Roteamento

| | OSRM | Valhalla | Google Directions |
|---|---|---|---|
| Licença | BSD | MIT | Pago |
| Self-host | Sim (pesado em disco) | Sim | Não |
| Multi-stop | Sim | Sim (matrix forte) | Sim |
| Motocicleta | Perfis custom OSM | Perfis flexíveis | Sim |
| Offline engine | Self-host only | Self-host only | Não |
| Custo | Infra própria | Infra própria | API |

**Piloto 1:** não embutir curva-a-curva complexa até provar ganho operacional. Preferir **abrir navegação externa** com destino/coordenada.

### Localização

| | Geolocation API | SDK nativo pago |
|---|---|---|
| Custo | Zero | Variável |
| HTTPS | Obrigatório em produção | — |
| Ligado à viagem | Política app (consent + trip ativa) | Idem |
| Histórico permanente | **Proibido** no ENTREGAS | — |

## 3. Verdade sobre “gratuito”

| Tipo | Realidade |
|---|---|
| Software OSS (MapLibre, OSRM, Valhalla) | **Sem licença** |
| Tiles públicos OSM de terceiros | **Não** é produção; ToS/rate limit |
| Self-host tiles + routing | **Custo de servidor, disco, banda** |
| Afirmar “custo zero em produção” | **Sem prova → proibido** |

Objetivo obrigatório: **zero licença proprietária**, **zero API paga obrigatória**, **stack substituível**, demo local sem chave.

## 4. Qualidade São Paulo / Android

| Critério | Avaliação honesta |
|---|---|
| Qualidade OSM em SP | Boa em avenidas; condomínios e sentidos exigem correção comunitária |
| Motocicleta | Depende de perfil e dados; não é “Google nível” out-of-the-box |
| Android modesto | MapLibre vector ok se tiles leves; evitar 3D pesado |
| Offline | Precisa pack PMTiles + motor self-host — **não** na demo pública de tiles |

## 5. Privacidade

- GPS **só** com viagem ativa e consentimento  
- Sem rastreamento contínuo nesta fase  
- Sem histórico permanente de coordenadas em eventos públicos  
- Atribuição OSM obrigatória na UI do mapa  

## 6. Adapter

```text
MapProvider (render)
RoutingProvider (opcional)
ExternalNavigationAdapter (piloto)
LocationSession (consent + trip_id)
```

Troca de provedor sem reescrever domínio.

## 7. Prova técnica

`src/entregas/ui/map-poc/` — isolada, dados anonimizados, sem domínio definitivo.

## 8. Status de escolha

| Fase | O que fazer |
|---|---|
| Agora | MapLibre + OSM atribuição + nav externa + POC |
| Pré-piloto | Benchmark SP (doc BENCHMARK) + decidir Valhalla vs OSRM se self-host |
| Produção | PMTiles próprios; **não** depender de tile público genérico |

## 9. Consequências

- Identidade visual do mapa pode usar estilo neutro/papel (não neon tracker).  
- Mapa **nunca** ocupa a tela inteira se a ação for confirmar entrega.  
- Domínio COR permanece autoridade; mapa é evidência/auxílio.
