# DeliveryOS — auditoria de preservação fundadora e prontidão de experiência
**Data:** 13/10/2026 · **Natureza:** auditoria independente da implementação, registro de evidências e decisão de não promoção.
**Alvo verificado:** PR #106, HEAD `e7262cedeb3e7caa8ac503fd5cf4967c33f0db15` antes de adicionar este registro. **DRAFT/HOLD · SEM MERGE · SEM DEPLOY.**
**Este documento não muda autoridade visual, não aprova M1B/Q-019 nem revoga decisões humanas.** É evidência de comparação, não fonte canônica nova.

## 1. Missão e critérios de aceitação
O produto concebido por César **não é um dashboard ou app de frota**: é a percepção operacional da TATÁ com intervenção mínima, confiabilidade de fonte, atenção humana única, apresentação sensorial serena e ação humana. Copiloto/Operação Viva (primeiro produto maduro) e Entregas (segundo prioritário) são **primos**: DNA, semântica e qualidade em comum, sem repetir fisicamente a mesma interface. CRM, chatbot e Comandas evoluem em paralelo e não bloqueiam essa fatia.

**Critério anti-regressão:** nenhuma superfície técnica, demo, design system ou conveniência de engenharia pode substituir silenciosamente o Sprint Visual V2, o organismo V3.3, a evolução Static/Motion North Star e as experiências de Entregas já confirmadas. Melhorias precisam de benefício observável e avaliação humana; não há autorização para redesign amplo.

## 2. Cadeia de fontes e integridade
| Ordem/papel | Material localizado | Verificação e fronteira |
|---|---|---|
| Filosofia de produto | `docs/Constituicao.md`, `docs/Manifesto_Produto_Design.md`, `docs/product/DELIVERYOS_PRODUCT_CONSTITUTION.md` | Propriocepção operacional, Calmo/Ambiente/Foco, anti-dashboard, nenhuma execução automática. |
| Cânone visual principal | `docs/design/canonical/deliveryos-visual-v2/Sprint Visual DeliveryOS V2 (1).zip` | SHA-256 do ZIP **`2755573BBE624F4CE0DBA992D006E6E5B8E2B6DEA87B7D6A2050E55FD9834101`**, revalidado diretamente no arquivo do worktree Foxxy; casa com `docs/design/CANONICAL_VISUAL_MANIFEST.json`. |
| V3.3 no ZIP original | Entrada `DeliveryOS Organismo Operacional.dc.html` | SHA-256 **`434294036F86FF6976B48FB3EC4B58D5C4CECEFE272FEEA181E9A167E7B19FBC`** verificado diretamente dentro do ZIP; a cópia extraída na árvore possui bytes/hash diferentes por transformação local e **não** substitui o objeto imutável dentro do ZIP. |
| Hierarquia e sucessão | `docs/design/VISUAL_REFERENCE_HIERARCHY.md`; `VISUAL_SOURCE_OF_TRUTH.md`; `M1_CANONICAL_SUCCESSION.md` | Sprint V2 ancestral soberano; V3.3 referência validada; De-Mechanization e Motion North Star descendências ativas; `app-v1` histórico, não baseline visual. |
| Movimento e alterações | `docs/design/M1_MOTION_GRAMMAR.md`; `M1_VISUAL_CHANGE_ENVELOPE.md` | Causa→propagação→efeito, falha técnica sem animação, evidência estática, reduced-motion; mudanças em caminhos protegidos exigem envelope estreito. |
| Entregas já aprovado | `docs/entregas-design/PRODUCT_DECISIONS.md`, `UX_ARCHITECTURE.md`, `DESIGN_HANDOFF_V03.md`, `docs/entregas/ux/EXPERIENCIA_VISUAL_CONFIRMADA.md` | 20 jornadas, Trip como objeto raiz, mobile próximo passo, offline honesto, excepcionalidade e retorno, sem ranking; experiência visual confirmada em 20/07 e **sem autorização para novo redesign geral**. |
| Figma e paridade | `docs/figma/FIGMA_ORGANISMO_PARITY_MATRIX.md`; `FIGMA_CODE_PARITY_MATRIX.md` | Referências nativas e nós de recuperação descritos. Nesta auditoria o conector Figma do titular retornou restrição de edição/seat View para capturar nós: **paridade visual Figma atual NÃO verificada ao vivo**. |

## 3. Confronto dos planos com o software — evidência e veredito

| Obrigação original | Evidência atual | Juízo |
|---|---|---|
| Produto central = organismo de percepção, não indicadores | Home `src/product/ui/surfaces/home.js/.css`: `.org`, câmaras, passagem, pressão por `data-degrau`, um Foco, estados explícitos. Captura real no Chromium de 1440 e 375 px, em DEMO sem banco. | **PRESERVAÇÃO PARCIAL COMPROVADA** da gramática. Elegância final depende do julgamento de César e de dados operacionais reais. |
| Calmo não é vazio; Ambiente não orienta; só Foco orienta | `docs/product/CONTRATO_CONSCIENCIA_COPILOTO.md` e testes R5A/B/C/D; CI atual Product UX R5 gates aprovados. | **PROVADO EM TESTES** de contrato; comportamento no pico real NÃO provado. |
| Copiloto principal não vira página de dashboard | `#/copiloto` em `src/product/ui/surfaces/copiloto.js` é **inspeção Shadow**, com cartões e grades; screenshots no Chromium: documento ~3.972 px desktop e ~7.147 px mobile. `M1_CANONICAL_SUCCESSION.md` esclarece que o organismo principal é a **Home**, não essa rota. | **SEM REGRESSÃO AUTOMÁTICA** porque a função é inspeção; **RISCO ALTO** se promovida como experiência principal. Proibida promoção como substituto visual da Home sem comparação/aceite humano. |
| Mesma família, personalidades distintas | `src/entregas/ui/console`, `rider-mobile`, `ifood-handoff` foram executados em servidor efêmero local DEMO; imagens reais de navegador desktop/mobile, sem JS page errors. O console é claro e funcional, mas mais orientado a cartões; o mobile adota título editorial/ação soberana e o fluxo da viagem. | **CONCEITOS PRESERVADOS**, acabamento de parentesco e peso dos cartões **DEPENDENTE DE REVISÃO HUMANA**; não substituir o console confirmado por mockup conceitual. |
| Motoboy precisa de próximo passo, não dashboard/mapa | Em `rider-mobile` a Trip fictícia de duas paradas apresenta fases Saída/A caminho/Entregar e **uma ação primária “Confirmar saída”**, GPS desligado. Screenshot 390×844 no Chromium, sem banco, sem viagem real. | **PASSA DEMO DE COMPORTAMENTO**. Não é prova Android físico nem de rede instável em campo. |
| Expedição externa e viagem de motoboy interno não são o mesmo objeto | `/ifood-handoff/` distinto de `/console/` e `/rider-mobile/`; filtro de origem autoritativa no servidor piloto para CreateTrip/AddDelivery; iFood handoff separado. | **FRONTEIRA PROTEGIDA POR TESTES SINTÉTICOS**, demanda piloto real com origem Neemo/Teknisa conferida. **Nenhuma API iFood LIVE é pré-requisito** para o piloto de motoboys próprios. |
| Pedido / impressão ≠ viagem ≠ entrega ≠ retorno | Contratos `docs/deliveryos/Fluxos_Estados_Entregas_V0_1.md` F1–F20 e testes de domínio/aceite; reimpressão não duplica delivery; confirmação e fechamento real são diferentes de saída/GPS. | **PRESERVADO NO DOMÍNIO**, conexão ponta a ponta com fonte/autorização reais NÃO provada. |
| Operação aprende do trabalho sem exigir burocracia | Leitor Teknisa/Comandas e pedido Neemo são fontes externas; formulário de motoboy é observação auxiliar, sem `trip_id` ou `order_ref`. Mobile requer confirmação explícita de eventos físicos, o que é **fronteira operacional consciente**, não formulário para alimentar a inteligência de cozinha. | **ALINHAMENTO CONDICIONAL**: preservar eventos automáticos quando há fonte; gestos do rider apenas para marcos indispensáveis, nunca coleta artificial de indicadores. |
| Entregas fornece fatos; Copiloto interpreta sem agir | `src/entregas/integration/durable-event-feed.ts`; `src/platform/copiloto/causal-identity-bridge.ts`; `src/product/viewmodels/copiloto-entregas-leitura.ts`; `tests/product/run-copiloto-entregas-http-browser.ts`. | **CONTRATO E PONTE READ-ONLY TESTADOS**; sem prova de que os fatos reais já atravessam a experiência V3.3 completa no turno TATÁ. |
| 6 células e praças: verdade antes de cor/pressão | `src/product/viewmodels/copiloto-celulas-v33.ts` mapeia Caixa, Sushi, Quentes, Cozinha, Conferência, Entregas como **cobertura**; ausência permanece não conectada. | **CORRETO COMO COBERTURA**, não confundir seis células com integração real das oito praças, carga real nem decisão de fluxo. |
| Mobile, offline, privacidade, acessibilidade | `src/entregas/offline/`, `src/entregas/gps/`, `src/entregas/pilot/` e tests; UI demo declara conexão e guarda; sem ranking punitivo. | **PROVAS AUTOMATIZADAS**, faltam dispositivo Android real, ciclo offline/replay em ambiente autorizado, leitura de tela humana e política operacional validada. |

### Atenção: superfícies distintas
1. **Home / organismo** = experiência central do DeliveryOS/Copiloto.
2. **`#/copiloto`** = inspetor de propostas Shadow, não substituto da Home.
3. **`#/entregas`** = leitura de realidade no Product System; é read-only e pode cair em DEMO declarada.
4. **`/console/`, `/rider-mobile/`, `/ifood-handoff/`** = jornada interativa legada do Entregas em servidor de demonstração; NÃO equivale ao servidor piloto persistente.
5. **Piloto persistente** = outra fronteira de autorização, origem, sessão, banco/outbox/dispositivo; nunca inferir LIVE do fato de a demo funcionar.

## 4. Provas executadas/verificadas

**GitHub no HEAD `e7262ced`**
- [Product UX #38407477846](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38407477846): job **SUCCESS**; TypeScript/build, HTTP+Chromium, Entregas navegador **18/18**, Product System **52**, `axe-core 4.10.2` **12 auditorias, zero violações automatizadas**, Visual Order, Figma Parity, skills, R5A–D3, governança sem nova falha. Correção R5-D2 **38 testes verdes**: comentário que negava captura não é tratado como implementação de coletor; guard continua com controles positivos sobre chamadas de código.
- [Q026 promotion #38407485481](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38407485481): **5/5 SUCCESS**, inclui PG16, semântica, Chromium e Android **JVM**.
- [PG borrowed survival #38407485738](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38407485738): **1/1 SUCCESS** em cenário isolado.

**Foxxy, árvore isolada anterior `d9214332`, sem DB operacional:** captura HTTP/Chromium de Home, Copiloto e Entregas 1440/375 sem erros JS, sem overflow horizontal; execução dos três caminhos de demonstração 1440/390 e rider com Trip SINTÉTICA no viewport 390. Gate visual-order 6, Figma-parity 24, M1 precondition 3, UI Entregas 23, domínio/aceite 45 casos passaram. `M1 bridge` passou a primeira seção (37) e **falhou na guarda C6** por deriva histórica protegida (`Q-019`); **não confundir** com o gate isolado Visual Order verde. Capturas desta rodada são locais efêmeras; o workflow guarda artefatos temporários com retenção de 14 dias.

**Integridade material:** hash original do ZIP verificado; arquivo não modificado, nenhum componente aprovado apagado. `Q-014` sobre contraste **foi respondida e autorizada em 29/08**; `--org-verde-texto-5` na árvore atual já usa `#68866c`, então as sete reprovações antigas não são blocker conhecido. Novo contraste automático tem zero violações no escopo inspecionado; **não** substitui NVDA/VoiceOver e inspeção física.

## 5. Bloqueios reais de qualidade — distintos de teste verde
1. **P0 — preservação/autoridade visual:** não converter a rota Shadow do Copiloto em experiência principal, nem substituir o mobile de Entregas por listas/KPIs genéricos. Antes de promoção, comparação visual no mesmo modo/viewport com cânone V2, V3.3 e package de Entregas confirmado, com veredito de César.
2. **P0 — `Q-019` aberto:** `docs/execution/PERGUNTAS.jsonl` mantém Q-019 `open` (C6/M1 paths). Product UX usou classificador `SEM_FAIL_NOVO` para não adicionar regressão; verde não equivale a autorização retroativa de todos os caminhos protegidos. Não reescrever baseline ou desabilitar gate para encobrir.
3. **P0 — ambiente real:** nenhum preview legítimo + Android físico + Neemo/Teknisa confirmados no mesmo fluxo, offline/retorno event, modo e origem, Copiloto lendo o mesmo fato. Sem LIVE iFood como requisito. Não há prova FIELD_PROVEN.
4. **P1 — Figma vivo/aceitação visual:** arquivo Full `dGyF0eRDd4YG8uqyWqU1P4` e nós estão registrados em `docs/figma/*`, mas a conta Figma do titular retornou falta de acesso de edição para screenshot via MCP nesta rodada. Não tratar snapshot do runtime de 04/10 como aceite da interface atual; confronto visual humano ainda necessário.
5. **P1 — UX e acessibilidade de campo:** legibilidade e ação primária em 320/375/390, foco no teclado, ausência de movimento, prevenção de toque destrutivo, Android fisico, leitor de tela, falha de rede, recuperação, recusa de comando sem origem.
6. **P1 — semântica e cobertura operacional:** correlacionar `order_key/NRCOMANDAEXT` e Neemo com evidência de origem **sem inventar ID nativo Neemo**; leitura dos formulários IDA/VOLTA sem `trip_id` não comprova entrega ou atraso individual. Não preencher lacuna de dados com cor verde/número zero.

## 6. Decisão e rota preservacionista
**Veredito:** MATERIAL FUNDADOR **ENCONTRADO E INTACTO** no ZIP canônico e nos contratos; execução de interfaces e testes sintéticos **PARCIALMENTE CONFORME**; unidade visual final, operação e piloto **NÃO HOMOLOGADOS**. Seria incorreto chamar DeliveryOS de 10/10 ou liberado.

**Próximos passos de maior valor, sem redesign e sem gasto:**
1. Conservar este parecer como referência de auditoria **não canônica**; usar os testes de regressão existentes, sem criar sistema paralelo.
2. Preparar uma folha de aceitação visual comparando **Home Calmo/Ambiente/Foco** e **Entregas console/rider estados preparação/em rota/offline/exceção/retorno** contra as referências autorizadas. Não comparar a inspeção Shadow com a Home como se fossem a mesma tela.
3. Tratar Q-019 pela trilha de decisão humana estreita e rever Figma somente com acesso legítimo/sem gasto.
4. Só então piloto Android **primeiro sintético**, sem GPS; posteriormente um pedido Neemo próprio conferido na Teknisa + consentimento + motoboy supervisionado, prova de viagem/retorno/offline e leitura por Copiloto. Manter iFood marketplace em handoff separado. Não ativar produção, login externo ou telemetria como efeito colateral.

**Fronteira:** `CODE_READY/CI_PASS` não significa `FIELD_PROVEN`, `DEPLOYED` ou `HUMAN_ACCEPTED`. Nenhuma alteração em fonte da loja, impressões, pedidos, GPS, contas, ferramentas pagas ou produção foi executada por esta auditoria.
