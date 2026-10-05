# Product System Reader â€” official wiring

Data: 2026-10-05
Branch: `tmp/product-reader-official-wiring-20261005`
Base: `735d4ab6b039a07924125c7ac0002ff7c63ff58b`
Escopo: **CODE_READY / configuraÃ§Ã£o oficial; sem deploy**

## O que foi ligado

A composiÃ§Ã£o oficial ganhou o serviÃ§o `deliveryos-product-system` usando o papel mÃ­nimo
`deliveryos_product_reader`.

O serviÃ§o:

- roda na imagem comum da plataforma;
- usa `PRODUCT_UI_HOST=0.0.0.0` apenas dentro da rede privada;
- expÃµe 5290 somente para a rede do compose, sem `ports:`;
- espera PostgreSQL saudÃ¡vel, migrations e job de papÃ©is;
- recebe URL com credencial exclusiva do reader;
- Ã© `read_only`, `no-new-privileges` e tem apenas `/tmp` gravÃ¡vel;
- mede saÃºde por `GET /api/navegacao`.

## Least privilege

`product_system_reader.sql` continua sem INSERT/UPDATE/DELETE/TRUNCATE e sem `secret_hash`.
A senha Ã© aplicada via ambiente pelo job de papÃ©is e permanece vazia no arquivo de exemplo.

## Empacotamento

O build oficial passou a incluir assets que TypeScript nÃ£o compila:

- Product System UI;
- shared tokens de Entregas;
- DESIGN_TOKENS.json;
- cardÃ¡pio de referÃªncia;
- perfil-delivery JS;
- Conference Brain JS.

O servidor e os seeds agora resolvem source-tree local primeiro e `dist/` como fallback.

## Provas

- Product reader wiring: **14/14 PASS**;
- `build:platform`: PASS;
- binÃ¡rio compilado em diretÃ³rio image-like sem Ã¡rvore `src/`: PASS;
- Product System: **54/54 PASS**;
- platform deploy audit: **30/30 PASS**.

## NÃ£o provado

- Docker nÃ£o estÃ¡ instalado nesta mÃ¡quina: `docker compose config/up` **NOT_RUN**;
- credencial real do reader: **NOT_CREATED**;
- deploy/cutover: **NOT_DEPLOYED**;
- produÃ§Ã£o: **NOT_ACTIVATED**.

A prova PostgreSQL sourceâ†’Product System 10/10 permanece a do checkpoint pai; nÃ£o foi rerodada
nesta sessÃ£o porque `DELIVERYOS_PG_URL` nÃ£o estava definida.

## Figma Full

O frame `25:47 â€” Pilot Readiness Â· 2026-10-05` foi sincronizado com o gate executÃ¡vel:

- **8 provas locais**;
- **5 blockers observacionais**;
- **6 blockers action-enabled**;
- novo card `26:2 â€” PRODUCT READER Â· wiring 14/14`.

Screenshot MCP renderizado apÃ³s a mutaÃ§Ã£o.
