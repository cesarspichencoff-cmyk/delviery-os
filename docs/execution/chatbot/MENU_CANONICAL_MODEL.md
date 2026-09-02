# Modelo canônico de cardápio

`MenuCatalog` representa fontes, identidades comerciais, variantes,
ingredientes, alergênicos, customizações, disponibilidade, preços,
harmonizações e conflitos.

Uma variante é identificada por:

```text
identidade comercial + canal + unidade + período + tamanho
```

Campos desconhecidos permanecem `null`, `unknown` ou vazios. Estados de
revisão: `confirmed`, `unconfirmed`, `conflicting`, `missing`, `deprecated`.

O catálogo de homologação tem itens claramente sintéticos. A seed operacional
de 199 itens é apenas inventariada: canal e unidade ausentes impedem promoção
ao catálogo comercial. O DOCX externo e as páginas públicas são fontes de
revisão; nenhum conteúdo é importado automaticamente.

Conflitos materiais na mesma variante são preservados em `menu_conflicts`.
