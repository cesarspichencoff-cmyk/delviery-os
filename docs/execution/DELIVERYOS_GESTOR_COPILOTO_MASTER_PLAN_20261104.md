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
