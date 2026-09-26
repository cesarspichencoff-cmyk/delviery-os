# César Gerencial Mail Bridge

Cloudflare Worker operacional para ingestão somente-leitura da caixa `atendimento@tatasushi.com.br`.

## Rota autorizada

- IMAP: `mail.tatasushi.com.br:993` via TLS.
- Caixa: `atendimento@tatasushi.com.br`.
- Pasta: Sent / `INBOX.Sent`, resolvida dinamicamente.
- Fechamentos: fluxo legado já existente.
- Avaliações iFood: destinatário `cesar@tatasushi.com.br` e assunto contendo `ifood`, case-insensitive.
- Identidade idempotente das avaliações: `UIDVALIDITY + UID`.

## Contrato de leitura

- usa `EXAMINE`, não `SELECT`;
- usa `BODY.PEEK`, preservando o estado de leitura;
- não envia e-mail;
- não usa `STORE`, `MOVE`, `COPY`, `DELETE`, `EXPUNGE` ou `APPEND`;
- worker sem URL pública em `workers.dev`.

## Persistência iFood

A tabela canônica é `ifood_review_mail`. Metadados, assunto e texto extraído podem ser persistidos no D1.
Anexos ficam em `ifood_review_attachment`, inclusive binários quando presentes.
Imagens/PDFs não são fingidos como texto: a extração permanece explicitamente incompleta até existir uma rota própria.

## Produção

- Worker: `cesar-gerencial-mail-bridge`.
- D1: `cesar-gerencial-mail-bridge` / `fc0ae418-599d-41da-b849-5fada0cc08e2`.
- Cron declarado: `0 * * * *`.
- Secrets necessários em produção: `IMAP_PASSWORD` e `NEON_DATABASE_URL`.
- Secrets nunca pertencem ao repositório.

## Limites de verdade

A presença de um e-mail prova transporte e observação da fonte; não prova causa operacional, culpa ou correção.
`readonly_verified` registra se o uso de `BODY.PEEK` preservou o estado observado da mensagem.
O primeiro lote real de avaliações iFood ainda é o gate para provar a cadeia completa até a análise gerencial.

## Testes

Execute:

`npm ci`
`npm test`
