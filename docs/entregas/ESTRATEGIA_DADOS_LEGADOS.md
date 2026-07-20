# Estratégia de dados legados (705 idas / 501 voltas)

## Princípio

Planilha Motoboy = **evidência histórica**, **não** eventos canônicos COR.

## Não fazer

- Converter automaticamente linhas em Trip confiáveis  
- Inventar `trip_id` retroativo como verdade  
- Misturar legado com operação nova no mesmo event stream  

## Fazer (quando houver UI/consulta)

| Ação | Descrição |
|---|---|
| Leitura | import read-only |
| Consulta histórica | marcador `source=legacy_spreadsheet` |
| Import opcional | objetos `LegacyTripHint` com `confidence=low` |
| Identificação | sem trip_id nativo; pairing frágil documentado |
| Preservação | somente leitura; sem overwrite do domínio vivo |

## Confiança

Qualquer métrica derivada do legado = **inferência**, nunca fato de aceite A01–A39.
