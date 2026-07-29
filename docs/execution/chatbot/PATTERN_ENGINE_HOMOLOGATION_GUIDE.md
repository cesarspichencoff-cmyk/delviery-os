# Homologação humana — Pattern Engine + Writers

## Objetivo

Comparar linguagem, não decisão. Os três candidatos recebem exatamente o mesmo
caso, estado e plano:

- determinístico da Mudança 006;
- Gemma 4 E4B como Writer;
- Qwen3.5 4B como Writer.

As opções A/B/C são ordenadas por hash determinístico. O artefato público não
contém identidade, modelo, provider, latência ou mapping. A identidade só pode
ser revelada depois de voto persistido.

## Proveniência

O bundle usa 20 casos dos corpora congelados da 005B e suas saídas locais já
certificadas. Isso evita nova inferência sem os pesos presentes e não altera o
plano. O artefato privado registra `shared_plan_hash`, `shared_state_hash` e
`source_evidence=stored_005b_writer_outputs_no_new_inference`.

## Critérios humanos

Naturalidade, saudação, continuidade, compreensão, retomada, utilidade,
confiança e “César enviaria?”. O voto não promove modelo automaticamente.

## Gate

`human_winner` permanece `null` e `promotion_authorized=false`. Uma futura
promoção exige autorização explícita de César e nova mudança; esta branch não
faz push, merge, deploy ou instalação.

