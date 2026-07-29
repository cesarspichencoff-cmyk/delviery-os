# Integração dos Writers locais — Mudança 006

## Arquitetura

O Pattern Engine é o único responsável por padrão conversacional e movimento
de jornada. O estado reconstruível produz o Response Plan. O plano e os
contextos opcionais passam pelo `ApprovedResponseEnvelope` antes do Writer.

Gemma 4 E4B e Qwen3.5 4B permanecem exclusivamente Writers. Os resultados da
Mudança 005B foram reutilizados como evidência de linguagem; nenhum modelo foi
promovido a Director e nenhuma inferência nova foi necessária para montar o
painel cego.

## Validação

O Writer recebe a superfície legada de 14 campos derivada do envelope. A saída
aceita somente `{ text }` e é recusada quando:

- muda ou remove a pergunta aprovada;
- inventa número, link, ação ou compensação;
- contradiz bloqueio de canal ou custo;
- expõe termos técnicos;
- viola gravidade, emoji ou tamanho;
- falha nos gates independentes pós-composição.

Falha ou indisponibilidade retorna ao texto determinístico; não há resposta
fabricada pelo adaptador.

## Limites

`human_winner=null`, `promotion_authorized=false`, sem peso novo, sem download,
sem API, sem custo externo e sem mudança no instalador certificado da Mudança
005.
