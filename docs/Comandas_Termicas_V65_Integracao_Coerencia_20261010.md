# Comandas térmicas V6.5 — integração SHADOW e reconciliação

**Data:** 10/10/2026. **Escopo:** somente código de prévia offline / PR #38 DRAFT (derivado do PR #21). **Fonte da verdade:** regras humanas atuais, motor de embalagem pinado e replays historicamente reconciliados. Nenhuma autorização de impressão, merge, deploy ou mudança no leitor.

## Prova observada

- Fonte motor `tata-academia/evolucao/v33-product-pass:lib/packaging-current.js`, Git blob SHA `3167c309f02a0ad5a84fb43043b8866e3bee873c`, verificado em 10/10/2026.
- `tools/gerar_tres_vias_motor_real_v65_offline.js`: executa **somente o conteúdo exato do motor pinado**, sem acesso a pedido vivo, porta, impressora, spooler ou deployment. Faz projeção de embalagens, kits, recursos, vias de produção e Conferência e renderiza **somente SVGs temporários**.
- Replay histórico reconciliado (04/10): motor real + entrada histórica validada + snapshot explícito de componentes de kits de teste. Resultado `PASS_OFFLINE`: Cozinha **2 caixas/2 itens**, Sushi **4 caixas/4 itens**, Conferência **6 caixas/6 itens**, sem efeitos físicos. `payload_sha256=933bba283dc89227144ad6b73080530249f45c0357170d6834b74ebe77587af1`.
- SHA-256 dos SVGs: Cozinha `041151f766725456d5487578375ac7c011c6bfa113ceaa52e1976a56d90e9db8`; Sushi `87ea691d76e57dca24ef104671c53119b53dfc60ec3d5d12739d1c864babd88f`; Conferência `f7a4cd64b85f3611abd5259c30d97f53d2cd7fcb9b3732faef50f794071d79a2`. Os três hashes **coincidem com os SVGs do replay V6.2**: não houve deriva de conteúdo ou geometria nesse replay.
- Novo contrato `packagingCoherenceV64.ts` só reagrupa as linhas da projeção, **não altera o plano/fingerprint original do motor de roteamento**. Se um grupo físico estiver dividido entre intents de praças diferentes, bloqueia.
- Renderer Epson ESC/POS offline agora expande três Kids validados em **C1, C2, C3**, com cada linha `1 COMBINADO KIDS`; C4 mostra caixa 240. Isso reconcilia a hierarquia física com o SVG da produção. Testes antigos que fixavam bytes anteriores foram atualizados **com novas contagens e sem afrouxar os portões**.
- Conferência distingue produtos **sem caixa física comprovada**, como bebidas classificadas, de produtos **sem embalagem comprovada**; não inventa uma caixa.
- Correção de sacolas: tamanho e **quantidade externa** precisam de prova própria; se há duas sacolas, exige distribuição de tamanhos individualmente comprovada. Kits sem regra FACT não entram automaticamente.
- Os testes incluem dois produtos distintos numa mesma caixa, uma linha com quantidade 2, observações vinculadas, grupo espalhado entre praças, bebidas sem caixa, alegação falsa de bebida sem caixa, falta de kit e sacola ambígua.
- SHA do Unified Kit Core atual consultado em `tata-os/feature/unified-tata-core-20261001:packages/unified-restaurant-core/src/kits.ts`: `42d69fea73e830bd6517e1230a0ec4c7fc9737a4`. O snapshot `data/kit_component_registry_v1.json` é **TRANSITIONAL / SUPERSEDED AS AUTHORITY**; usado somente como entrada explícita no replay histórico. A implementação **não** declara o snapshot como fonte viva nem autoriza inferir componentes.

## Pendências obrigatórias

1. Conectar a execução real de `projectTicketsFromCurrentPackagingV63` ao listener/ordem reconciliada e ao **Unified Core de kits com versão/proveniência**, sem bypass das regras de fonte. O runner V6.5 é uma conexão offline real com o motor de embalagens, **não** uma ativação produtiva.
2. Revalidar motor e fonte das regras caso os blobs evoluam; resolver classificação de praça, casos não compreendidos e múltiplas caixas físicas que exigem distribuição item-a-item.
3. HOT, EBITEN e SHISO possuem regras 1 preparação/porção da **praça Sushi Quente comprovada**; cobertura global permanece PARTIAL. `SKIN` passou a gerar `SKIN_KITCHEN_DEPENDENCY_UNPROVEN` quando aplicável — **não foi atribuído fator de preparo sem prova humana**.
4. Integrar quebra de observações longas V5.6 ao renderer operacional sem perder negações/alergias.
5. Comparar documento **Figma vivo** (nós 30:2/20:2) contra SVG, raster e Epson com fontes e dispositivo reais. O conector Figma estava sem acesso direto; hashes iguais não implicam paridade tipográfica/pixels.
6. Prova física somente na impressora **CAIXA Itaim**, por meio permitido e autorização específica; não usar outras impressoras nem imprimir pedido real como teste.
7. Obter aceite visual e operacional de César antes de integrar com produção. Confirmar branch alvo e dependências de PRs ancestrais.

## Estado objetivo

`CODE_READY/SHADOW` e `TEST_PASS/OFFLINE` dentro do escopo observado. **Não** `DEPLOYED`, **não** `WORLD_PROVEN`, **não** `HUMAN_ACCEPTED`. Nenhum merge, deploy, efeito de spooler, corte, leitor ou fiscal foi realizado neste PR.
