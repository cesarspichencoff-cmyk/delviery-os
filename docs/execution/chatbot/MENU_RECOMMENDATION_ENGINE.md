# Motor de recomendação de cardápio

Ordem determinística:

```text
canal/unidade
→ revisão e disponibilidade
→ alergias e restrições obrigatórias
→ preparo, ingredientes excluídos e faixa de preço
→ compatibilidade
→ preferência confirmada
→ preferência inferida com peso menor
→ no máximo três opções
```

O resultado inclui IDs, razões, fontes, disponibilidade e restrições
aplicadas. Não existe sinal de “mais vendido” nem popularidade inventada.

Harmonizações só aparecem com `approval_status=confirmed`, no mesmo canal e
unidade, e com a bebida disponível. O Writer recebe apenas candidatos
autorizados; não recebe score nem pode inserir item ou ingrediente.

Jornadas suportadas pelos contratos: descoberta, recomendação, harmonização,
filtro alimentar, alergênicos, composição e comparação.
