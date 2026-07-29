# Menu Context Contract V1

## Inventário das fontes oficiais internas localizadas

| Fonte | Caminho relativo | Formato | Escopo/canal confirmado | Uso nesta mudança |
|---|---|---|---|---|
| Lista fonte TATÁ | `data/cardapio_fonte.txt` | texto delimitado por `|`, 217 linhas | canal e unidade não codificados | conferir campos básicos; não publicar catálogo |
| Seed operacional | `data/cardapio_knowledge_seed.json` | JSON, 199 itens canônicos | conhecimento operacional transversal; não é menu por canal | validar cobertura e lacunas |
| Auditoria da seed | `docs/Auditoria_Cardapio_Conhecimento.md` | Markdown | 18 duplicados, 24 sem descrição, 8 em revisão manual | registrar divergências |
| Arquitetura operacional | `docs/Arquitetura_Conhecimento_Cardapio.md` | Markdown | modelo de produção/praça, não recomendação ao cliente | separar domínio operacional do Menu Context |
| Referências públicas confirmadas | `src/conversation-crm/native/catalogs/TATA_OPERATIONAL_PUBLIC_INFO_V1.json` | JSON | Itaim; institucional com preços, salão completo e delivery próprio em links distintos | transportar referência por canal sem misturar conteúdo |
| Página DeliveryOS | `app-v1/app.js` | JavaScript | carrega a seed em fonte atual e simulada | superfície consumidora; não é nova fonte de verdade |

Hashes SHA-256 observados em 29/07/2026:

- `cardapio_fonte.txt`: `c9322334c073c9439ba799739a7c6e9e53d3a6a87067c6a3ed4eb86585d36bc4`;
- `cardapio_knowledge_seed.json`: `0f84415708e7364a6a6f2f537e6884bcdf415ff4139eb8855ee5227ed785f4df`;
- auditoria: `ffd8cb4d5fb34a3e292892bb814fdc80939609430fb15d02ae880bd486feb630`;
- arquitetura: `883c20247b483c57a15c00122a77f5c42f9215b3551eb1c94e1a89e67392e3ed`;
- referências públicas: `db75aafeb4ff863b811a74da0b6a74794b03e80de7877d81ad1f11111ce1d982`.

## Campos do contrato

O Menu Context V1 separa `status`, `channel`, `unit_id`, `items`, `unknowns`,
`divergences` e `provenance`. Cada item deve ter ao menos `item_id` e `name`.
Se declarar canal ou unidade, deve coincidir com o contexto pai.

Campos previstos para a Mudança 008: descrição oficial, preço por canal,
ingredientes confirmados, quantidade/peças, temperatura de serviço, presença
de cream cheese, alergênicos, risco de contaminação cruzada, customizações,
disponibilidade por canal/unidade, origem e última revisão.

## Cobertura encontrada

| Campo futuro | Cobertura atual | Observação |
|---|---|---|
| nome | presente | fonte e seed |
| descrição | parcial | 24 itens sem descrição |
| categoria/praça/temperatura operacional | presente, com incertezas | não equivale a apresentação ao cliente |
| ingredientes | parcial e derivado por dicionário | não tratar como ficha oficial nem alergênico |
| quantidade de peças/pessoas | parcial | preservar `null` quando ausente |
| preço por canal | ausente na lista/seed | existe apenas referência externa por link; não foi importado |
| canal por item | ausente | proibido misturar salão, iFood e delivery próprio |
| unidade por item | ausente | referências públicas são da unidade Itaim |
| disponibilidade viva | ausente | `disponivel_em` da seed não prova disponibilidade comercial atual |
| alergênicos/contaminação cruzada | ausente | qualquer orientação deve pedir confirmação humana |
| customizações | ausente | não inferir pela descrição |
| popularidade/ranking | ausente | não inferir de ordem ou categoria |

## Divergências para revisão humana

- 18 linhas duplicadas foram colapsadas na seed;
- 24 itens não têm descrição;
- 8 itens estão marcados para revisão manual/baixa confiança;
- ingredientes e molhos foram extraídos por dicionário, não confirmados como
  ficha técnica de atendimento;
- não existe mapeamento item × canal × unidade × preço;
- os três links públicos são distintos e não autorizam união dos catálogos;
- a página DeliveryOS consome a seed operacional, mas isso não transforma a
  seed no catálogo comercial definitivo.

Nenhum preço, descrição ou ingrediente foi alterado. Nenhuma lacuna foi
preenchida. O catálogo definitivo permanece reservado para a Mudança 008.

## Interfaces reservadas

`search_menu_items`, `get_menu_item_details`, `get_channel_menu`,
`get_item_availability`, `get_item_allergens`, `get_item_customizations`,
`get_recommendation_candidates` e `get_pairing_candidates`.

Todos retornam indisponível nesta mudança.
