# Plano de implementação — Copiloto Delivery V3.3

> Fase 1: congelamento + mapeamento. **Sem implementação de interface nesta fase.**
> Branch: `feature/copiloto-v33-implementation`
> Worktree: `C:\Users\italo\Desktop\Claude\deliveryos-copiloto-v33-implementation`

---

## 1. Base técnica confirmada

| Item | Valor |
|---|---|
| Repositório de origem | `C:\Users\italo\Desktop\Claude\deliveryos-fable` |
| Branch de origem | `feature/d4a-cenarios-volume-visual` |
| HEAD de origem | `e299cbc01c501b9f44c9c098dec65880f3955dec` |
| Mensagem HEAD | Investiga cenarios de volume que produzem Ambiente e Foco pelo motor real |
| Working tree de origem | **limpa** |
| Base escolhida | **SIM** — branch d4a existe, limpa, é a linha técnica live (motor + D4A + app-v1) |

### Por que esta base (e não outra)

- Contém o **motor real** (`src/perfil-delivery/motor.js`, `decisao.js`) que produz Calmo / Ambiente / Foco.
- Contém **app-v1** (superfície live) e pipeline D4A (`src/live/interface/*`, simulador, estados de fonte).
- Contém testes live + cenários de volume.

### Divergência registrada (não bloqueante)

Existe branch/worktree paralelo `grok/copiloto-intelligence-pack` @ `a8ea130` com pacote de inteligência (+94 arquivos: engines, schemas, mocks, design docs). É **superset documental/cognitivo** de `e299cbc`, **não** a base UI live escolhida nesta fase.

- **Não alteramos** o worktree de inteligência.
- O pacote é **disponível para mapeamento e reuso futuro** (adapters), sem merge automático nesta fase.
- Entregas/visual lab (`research/tata-evolucao-grok`) e main (`a441bc7`) **não** são base desta implementação.

### Stack e execução (origem)

| Aspecto | Situação |
|---|---|
| Runtime | Node + TypeScript (Camada 0); JS no browser para motor/interface |
| App live | `app-v1/` (HTML/CSS/JS) |
| Rodar interface V1 | `node tools/servir_v1.js` → `http://localhost:5179/` |
| Rodar D4A | `node tools/live/interface/servir_d4a.js` (feature flag `DELIVERYOS_LIVE_SOURCE`) |
| Protótipo antigo | `node tools/serve_prototipo.js` → `http://localhost:5178` (`prototipos/parados-agora` — legado) |
| Demo Camada 0 | `npm run demo` |
| Testes live | `tests/live/**` (núcleo, adaptador, simulador) |
| Testes copiloto (pack) | `node tests/copiloto/run.js` — **só no pack de inteligência**, não nesta branch ainda |
| Versão visual atual | **Interface V1** (Calmo pulso + mapa 6 cards Ambiente + cartão Foco) — **não é V3.3** |

---

## 2. Referência canônica e hashes

| Artefato | Valor |
|---|---|
| ZIP | `C:\Users\italo\Downloads\Sprint Visual DeliveryOS V2 (1).zip` |
| SHA-256 ZIP | `2755573BBE624F4CE0DBA992D006E6E5B8E2B6DEA87B7D6A2050E55FD9834101` |
| HTML interno | `DeliveryOS Organismo Operacional.dc.html` |
| SHA-256 HTML | `434294036F86FF6976B48FB3EC4B58D5C4CECEFE272FEEA181E9A167E7B19FBC` |
| Tamanho | `104769` bytes |
| Cópia congelada | `design-reference/copiloto-v33/DeliveryOS Organismo Operacional.dc.html` |
| Metadados | `design-reference/copiloto-v33/REFERENCE.md` |
| Hash pós-cópia | **idêntico** ao canônico (byte a byte) |

Única referência visual autorizada. HTML congelado **não se edita**.

---

## 3. Arquitetura atual

```
Fonte (current | simulator)
        │
        ▼
src/live/interface/fonte.js  +  adaptador.js
        │  janela NIGHT/rows + estado técnico da fonte
        ▼
app-v1 (app.js + style.css + index.html)
        │  carrega motor.js + decisao.js
        ▼
MOTOR.step / DECISAO.decidir → mode: calmo | ambiente | foco
        │
        ▼
Render V1: pulso | mapa de 6 cards | cartão + pílula de ação
```

**Contrato soberano (preservar):** motor decide → projeção expõe → adaptador transporta → interface apresenta. A interface **nunca** recalcula Calmo/Ambiente/Foco.

**Pacote de inteligência (disponível, branch paralela):** `src/copiloto/*` (forecast, focus-engine, focus-stability, voice-intents, shift-closing, anomalies, playbooks…), `schemas/copiloto/*`, `mocks/copiloto/*`, `openapi/copiloto-openapi.yaml`.

---

## 4. Componentes reutilizáveis

| Peça | Onde | Uso no V3.3 |
|---|---|---|
| Motor 8 praças | `src/perfil-delivery/motor.js` | Continua dono do clima operacional e situações |
| Decisão / atenção | `src/perfil-delivery/decisao.js` | Foco + recomendação; `rec=null` → foco puro |
| Núcleo live | `src/live/*` | Fonte viva, dedup, freshness, qualidade |
| Adaptador D4A | `src/live/interface/adaptador.js` | Transporte NIGHT/rows; estados de fonte |
| Feature flag fonte | `src/live/interface/fonte.js` | `current` \| `simulator` |
| Servidores de preview | `tools/servir_v1.js`, `tools/live/interface/servir_d4a.js` | Base para servir a nova superfície (sem redesign no tool) |
| Simulador + cenários volume | `tools/live/simulator/**` | Alimentar demos / QA com motor real |
| Testes live | `tests/live/**` | Regressão de contrato motor/adaptador |
| Cardápio knowledge | `data/cardapio_knowledge_seed.json` | Resolução de itens |
| Engines copiloto (pack) | `src/copiloto/*` (paralelo) | Forecast, stability, voice, closing — **reutilizar via adapter**, não reescrever |
| Schemas / OpenAPI (pack) | `schemas/copiloto/*`, `openapi/*` | Contrato de resposta |
| Fixtures 01–30 (pack) | `mocks/copiloto/fixtures/scenarios/*` | Catálogo de QA cognitivo |
| Design docs copiloto (pack) | `docs/copiloto/*`, `docs/copiloto-design/*` | Critérios de experiência (não redesenham o V3.3) |

---

## 5. Componentes novos (a construir na implementação)

| Componente | Função | Notas |
|---|---|---|
| Superfície organismo V3.3 | Substitui a hierarquia visual V1 (sem matar o motor) | Portar do HTML congelado; **mesma superfície** para Calmo/clima/Foco |
| Áreas do organismo | Leitura periférica de zonas (não cards ERP) | Portar linguagem visual V3.3 |
| Atenção dominante | Slot soberano de Foco | Progressive disclosure se pesado |
| Bloco de previsão | 10–15 min, “se nada mudar”, “estimativa, não certeza” | Confiança separada da gravidade |
| Ação acompanhada | Aceita → responsável → melhora / parcial / ausência / colateral | Não wizard |
| Voz operacional | Captura curta + ambiguidade + falha | Não chatbot; não modal de chat |
| Fechamento de turno | Perguntas mínimas; Não sei / Pular | Não formulário |
| Estados técnicos UI | Texto + forma (além da cor) | Alinhar aos estados D4A existentes |
| Layout mobile V3.3 | Uma coluna; toque; hierarquia do design | Portar breakpoints do HTML |
| Catálogo QA (dev-only) | Deck de cenários de apresentação | **Fora** da navegação do produto |

---

## 6. Adapters necessários

| Adapter | Entrada | Saída UI | Notas |
|---|---|---|---|
| `mode → superfície` | `R.mode` (calmo/ambiente/foco) | Composição V3.3 na **mesma** view | Sem rotas/páginas por modo |
| `decisão → Foco` | `sit`, `rec`, evidências | Atenção dominante + ação | Manter `rec=null` digno |
| `fonte → estado técnico` | `ESTADOS_FONTE` D4A | UI técnico V3.3 | Já existe no app-v1; redesenhar só apresentação |
| `forecast → previsão` | Engine `forecast.js` (pack) ou mock | Bloco previsão + confiança | Mock até wiring do pack |
| `ação → acompanhamento` | Eventos aceitar/adaptar/ignorar + outcome | Estados: assumiu / melhora / parcial / colateral | Fixtures 18–23 |
| `voz → intent` | `voice-intents.js` (pack) ou mock | UI voz + “Não sei” | Nunca chat thread |
| `closing → fechamento` | `shift-closing.js` (pack) ou mock | UI fechamento | Fixtures 25–27 |
| `cenários QA → deck` | fixtures 01–30 + cenários volume | Catálogo oculto / flag dev | Não é navegação real |

Regra: adapters **só mapeiam**. Não decidem modo, não recalculam score, não inventam certeza.

---

## 7. Arquivos previstos (implementação futura — não criar agora)

| Caminho previsto | Papel |
|---|---|
| `design-reference/copiloto-v33/*` | **Já criado** — freeze imutável |
| `docs/COPILOTO_V33_IMPLEMENTATION_PLAN.md` | **Já criado** — este plano |
| `app-v1/` ou sucessor `app-copiloto-v33/` | Superfície alvo (decisão de pasta na fase de código) |
| `src/live/interface/adaptador-v33.js` (nome TBD) | Mapas de projeção → view-model V3.3 |
| `src/copiloto/*` | Opcional: portar/merge do pack quando autorizado |
| `mocks/copiloto/*` | Opcional: fixtures para demos |
| `tests/...` | Testes de adapter + regressão visual/comportamental |

Nesta fase **somente** freeze + este plano.

---

## 8. Ordem de implementação (fases seguintes)

1. **View-model estável** — mapear `R` + estado de fonte → shape da superfície V3.3 (sem CSS final).
2. **Calmo na mesma superfície** — abrir sempre em Calmo; zero cards de alerta.
3. **Clima + áreas (comportamento “Ambiente”)** — periférico do organismo; sem página separada; sem exigir a palavra “Ambiente”.
4. **Foco soberano** — uma atenção; progressive disclosure.
5. **Estados técnicos** — texto + forma; preservar semântica D4A.
6. **Mobile** — hierarquia e toque do V3.3.
7. **Previsão** — mock honesto → adapter do pack.
8. **Ação acompanhada** — estados + colateral; sem wizard.
9. **Voz** — captura + ambiguidade + falha; sem chatbot.
10. **Fechamento** — Não sei / Pular; sem formulário.
11. **Catálogo QA** — flag/dev; fixtures; nunca navegação real.
12. **Wiring pack inteligência** — só com autorização e testes; sem marcar mock como live.
13. **QA final Claude Code** — ver §14.

---

## 9. Mocks

| Mock | Origem | Uso |
|---|---|---|
| Janela real / generated | `tools/gerar_janela_v1.js` + `data/generated` | Replay V1 atual |
| Simulador D4A | `tools/live/simulator` | Cenários certificados + volume |
| Fixtures copiloto 01–30 | pack `mocks/copiloto/fixtures` | Previsão, ação, voz, fechamento, falha |
| HTML V3.3 | freeze local | Referência visual; **não** é runtime de produto |

Todos os mocks devem ser **rotulados como demonstração** na UI de dev/QA.

---

## 10. Testes

| Camada | O quê | Quando |
|---|---|---|
| Contrato adaptador | Não decide modo; não inventa campo | Já existe (`tests/live/interface-*`) — manter verde |
| Simulador | Determinismo / cenários volume | Já existe — manter |
| View-model V3.3 | Mapeamento mode→UI; foco único; tech states | Criar na implementação |
| Previsão / confiança | Copy anti-certeza; gravidade ≠ confiança | Criar |
| Ação acompanhada | Transições de estado; colateral | Criar (+ fixtures pack) |
| Voz / fechamento | Não sei / Pular; sem wizard/chat | Criar |
| Mobile smoke | Layout sem quebra de hierarquia | Manual + checklist |
| Pack copiloto | `tests/copiloto/run.js` | Após eventual port do pack |

Nesta fase: **nenhum teste novo executado além da verificação de hashes**.

---

## 11. Critérios visuais de aceite

- [ ] Abre em **Calmo** por padrão.
- [ ] Calmo / clima / Foco na **mesma superfície** (sem nav por páginas).
- [ ] **Uma** atenção dominante; periférico legível sem competir.
- [ ] Áreas do organismo **não** viram cards ERP nem dashboard de KPIs.
- [ ] Sem feed de alertas; sem oito fases simultâneas.
- [ ] Previsão **não** sempre expandida; linguagem de estimativa.
- [ ] Confiança visual **separada** da gravidade.
- [ ] Estados técnicos: **texto + forma**, não só cor.
- [ ] Mobile: hierarquia do V3.3 legível com toque ≥44px onde o design exige.
- [ ] Catálogo de cenários **não** aparece como navegação do produto.
- [ ] Pixel/comportamento confrontado com `design-reference/copiloto-v33/*.html` (não com V1).

---

## 12. Critérios funcionais de aceite

- [ ] Motor/decisão **intocados** na semântica (interface não decide modo).
- [ ] `rec === null` permanece digno (foco sem ação forçada).
- [ ] Previsão nunca afirmada como certeza (“se nada mudar”, “estimativa, não certeza”).
- [ ] Ação acompanhada: aceita → responsável → melhora / parcial / ausência / colateral.
- [ ] Voz: ambiguidade e falha de reconhecimento tratadas; sem chatbot.
- [ ] Fechamento: “Não sei” e “Pular” válidos; sem formulário longo.
- [ ] Estados de fonte D4A continuam auditáveis (stale, disconnected, degraded, failed…).
- [ ] Dados mock **não** rotulados como ao vivo.
- [ ] Feature flags / dev deck não alteram default seguro da fonte.

---

## 13. Riscos (proibidos) e mapa de elementos

### 13.1 Riscos proibidos

| Risco | Mitigação |
|---|---|
| Organismo → dashboard | Aceite visual §11; review contra HTML freeze |
| Áreas → cards ERP | Proibir grade de cards estilo V1 Mapa 6× |
| Feed de alertas | Um Foco; sem lista de prioridade competindo |
| Oito fases ao mesmo tempo | Progressive disclosure; estados sequenciais de ação |
| Wizard de ação | Máquina de estados simples, não steps UI |
| Voz em modal chat | UI inline operacional |
| Chatbot | Intents fechados (pack voice-intents) |
| Previsão sempre expandida | Default colapsado / sob demanda |
| Deck de apresentação = produto | Flag dev / rota QA isolada |
| Mock como live | Labels + `fonte` auditável |
| Perder estados técnicos | Mapear 1:1 D4A → UI V3.3 |
| Nav por páginas Calmo/Ambiente/Foco | Single surface; só composição muda |

### 13.2 Classificação por elemento

| Elemento | Classificação | Notas |
|---|---|---|
| Calmo | **Portar** visual; **Reutilizar** decisão `mode=calmo` | Abre em Calmo |
| Ambiente (comportamento) | **Portar** clima na superfície; **Reutilizar** `mode=ambiente` | Literal “Ambiente” opcional |
| Foco | **Portar** atenção dominante; **Reutilizar** sit/rec | Progressive disclosure |
| Áreas do organismo | **Portar** | Não reutilizar mapa 6 cards V1 como design |
| Atenção dominante | **Portar** + **Adaptar** de `sess.active` / rec | Um só |
| Previsão | **Adaptar** (pack forecast) + **Simular** até wiring | 10–15 min demo ok |
| Confiança | **Adaptar** | Separar de gravidade; V1 só sussurra texto |
| Ação acompanhada | **Portar** UI + **Adaptar**/fixtures | Não existe no V1 |
| Responsável funcional | **Portar** + **Simular** | Ex.: “Kenji assumiu” |
| Melhora | **Portar** + **Simular**/fixtures 21 | |
| Melhora parcial | **Portar** + **Simular** | |
| Ausência de resultado | **Portar** + **Simular**/fixtures 22 | |
| Efeito colateral | **Portar** + **Simular**/fixtures 23 | |
| Encerramento (de ação) | **Portar** | Distinto de fechamento de turno |
| Voz | **Portar** UI + **Adaptar** voice-intents | **Futuro** ASR real |
| Ambiguidade | **Portar** + **Simular** | |
| Falha de reconhecimento | **Portar** + **Simular** | |
| Fechamento do turno | **Portar** + **Adaptar** shift-closing | Não sei / Pular |
| Estados técnicos | **Adaptar** UI sobre D4A **reutilizado** | Texto + forma |
| Mobile | **Portar** | V1 mobile-first existe mas visual V1 |
| Catálogo de QA | **Portar** como dev-only + **Simular** | Não navegação real |
| ASR/TTS produção | **Futuro** | |
| Fonte iFood contínua em loja | **Futuro** / fora desta entrega visual | |
| Merge git do pack inteligência | **Futuro** (autorizado) | Mapear sem alterar pack agora |
| Entregas / TATÁ OS rename | **Futuro** / outra trilha | |

---

## 14. Itens reservados para QA final do Claude Code

1. Diff visual sistemático: freeze HTML × implementação (desktop + mobile).
2. Matriz dos momentos inteligentes V3.3 (previsão, ação, voz, fechamento, falha, colateral).
3. Prova de que **não** há navegação por páginas entre modos.
4. Prova de que motor/decisão não foram semanticamente alterados.
5. Prova de honestidade: mock ≠ live; confiança ≠ gravidade; estimativa ≠ certeza.
6. Estados técnicos com falha de cor (acessibilidade): texto + forma ainda legíveis.
7. Deck QA inacessível no fluxo operacional padrão.
8. Checklist de riscos proibidos §13.1 com evidência por item.
9. Decisão explícita se/when portar `src/copiloto` do pack para esta branch.
10. Gate humano final antes de qualquer push/deploy.

---

## Registro de fase

| Campo | Valor |
|---|---|
| Fase 1 | Congelamento + plano |
| Fase 2A | Superfície V3.3 na app real (adapters + mocks) |
| Push / deploy | **NÃO** |
| ZIP / HTML originais | **intocados** |
| Pack inteligência | **não incorporado** |
| Outros worktrees | **intocados** |

---

## Fase 2A executada

### Arquivos implementados

| Arquivo | Papel |
|---|---|
| `app-v1/index.html` | Shell V3.3 (topo, palco, voz, fechamento, QA) |
| `app-v1/style.css` | Tokens e gramática visual do organismo canônico |
| `app-v1/app.js` | Render organismo; motor/D4A preservados; default Calmo |
| `app-v1/v33-mocks.js` | Previsão, ação acompanhada, voz, fechamento, QA catalog |
| `src/live/interface/adaptador-v33.js` | View-model V3.3 (Node + browser) |
| `tests/live/interface-adaptador-v33.test.js` | Contrato do adaptador V3.3 |

### Adapters

- `montarViewModelV33` — mode + áreas + atenção + mocks → shape UI  
- `mapearEstadoFonteV33` — status D4A → texto + forma (dashed/pulse/solid)  
- `areaHintFromSit` — sitKind/sitPraca → área dominante (apresentação)  
- Motor / `adaptador.js` D4A / `fonte.js` **intocados na semântica**

### Mocks (explícitos, `simulated: true` + label demo)

- Previsão 10–15 min, “se nada mudar”, confiança ●●○, “estimativa, não certeza”  
- Ação acompanhada: 8 estados sequenciais (um de cada vez)  
- Responsável funcional (sem ranking)  
- Voz: escuta → transcrição → conclusão → confirmação / ambiguidade / falha  
- Fechamento: resumo, 1 de 2, Não sei / Pular, áudio simulado  
- QA Catalog (~16 itens) só com `?qa=1` ou `?dev=1`

### Testes

- `node --test tests/live/**/*.js tests/live/*.js` → **179 pass / 0 fail**  
- Inclui novos testes do adaptador V3.3 + suite live/D4A/simulador intacta  

### Comando para executar

```bash
node tools/servir_v1.js
# → http://localhost:5179/
# QA catalog: http://localhost:5179/app-v1/index.html?qa=1
# D4A: DELIVERYOS_LIVE_SOURCE=simulator node tools/live/interface/servir_d4a.js
```

### Limitações (Fase 2A)

- Previsão / ação / voz / fechamento **não** ligados a engines do pack  
- ASR/TTS ausente (só demo)  
- Janela real ainda depende de `data/generated` (gerar se faltar)  
- Replay permanece no rodapé (demonstração de janela histórica)  
- Pixel-perfect vs HTML Claude Design: gramática e tokens portados; validação visual humana pendente  

### Itens reservados para Fase 2B

- Merge/port controlado de `grok/copiloto-intelligence-pack`  
- Forecast engine, voice-intents, shift-closing, schemas, OpenAPI  
- Wiring live de previsão e ação acompanhada  
- Memória operacional / backtests  
- Remoção progressiva de mocks onde o motor cobrir  
- Gate visual formal vs HTML congelado
