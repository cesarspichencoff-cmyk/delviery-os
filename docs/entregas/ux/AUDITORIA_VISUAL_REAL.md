# Auditoria visual real — ENTREGAS 3C.1A

| Campo | Valor |
|---|---|
| Commit auditado | `cb74303932a8dd2dfdd5fd0c110639d16e654d3e` (+ correções 3C.1A) |
| Método | Playwright + Chrome · PNG reais |
| Pasta | `docs/entregas/ux/capturas-reais/` |
| SVG como prova final | **NÃO** |

## Resultado das capturas

| Métrica | Valor |
|---|---|
| PNG reais | **43** |
| Viewports | 1366×768, 1440×900, 768×1024, 390×844, 360×800 |
| Console / Mobile / iFood / Mapa | cobertos |

Índice: `capturas-reais/INDEX.json`.

## Achados principais (antes das correções)

| # | Achado | Severidade | Ação |
|---|---|---|---|
| 1 | Rotas `/console/` 404 se servidas do `dist/` (path errado) | Bloqueante | **Corrigido** — ROOT = `src/entregas/ui` + index.html em pastas |
| 2 | HTTP 400 em rejeição de domínio gerava “erro de rede” no console | Médio | **Corrigido** — API retorna 200 + `result.ok` |
| 3 | Mobile mantinha “Confirmar saída” em viagem retornando | Alto UX | **Corrigido** — botões desabilitados por estado |
| 4 | Erro técnico `trip_started de retornando` | Alto UX | **Corrigido** — humanizeDomainError |
| 5 | Footer citava “ApplicationService” | Baixo | **Corrigido** — “Demo” |
| 6 | Console 3 colunas em 1440 com área vazia à direita em empty | Médio visual | Aceitável em empty; lista+viagens usam span |
| 7 | “Handoff” ainda aparece em alguns rótulos iFood | Baixo | Parcial — título Expedição iFood OK |

## O que está bem

- Banner DEMO sempre visível  
- Verde/papel alinhados a DELIVERYOS  
- Mobile botões grandes  
- iFood sem perfil de courier / sem Trip / sem mapa  
- Mapa POC com estados e atribuição OSM  
- Sem ranking  

## Limitações honestas

- Protótipo em memória (não FileUnitOfWork)  
- Capturas de alguns estados “loading/dado expirado” genéricos ainda fracos  
- Leitor de tela: smoke apenas (não bateria completa)  
- Mapa usa tiles públicos demo (não produção)  

## Não declarar

Experiência **não** está aprovada em nome do César.  
Aguardar: `EXPERIENCIA ENTREGAS CONFIRMADA`.
