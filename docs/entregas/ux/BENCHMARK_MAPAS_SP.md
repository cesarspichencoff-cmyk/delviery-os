# Benchmark cartográfico — São Paulo (honesto)

| Campo | Valor |
|---|---|
| Status | **Protocolo + resultados parciais de POC** |
| Data | 2026-07-20 |

## 1. Objetivo

Comparar stack open source para ENTREGAS **sem** declarar “melhor GPS” sem prova.

## 2. Cenários de teste (endereços **anonimizados**)

| ID | Tipo | Notas |
|---|---|---|
| SP-A | Trajeto curto (≈2–4 km) | Mesma região |
| SP-B | Trajeto longo (≈12–18 km) | Travessia de bairros |
| SP-C | Sentido único / via restrita | Qualidade OSM |
| SP-D | Condomínio / acesso | Ambiguidade de portaria |
| SP-E | 3–5 paradas | Ordem de visita |
| SP-F | Rede instável | Offline parcial |
| SP-G | GPS impreciso | accuracy alta |
| SP-H | Permissão negada | Sem localização |

## 3. Métricas

- Tempo de load do mapa (ms)  
- Tempo de cálculo de rota (ms)  
- Tamanho JS + tiles (MB)  
- Dados móveis estimados  
- Comportamento offline  
- Precisão percebida  
- Facilidade de uso no Android modesto  

## 4. Resultados da POC isolada (MapLibre + tiles demo)

| Métrica | Resultado POC | Comentário |
|---|---|---|
| Load MapLibre (CDN demo) | ~1–3 s em rede boa | Depende de CDN; **não** produção |
| Rota simulada (polyline fixa) | Instantânea | Não é motor de routing real |
| Offline tiles | **Falha** sem pack local | Esperado |
| Permissão negada | UI “Localização indisponível” | OK |
| GPS fictício de motoboy | **Não desenhado** | Regra soberana |
| Atribuição OSM | Visível no rodapé do mapa | Obrigatório |

## 5. Routing self-host (ainda não medido em SP real)

| Engine | Próximo passo |
|---|---|
| OSRM | Subir extract SP, medir multi-stop car profile |
| Valhalla | Medir matrix + perfil custom |

**Não há vencedor de produção declarado nesta fase.**

## 6. Piloto recomendado

1. Mapa contextual MapLibre (self-host tiles quando houver).  
2. Navegação curva-a-curva via **app externo**.  
3. Medir se embutir motor melhora tempo de entrega antes de investir.
