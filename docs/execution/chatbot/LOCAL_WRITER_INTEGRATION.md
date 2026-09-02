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

## Conexão final ao painel local

O endpoint real `/api/homologation/chat` chama o Gemma 4 E4B somente depois de
o runtime emitir `deliveryos-approved-response-envelope-v1`. Os artefatos ficam
fora do Git em raiz configurável por `DELIVERYOS_HOMOLOGATION_WRITER_ROOT`; na
ausência da variável, o padrão é `%LOCALAPPDATA%\DeliveryOS\homologation-writer`.

O painel publica apenas:

- `Writer: gemma_local` quando geração e validação passam;
- `Writer: deterministic_fallback` e um código específico quando artefato,
  inicialização, tempo ou saída falham.

O runtime certificado é `llama.cpp b10172`, CPU, contexto 8.192, uma sessão,
bind exclusivo em `127.0.0.1`. O modelo é o GGUF oficial
`gemma-4-E4B_q4_0-it.gguf`, revisão e SHA-256 já aprovados na Mudança 005B.

## Limites

O Writer está conectado somente à homologação local; não existe WhatsApp,
driver real, nuvem ou custo externo. A comparação humana A/B usa o mesmo
envelope: A é o compositor determinístico e B é o Gemma local. Isso não promove
o Writer para Director e não altera o instalador certificado da Mudança 005.
