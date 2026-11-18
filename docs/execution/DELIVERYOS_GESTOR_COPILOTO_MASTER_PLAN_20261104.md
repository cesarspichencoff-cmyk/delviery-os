# Delivery OS Itaim — plano mestre Gestor → motor existente → Copiloto
**Data de consolidação:** 04/11/2026 · **Responsável pela decisão de produto:** César · **Escopo:** Itaim exclusivamente · **Situação:** execução técnica em PR #137 DRAFT/HOLD; não implantado.
**Natureza:** plano único de execução, não nova arquitetura, não outro motor, não mudança da Home aprovada e não autorização de efeitos em produção.

## 0. A pergunta que decide tudo

**O Delivery OS consegue mostrar o que realmente ocorre no Itaim, detectar o risco com antecedência e indicar uma ação útil sem atrapalhar o caixa?**

Objetivo explícito reafirmado por César: Gestor/iFood como a fonte de maior velocidade para pedidos, itens, quantidade, complementos/observações, status, prazos e logística **quando comprovadamente visíveis**; o motor original cruza fatos e mantém o estado operacional; Copiloto/Home exibe consciência da operação e uma recomendação prioritária; o TATÁ Comandas entra como segunda testemunha, enriquecimento e detector de divergência. Sem API oficial como dependência; sem despesas novas. O projeto Comandas e sua PR #135 **não são implementados aqui**.

A pesquisa de 9 páginas fornecida por César (*Delivery OS alimentado pelo Gestor: arquitetura de captura em tempo real sem depender da API oficial*) foi confrontada com código e prova real em:
- `docs/execution/DELIVERYOS_GESTOR_SENSOR_ARCHITECTURE_ADVERSARIAL_20261104.md`;
- `docs/execution/DELIVERYOS_GESTOR_V3_STAGE_TEST_GATE_20261104.md`;
- `docs/product/DELIVERYOS_PRODUCT_CONSTITUTION.md`;
- `docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md`;
- `docs/Modelo_Operacional_Consciencia_DeliveryOS.md`;
- `docs/Mapa_Sinais_Operacionais.md`;
- `docs/execution/DELIVERYOS_V1_LAUNCH_ACCEPTANCE_20261103.md`.

A Constituição prevalece sobre esta nota em decisões de produto: Home `/` é o Copiloto operacional; `/copiloto` é diagnóstico Shadow; Entregas não é a Home. A Operação Viva é a **única autoridade** de Calmo, Ambiente, Foco e Resolução. Um Foco por vez, demais riscos continuam visíveis, nenhum ambiente crítico desaparece. Funcionalidade de V4 pode ser considerada sob revisão, mas o **visual V4 foi rejeitado** e não deve ser promovido.

## 1. O que já existe — NÃO refazer

| Capacidade | Implementação/documento canônico | Prova / fronteira |
|---|---|---|
| Visualizador Gestor V2 estrutural, perfis Edge dedicados, receptor local | CAIXA_MOOCA `%LOCALAPPDATA%\TataGestorObservationLab\GestorWebReadOnlyV2` | Estrutura `expedition` em 03/11 10:40 BRT; **merchant/itens/status não comprovados**; tarefas antigas desativadas |
| Gestor V3 passivo: cartões, detalhe já aberto, MutationObserver, dedupe, stale | `runtime/reporting/gestor_v3_visible_sensor.js` | **25/25 Edge fictício**, job Windows CI success; arquivo copiado em **STAGING ONLY** no caixa; não conectado ou ativado |
| Guardas Gestor antigos | `runtime/reporting/gestor_visible_detail_probe_v1.js`, `gestor_window_selector_v1.cjs`, `gestor_shadow_status_bridge_v1.cjs` | 22+20+13 asserts sintéticos, CI; **sem captura real** |
| Contratos de ingestão, procedência, idempotência, outbox/journal | `src/platform/ingest/`, `src/product/eventos/`, `src/entregas/integration/` | Código/testes preexistentes; **reusar**, não criar segundo barramento |
| Operação Viva e arbitragem de atenção | `src/perfil-delivery/motor.js`, `src/perfil-delivery/decisao.js`, `src/platform/copiloto/causal-attention-orchestrator.ts` | Lógica já existe; nunca gerar foco numa camada paralela |
| Home e ambientes V3.3 | `src/product/viewmodels/home-vm.ts`, `copiloto-celulas-v33.ts`, `src/product/ui/surfaces/home.js` | UI/fixtures existem, não homologadas com feed real |
| Catálogo S1–S22 | `docs/Mapa_Sinais_Operacionais.md`, `src/product/viewmodels/sinais.ts` | 22 no patrimônio de produto; 11 descritos como implementados sob classificações da época, outros dependentes de prova de fontes; revisão sinal por sinal obrigatória |
| Entregas, GPS consentido, offline | `src/entregas/`, `android/app/`, `copiloto-entregas-leitura.ts` | Testes isolados; não comprova jornada real Xiaomi/iPhone |
| TATÁ Comandas | Produtor na frente independente PR #135, contratos de consumo existentes | Não reimplementar, não inventar pronto físico, só usar evidência qualificada |

A matriz V1 L1–L8 registra **0/8 gates integralmente provados em campo**, o que **não** significa 0/8 módulos desenvolvidos.

## 2. Arquitetura final — usar os ativos existentes

```text
Gestor autenticado / Itaim (visibilidade autorizada)
  ├─ Eventos já emitidos à sessão (HTTP/XHR/WS/SSE/SW), SE acessíveis legitimamente
  ├─ DOM/acessibilidade (validador + fallback de fatos já mostrados)
  └─ Detalhes abertos em sessão isolada, somente após prova de efeitos
                  ↓
     ADAPTADOR GESTOR FAIL-CLOSED
   escopo/merchant/ordem/revisão/frescor/cobertura/privacidade
                  ↓
     JOURNAL + CONTRATOS EXISTENTES
       dedupe, replay, idempotência, ordens fora de sequência
                  ↓
       OPERAÇÃO VIVA (ÚNICA)
    catálogo item→praça; carga; prazos; risco;
      Calmo · Ambiente · Foco · Resolução
                  ↓
      HOME / COPILOTO V3.3
  Agora · Atenção · Próxima ação · fontes / limites
                  ↕
 Entregas: fatos/recibos próprios, não substituir Home
                  ↑
 TATÁ Comandas: CHECK/enriquecimento/divergência,
  vínculo forte quando necessário para Conferência e Delivery
```

**Diretriz fundamental:** o Copiloto consulta o estado materializado do motor, **não** faz scraping ou consulta navegador a cada render. Um evento pode antecipar atualização; uma reconciliação *planejada* a cada 60 s tenta reparar perdas. Temporizador não é comprovação de cobertura: sem denominador total/paginação e detalhes, status `PARTIAL/UNKNOWN`, nunca “todos os pedidos”.

## 3. Fatos vs inferências — contrato de confiança

A entrada só admite campos realmente visíveis e vinculáveis ao pedido correto: identidade + unidade/procedência; marca temporal e revisão; status de cabeçalho e significado de fornecedor; item, quantidade, modificadores e observações quando presentes; previsão de preparo, tags de logística, pendências, cancelamentos, volume/sacolas **se expressos**. Rejeitar dados ocultos, truncados, sem contexto de loja ou capturados em sessão expirada. Credenciais/tokens/cookies/telefone/endereço/chat não entram em journal, logs ou GitHub.

**Nunca converter automaticamente:**
- `pedido aceito/em preparo` → item fisicamente em preparo na praça;
- `cabeçalho pronto` → todos os itens prontos, conferidos ou lacrados;
- `pedido em expedição` → saiu fisicamente/foi entregue;
- pedido com muitos itens → “duas sacolas” sem motivo verificável;
- 20 cards renderizados → 20 pedidos totais;
- quatro dígitos da UI → UUID iFood ou vínculo forte com comanda Teknisa;
- ausência de captura → volume zero, normalidade, praça verde;
- taxa calculada a partir de fixture → ETA real.

Separar três agregados diferentes e explicitar a unidade no Copiloto:
1. **Itens demandados em pedidos ativos observados**: soma de quantidades por produto, com revisão e cobertura visível.
2. **Trabalhos abertos por praça**: `carga_por_praca` canônica atual (pedido × grupo; NÃO são unidades de produto). Evitar dupla contagem entre Sushi e subárea Sushi Quentes.
3. **Itens comprovadamente em preparo/prontos por praça**: somente com evidência de praça/ato físico; até lá UNKNOWN, não renomear o agregado (1) como (3).

A inferência de risco precisa apresentar regra, baseline medido, frescor, alcance e confiança; não afirmar atraso futuro como fato. Atraso efetivo requer meta/horário real verificado. Para o **S14 — duas sacolas**, só produzir quando motivo válido comprovado; composição quente/frio e bebida/kit devem respeitar embalagem e atendimento. **S20 — alergias/observações** e **S21 — bebidas/sobremesas/kits** são gates de proteção do conteúdo.

## 4. Estratégia de captura sem API oficial — decisão por gates, não por preferência de ferramenta

**Sensor preferencial:** perfil isolado Edge já criado e autenticado por meios normais, nunca sessão clandestina/copied cookie. Descobrir, com observação autorizada **sem registrar payload bruto**, quais fatos já chegam estruturados por HTTP/XHR/WebSocket/SSE/Service Worker. Pode ser possível consumir passivamente dados que o Gestor já apresenta; isso só é hipótese até prova da sessão Itaim.

**Validador:** o V3 DOM + acessibilidade para conferir status e detalhe já aberto; se o Gestor renderiza algo que a rede não entrega de modo acessível, usar o validador como fonte visível parcial. O V2 estrutural permanece diagnóstico. UI Automation original é fallback restrito e só para uma janela inequivocamente qualificada.

**Proibido repetir a rota de falha:** reativar 6 tarefas Edge/UIA, iniciar relançamento watchdog no perfil operador, criar segunda janela no mesmo perfil e mudar `MainWindowHandle`, habilitar debugging no perfil real, tocar POS/SQL/Reader, extrair cookies, interceptar credenciais, consultar endpoints internos diretamente ou automatizar aceite/pronto/cancelamento/impressão.

**Alternativas contingentes:** se rede da sessão isolada não expuser detalhes, validar DOM com o operador em um pedido já aberto; depois testar navegação **somente em perfil isolado** com prova explícita de ausência de efeitos, antes de permitir leitura incremental de todos. Sem sessão autenticada ou autorização legítima: STOP seguro e manter a fonte visível como diagnóstica, sem prometer 60 s/100%.

## 5. Plano mínimo de execução — entregue por valor, não por número de arquivos

| Ordem | Entrega observável | Critério para avançar | Situação |
|---|---|---|---|
| **P0 — Acesso silencioso** | Sessão isolada do Gestor Itaim qualificada; zero janela/foco/áudio no caixa | Origem/loja comprovadas, sessão regular, kill switch e rollback observáveis; nenhum clique operacional | **HOLD mundo real** |
| **P1 — Um pedido de verdade** | 1 pedido autorizado com itens, qtd, complementos/notas, estado e horário comparados visualmente | Todos os campos pertinentes batem; detalhe inequívoco; nenhum dado pessoal exportado | **HOLD mundo real** |
| **P2 — Sensor incremental robusto** | 1→5→lote representativo; novo/alterado/cancelado; HTTP/WS/DOM conforme permitido; lista/paginação reconhecidas | Zero perdas na amostra cotejada; dedupe, revisão fora de ordem, reconexão e drift UI testados; coverage explicitada | **Não implementado para Gestor real** |
| **P3 — Gêmeo operacional** | Gestor→contratos/journal existentes→leitura de pedidos ativos; quebra de fonte fica stale | Última revisão única, item editado retifica contagem, cancelamento elimina carga fantasma; replay idempotente | **Integração Gestor ainda HOLD** |
| **P4 — Inteligência por praça** | Ranking All Day por SKU/quantidade; células Sushi, Sushi Quentes, Cozinha, Caixa e Conferência; carga/risco por prazo | Produto→praça com mapa aprovado, exceção UNKNOWN, sem duplicar Sushi Quentes, sem equiparar item ativo a preparo físico | **Motor/células existentes; feed real pendente** |
| **P5 — Copiloto vivo** | Home V3.3 alimentada, modos Calmo/Ambiente/Foco, uma orientação principal com causa, impacto, ação humana e evidência | Tela iPhone atualiza sem troca de janela, riscos secundários e fontes faltantes visíveis, não executa ações no Gestor | **Home existe; integração real não provada** |
| **P6 — 60 s confiáveis** | Eventos chegam rápido e reconciliação detecta falhas; última leitura/data clara | Comparar fonte e Home em movimento real, medir lag e cobertura completos; sem prova, sinalizar stale/partial. Zero popups no caixa | **SLA ainda não medido** |
| **P7 — Check Comandas + expedição** | Revisões nativas conferem itens/notas/estado quando correlacionadas; Entregas adiciona entrega e GPS consentido | Divergência explícita não permite conferência automática; estado físico tem recibo; teste Xiaomi/iPhone autorizado | **Fronteiras existentes, campo HOLD** |
| **P8 — Aceite de uso real** | Uma jornada Itaim completa com exceções; rollback e proteção de operador | L1–L8 evidenciados em campo, zero efeitos não autorizados, César aceita o uso; só então discutir deploy/merge | **HOLD** |

**Limite temporal desejado:** reconciliação em ciclos de 60 s e atualização por evento quando possível. Medir `source_event_lag`, `observer_capture_lag`, `journal_lag`, `home_lag`, `time_since_last_proven_source`, `observed_card_coverage` e `detail_completeness`. Se fonte indisponível, exibir a idade; não fingir continuidade. Repassar o estado ao mesmo motor, nunca criar alerta paralelo.

**Primeiro caminho crítico:** P0→P1. Quanto antes um pedido real for qualificado na sessão isolada, mais rapidamente saberemos se a fonte de rede realmente entrega os detalhes e se existe modo de monitorar sem abrir os pedidos um a um. Não multiplicar fixtures, UI ou serviços antes dessa descoberta. Na impossibilidade de operar P0/P1, ampliar apenas testes puros de *fonte→motor→Home* para não confundir atividade com progresso.

## 6. Como o Copiloto deve ser experimentado (sem criar outro dashboard)

**Agora (pulso):** “X pedidos ativos observados” e “Y itens demandados por SKU”, indicando que o total pode ser parcial se a cobertura não estiver atestada. **Ambiente (clima):** no máximo duas tendências para acompanhar, por exemplo “Sushi Quentes pressionado” e “Saídas demorando”. **Foco:** uma orientação, com justificativa, impacto evitável, procedência e ação humana — por exemplo (FICTÍCIO) “Pedido #1234 tem 4 min até o prazo informado; dois itens ainda na demanda de Sushi Quentes; verificar a produção antes da conferência”. Nunca declarar que ambos estão fisicamente em preparo sem evidência.

**O diferencial desejado:** o motor explica *por que agora*, não apresenta alertas genéricos. Prioriza antecipadamente o cruzamento entre item acumulado, praça, promessa, logística e risco de conferência. O gestor da operação vê a **próxima ação que altera o desfecho**, sem perder outros problemas relevantes.

**Modo Calmo é ativo**, não página vazia. Foco tem debounce/cooldown e não interrompe por qualquer oscilação. Não criar pontuação arbitrária de 132% ou ETA sem baseline e calibração. Não reintroduzir aparência V4 rejeitada nem gráficos gerenciais no Mapa de Ambientes.

## 7. Falhas fora da curva e testes adversariais obrigatórios

1. Gestor exige login/2FA ou mostra outra loja; sessão expira sem evento.
2. Pedido aparece em Quadros e Expedição com campos/contagens diferentes.
3. UI exibe apenas parte dos pedidos por virtualização, scroll, filtro ou paginação; cards reaproveitam nós.
4. Pedido é editado após primeira captura; quantidade e observação crítica mudam; cancelamento chega tarde; dois status chegam fora de ordem.
5. Mesmo número curto em dias ou unidades diferentes: nunca misturar ou deduplicar incorretamente.
6. Status de cabeçalho não equivale a preparo físico; bandejas/quentes/cozinha em praças distintas; pronto e conferido sem recibo.
7. Duas sacolas não exibidas; combo com modificadores; bebida, hot roll, molho, alergia ou observação longa truncada.
8. Service Worker altera observabilidade de rede; reconexão perde evento ou duplica pedido.
9. Edge original e segunda janela competem pela seleção, causando HOLD; jamais reiniciar Edge para se recuperar.
10. Estouro de CPU/memória, janela/console/alerta visual, áudio, intervenção no foco do operador.
11. Erro de relógio, atraso de cache, replay e dados aparentemente “ao vivo” com timestamp antigo.
12. Divergência Gestor×Comandas; iFood 4 dígitos não vincula comanda automaticamente.
13. Um setor crítico perde medição e fica verde: regressão proibida.
14. Conectividade iPhone/Xiaomi offline, recibos de ações do Entregas e reenvio sem duplicação.
15. Dados de clientes presentes em HTML/HTTP que não podem ser publicados em logs ou exportados ao sensor.

## 8. Prova e governança

- Atributos de cada fato aceito: `source`, `scope`, `observed_at`, `source_time` se atestado, `order_key_strength`, `revision`, `payload_digest`, `complete`, `coverage`, `freshness`, `raw/redacted`, `source_contract_version`, `confidence` (evidence-backed).
- Eventos append-only, projeção atual materializada; idempotência por chave/revisão, tombstone para cancelamento, conflito em quarentena e reprodução determinística; **reusar o journal existente**.
- Definições dos 22 sinais não se alteram por oportunidade de captura. Revisar quais passam a ter fatos, quais continuam UNKNOWN e quais exigem check físico ou SAC; S20/S21 exigem integridade de texto.
- **Nenhuma ação automática no Gestor** nesta fase, nem prometer auto-pausa de cardápio.
- Code ready / CI pass / staging no caixa **não equivalem** a `LIVE_SOURCE_PROVEN`, `FIELD_PASS`, `DEPLOYED` ou `HUMAN_ACCEPTED`.
- Gate de permissão separado antes de instalar extensão/worker, usar login real, navegar por pedidos, alterar execução em produção, mexer em serviços/tarefas, deploy, merge ou gastar dinheiro.

## 9. Referências internacionais e limites

- iFood (atualizado 05/05/2026), [Nova jornada de pedidos no Gestor](https://blog-parceiros.ifood.com.br/painel-de-expedicao-gestor-de-pedidos/): modos Expedição/Quadros, tags de tempo/logística/pendências e agrupamento de pedidos — potencial de leitura visual, não prova de layout específico na conta Itaim.
- Toast, [All Day View / contagem por item](https://doc.toasttab.com/doc/platformguide/adminGlossary.html): total de unidades de um item demandadas através de vários pedidos — modelo operacional para ranking, **não** mesmo que "em preparo comprovado".
- Toast, [estações de preparo e expedidor](https://doc.toasttab.com/doc/platformguide/adminAssignPrepStationKDS.html): itens nas estações e visão de expedição separadas.
- Playwright, [Network](https://playwright.dev/docs/network) e [Service Workers](https://playwright.dev/docs/service-workers): HTTP/WS/eventos e limitações de observabilidade em aplicativos modernos; só candidato em sessão legítima.
- Chrome, [remote debugging security](https://developer.chrome.com/blog/remote-debugging-port?hl=pt-br): isolamento de perfil por segurança; não forçar depuração do navegador operacional.
- PDF fornecido por César, pp. 1–9: modelo do gêmeo operacional, prioridade de captura por evento, reconciliação 60 s, ranking, causação, fontes, exceções e implantação em etapas. O texto é **proposta de arquitetura**, não prova de acesso vivo.

## 10. Próxima execução sem ambiguidades

**Um próximo passo técnico de maior valor:** prova sanitizada, somente leitura, de uma sessão isolada regularmente autenticada e de UM detalhe de pedido atual Itaim (com referência, item, quantidade, status e tempo), sem causar efeito no caixa. Sem isso, não afirmar que V3 leu “todos os pedidos” ou que a atualização em 60 s funciona. O trabalho de código remanescente deve apoiar diretamente o passo seguinte, não desviar para telas, novos motores ou testes cosméticos.

**Status consolidado 04/11:** CANONICAL_PLAN=RECORDED · Gestor V3 Edge 27/27 no commit 59ddf3c + Windows CI success (sintético) · STAGING_ONLY_ON_CAIXA_MOOCA · GESTOR_REAL_MERCHANT=UNKNOWN · COMPLETE_CURRENT_ORDERS=UNKNOWN · END_TO_END_COPILOTO=UNKNOWN · 60S_FIELD_SLA=NOT_PROVEN · PR #137 DRAFT/HOLD.

## 11. Roteiro executivo de entrega — 04/11, após auditoria do V3

Este é o **plano único de execução do Delivery OS Itaim**. As etapas P0–P8 da seção 5 continuam vinculantes; a tabela detalha entregas, critérios e dependências. Não criar plano paralelo. O desenvolvimento do TATÁ Comandas/PR #135 fica inteiramente fora deste escopo.

| Etapa | Objetivo e resultado visível | Prova obrigatória de saída | Estado |
|---|---|---|---|
| **A — Um pedido real (P0–P1)** | Identificar o Gestor autenticado do **Itaim** e obter uma revisão completa de **um pedido** em leitura silenciosa | Unidade verificada por prova independente, referência, estado, hora, itens, quantidade e modificadores/observações conferidos contra a interface, sem dado pessoal exportado; sem clique operacional, janela, áudio ou foco roubado | **BLOQUEIO CRÍTICO — HOLD**; V2 estrutural e V3 staging já existem |
| **B — Cobertura e semântica (P2)** | Saber o que Quadros/Expedição entregam na lista e no detalhe; escolher a melhor observação | Matriz campo×modo×origem×identidade×frescor×privacidade; verificar filtros, agrupamentos, virtualização, paginação, WebSocket/HTTP/Service Worker apenas em sessão isolada legitimamente acessível | **Depende de A** |
| **C — Captura diferencial (P2–P3)** | Ler apenas novos/alterados e reconciliar perdidos; projetar uma revisão única no journal **existente** | Amostra 1→5→lote representativo: criação, edição, cancelamento, reconexão, duplicata, fora de ordem e quebra de origem; comparar com fonte, provar cobertura e dedupe; ausência/stale/partial nunca vira zero | **Pendente de fonte real** |
| **D — Produção por praça (P4)** | Ranking All Day por produto/modificador; carga por praça e dependências entre pedidos | Classificador/catálogo já aprovados; quantidade/revisão sem dupla contagem; Sushi Quentes distinto de Quentes da Cozinha; estados separados entre demanda, encaminhamento e preparo físico comprovado; S20/S21 sem truncamento | **Motor existe; alimentação real pendente** |
| **E — Copiloto que antecipa (P5–P6)** | Home V3.3 com pulso, ambientes, um único Foco e próxima ação de alto valor | Uma recomendação explicável com causa/impacto/evidência/frescor; outros riscos visíveis; Calmo não surge de origem ausente; não inventar ETA/saturação/confiança; medir lag fim a fim e falsas recomendações | **Home existe; integração real pendente** |
| **F — Conferência e Entregas (P7)** | Conectar prontos/conferidos/lacrados, motoboy e viagem ao pedido certo | Identidade forte na junção, recibo de ato físico, ACK durável de Entregas no Xiaomi, offline sem duplicar, GPS consentido; nenhuma sacola inferida como fato. Apenas CONSUMIR confirmação Comandas quando existente | **HOLD de campo** |
| **G — Piloto Itaim (P8)** | Um almoço e um jantar inteiros com Copiloto útil, silencioso e reversível | L1–L8 aceitos, zero popup CMD/PowerShell/áudio/foco, privacidade, rollback, cobertura e latências medidas, alertas falsos e perdidos registrados, aceite de César | **HOLD para implantação** |

### Regras de execução

1. O caminho crítico é **A → B → C → D → E → F → G**. O trabalho próprio de Entregas pode avançar em paralelo, mas não torna A concluída. Não expandir laboratório fictício sem defeito ou hipótese concreta.
2. O ensaio indicado para 05/11 é **condicionado**, não tarefa automática: sessão isolada do Itaim autenticada por meios normais, um detalhe **já aberto** e supervisor/condição operacional apropriados. Se a sessão não existir, manter HOLD; nunca abrir outra janela do perfil de operação nem relançar o Edge.
3. Eventos e interface devem permanecer desacoplados: a Home consulta **o estado projetado da Operação Viva**, nunca faz scraping no render. Reusar o journal/outbox e a Camada de Decisão existentes.
4. **Reconciliação a cada 60 s não é SLA de 60 s.** Medir evento na origem (quando timestamp comprovado), captura, journal, projeção, Home, coverage de lista e completude de detalhes; sem fonte de tempo, marcar UNKNOWN. Durante falha de rede/login/dados, mostrar fonte defasada e não pintar verde.
5. Fatos recebidos do iFood e dados derivados da Teknisa continuam externos mesmo se passarem por eventos TATÁ; anotar procedência por campo. Nunca equiparar status de cabeçalho a item pronto por praça ou pedido pronto a sacola conferida.
6. Instalador, extensão, host, serviço, tarefa, login, navegador, merge, deploy, impressão, GPS ou ação no Gestor exigem **gate específico de efeito/autorização**. Nenhum novo gasto sem decisão humana.

## 12. Potencialização da pesquisa: PLUS priorizados

| Recurso complementar | Ganho na rotina do Itaim | Dependência / decisão |
|---|---|---|
| **PLUS 1 — Radar All Day por SKU + modificador** | Somar hot rolls, combinados, bebidas, molhos e variantes; ajudar a trabalhar lotes sem misturar observações e alergias; mostrar pedidos que dependem de cada item | Toast KDS agrupa por item e opcionalmente por modificadores. **Fazer dentro do motor atual após C/D**, nunca dashboard novo |
| **PLUS 2 — Três naturezas de carga** | Separar quantidade demandada, quantidade liberada/enviada para a praça e quantidade com preparo ou prontidão física atestada | Toast diferencia pedidos/etapas held e fired. No TATÁ só exibir estados que as fontes comprovaram. **Contrato em D**, sem inferir pronto |
| **PLUS 3 — Previsão de fila de entregadores** | Cruzar tag logística/chegada estimada, agrupamento por motoboy, prazo do pedido e conferência para antecipar espera e atraso | O iFood documenta essas tags, mas o acesso real do Itaim está UNKNOWN. **Depois de B**, sem clicar em pronto nem alterar tempo automaticamente |
| **PLUS 4 — Conferência crítica** | Destacar risco de kit, bebida, sobremesa, quentes/frios, observação especial e lacre incorreto, com identidade certa | Reusar S14/S20/S21 e atos próprios com recibo. **Depois de D/F**, não prescrever “duas sacolas” por estimativa |
| **PLUS 5 — Foco anti-ruído** | A Home recomenda só ações úteis e mede falso positivo, falso negativo e tempo entre aviso e resolução | Reusar Calmo/Ambiente/Foco e feedback humano; Google SRE favorece alertas por sintomas acionáveis. **Calibrar em E/G**, sem novo árbitro |
| **PLUS 6 — Ponte silenciosa Edge → Windows** | Alternativa local para transportar eventos de extensão a um host nativo sem depender de um receptor HTTP próprio | Microsoft Edge oferece Native Messaging (manifesto, permissão, registro e host). **NÃO INSTALAR AGORA**: reusar V2/receptor até prova de necessidade; exige gate do navegador isolado, segurança/rollback |
| **PLUS 7 — Replay de turnos e aprendizado verificável** | Comparar previsão versus resultado real no almoço e jantar; descobrir gargalos repetidos por produto/praça sem sobrecarregar equipe | Reusar journal e replay existentes, com registros mínimos sanitizados. **Ativar só em shadow após fatos C** |

### Transferência explícita do estudo internacional

- **iFood — Expedição/Quadros, tempo de preparo, logística, pendências e pedidos agrupados:** fonte de possíveis campos para a matriz da etapa B, **não** prova de visibilidade na conta Itaim. Referência atualizada em 05/05/2026: https://blog-parceiros.ifood.com.br/painel-de-expedicao-gestor-de-pedidos/
- **Toast — All Day e modificadores:** somar linhas por produto e manter subgrupos por opção quando importarem para preparação, nunca achatar alergias. Referência: https://doc.toasttab.com/doc/platformguide/adminReportingTotalsKDS.html
- **Toast — held/fired:** diferenciar demanda potencial de itens efetivamente liberados ao preparo; origem pode não disponibilizar esse estado. Referência: https://doc.toasttab.com/doc/platformguide/adminKitchenDiningRoomReference.html
- **Playwright — HTTP, WebSocket e Service Worker:** observar a rede é hipótese de maior completude, mas o mecanismo pode ocultar eventos; a escolha vem da prova B, não do PDF. Referências: https://playwright.dev/docs/network e https://playwright.dev/docs/service-workers
- **Edge Native Messaging:** ponte técnica possível, não infraestrutura instalada: https://learn.microsoft.com/pt-br/microsoft-edge/extensions/developer-guide/native-messaging
- **Google SRE:** alertar problemas acionáveis e de impacto, não gerar barulho de telemetria: https://sre.google/resources/practices-and-processes/incident-management-guide/

### Exemplos estritamente fictícios

- “12 hot rolls demandados em pedidos **observados**, sendo 3 com modificadores diferentes”. Não dizer “12 em preparo”, nem “12 em todos os pedidos” sem cobertura.
- “Pedido #1234 próximo do prazo exibido, depende de dois itens de Sushi Quentes; verificar a praça antes da conferência”. Depende de tempos e vínculo completos, não é evento real.
- “Entregador associado ao grupo está com chegada prevista, mas conferência sem recibo”. Só com logística, identidade e prontidão verificadas; não colocar rótulo de atraso por suposição.

### Instalação recomendada agora

**Nenhuma instalação operacional.** O V2 estrutural, o V3 em staging, o Edge/Playwright de laboratório, o receptor existente, o journal, o motor e a Home são suficientes para descobrir se um pedido real é observável. Adicionar extensão, native host, serviço ou licença antes da prova A só criaria nova superfície de falha e custo de operação. O próximo investimento técnico deve ser o menor ensaio autorizado capaz de comprovar o primeiro pedido. A rota silenciosa e a proteção do caixa têm prioridade sobre gadgets.

## 13. Checkpoint desta atualização

- **PR #137 continua DRAFT/HOLD.** Sensor V3 corrigido para mutações só de atributos (commit 7775627); duas regressões adicionais no commit 59ddf3c; GitHub Actions #41798990871 **completed/success**, com **27/27 Edge sintético** e demais jobs aprovados. Esse resultado **não** usa iFood real.
- O V3 armazenado no CAIXA_MOOCA permanece **STAGING_ONLY**, **não foi atualizado nem ativado** nesta retomada. O V2 só tem prova de estrutura; Reader local continua em modo diagnóstico, sem prova de pedidos reais.
- Fatos de campo ainda desconhecidos: merchant autenticado Itaim, um detalhe completo, status físico por praça, cobertura de todos os pedidos, latência até 60 s, Entregas end-to-end, uso real no iPhone/Xiaomi.
- **Próximo resultado:** um pedido verdadeiro do Gestor Itaim, completo e comparado com a interface em sessão isolada, sem perturbar a equipe. Só então a escolha final entre leitura incremental por rede, DOM ou extensão deverá ser feita.
- **Não declarar entrega concluída** com laboratório, PR verde ou arquivo copiado. L1–L8, estabilidade no pico, rollback e aceite humano continuam critérios do lançamento.

## 14. Checkpoint operacional — almoço de 04/11 às 11h07 BRT

**Gatilho humano:** César confirmou "O delivery abriu". Isso autoriza verificar status sem efeitos; **não** autoriza alterar sessão do Gestor operacional, ativar extensão/V3, instalar serviço ou fazer cutover.

**Verificação remota SOMENTE LEITURA no dispositivo ONLINE validado CAIXA_MOOCA** (não Foxxy):

- **Automação Reader confirmada em janela LUNCH:** status local 2026-11-04T14:07:39.411Z, automático, READ_ONLY_LOCAL, NO_EVIDENCE, sourceMode=CONTROL_DIAGNOSTIC_NOT_REAL_PROOF, liveSourceVerified=false, operationalOrderTotal=null, filesRead=250, ignoredHistorical=250, projectedOrderCount=0. **A projeção zero NÃO prova zero pedidos.**
- **Causa estrutural identificada no código instalado:** `observer.cjs` lê somente a fonte de arquivos `C:\ProgramData\TataComandaReader` em modo `control` com `maxAgeMs=300000` e `maxFiles=250`. Não é captura direta do Gestor web e **não deve ser promovida** como observador de pedidos do iFood. Os 250 arquivos foram todos rejeitados como históricos pela regra temporal.
- **Gestor instalado está em execução:** processo `Gestor de Pedidos.exe` apareceu na lista de processos. Há múltiplos `msedge.exe`, **mas PID não prova conta Itaim, sessão autenticada, detalhe aberto ou cobertura de pedidos**.
- **V2 e monitores sem prova nova de loja/identidade:** `GestorWebReadOnlyV2/latest.structure.json` ainda observado em 03/11 13:40Z, apenas STRUCTURE_ONLY_UNVERIFIED; `GestorUiReadOnlyMonitor/status.json` antigo HOLD, merchantVerified=false, actualOrderIdVerified=false. **V3 continua STAGING_ONLY não instalado/ativado**.
- **Silêncio:** guard de áudio registrou 2026-11-04T14:09:08.999Z, observador silenciado e Edge do operador não tocado, zero ação em janela; isso confirma um registro local, não garante ausência futura de popups em todos os processos.

**Resultado:** Gate A **ABERTO MAS NÃO APROVADO**; a janela de almoço e a presença do Gestor foram observadas, sem pedido real e sem prova de merchant. **Não avançar para B/C/E nem afirmar que Copiloto agirá sozinho.**

**Próximo gate mínimo:** obter prova de que o **perfil Edge ISOLADO** do laboratório — e não o Gestor/Edge operacional — está legitimamente autenticado em conta Itaim e exibindo detalhe de pedido atual. Se não estiver, registrar razão concreta e coordenar autenticação normal supervisionada antes de qualquer prova. Sem instalar/ativar V3, iniciar terminal visível, clicar em pedido operacional, exportar cliente ou mexer em Comandas. Quando tal sessão estiver comprovada, realizar ensaio REVIEW_ONLY sanitizado para um pedido e comparar com tela.

**Estado de efeito deste checkpoint:** só leituras remotas e documentação da PR #137; sem mudanças no caixa, sessão, tarefas, processos, Edge, Gestor ou produção.

**Confirmação humana após abertura do delivery:** César respondeu que a janela separada do Edge para o Delivery OS **ainda não está conectada ao iFood**. A sessão isolada autenticada exigida pelo Gate A não deve ser presumida. Não executar `enter-login-once.cjs` (contém clique programático no fluxo de entrada) nem usar as instruções antigas do V2, que se referem ao Edge ORIGINAL, como substituto do laboratório isolado. Próximo passo é autenticação **normal, supervisionada e fora de momento crítico**, exclusivamente no perfil isolado, após validar o método sem perturbar o Gestor da equipe. Até lá: Gate A = HOLD, não ativar V3 e não anunciar Copiloto operacional.

## 15. Checkpoint humano — login normal do Gestor na janela isolada (04/11)

- César confirmou em conversa que o Edge separado foi aberto, o login normal do iFood foi concluído e a **unidade Itaim aparece na tela**. Evidência: **HUMAN_REPORTED**, não sessão técnica revalidada pelo sensor.
- Verificação passiva da máquina: CAIXA_MOOCA online; Edge, perfil `DedicatedEdgeProfile` e processo Gestor já existem. `DevToolsActivePort` do perfil tem mtime de 01/11 (stale, não prova attach do navegador atual); não assumir CDP conectado.
- O diagnóstico do perfil via `safe-dom-preflight.cjs` exigiria execução local, cujo invocador remoto não comprova supressão de console. Respeitando exigência **zero CMD/PowerShell visível**, não foi executado, não se iniciou script, janela, extensão, login automatizado nem V3. Nenhuma captura de credencial.
- **GATE A = PARTIAL/HOLD:** sessão Itaim validada visualmente por César; sem prova técnica independente de merchant, cartão de pedido real, detalhe, itens, cobertura ou transmissão ao motor.
- Próximo verificador de menor risco: identificar se a janela isolada **já mostra cartões de pedidos ativos do Itaim**, sem clicar em comandos. Só então planejar diagnóstico sanitizado por meio comprovadamente silencioso, no perfil isolado e com efeitos controlados. Não promover V3 ao motor ainda.

## 16. Checkpoint do agrupamento real — 04/11/2026

**Fato humano confirmado:** na sessão isolada, o Gestor do Itaim mostra cartões que podem representar vários pedidos; ao abrir um cartão, os pedidos aparecem individualizados, com seus números e itens. Observação humana não confirma automaticamente que os mesmos elementos estejam disponíveis no DOM, na rede ou via instrumentação.

**Defeito preventivo identificado:** o sensor V3 de revisão anterior exigia um único número de pedido por cartão. No layout descrito, interpretar cartão como pedido geraria contagem e associação incorretas. Não ativar esse modo sobre a operação.

**Adaptação em código da PR #137 (sem deploy):**
- Commit `69ac7f22`: modo opcional `GROUPED` no sensor V3 existente. Cartões são contabilizados como **grupos**; pedidos individualizados são lidos apenas dos blocos numerados dentro de um detalhe **já aberto**. A captura não realiza cliques, rolagem, navegação, escrita ou publicação. Status de cabeçalho, vínculo entre grupo e pedido, cobertura da loja e merchant ficam desconhecidos; `ordersPublishable=0`.
- Commit `2253c1c4`: mais oito testes sintéticos de agrupamento, incluindo associação de itens ao número correto, duplicidade, bloco oculto, ausência de detalhe, quantidade inválida, ausência de efeitos e ausência de falsas afirmações de cobertura. Total esperado da suíte V3: 35 cenários; **ainda dependente de resultado real da CI**.
- Workflow associado a `2253c1c4`: [Actions #41878958310](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41878958310), `queued` na última consulta. Não registrar PASS até obter logs e conclusão.

**GATE A permanece PARCIAL:** login e visualização do Itaim reportados por César, mas seletores reais, leitura técnica sanitizada de 1 pedido, qualidade da identificação, conectividade sem console e envio de fatos ao motor continuam não comprovados. Para capturar grupos fechados sem cliques, será necessário comprovar mecanismo legítimo e autorizado que permita acesso aos detalhes já recebidos; o V3 de revisão não descobre detalhes ocultos sozinho.

**Fronteira de efeitos:** somente commits à PR em rascunho e testes de laboratório. Nenhuma instalação, tarefa, serviço, extensão ou sessão do caixa alterada, sem acesso a cliente ou pedido real e sem mudança no Gestor operacional.

## 17. Corrigido: partição de itens por pedido no cartão agrupado

**Gatilho de campo (relato humano 04/11):** o Gestor do Itaim exibe cartões que podem agrupar múltiplos pedidos; ao abrir, cada pedido aparece individualizado com número e itens. Isso orienta `layout=GROUPED`, mas não substitui uma captura DOM/autenticidade confirmada pelo sensor.

**Falha adversarial reproduzida em laboratório:** um item renderizado fora de qualquer bloco numerado de pedido podia ser ignorado enquanto a revisão permanecia `REVIEW_ONLY`; blocos de pedido aninhados podiam causar ambiguidade de soma. Não contar cartão agrupado como pedido.

**Correção versionada na PR #137**:
- `e1113ab2ad784c67509ad138f98b9c6130bf97ff`: rejeitar `HOLD_ITEM_SCOPE_AMBIGUOUS` se uma linha visível/oculta do detalhe pertencer a zero ou múltiplos blocos numerados; rejeitar `HOLD_OVERLAPPING_ORDER_SCOPE` se um bloco de pedido contiver outro. Somente leitura, sem ativação do sensor em campo.
- `eac586047c59c4a0e2b97ded4f262b2cd80e2322`: dois casos de regressão sintéticos adicionados à suíte Edge; total agora 37.
- CI do commit `eac58604`: [GitHub Actions #41922440582](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41922440582) = **completed/success**. Log Edge `GESTOR_V3_VISIBLE_SENSOR_EDGE_FIXTURE_PASS 37/37`, inclusive os dois novos casos; Windows silencioso `SILENT_OBSERVER_WINDOWS_LAB_PASS 45/45 NO_VISIBLE_WINDOWS`; readiness offline `53/53`. Jobs de contratos e ligação de praça também passaram.
- Prova independente anterior Foxxy: 9/9 casos sintéticos sobre o sensor corrigido isoladamente. Não confundir a prova do Foxxy com acesso ao iFood real.

**Estado operacional:** `STAGED_CODE + TEST_PASS_SYNTHETIC`, **NÃO** `GESTOR_REAL_PROVEN` / `DEPLOYED` / `WORLD_PROVEN`. O Edge dedicado `TataGestorObservationLab/DedicatedEdgeProfile` foi autenticado visualmente por César e exibe grupos; nenhum seletor de DOM real, cobertura de grupos fechados, pedido completo extraído, identidade independente de merchant ou latência máxima foi homologado. O V3 **não foi ativado** nem alimentou a Home.

**Ocultação do Edge (pedido separado):** nenhum mecanismo de ocultação foi executado. Scripts V2 existentes referem-se a **outro perfil** e não devem ser reutilizados. Tentativas de criar acionador silencioso da janela correta foram bloqueadas por segurança; o único arquivo local preparatório do perfil correto foi neutralizado em modo HOLD. Não afirmar janela oculta; não executar PowerShell/CMD visível nem clicar no Gestor operacional. A alternativa manual de minimizar a janela dedicada não configura ocultação completa.

**Próximo gate A, sem custo novo:** identificar e validar, mediante ensaio supervisionado e isolado, os seletores/estrutura do DOM de um pedido já aberto na UI legítima e seus detalhes; nenhum clique ou abertura automática de cartões, nenhuma coleta de clientes. Comparar número+itens+quantidades+complementos com a tela antes de considerar captura real. Investigar cobertura dos cartões fechados sem assumir que dados não renderizados estejam disponíveis. Manter DRAFT/HOLD sem merge/deploy/cutover e sem alterar caixa.

## 18. Sensor agrupado — mudanças contínuas, ensaio de campo ainda HOLD (04/11)

- **Código/testes versionados** na PR #137: commit `cc453a144fba9a603d400ffff01b224178440a41`. Três regressões no Edge fictício para `watch()` em `layout=GROUPED`: alterar quantidade mantém vínculo por pedido e emite nova observação; fechar o detalhe remove imediatamente a evidência antiga; surgir item sem pedido definido produz `HOLD_ITEM_SCOPE_AMBIGUOUS` (nunca fato publicável).
- **CI comprovada:** [GitHub Actions #41924294652](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41924294652) finalizada `completed/success`, quatro jobs concluídos. Log de navegador `GESTOR_V3_VISIBLE_SENSOR_EDGE_FIXTURE_PASS 40/40 (SYNTHETIC_ONLY; NO_ORDERS_FROM_IFOOD)`, Windows `SILENT_OBSERVER_WINDOWS_LAB_PASS 45/45 NO_VISIBLE_WINDOWS`, diagnóstico offline `53/53`. Observação: o rótulo do job Edge no workflow ainda menciona 25 assertions, mas o log executou **40**; confiar no log e registrar dívida cosmética do nome.
- **Checagem passiva no CAIXA_MOOCA (19h17 BRT):** `C:\ProgramData\DeliveryOS-Itaim-Observer\status.json` registrou `schedule=DINNER`, `state=OBSERVED_RECORDS`, `filesRead=250`, `ignoredHistorical=244`, `projectedOrderCount=6`. **Isso representa seis registros projetados a partir de arquivos locais de controle, NÃO seis pedidos vivos do iFood**; `sourceMode=CONTROL_DIAGNOSTIC_NOT_REAL_PROOF`, `liveSourceVerified=false`, `operationalOrderTotal=null`.
- **Bloqueio técnico para Gate A real:** `DedicatedEdgeProfile/DevToolsActivePort` tem última **modificação** em 01/11/2026, anterior ao login humano relatado em 04/11; não é recibo de anexo CDP vigente. `GestorWebReadOnlyV2/latest.structure.json` continua com data de observação 03/11. As ferramentas de leitura de abas Browser/Opera não estão conectadas à sessão isolada; não há conteúdo real de pedido capturado por elas.
- **Regra de segurança:** não reabrir/reiniciar a sessão operacional, não confiar no DevToolsActivePort antigo, não instalar sensores em produção, não capturar segredos ou PII, não disparar CMD/PowerShell no caixa, não reativar as seis tarefas antigas. A ocultação da janela dedicada permanece pendente: não afirmar que o navegador está oculto; nenhuma mudança na janela foi executada nesta rodada.
- **Próximo comprovante material (Etapa A):** observação passiva do DOM **da janela dedicada já autenticada** e de um detalhe previamente aberto, em sessão supervisionada, com identidade Itaim verificada, correspondência número→itens→quantidade→modificadores e recibo de zero ações. Se não existir via de leitura segura e silenciosa, **HOLD** e investigar rota comprovadamente isolada; não improvisar depuração no perfil operacional nem chamar ausência de captura de zero pedidos. A etapa B (cobertura de grupos fechados e latência) permanece posterior a esse comprovante.

## 19. Decisão de fonte de pedidos — 04/11

- Investiguei a API oficial de Food/Order do iFood. Ela possui detalhes estruturados (`GET /orders/{id}`, itens, quantidades, complementos e observações) e eventos para alterações e grupos, mas a política atual de homologação **não aceita aplicativos exclusivamente read-only** nos módulos operacionais Order/Events. Ações/ACK de homologação implicam responsabilidade operacional; não implantar espelho próprio por contorno.
- Registrei [análise de rotas e critérios](./DELIVERYOS_IFOOD_FONTE_CONTINUA_DECISAO_20261104.md), com links da documentação oficial. Consulta API por conta própria = **HOLD** sem app efetivamente homologado e permissão da loja. A opção de reusar feed legítimo de fornecedor homologado permanece **UNKNOWN**, não promessa de acesso. Sem gasto novo.
- **Prioridade mantida:** provar um pedido completo na sessão Edge isolada (se houver meio de diagnóstico realmente silencioso), ou obter um feed autorizado já disponível pelo integrador. Nunca aceitar `projectedOrderCount` do Reader de controle como total real, nem iniciar polling/ACK capaz de interferir em consumo de eventos.
- **Efeitos:** pesquisa documental e commits somente na PR rascunho; nenhum deploy, merge, credenciais ou nova integração no caixa. Gate A = **PARTIAL/HOLD**.

## 19. Snapshot V3 inerte no caixa e gate do Edge em segundo plano

**Ação concluída, somente arquivos e sem execução de programa no caixa (04/11):**
- Lida a versão atual `runtime/reporting/gestor_v3_visible_sensor.js` da branch da PR #137, Git blob `53366ba008a1ee4e56157f975203ed4f5e4c2dea`.
- Copiada com escrita direta de arquivo, sem shell, para o CAIXA_MOOCA em `%LOCALAPPDATA%\TataGestorObservationLab\GestorV3Staging\gestor_v3_visible_sensor_40pass_20261104.js`. **Arquivo apenas; nenhuma ativação, import, processo, janela, extensão, tarefa, serviço ou conexão ao Gestor.**
- Conteúdo remoto lido novamente e comparado por igualdade integral de 12.119 caracteres com a fonte do GitHub: **MATCH**. A versão antiga `gestor_v3_visible_sensor.js` foi mantida. Atualizado `STAGING_ONLY.txt` com prova CI `41924294652`: 40/40 Edge, 45/45 Windows silencioso.
- Verificação passiva do Reader às `2026-11-04T22:27:39.210Z`: DINNER, 250 arquivos lidos, 247 ignorados como históricos, `projectedOrderCount=3`; `sourceMode=CONTROL_DIAGNOSTIC_NOT_REAL_PROOF`, `liveSourceVerified=false`, `operationalOrderTotal=null`. **Não interpretar 3 como pedidos iFood.** Encontrar processos Edge na lista sem linha de comando vinculada ao perfil não prova qual é a janela dedicada nem sessão válida.

**Decisão de arquitetura antes de ocultar a janela dedicada:**
- O Chromium pode limitar temporizadores de abas em segundo plano, chegando a verificar timers em lotes aproximados de 1 minuto após cinco minutos sob determinadas condições. Fonte pública: https://developer.chrome.com/blog/timer-throttling-in-chrome-88/ . Isso é **risco técnico geral, não medição do iFood no Edge deste caixa**.
- Mesmo com `MutationObserver` passivo, o aplicativo de origem pode deixar de atualizar DOM enquanto oculto; `observed_at` do adaptador não demonstra frescor da fonte do servidor. O contrato atual `HOLD_STALE` e `ordersPublishable=0` deve continuar fail-closed até ensaio real.
- Manifest V3 tem ciclo de vida não persistente de service worker; não prometer worker sempre ativo por existir extensão. Fonte Microsoft: https://devblogs.microsoft.com/engineering-at-microsoft/learnings-from-migrating-accessibility-insights-for-web-to-chromes-manifest-v3/
- **Gate de ocultação futuro:** comprovar identidade do processo/janela pelo perfil `DedicatedEdgeProfile` (nunca o perfil V2/operacional), identidade/autorização Itaim, leitura exata de um pedido já aberto, `actionsExecuted=0`, nenhuma informação pessoal transferida, e duas leituras observáveis de atualização durante uma sessão isolada oculta por mais de 5 min. Medir atraso e perda de atualizações em vez de presumir SLA. Restauração reversível, sem taskbar/foco/popup, no mesmo HWND e perfil; abortar se identidade de janela não for única. Não usar scripts de outro perfil.
- **Blocked:** sem acesso ao DOM atual pelo conector de abas e sem invocador de inspeção comprovadamente silencioso no CAIXA_MOOCA. `DedicatedEdgeProfile/DevToolsActivePort` teve modificação em 01/11 e não prova attach válido. Não executar comandos no caixa para forçar CDP, não usar o navegador operacional, não instalar sensor sem gate. O V3 copiado continua `STAGED_CODE`, não `DEPLOYED`.

**Próximo ato permitido sem perturbação:** somente leitura/planejamento/QA em repositório ou Foxxy isolado; o salto para o primeiro pedido real exige canal de observação isolado e sem console comprovado no ambiente do caixa. Gate A permanece **PARTIAL/HOLD**, PR #137 **DRAFT**.

## 20. Frescor do DOM não é frescor da origem — gate adicional

**Risco observado no código:** `watch().reconcile()` refazia a leitura do DOM e renovava `observed_at` mesmo quando conteúdo visível permanecia inalterado. Sem recibo da origem, uma página congelada em segundo plano poderia parecer recém-observada. Isso não demonstra atualização real do Gestor do iFood.

**Correção na PR #137:** commit `d78e844d27de87344ffd572e675757973bac561b` acrescenta ao recibo do `watch()`:
- `observed_at`: data/hora da **última verificação local** do DOM (não timestamp iFood).
- `visibleContentChangedAt`: data/hora da **última alteração detectada no resultado visível**, sem renovar a cada varredura idêntica.
- `freshnessBasis=LOCAL_DOM_SCAN_ONLY`, `sourceFreshnessVerified=false`, `sourceUpdatedAt=null`: nenhum frescor do servidor do iFood alegado.

**Testes:** commit `b348b7ab96b1f61215b793a72c56c4db33686c65` adicionou dois testes (40→42) para varredura idêntica não renovar mudança de conteúdo e para mudança visível de grupo não certificar frescor na origem. [GitHub Actions #41951024140](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41951024140) `completed/success`, quatro jobs aprovados. Logs: Edge `42/42 (SYNTHETIC_ONLY; NO_ORDERS_FROM_IFOOD)`, Windows `45/45 NO_VISIBLE_WINDOWS`, readiness offline `53/53`. A validação é de laboratório, não do iFood.

**Verificação passiva do caixa:** CAIXA_MOOCA online; `status.json` às `2026-11-05T01:45:40.020Z` (22h45 BRT de 04/11) reporta `schedule=DINNER`, `filesRead=250`, `ignoredHistorical=249`, `projectedOrderCount=1`, e permanece `sourceMode=CONTROL_DIAGNOSTIC_NOT_REAL_PROOF`, `liveSourceVerified=false`, `operationalOrderTotal=null`. Um registro do feed local **não** prova um pedido iFood. A extensão V2 continua sem nova captura estrutural comprovada; `DevToolsActivePort` tem mtime de 01/11 e não comprova ligação atual com Edge.

**Decisão de execução:** sem shell, reinício de Edge, injecção CDP, extensões, tasks ou hooks visíveis no caixa. O V3 de 40 testes copiado anteriormente ao `GestorV3Staging` permanece **INATIVO** e não deve ser rotulado como versão dos 42 testes sem substituição verificada. Não houve sincronização deste commit ao caixa, nem ativação, merge ou deploy. Edge isolado ainda não foi ocultado por automação.

**Gate A futuro:** instrumento read-only de sessão isolada comprovadamente silencioso + comparação de um pedido real (identidade, itens, quantidades, complementos), sem PII e sem efeitos no Gestor. Gate de esconder janela requer validar um HWND pertencente unicamente ao perfil dedicado e demonstrar atualização real da fonte quando em segundo plano; caso contrário, HOLD. `sourceFreshnessVerified` somente poderá mudar para true com evidência independente explícita, não via mudança de DOM.

## 21. Staging inerte alinhado à suíte 42/42

**Efeito direto no CAIXA_MOOCA:** com operação ainda em janela de jantar, somente a API de arquivo do Desktop Commander foi usada (sem qualquer shell/processo/comando remoto) para copiar o sensor `runtime/reporting/gestor_v3_visible_sensor.js` atual da PR #137 para `%LOCALAPPDATA%\TataGestorObservationLab\GestorV3Staging\gestor_v3_visible_sensor_42pass_20261104.js`. O arquivo tem 12.510 caracteres; **leitura de volta e comparação integral == fonte GitHub**, blob Git `ff037ddad0ed9e74b473e6deceb0ae7312f00764`. `STAGING_ONLY.txt` atualizado; antigas versões preservadas.

**Estado:** `CODE_STAGED_INERT_AND_BYTE_TEXT_MATCH` + `CI_42_PASS`; **NÃO** ativo, instalado, integrado ao Edge, homologado na sessão real ou habilitado ao Copiloto. Não houve mudança de janela, serviço, tarefa, impressora, perfil do navegador, receptor ou pedido. A data de observação do DOM não comprova frescor no servidor, conforme sec. 20.

**Próximo gate:** primeiro comprovante observacional de um pedido real na sessão isolada, por uma via de leitura de DOM **autorizada e comprovadamente silenciosa**, sem exportar PII ou copiar cookies/credenciais e com verificação visual dos itens. Nenhum `DevToolsActivePort` antigo ou Reader local de controle vira prova de fonte. A ocultação total do Edge continua bloqueada até prova de identidade unívoca da janela e continuidade de atualização em segundo plano.

## 22. Seleção do Edge dedicado sem confundir grupos com pedidos

**Falha de contrato comprovada por leitura de fonte (04/11):** `runtime/reporting/gestor_window_selector_v1.cjs`, criado para `DeliveryOS-Edge-Gestor-Itaim`, exige `singleCodeCards == listChildren` e igual número de códigos únicos. Esse contrato pressupõe 1 cartão = 1 pedido e **não cabe** no perfil ativo `TataGestorObservationLab/DedicatedEdgeProfile`, cujo layout de grupos pode conter vários pedidos individuais. Manter a versão antiga intacta para não causar regressões em outra superfície.

**Implementação isolada na PR #137:**
- `794edfa47bd01416e208fbe7d491af3cbaa5e37b`: novo `runtime/reporting/gestor_dedicated_window_gate_v1.cjs`, contrato puramente funcional, sem acesso a Windows/Edge e sem efeitos. Exige host `CAIXA_MOOCA`, caminho exato do perfil dedicado, metadados sanitizados sem campos de cliente/ordem e único candidato estável; `groupCount` permanece distinto de `orderCount=null`. Resultado permitido `CANDIDATE_UNVERIFIED`, **nunca** autorização de ocultar janela, publicar pedido, navegar, confirmar sessão ou merchant. Qualquer dúvida ou janela ambígua => HOLD.
- `5831948ceb123183b4e96d6ea6035e6689150c1a`: `29/29` testes de contrato sintéticos (grupo≠pedido, dois candidatos, janela oculta/minimizada, perfil incorreto, metadados pessoais extras, campo de contagem indevido, contexto errado, etc).
- `611ec2c0db09205e6856e9b735d5c399a8eedf72`: workflow Linux passou a executar esses testes; contrato V1 anterior preservado.
- [CI #41953854757](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41953854757): **completed/success**, quatro jobs; logs estáticos registram `GESTOR_DEDICATED_WINDOW_GATE_PASS 29/29 SYNTHETIC_ONLY` e `GESTOR_WINDOW_SELECTOR_PASS 20/20`. A suíte V3 sintética 42/42 e Windows sem console permanecem independentes, não comprovam captura de pedidos reais.

**Limite de prova:** o novo seletor recebe **metadados ainda não atestados**, sem instrumentação de SO. Ele não identifica sozinho o PID/HWND no caixa e não autoriza nenhuma ação sobre a janela. O `DevToolsActivePort` foi criado em 01/11: a data antiga **não prova que a conexão está ativa nem inativa**; o attach atual segue UNKNOWN. Nenhuma inspeção CDP ou shell foi executada no CAIXA_MOOCA; nenhuma janela, perfil, extensão, tarefa, serviço, impressão ou pedido alterado.

**Próximo desbloqueio real:** obter metadados OS com vínculo inequívoco `--user-data-dir` → PID principal Edge → HWND, por instrumentação auditada de **execução realmente invisível**, e depois obter o DOM de um único detalhe já aberto pelo meio autorizado. Independência da identidade da loja e verificação de ausência de efeitos seguem obrigatórias. Não converter `CANDIDATE_UNVERIFIED` em `WORLD_PROVEN`, não ocultar o Edge nem ativar sensor pelo fato de CI verde. PR #137 segue DRAFT/HOLD.

## 23. Inventário nativo Windows de janela dedicada — prova isolada

**Lacuna do gate anterior:** o seletor puro `gestor_dedicated_window_gate_v1.cjs` avalia metadados sanitizados, mas não consultava o vínculo real `--user-data-dir` → PID principal → HWND. Os conectores remotos de lista de processos não expõem essa cadeia; não inferi identidade real a partir de nomes de processos, `DevToolsActivePort` antigo ou V2 estrutural.

**Código acrescentado somente à PR #137:**
- `runtime/reporting/gestor_dedicated_edge_inventory_win_v1.cs`: inventário nativo Windows `Win32_Process` + `EnumWindows` sem clique, captura de título, URL, DOM, cookie, navegador, rede ou serviço. Verifica nome do processo `msedge.exe`, argumento `--user-data-dir` com caminho **exato** do `DedicatedEdgeProfile`, ausência de `--type`, candidato principal único e exatamente uma janela superior visível/não minimizada. Em ambiguidade ou falha, HOLD. Não exporta PID, HWND nem linha de comando no recibo. Não possui ação de ocultar/restaurar.
- O programa compilado como `/target:winexe` é **estritamente de laboratório**: exige diretório com marcador de fixture e recusa executar quando `COMPUTERNAME=CAIXA_MOOCA`. Isso é uma proteção real no código, não apenas uma instrução de documentação. Reutilizá-lo em produção exigirá novo código, prova e autorização específica.
- `tests/gestor-shadow/DedicatedEdgeInventoryTests.cs`: 20 testes de identidade/ambiguidade, perfil errado, `--type=renderer`, argumento falso na URL, processo duplicado e janela ausente/minimizada. A CI recompila e executa, verifica subsistema Windows GUI (=2), produz recibo local em VM e exige `HOLD_NO_UNIQUE_DEDICATED_PROCESS`, sem credenciais, ações de janela ou autorização de publicação.

**Evidência e reparos da própria integração:** primeira CI [#41955100827](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41955100827) falhou por caminhos relativos com barras de diretório no compilador C# legado; segunda [#41955278548](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41955278548) compilou e passou os 20 testes, mas leu o recibo antes de o `winexe` encerrar. Corrigidos com caminho Windows absoluto e espera explícita pelo término do processo. **CI final [#41955427840](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41955427840): `completed/success`, 4/4 jobs.** Logs: `DEDICATED_EDGE_NATIVE_IDENTITY_LAB_PASS 20/20 SYNTHETIC_ONLY`, `GESTOR_DEDICATED_NATIVE_WINDOW_INVENTORY_PASS 20/20 PLUS_HOLD_RECEIPT LAB_ONLY NO_CONSOLE_SUBSYSTEM`, `SILENT_OBSERVER_WINDOWS_LAB_PASS 45/45 NO_VISIBLE_WINDOWS` (fixture diferente) e `DIAGNOSTIC_READINESS_CONTRACT_PASS 53/53`.

**O que esta prova NÃO demonstra:** qual PID/HWND pertence ao Edge no caixa; se o perfil dedicado está autenticado na conta Itaim; se o iFood atual expõe detalhes do pedido no DOM; se ocultar a janela preserva atualização de origem; se uma chamada ao Windows por Desktop Commander não abre PowerShell; e se é permitido publicar qualquer dado. A CI apenas provou o componente no Windows de laboratório. Nenhum binário, execução, tarefa, serviço ou nova janela foi introduzido no `CAIXA_MOOCA` nesta rodada.

**Próximo gate material:** somente quando houver meio autorizado e **comprovadamente sem console** para rodar uma variante estritamente read-only no caixa, obter recibo de identidade local do perfil exato e vincular HWND ao processo com revalidação de PID/tempo de criação. Depois observar **um** detalhe de pedido real já aberto no perfil isolado, sanitizando PII, comparar itens/quantidades com tela e provar zero efeitos. A função `CANDIDATE_UNVERIFIED` não autoriza ocultação de janela. PR mantém DRAFT/HOLD, sem merge, deploy, leitura real ou Copiloto ativo.

## 24. Inventário silencioso — prova de janela e foco em execução

**Lacuna do gate anterior:** comprovar `/target:winexe` e ter testes de ausência de console em outro componente não bastava para demonstrar que **o inventário nativo** deixaria o foco e as janelas intactos durante a própria execução.

**Correção somente de laboratório:**
- `6cd3dcba56db07e7b53b1e542c72f6aa0ea8f87e`: adicionada opção estrita `--hold-visibility-lab-only`, que mantém a execução por até 1,2 s **somente após** validação de diretório/marcador de laboratório. A proibição de `COMPUTERNAME=CAIXA_MOOCA` continua sendo a primeira condição, antes da análise dos argumentos.
- `e5a5cbbfa45ef377ac9cd212f9e25282a4bee61b`: a CI Windows executa o binário `winexe` sem `-WindowStyle Hidden` para não esconder falsamente um eventual popup. Mede via `EnumWindows` + PID de processo, em **dez amostras**, a quantidade de janelas visíveis e compara `GetForegroundWindow()` antes/depois. Verifica encerramento, ausência de erro e estado HOLD do recibo sem dados pessoais.
- [GitHub Actions #41956310147](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41956310147) = **completed/success**, quatro jobs. Logs Windows: `GESTOR_DEDICATED_NATIVE_IDENTITY_LAB_PASS 20/20`, `GESTOR_DEDICATED_NATIVE_WINDOW_INVENTORY_PASS 20/20 PLUS_HOLD_RECEIPT`, **`GESTOR_DEDICATED_NATIVE_NO_WINDOW_RUNTIME_PASS 10/10 NO_VISIBLE_HWND NO_FOCUS_CHANGE LAB_ONLY`**, além de `45/45` no laboratório anterior.
- Amostragem por aproximadamente 700 ms dentro da retenção de 1,2 s comprova ausência de janela visível **no processo testado e no intervalo amostrado**, não garante ausência absoluta de qualquer flash em qualquer invocador, em outra máquina ou em condição futura.

**Fronteiras:** sem execução do inventário no CAIXA_MOOCA, sem extensão, CDP, comando/shell, intervenção na sessão do Gestor, tarefa, serviço, merge, deployment ou publicação ao Copiloto. O arquivo V3 de 42 testes existente em staging permanece inativo. O Edge isolado **não foi ocultado**. A interface `gestor_dedicated_window_gate_v1.cjs` ainda usa metadados declarativos, enquanto o inventário nativo produz um recibo HOLD sem PID/HWND: não alegar que ambos já compõem uma prova end-to-end da janela real.

**Próxima decisão material:** antes de executar qualquer variante no caixa, obter caminho de invocação **intrinsecamente sem console**, confirmar que consegue ser revertido sem afetar o operador e realizar ensaio supervisionado de identidade do perfil específico. Não recorrer a outros runners para contornar bloqueios anteriores. Depois disso, ainda resta a leitura real de um detalhe de pedido Itaim e a medição de atualização em Edge oculto.

## 25. Identidade de instância do Edge — proteção contra PID reciclado

**Risco de identidade (revisão de código 04/11):** o inventário nativo identificava processos `msedge.exe` por argumento `--user-data-dir`, consultava PID e em seguida enumerava HWND. Entre a consulta WMI e a enumeração de janelas, um processo pode encerrar e o Windows reutilizar o número do PID. O mero PID não comprova que a janela encontrada ainda pertence à mesma instância.

**Correção versionada na PR #137, sem instalação:**
- `d4a362e5f76213ae1123da30bcbb2cbf9d0525d4`: o inventário passou a obter `CreationDate` via WMI, exigir valor DMTF válido e reconsultar `Name`, `ProcessId`, `CreationDate` e `CommandLine` do processo **antes e depois** de `EnumWindows`. Divergência, processo ausente, identidade desconhecida ou mudança do argumento de perfil resultam em `HOLD_PROCESS_IDENTITY_UNVERIFIED` ou `HOLD_PROCESS_CHANGED_DURING_OBSERVATION`. Nenhum PID, HWND, linha de comando, URL ou dados de clientes é escrito no recibo.
- `932da172ed0e9c7a603a101c778b66bba588db0d`: sete casos sintéticos adicionais, incluindo reutilização de PID, mudança de CreationDate, timestamp inválido, nulo ou fuso divergente (20→27).
- `ae4b52d7d6d4643a145cefefac142d6978df8949`: atualização do job de testes Windows para contar os sete casos novos.
- [GitHub Actions #41957460937](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41957460937): `completed/success`, **quatro jobs aprovados**. Logs Windows `DEDICATED_EDGE_NATIVE_IDENTITY_LAB_PASS 27/27 SYNTHETIC_ONLY`, `GESTOR_DEDICATED_NATIVE_WINDOW_INVENTORY_PASS 27/27 PLUS_HOLD_RECEIPT LAB_ONLY NO_CONSOLE_SUBSYSTEM`, `GESTOR_DEDICATED_NATIVE_NO_WINDOW_RUNTIME_PASS 10/10 NO_VISIBLE_HWND NO_FOCUS_CHANGE LAB_ONLY`; permanecem `45/45` no laboratório silencioso anterior e `53/53` na prontidão offline.

**Limites:** teste de identidade WMI/HWND **não foi realizado em um Edge legítimo autenticado do caixa**, e esta variante ainda se recusa a executar no `CAIXA_MOOCA`. O teste puro de mesmo PID/CreationDate e o comportamento de VM sem sessão não demonstram o caminho de sucesso com browser real nem a frequência de atualizações do iFood. A janela dedicada ainda não foi ocultada. **Sem scripts, shells, novos serviços, instalações, reinícios, merge, deployment ou pedidos reais lidos no caixa nesta rodada.**

**Próximo salto de prova:** um ensaio **autorizado e comprovadamente silencioso** que produza somente identidade local do Edge dedicado e verifique PID+CreationDate+HWND ao vivo sem atuar no operador. A captura de DOM de um pedido individual previamente aberto, com privacidade e validação Itaim, exige um segundo gate; nenhum resultado de laboratório autoriza ativar Copiloto. Não gastar novos ciclos com testes sintéticos equivalentes se não surgir uma falha de segurança nova. PR permanece DRAFT/HOLD.

## 26. Mudança de foco para Reader nativo instalado — N1 parcialmente comprovado

**Decisão de continuidade:** o requisito L1 vinculante em `DELIVERYOS_V1_LAUNCH_ACCEPTANCE_20261103.md` prioriza reusar o Reader nativo existente para itens/observações do Itaim, **sem** novo coletor oficial iFood/Teknisa. Não continuar aumentando testes sintéticos do Edge em vez de verificar a fonte nativa. Edge V3 permanece uma rota auxiliar DRAFT/HOLD, não aquisição contínua de pedidos garantida.

**Prova nova no CAIXA_MOOCA (somente APIs de leitura de arquivo, zero comandos):** watcher instalado `tata_reader_continuous_watch_candidate_v2.ps1` presente; SHA-256 local recalculado independentemente igual ao esperado no heartbeat `92B33E82ED72426BE46FE20BCB2A4F4557F9716108886F89E15A4E262C506D44`; heartbeat informa `RUNNING`, SHA verificado, última execução `OK` e zero falhas consecutivas. Arquivo V2 efetivamente contém DSOBS*/TXPRODCOMVEN, `observation_rows` e `observation_scan_complete` (ao contrário do watcher V1 analisado anteriormente). Emissor de eventos local e shadow consumer têm status próprio de atividade; os totais do heartbeat são revisões/batches, **não** pedidos únicos. Não foi aberto qualquer arquivo de pedido ou texto de cliente.

**Lacunas reais:** V2 usa `ConvertTo-Json` legado no SHA e pode não corresponder ao digest canônico do Delivery OS; `observation_scan_complete=true` declarado pelo script não atesta fim de consulta/consistência transacional. Autenticidade independente da fonte, privilégio do serviço, política de PII, frescor e mapeamento real para Home continuam sem prova. O produtor puro da PR #135 pode gerar envelope canônico, mas o `live_shadow_consumer_v2_candidate_v714.cjs` tem capacidades de leitura de estado operacional e escrita em arquivo; sua execução no caixa está expressamente suspensa pela auditoria da PR #135. Não promover os 34 arquivos do manifesto inteiro.

**Checkpoint detalhado e gates N1–N5:** [`DELIVERYOS_L1_READER_COMANDAS_CROSS_PR_GATE_20261104.md`](./DELIVERYOS_L1_READER_COMANDAS_CROSS_PR_GATE_20261104.md). N1: identidade/versão de arquivo e heartbeat parcialmente provadas; N2 captura e completude SQL de revisão real = HOLD; N3 paridade canônica em uma revisão real = UNKNOWN; N4 atestação independente = HOLD; N5 integração com Home = HOLD. Continuar pelo **menor recibo sanitizado já disponível**, sem executar SQL, vigiar pedidos, instalar software, tocar ACL, imprimir, abrir console ou alterar Edge.

## 27. Checkpoint nativo sanitizado e projeção bloqueada — 05/11

**Marco de campo, somente metadados:** `CAIXA_MOOCA` Reader V2 ativo, script instalado com SHA-256 conferido no checkpoint anterior, 250/250 entradas do checkpoint no escopo Itaim com revisões estabilizadas, marcador de emissão == hash atual e 3/3 referências amostradas com arquivos locais existentes. Os 250 registros **não são pedidos ativos**; integridade de observações e vínculo com cliente/pedido iFood não foram lidos nem atestados. Heartbeat informa execução recente `OK` e zero falhas consecutivas, mas supervisor local não é comprovante de fonte independente.

**Segundo bloqueio observado:** consumidor de sombra registra `SKIPPED_LOCKED` no projetor; checkpoint de projeção datado de 30/10, `projector.lock` contém PID que não constava na amostra atual de processos. Hipótese: lock persistente; ainda **UNKNOWN** se pertence a processo temporário, saiu da amostra, foi reutilizado ou está órfão. **Não** remover lock ou reiniciar processo no caixa, nem chamar relatório desatualizado de Home ao vivo.

**Rota de continuidade revisada:** prioridade para L1 Reader nativo (versão/hash/recibo e itens/observações atuais completos) antes de Edge. A PR #135 segue DRAFT e seu consumidor com capacidade de escrita em host permanece suspenso; usar apenas montador puro na homologação sintética. Os gates N2 (corpo e isolamento da revisão), N3 (hash PowerShell↔Node no dado real), N4 (origem/autoridade/frescor) e N5 (Home) permanecem HOLD. O problema de projeção é separado e deve ser investigado sem destravar efeitos produtivos.

**Detalhe de evidência, valores e critérios:** [`DELIVERYOS_L1_READER_COMANDAS_CROSS_PR_GATE_20261104.md`](./DELIVERYOS_L1_READER_COMANDAS_CROSS_PR_GATE_20261104.md), seção 7. Nenhum pedido bruto, cliente, observação, consulta SQL, serviço, impressão, Edge ou aplicação alterado nesta rodada. Sem merge/deploy/ativação. `PR #137` DRAFT/HOLD.

## 28. Estado atual L1–L8 e diagnóstico do projetor

**Controle de continuidade para César:** [`DELIVERYOS_V1_ETAPAS_PROGRESSO_ATUAL.md`](./DELIVERYOS_V1_ETAPAS_PROGRESSO_ATUAL.md) passou a ser o quadro compacto do progresso **L1–L8** e subgates N1–N5. Foco: **L1/N2–N3**, sem confundir 0/8 aceites ponta a ponta com a quantidade de testes aprovados. Conferir esse quadro e o contrato de lançamento antes de toda continuação.

**Revisão de diagnóstico:** análise somente leitura das duas implementações instaladas no caixa distinguiu `SKIPPED_LOCKED` durante a proteção de concorrência de 120 segundos de uma trava realmente órfã. A tentativa observada ocorreu cerca de 66 segundos depois da atualização da trava: **não sustenta a antiga conclusão de trava órfã**. A rotina de consumo só repete projeção após novo envelope, o que pode manter o relatório antigo sem nova emissão. Existe risco adicional de concorrência no protocolo de liberação. Não alterar código instalado; reconciliar primeiro a fonte versionada da versão executada, pois o arquivo antigo da PR #135 é diferente da versão no host.

**Próxima prova material:** N2/N3 com recibo sanitizado de uma revisão; correção do projetor separada e restrita a laboratório até haver baseline fiel, regressões e autorização de efeito. [CI #41964180535](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41964180535) mantém 4/4 jobs aprovados do código anterior. PR #137 DRAFT/HOLD.

