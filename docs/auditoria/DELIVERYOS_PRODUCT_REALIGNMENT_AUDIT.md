# Auditoria forense de realinhamento — DeliveryOS como produto

> **Missão analítica.** Nada foi editado: nem código, nem Figma, nem memória executável, nem arquitetura.
> Este arquivo é o único artefato criado.
> Branch `feature/deliveryos-hybrid-platform-foundation-v1` · HEAD `d7c28e8` · working tree limpo ·
> vereditos confirmados: `CONFERENCE_BRAIN_UNIT_COMPLETE`, `COPILOT_SHADOW_UNIT_COMPLETE`,
> `PRODUCT_SYSTEM_UNIT_COMPLETE`. Figma lido em modo leitura.
> Data: 2026-08-01.

---

## Veredito em uma frase

**As fundações técnicas estão sólidas e a visão continua escrita e intacta nos documentos fundadores, mas o produto que está sendo implementado deixou de ser uma consciência operacional (Calmo · Ambiente · Foco) e virou uma plataforma observável com um catálogo de módulos — a deriva é de experiência e de foco, não de engenharia, e é largamente reversível porque o motor cognitivo original continua no repositório, funcional e intocado.**

Nuance obrigatória, e ela é grande: **a deriva foi em boa parte autorizada e correta na sequência**. A Lei 11 (`Leis_Fundamentais.md`) manda explicitamente *"observabilidade antes de inteligência: ver → confiar → projetar → (só então) sugerir"*. As Unidades 1–5 são exatamente "ver e confiar". O problema não é terem sido feitas. O problema é que, ao chegar na Unidade 6, a camada de **apresentação** foi construída sobre a linguagem da observabilidade (dimensões, saúde de fonte, ciclos) em vez da linguagem da consciência (Calmo, Ambiente, Foco, uma ação) — e ninguém percebeu porque a memória que governa o trabalho diário parou de carregar a intenção de produto.

---

## 1. Resumo executivo

Cinco fatos sustentam o veredito, e todos são verificáveis:

1. **O DeliveryOS foi definido como sendo o Copiloto, não como tendo um Copiloto.**
   `PRODUCT_CONSTITUTION.md` §1: *"DELIVERYOS nomeia o módulo de consciência operacional (Copiloto)"*.
   Na Unidade 6, o Copiloto virou **1 item entre 11** num menu, no grupo "Entendimento", ao lado de
   "Caixa" e "Suprimentos". É uma inversão de categoria: o produto virou submenu de si mesmo.

2. **Existem dois Copilotos, e eles não se conhecem.**
   O original (`src/perfil-delivery/decisao.js`) produz 6 tipos de ação operacional
   (`priorizar_praca`, `fechar_simples`, `chamar_motoboy`, `conferencia`, `conferir_saida`,
   `olhar_pedido`), com backtest de 30 dias reais e 460 recomendações. O novo
   (`src/platform/copiloto/shadow.ts`) tem 3 políticas (`sinal-velho`, `capacidade-saturada`,
   `ocorrencias-acumuladas`) e **zero referências** ao primeiro. Nenhum arquivo de `src/platform`,
   `src/product` ou `src/conference-brain` importa `perfil-delivery`.

3. **O vocabulário cognitivo desapareceu de tudo que foi construído a partir de 26/07.**
   `Calmo`, `Ambiente` e `Foco` aparecem **48 vezes** em `prototipos/` e no motor, e **zero vezes**
   em `src/platform`, `src/product`, `src/conference-brain` e nos 13 documentos de `docs/figma/`.
   Isso apesar de o mapa de domínios (12/07) declarar *"Motor central soberano: Calmo · Ambiente ·
   Foco"* e de o contrato de integração (20/07) ainda tratá-los como propriedade do Copiloto.

4. **"Operação Viva" mudou de significado mantendo o nome.**
   No mapa de domínios ela é o **núcleo de consciência**, "único dono da decisão cognitiva".
   No código ela é `projetar()`: uma projeção de **viagens** com 9 dimensões de telemetria. Não há
   modo, não há slot de foco, não há debounce/cooldown/teto. O nome sobreviveu; a função foi trocada.

5. **A memória preservou o estado técnico e perdeu a intenção de produto.**
   A palavra "gerente" — usuário principal do Manifesto — aparece **0 vezes** em `docs/figma/`
   (os 13 documentos da Unidade 6), **0 vezes** em `docs/execution/` (a memória executável inteira)
   e **0 vezes** em `src/product/`. A memória de produto (`docs/Estado_Atual_DeliveryOS.md`) está
   parada em 05/07 e descreve um roadmap que não é o que está sendo executado.

O sintoma mais concentrado de tudo isso é a **capa do próprio Figma**: ela mede o DeliveryOS em
*"TESTES · 629 verdes"*. A primeira coisa que se vê ao abrir o arquivo de design do produto é um
contador de testes.

---

## 2. Intenção original reconstruída

Fontes primárias, todas versionadas e anteriores ao pivô: `docs/Constituicao.md`,
`docs/Leis_Fundamentais.md`, `docs/Manifesto_Produto_Design.md`,
`docs/Modelo_Operacional_Consciencia_DeliveryOS.md`, `docs/Camada_Decisao_Operacional.md`,
`docs/Estado_Atual_DeliveryOS.md`, `docs/PRODUCT_CONSTITUTION.md`.

### O problema humano e operacional

> *"Toda operação de delivery sob pressão faz, o tempo todo, a mesma coisa: **para de produzir para
> se procurar**. 'Cadê o 330?', 'já saiu?', 'quem fechou?', 'o que travou?'"* — Manifesto, frase fundadora.

O problema não é falta de dado. É que a operação **não tem propriocepção** — para saber onde está,
ela precisa parar, olhar, perguntar e reconstruir. O imposto é atenção.

### A promessa central

> *"O DeliveryOS é o sistema nervoso da operação: ele sabe, a cada instante, onde está cada pedido e
> o que travou — para que a equipe nunca mais precise parar de produzir para descobrir."*
> *"Não é um software que você usa. É um sentido que a operação passa a ter."*

### A transformação esperada

Uma emoção específica: **calma**. *"A paz de quem nunca mais precisa perguntar 'cadê?'"*. E uma
métrica de sucesso invertida em relação a todo software de gestão: *"quanto tempo a equipe consegue
passar **sem olhar** para ele"*.

### Papéis

| Papel | Intenção original | Fonte | Explícita/Inferida |
|---|---|---|---|
| **Público principal** | quem está no chão sob pressão — expedição, produção, e o gerente/LE | Manifesto §2, §7; Modelo §10 | explícita |
| **Gerente** | o "maestro". Decide. O sistema aponta, ele age. Deve poder **desviar o olhar** | Manifesto §2, §4 ("nunca decidir pela pessoa") | explícita |
| **Líderes** | liderança é **desenho, não polícia**; o julgamento do líder é capturado e amplificado, nunca substituído | Constituição §7 | explícita |
| **Equipe** | é a **inteligência** da operação, não o elo fraco; nunca vira operadora do sistema | Constituição §2; Lei 7 | explícita |
| **Entregador** | sujeito de execução, nunca de vigilância; sem ranking, sem rastreamento permanente | Lei 4; Mapa de Domínios §2.2 "dados proibidos" | explícita |
| **IA** | uma **projeção sobre o corpus**, não substituta do julgamento; falsificável e honesta sobre confiança | Constituição §9 | explícita |
| **Copiloto** | **é o DeliveryOS**: a camada de consciência operacional | `PRODUCT_CONSTITUTION.md` §1, §4 | explícita |
| **Operação Viva** | o **núcleo**; único dono de Calmo/Ambiente/Foco; nenhum domínio cria Foco | `Mapa_Mestre_Dominios` §2.1, §1 | explícita |
| **Conference Brain** | — **ausente das fontes originais** | — | **lacuna** |
| **CRM / Conversa** | não existe como módulo nos fundadores; o WhatsApp aparece como **fonte de evidência** (4 anos), não como produto | `Estudo_Conversas_WhatsApp.md`; CLAUDE.md §2 | inferida |
| **Módulos futuros** | Suprimentos e Caixa **demarcados**, sem aprofundar; TATÁ Evolução é **produto separado** | `Mapa_Mestre_Dominios` §2.3–2.5 | explícita |

### A experiência desejada — quatro estados, não telas

> *"DeliveryOS não muda de tela. Ele muda de consciência."* — Modelo Operacional §12, lei 1.

| Estado | O que mostra | O que esconde |
|---|---|---|
| **Calmo** | o **pulso** ("N em andamento") — nada mais | *"nunca uma lista de pedidos, nunca contagem por praça, nunca um KPI"* |
| **Ambiente** | até **2** rótulos curtos + cor de severidade | números, listas, ação |
| **Foco** | **4 linhas + sussurro**: AÇÃO (imperativo, ≤4 palavras) · por quê · primeiro olhar · impacto · confiança | score, ranking, dados-fonte |
| **Resolução** | nada — o foco recua | o próprio ciclo |

Protegido por mecanismos medidos: `DEBOUNCE` 3 min, `COOLDOWN` 45 min, `MAXFOCUS` 8 min,
**exclusividade de slot** (1 foco por vez, nunca fila).

### Diferenciais pretendidos

- *"Dashboard se mede por quanto você olha. DeliveryOS, por quanto você pode parar de olhar."* (§8)
- *"A tela mostra a conclusão da investigação, nunca a investigação."* (Camada de Decisão)
- *"A frase que o usuário pensa: 'o sistema sabia antes de mim.'"* (§10)
- Assinatura comportamental: **o foco surgindo da calma**.

### Fronteiras de decisão

| Categoria | Conteúdo | Fonte |
|---|---|---|
| **Sempre humana** | o julgamento consequente: o que segura, o que sacrifica, quando quebrar a regra | Lei 6 |
| **Pode ser assistida** | o que olhar primeiro; qual praça segura mais; qual pedido destrava mais saídas; dá para fechar algum agora | `Camada_Decisao_Operacional` §"decisões que já elimina" |
| **Nunca automatizada** | punição, ranking, vigilância de pessoa; regra permanente sem aprovação humana; desfecho presumido sem confirmação | Lei 4; Modelo §8, §12 |

---

## 3. Produto atual (HEAD `d7c28e8`)

### Classificação honesta de cada camada

| Camada | O que é | Classe |
|---|---|---|
| `src/platform/ingest`, `event-catalog`, outbox, event log | ingestão autenticada, contratos, entrega confiável | **código funcional**, integrado ao runtime |
| `POST /api/gps/batch` + `OUTBOX_HANDLERS` | única porta de entrada real | **código funcional** |
| `src/platform/projections/operacao-viva.ts` | projeção de viagens + 9 dimensões | **projeção** |
| `src/conference-brain/` (25 arquivos) | observador, núcleo multidimensional, store | **código funcional**, isolado do crítico |
| `ingestion/operacao-viva-adapter.js` | traduz projeção → Brain, **recusando emitir pedido** | **adapter** |
| `src/platform/copiloto/` | ponte + gerador de recomendações | **mecanismo shadow** |
| `src/product/` (Unidade 6) | shell + 4 superfícies | **tela local**, alimentada por fixture |
| `src/product/demo/seed-demonstracao.ts` | eventos de exercício sobre lógica real | **fixture / demonstração** |
| `src/perfil-delivery/` | motor cognitivo + camada de decisão | **código funcional — desconectado** |
| 7 módulos do menu | CRM, Caixa, Suprimentos, Evolução, Treinamento, RH, Gestão | **visão futura**, zero dado |
| Estado do aparelho (credencial, GPS, sync, fila) | — | **integração inexistente** |
| Histórico / série temporal | — | **integração inexistente** |
| `docs/deliveryos/`, `docs/entregas-design/` | 10 + 11 documentos de domínio e UX | **documentação sem implementação correspondente** |
| Motor cognitivo (Calmo/Ambiente/Foco) | especificado, medido, implementado em 2026-07 | **implementação sem experiência correspondente no produto atual** |

### A cadeia real, ponta a ponta

```
ENTRA      POST /api/gps/batch (autenticado, device revogável)
PERSISTE   event log append-only + outbox, mesma transação
PROJETA    projetar() → Projeção de VIAGENS + 9 dimensões        [sem identidade de pedido]
ADAPTA     adapter → escopo, saúde, contexto, procedência         [orders SEMPRE vazio, por decisão]
CONCLUI    observer → Conference Brain → conclusões `source_health`  [zero `order_dimension`]
COPILOTO   recebe conclusões de FONTE → 3 recomendações sobre a FONTE
INTERFACE  mostra dimensões, ciclos, saúde, conclusões e propostas — tudo rotulado `somente_demonstracao`
PESSOA     pode: navegar, expandir inspetores, ler.
           não pode: agir. Nenhuma ação existe, por construção.
```

**A cadeia está tecnicamente viva e operacionalmente vazia.** Ela transporta com rigor exemplar uma
informação que não é sobre a operação: é sobre a **saúde da própria cadeia**. O Copiloto atual
recomenda coisas como *"Leitura da Conferência incompleta — a fonte reportou 'partial' e declarou 10
campos que não consegue fornecer"*. Isso é uma recomendação de **observabilidade para quem constrói o
sistema**, não uma decisão operacional para quem está no balcão.

---

## 4. Mapa de evolução (linha do tempo)

| Data | Commit | Evento | Efeito na visão |
|---|---|---|---|
| início | `fcfc21d` | Camada 0 — motor de escuta append-only | funda o núcleo |
| — | `b5b8c23`, `1d212cc` | Constituição, Leis Fundamentais, Manifesto | **a visão é escrita e red-teamed** |
| — | `10adcf8`, `e9c89cd` | "Parados Agora" reduzido à essência; 3 estados por luz/ritmo/direção | a experiência existe e é sentida |
| — | `7ef56f6` | Auto Teste Operacional — backtest de 30 dias reais | a inteligência é **medida** |
| — | `82eb2f3` | Camada de Decisão: "de diagnóstico para redução de decisões" | nasce a recomendação de 4 linhas |
| 02/07 | `6607ec9` | caso "402 min" corrigido; foco leve (ação-primeiro) | honestidade de confiança vira regra |
| **05/07** | `37ca1c9` | **Restringe `decisao.js` ao escopo do foco ativo** | a correção Motor×Decisão **foi implementada** |
| **05/07** | `72561c9` | `Estado_Atual_DeliveryOS.md` | **última atualização da memória de PRODUTO** |
| 12/07 | `a03508c` | **Pivô 1** — mapeia domínios e funda Entregas | *preserva* Calmo/Ambiente/Foco explicitamente |
| 18–20/07 | `96d76a3`…`de1d7eb` | **Pivô 2** — Entregas ganha UX, protótipos, contrato COR | Entregas vira um produto com jornada própria |
| 20/07 | `INTEGRACAO_DELIVERYOS_COPILOTO.md` | Copiloto ainda dono de Calmo/Ambiente/Foco, mas "não conectado" | último documento em que a consciência aparece |
| **26/07** | `4335d16` | **Pivô 3** — `src/platform`, plataforma híbrida (Macro-Prompt 1) | começa a era da observabilidade |
| 27–31/07 | Unidades 1–5 | Android auth · contratos · ponte · Conference Brain · Copiloto shadow | *"ver e confiar"* — coerente com a Lei 11 |
| 01/08 | Unidade 6 | Product System, Figma, 4 superfícies | **a apresentação nasce na linguagem da observabilidade** |

**Onde a direção mudou de fato:** não no Pivô 1 (que preservou a consciência por escrito), nem no
Pivô 3 (que a Lei 11 autoriza). Mudou **entre 20/07 e 26/07**, quando o vocabulário cognitivo parou
de aparecer em qualquer artefato novo — e ninguém registrou essa perda, porque a memória de produto
já estava congelada desde 05/07.

---

## 5. Pontos de convergência (o que continua alinhado)

| Intenção | Estado atual | Evidência |
|---|---|---|
| "Nunca mente" (Lei 5) | preservado com rigor **acima** do original | `Campo<T>` sem campo `valor` quando não observado; ausência ≠ zero é trava de tipo |
| "Declara o que sabe, suspeita e não sabe" | preservado | 4 classificações (observado/inferido/contexto/evidência); 22 estados semânticos |
| "Nunca vigia nem pune" (Lei 4) | preservado | PII guard; sem ranking; `dados proibidos` respeitados |
| "O humano decide" (Lei 6) | preservado de forma **estrutural** | servidor sem rota de escrita; `requires_human` literal; zero botões no Copiloto |
| "Nunca grita lobo" (Lei 12) | preservado | confiança sem evidência não é apresentada; `partial` nunca vira `saudável` |
| "Memória nasce do trabalho" (Lei 1) | preservado | event log de fatos; nenhuma tela pede input |
| "Observabilidade antes de inteligência" (Lei 11) | **cumprido** | Unidades 1–5 são literalmente "ver → confiar" |
| Identidade visual TATÁ | preservada | verde profundo, creme, Spectral/Hanken/IBM Plex — cânone respeitado nas seções 01.x |
| "Dado incompleto aceitável, dado falso é veneno" | preservado | fixtures rotuladas; controle positivo ao lado de todo zero |

**Este bloco é grande e importa.** As leis mais difíceis de sustentar — honestidade, ausência,
não-vigilância, não-decisão — não só sobreviveram como ficaram **mais fortes** do que estavam. Isso
não é um projeto que perdeu o rumo por descuido.

---

## 6. Pontos de deriva

Cada item foi testado com evidência a favor **e** contra.

### D1 — Produto operacional inteligente → plataforma técnica segura
- **A favor:** 100% do esforço de 26/07 a 01/08 foi plataforma, contratos, isolamento e apresentação
  de estados internos. A capa do Figma mede o produto em "629 testes verdes". Nenhuma recomendação
  operacional foi produzida em nenhuma das 6 unidades.
- **Contra:** a Lei 11 exige exatamente essa sequência. As fundações são pré-condição real.
- **Veredito: DERIVA PARCIAL, majoritariamente autorizada.** O erro não é a sequência; é não haver
  nenhum marco declarando *quando* a fase de observabilidade termina e a de inteligência recomeça.
- **Impacto:** médio. **Quando:** 26/07. **Origem:** Macro-Prompt 1. **Natureza:** deliberada.

### D2 — Copiloto central → módulo secundário
- **A favor:** `PRODUCT_CONSTITUTION.md` diz que DeliveryOS **é** o Copiloto. Na Unidade 6 ele é 1 de
  11 itens de menu, no grupo "Entendimento", ao lado de Caixa. A rota inicial é `/entregas`.
- **Contra:** o Copiloto é o único módulo com selo `shadow` próprio e a única superfície com contrato
  de "nenhuma ação executada" — ele recebeu tratamento especial.
- **Veredito: DERIVA CONFIRMADA, de categoria.** Tratamento especial não compensa posição errada.
- **Impacto:** **alto**. **Quando:** 01/08. **Origem:** decisão de navegação da Unidade 6 (minha),
  sem validação. **Natureza:** acidental.

### D3 — Experiência orientada à decisão → coleção de dashboards
- **A favor:** a Operação Viva renderiza **9 cartões de dimensão** + tabela de viagens + 3 métricas.
  O Manifesto §11 proíbe nominalmente *"dashboards e grids de KPI"* e *"tabelas e listas de pedidos
  (a lista é a investigação travestida de produto)"*. Nenhuma tela mostra uma ação.
- **Contra:** as telas são de **leitura de estado do sistema**, e a Lei 2 permite "pull de escritório"
  fora da superfície operacional. Se forem lidas como painel de auditoria, não violam nada.
- **Veredito: DERIVA CONFIRMADA — por ambiguidade de propósito.** O material declara-se operacional
  (grupo "Agora", *"a navegação reflete o trabalho de quem opera"*, rota inicial Entregas), e nesse
  enquadramento viola o Manifesto diretamente. Nada no repositório o classifica como auditoria.
- **Impacto:** **alto**. **Quando:** 01/08. **Origem:** Unidade 6. **Natureza:** acidental.

### D4 — Consciência operacional → exposição de estados internos
- **A favor:** o que o Copiloto recomenda hoje é sobre a **fonte** ("leitura da Conferência
  incompleta", "10 campos que a fonte não fornece"). O usuário implícito virou quem constrói o
  sistema. `Calmo/Ambiente/Foco`: 0 ocorrências no código novo.
- **Contra:** essa é a única conclusão honestamente disponível, porque a cadeia não carrega pedido.
  Inventar recomendação operacional teria violado a Lei 5.
- **Veredito: DERIVA CONFIRMADA, mas como consequência, não como escolha.** A recusa foi correta; o
  erro foi **publicar isso como o produto** em vez de declarar o produto ainda ausente.
- **Impacto:** **alto**. **Quando:** 31/07–01/08. **Natureza:** acidental.

### D5 — Sistema vivo → catálogo de módulos
- **A favor:** 11 módulos em 3 grupos, 7 deles inexistentes e ainda assim ocupando navegação. O
  Manifesto §10 diz *"foco, não lista; a unidade da tela é a coisa que importa agora, não um inventário"*.
- **Contra:** os 7 futuros são marcados `PLANEJADO`, não têm dado e não aparecem na barra mobile —
  a honestidade foi preservada.
- **Veredito: DERIVA CONFIRMADA, de forma leve.** Honestidade não desfaz o efeito de inventário.
- **Impacto:** médio. **Quando:** 01/08. **Natureza:** acidental.

### D6 — Jornada do gerente → arquitetura de componentes
- **A favor:** "gerente" = **0 ocorrências** em `docs/figma/`, `docs/execution/` e `src/product/`.
  Os 13 documentos da Unidade 6 organizam-se por componente, token, estado e paridade — nenhum por
  jornada. Nenhum documento pergunta "o que a pessoa precisa decidir".
- **Contra:** `docs/entregas-design-audit/JOURNEY_COVERAGE.md` mapeia 20 jornadas (8 completas,
  7 parciais, 5 ausentes) — o trabalho de jornada **existe**, só é anterior e de outro módulo.
- **Veredito: DERIVA CONFIRMADA.** O patrimônio de jornadas existe e não foi consultado pela Unidade 6.
- **Impacto:** **alto**. **Quando:** 01/08. **Natureza:** acidental.

### D7 — Visão futura → representação das limitações atuais
- **A favor:** as telas são majoritariamente ocupadas por **o que não se sabe**: 5 campos de aparelho
  indisponíveis, capacidade não apurada, histórico ausente, 3 blocos de limitação por tela, 10 estados
  de ausência. A tela do Conference Brain é, em boa parte, uma explicação de por que ela está vazia.
- **Contra:** isso é a Lei 5 levada a sério, e é raro e valioso.
- **Veredito: DERIVA CONFIRMADA, e é a mais sutil.** A honestidade virou **conteúdo**. Um produto que
  passa mais pixels explicando lacunas do que entregando decisão inverteu o propósito, mesmo sem mentir.
- **Impacto:** médio-alto. **Quando:** 01/08. **Natureza:** acidental.

### D8 — Inteligência contextual → regras determinísticas estreitas
- **A favor:** 3 políticas de limiar simples substituíram um ranking por impacto físico
  (`unblock×2 + carga×0,5 + severidade`) calibrado contra 30 dias reais.
- **Contra:** o ranking original **não foi apagado**; continua em `decisao.js`, funcional. E as 3
  políticas novas nunca pretenderam substituí-lo — nasceram para provar a ponte.
- **Veredito: NÃO É DERIVA — é desconexão.** Nada foi perdido; duas coisas certas não foram ligadas.
- **Impacto:** alto se persistir; **reversível**. **Quando:** 31/07. **Natureza:** desconhecida
  (nenhum documento registra a decisão de não reusar `decisao.js`).

### D9 — Integração entre áreas → módulos isolados
- **A favor:** Entregas, Operação Viva, Brain e Copiloto são 4 telas separadas com 4 rotas.
- **Contra:** a cadeia técnica os integra de verdade (Op. Viva → adapter → Brain → Copiloto), e a
  tela do Brain mostra o par real/controle — há integração conceitual real.
- **Veredito: DERIVA PARCIAL.** Integrados por baixo, separados por cima. O usuário precisa de 4
  navegações para reconstruir uma cadeia que o sistema já conhece inteira.
- **Impacto:** médio. **Natureza:** acidental.

### D10 — Produto diferenciado → painel administrativo convencional
- **A favor:** shell com rail de navegação, seletor de unidade, breadcrumb, faixas de métrica,
  tabelas, badges de status. Estruturalmente, é a anatomia de um painel administrativo.
- **Contra:** a tipografia editorial, a paleta de sinal, o vocabulário de 22 estados e a recusa de
  ação são **anticonvencionais** e não existem em painel administrativo nenhum.
- **Veredito: DERIVA PARCIAL.** A **estrutura** convergiu para o convencional; a **linguagem** não.
  É um painel administrativo com alma de produto honesto — não é o "sentido que a operação passa a ter".
- **Impacto:** alto. **Quando:** 01/08. **Natureza:** acidental.

**Placar:** 6 derivas confirmadas · 3 parciais · 1 reclassificada como desconexão. Nenhuma é
irreversível, e nenhuma nasceu de descuido técnico.

---

## 7. Análise da arquitetura — serve, limita, protege ou define a visão?

| Decisão | Problema que resolvia | Ainda necessária? | Virou restrição de produto? | Reversível? | Veredito |
|---|---|---|---|---|---|
| **Modular monolith** | evitar complexidade distribuída cedo | sim | não | — | **protege** |
| **Crítico × assíncrono** | a rua não pode parar se o cérebro cair | sim | não | — | **protege** — é a Lei 8 em arquitetura |
| **Event log append-only (trigger no banco)** | memória que nasce do trabalho | sim | não | — | **serve** — é a Lei 1 em arquitetura |
| **Outbox transacional** | entrega confiável sem broker | sim | não | sim | **serve** |
| **Operação Viva como projeção de viagens** | reconstruir estado por replay | sim, como projeção | **SIM** — ocupou o nome do núcleo cognitivo | sim | **começou a DEFINIR a visão** |
| **Conference Brain** | modelo multidimensional de pedido | sim | parcialmente — introduziu vocabulário que vazou para a UI | sim | **serve, exposto indevidamente** |
| **Copiloto shadow** | provar a ponte sem executar nada | sim | **SIM** — "shadow" virou identidade em vez de fase | sim | **restrição temporária virando permanente** |
| **Store JSONL do Brain** | persistência simples e auditável | sim | não | sim | **serve** |
| **Contratos versionados** | fronteiras que não mentem | sim | não | — | **protege** |
| **Frontend vanilla** | não havia framework; evitar segundo frontend | discutível | leve — sem componentização real | sim | **serve hoje, revisar depois** |
| **Android** | captura de campo | sim | não | — | **serve** |
| **Cloud futura** | portabilidade | sim | não | — | **serve** |

### As duas decisões que precisam ser reinterpretadas

**1. "Operação Viva".** O nome pertence, por documento fundador, ao **núcleo de consciência**. Hoje
ele nomeia uma projeção de telemetria de viagens. Ou a projeção é renomeada (ex.: "Estado de
Viagens"), ou a Operação Viva reassume Calmo/Ambiente/Foco e a projeção passa a ser um insumo dela.
Manter os dois significados no mesmo nome garante que a confusão se repita.

**2. "Shadow".** Nasceu como **fase** ("ainda não executa, porque ainda não confiamos"). Na Unidade 6
virou **atributo permanente** do módulo, com selo próprio, e a documentação afirma *"não é uma
configuração que alguém pode desligar: é o que o subsistema é"*. Isso é uma restrição temporária que
já virou identidade — exatamente o padrão que esta auditoria foi pedida para procurar.

**Nada aqui pede microserviços, reescrita ou troca de tecnologia.** A arquitetura está certa. Ela só
está sendo **exposta ao usuário** — dimensões, ciclos, saúde de fonte, versões de contrato,
`run_id`/`cycle_id` na tela — e isso viola a régua *"a tela mostra a conclusão da investigação, nunca
a investigação"*.

---

## 8. Análise do Copiloto

### Visão inicial (reconstruída)

O Copiloto **é** o DeliveryOS: a camada que decide no que prestar atenção, quando calar e quando vale
interromper um humano. Relação com o gerente: *"se você olhar uma coisa agora, olhe isso"*. Relação
com os módulos: **nenhum domínio cria Foco** — todos fornecem fatos, e só a consciência decide.
Relação com decisões: elimina *"o que eu olho primeiro?"*, *"qual praça segura mais?"*, *"qual pedido
destrava mais saídas?"*. Relação com memória: ciclos de Resolução real viram Memória Operacional, e
nunca regra automática. Relação com ação humana: propõe uma ação imperativa de ≤4 palavras.
Conversação: **não existe nas fontes originais** — registrar como lacuna, não inferir.

### Copiloto atual

| Dimensão | Original (`decisao.js`) | Atual (`shadow.ts` + `conference-bridge.ts`) |
|---|---|---|
| Entrada | fotografia do minuto: situações + carga + composição | conclusões de saúde de fonte |
| Processamento | ranking por impacto físico calibrado | 3 políticas de limiar |
| Saída | ação imperativa ≤4 palavras + porquê + primeiro olhar + impacto | título descritivo + descrição + evidência + limitações |
| Sobre o quê | praça, pedido, motoboy, conferência | **a fonte de dados** |
| Estados | calmo / ambiente / foco / resolução | proposed / expired / dismissed / invalidated |
| Interface | bloco de foco dentro da experiência | rota `#/copiloto`, 4º item de menu |
| Interrupção | debounce, cooldown, teto, slot único | **não existe** |
| Validação | backtest 30 dias, 460 recomendações reais | 39 testes unitários |

### Respostas diretas

- **É fundação do produto desejado?** **Parcialmente.** A *forma* do registro serve: já carrega
  confiança, evidência, validade, limitação, procedência e exigência de humano — tudo o que o
  original pedia e mais. Falta a **função**: eleger uma tensão, decidir se interrompe, e calar.
- **É versão reduzida temporária?** **Sim, mas não está declarado como tal em lugar nenhum** — e é
  essa a falha. Nenhum documento diz "isto é um estágio; o Copiloto de verdade é outro".
- **É outro produto?** **Não.** É outra *camada* do mesmo produto: observabilidade da cadeia.
- **É só um componente técnico com o mesmo nome?** **Hoje, funcionalmente, sim** — e o nome é o
  problema, porque ocupa o lugar do produto inteiro sem exercer o papel dele.
- **Capacidades originais que permanecem possíveis:** todas. Ranking por impacto, foco único,
  debounce/cooldown, ação imperativa, memória de resolução — nada foi impedido pela arquitetura.
- **Capacidades eliminadas pela arquitetura:** **nenhuma identificada.**
- **Capacidades apenas não implementadas:** gestão de atenção (slot, debounce, cooldown, teto);
  recomendação sobre pedido (bloqueada por `order_id` não propagado — decisão D29, reversível);
  Resolução e Memória Operacional (declaradas conceituais desde 2026-07).

---

## 9. Análise das jornadas

Reconstruídas a partir do trabalho, não dos módulos. Cada uma testada contra o produto atual.

| # | Jornada | O que precisa saber | Dados existem? | Telas hoje | Termina em |
|---|---|---|---|---|---|
| 1 | Gerente abre no início do turno | "está tudo bem?" | sim (dimensões) | 1–2 | **informação** — não há resposta única |
| 2 | Operação começa a piorar | "o que mudou?" | **não** — sem histórico | — | **nada** |
| 3 | Vários sinais pequenos aparecem | "isto é um padrão ou ruído?" | parcial (severidade existe no motor, desligado) | — | **nada** |
| 4 | Erro de pedido | "o que aconteceu com o #X?" | parcial (Entregas tem `order_ref`) | 2 | informação |
| 5 | Tempo de entrega sobe | "quem está segurando?" | **sim, no motor desconectado** | — | **nada** |
| 6 | Problema com entregador/dispositivo | "o aparelho está mandando?" | **não** — sem rota de leitura (B5) | 1, e ela diz que não sabe | **declaração de ausência** |
| 7 | Cliente reclama | "o que sabemos deste pedido?" | não integrado | — | **nada** |
| 8 | Padrão recorrente em vários dias | "isto já aconteceu?" | **não** — Memória Operacional nunca construída | — | **nada** |
| 9 | Líder precisa de orientação | "o que digo à equipe?" | não | — | **nada** |
| 10 | Gerente sai do restaurante | "serei avisado?" | **não** — não há push, alerta nem canal | — | **nada** |
| 11 | Gerente volta no dia seguinte | "o que perdi?" | **não** — sem histórico | — | **nada** |
| 12 | "A ação de ontem funcionou?" | desfecho confirmado | **não** — Resolução nunca implementada | — | **nada** |

**Resultado: 0 de 12 jornadas terminam em compreensão.** Duas terminam em informação; uma termina
numa declaração honesta de ausência; nove não têm por onde começar.

**Jornadas essenciais não representadas em lugar nenhum:** #2 (degradação percebida ao longo do
tempo), #8 (padrão recorrente), #10 (ser avisado quando não se está olhando), #12 (o loop de
aprendizado). As quatro são exatamente o que diferenciaria o DeliveryOS de um painel — e as quatro
dependem de **Resolução** e **Memória Operacional**, declaradas conceituais desde 2026-07 e nunca
retomadas.

O Figma **não representa nenhuma dessas jornadas**. Ele representa 4 módulos e 10 estados.

---

## 10. Análise do Figma e do frontend como produto

Inspeção visual real (screenshots das páginas 00, 01.3, 01.4 e 02, e da aplicação rodando).

**O que está bom, e é bom de verdade:** a linguagem visual é coerente, editorial, calma e
anticonvencional. Os 22 estados semânticos com quatro canais (rótulo, glifo, padrão de borda, cor)
são um trabalho de acessibilidade acima da média do mercado. A tipografia Spectral/Hanken/IBM Plex
carrega personalidade. Não há neon, não há gradiente aleatório, não há gamificação.

**O que o produto comunica, medido por hierarquia visual:**

| Pergunta | Resposta observada |
|---|---|
| O Figma mostra o produto desejado? | **Não.** Mostra o *sistema de design* do produto e as capacidades já implementadas. |
| Mostra uma console técnica? | **Em parte, sim.** `run_id`, `cycle_id`, `conclusion_ref`, versões de contrato e `source_health` aparecem na tela. |
| A página inicial representa o papel do sistema? | **Não.** A capa mede o produto em *"629 testes verdes"*; a rota inicial da aplicação é uma lista de viagens. |
| Os módulos estão organizados segundo o trabalho humano? | **Parcialmente.** Os grupos (Agora/Entendimento/A casa) são bem pensados, mas nenhum nasce de uma jornada. |
| O Copiloto é experiência ou item de menu? | **Item de menu**, 4º de 11. |
| O design comunica inteligência ou estado? | **Estado.** Nenhuma tela conclui nada; todas descrevem. |
| Parece diferente de um painel administrativo? | **Na linguagem, sim. Na estrutura, não.** |
| Modo Calmo | **ausente** |
| Modo Ambiente | **ausente** |
| Modo Foco | **ausente** |
| Modo Degradado | **presente e bem resolvido** |
| Atenção soberana (uma coisa por vez) | **ausente** — todas as telas competem por atenção simultaneamente |
| Contexto e capacidade de explicar | **presente e forte** (evidência, procedência, limitação) |
| Capacidade de acompanhar / continuidade temporal | **ausente** |

**A observação mais dura, e ela é sobre a capa.** O arquivo de design do produto abre com quatro
cartões: "MACRO 1 · Concluído", "TESTES · 629 verdes", "PRÓXIMO · Field + Copilot Bridge", "MODO ·
Design conectado ao código". Nenhum deles é sobre a operação, o gerente, o pedido ou a noite de
sexta. A capa também usa fundo escuro e verde neon, **fora do cânone TATÁ** que as próprias seções
01.x do mesmo arquivo estabelecem (verde profundo sobre branco quente). O produto está se
apresentando para quem o constrói.

---

## 11. Análise da memória e dos prompts

### A memória preservou melhor o técnico — e isso é mensurável

| Item | `docs/execution/` (técnico) | Documentos de produto |
|---|---|---|
| Última atualização | 01/08 (hoje) | **05/07** (`Estado_Atual_DeliveryOS.md`) |
| Testes, commits, bloqueios, decisões arquiteturais | 165 evidências, 39 decisões, 31 lições | — |
| Intenção de produto, jornada, papel humano | **"gerente": 0 ocorrências** | 16 ocorrências nos fundadores |
| Roadmap vigente | Unidades 1→7 | um roadmap **diferente**, de 9 passos, congelado |

`Estado_Atual_DeliveryOS.md` §12 lista as próximas missões: *implementação da correção Motor×Decisão →
auditoria pós-correção → firedAt → Modelo de Resolução → Memória Operacional → Linguagem de Produto →
Linguagem Visual → Interface Cognitiva*. **Nada disso foi executado.** Em vez disso executou-se
plataforma, contratos, ponte, Brain, Copiloto shadow e Product System.

Pior: §10 desse mesmo documento diz, textualmente, *"Não criar design visual final, nem dashboard"* e
*"Não expandir funcionalidades antes de estabilizar atenção e decisão"*. A Unidade 6 fez as duas
coisas. **Não porque alguém desobedeceu** — mas porque esse documento deixou de ser lido: o
`CLAUDE.md` manda ler `docs/execution/`, e `docs/execution/NEXT_RESUME.md` nunca menciona
`Estado_Atual_DeliveryOS.md`. **Duas memórias oficiais, uma esquecida.**

Um detalhe que prova a desatualização: §11 afirma que a correção Motor×Decisão *"aguarda autorização"*.
Ela **foi implementada** no commit `37ca1c9`, no mesmo dia. A memória de produto está desatualizada
em relação ao próprio repositório desde o dia em que foi escrita.

### Momentos em que escopo foi reduzido ou restrição virou identidade

| Momento | O que aconteceu | Classificação |
|---|---|---|
| 05/07 → 12/07 | memória de produto congela; memória técnica assume | **erro de memória** |
| 20/07 → 26/07 | vocabulário cognitivo desaparece dos artefatos novos, sem registro | **erro de comunicação** |
| Unidade 4 (D29) | adapter não emite pedido — decisão **correta** (não havia identidade) | **decisão correta** |
| Unidade 5 | "shadow" passa de fase a identidade declarada do módulo | **restrição temporária → permanente** |
| Unidade 5 | Copiloto novo é construído sem consultar `decisao.js` | **erro de produto** (decisão de produto tomada sem validação) |
| Unidade 6 | navegação, hierarquia e rota inicial definidas sem jornada e sem validação | **erro de produto** |
| Unidade 6 | veredito `PRODUCT_SYSTEM_UNIT_COMPLETE` declarado | **erro de comunicação** — completude técnica anunciada como completude de produto |

**Sobre o último item, sem rodeios:** o relatório final da Unidade 6 afirmou "419 testes verdes" e
"nenhuma tela mostra dado real" — as duas coisas verdadeiras. Mas declarou a unidade **completa**
sem perguntar se o produto apresentado ainda era o DeliveryOS. Segurança e honestidade foram tratadas
como suficientes; **utilidade não foi avaliada**. Foi o modelo — eu — que tomou as decisões de
produto de maior impacto desta fase (o que é a home, onde fica o Copiloto, o que é um módulo) sem
marcá-las como decisões de produto que exigiam César.

---

## 12. Ativos que devem ser preservados

| Ativo | Classificação |
|---|---|
| Constituição, Leis Fundamentais, Manifesto | **preservar integralmente** — são a régua, e sobreviveram intactos |
| Event log append-only + trigger no banco | **preservar como infraestrutura** |
| Outbox transacional, idempotência, replay | **preservar como infraestrutura** |
| Runtimes crítico × assíncrono | **preservar como infraestrutura** |
| Contratos de evento versionados | **preservar integralmente** |
| PII guard, isolamento, `erroSeguro` | **preservar integralmente** |
| Autenticação de dispositivo Android + offline | **preservar integralmente** |
| `src/perfil-delivery/motor.js` + `decisao.js` | **preservar e REPOSICIONAR** — é o coração do produto, hoje desconectado |
| Backtest de 30 dias, 12 janelas reais, cardápio 199 itens | **preservar integralmente** — evidência insubstituível |
| Design System (tokens, 22 estados, acessibilidade) | **preservar integralmente** — é bom e é raro |
| Componentes `campo`, `metric`, `bloco-evidencia`, `bloco-limitacao` | **preservar e reposicionar** |
| `Campo<T>` (ausência ≠ zero) | **preservar integralmente** — é a Lei 5 em tipo |
| Conference Brain (núcleo multidimensional) | **preservar como infraestrutura** — não como tela |
| Copiloto: contrato de recomendação (evidência, validade, limitação, `requires_human`) | **preservar e reposicionar** |
| Copiloto: as 3 políticas de saúde de fonte | **preservar como infraestrutura** — vira health interno, não produto |
| Figma 01.1–01.4 | **preservar integralmente** |
| Figma 02 (telas) | **redesenhar** — depois de definir jornadas |
| Figma capa (00) | **substituir** — mede o produto em testes e está fora do cânone visual |
| Navegação de 11 módulos | **simplificar** |
| Superfícies dos 7 módulos futuros | **decidir depois** |
| `docs/execution/` | **preservar e reposicionar** — precisa carregar produto, não só técnica |
| `docs/Estado_Atual_DeliveryOS.md` | **preservar e atualizar** — é a memória de produto perdida |
| `JOURNEY_COVERAGE.md` e `docs/entregas-design/` | **preservar e reposicionar** — patrimônio de jornada não consultado |

**Nada nesta lista pede exclusão.** O trabalho técnico das seis unidades é sólido e, na maior parte,
infraestrutura correta para o produto certo.

---

## 13. Lacunas de evidência

Registradas como ausências, sem preenchimento por suposição:

1. **Não existe documento que registre a decisão de não reusar `decisao.js`** ao construir o Copiloto
   shadow. Não sei se foi deliberado, esquecido ou desconhecido.
2. **Não existe documento de intenção original para o Conference Brain.** Ele não aparece na
   Constituição, nas Leis, no Manifesto, no Modelo de Consciência nem no Mapa de Domínios. Sua origem
   é `deliveryos-copiloto-secure-bind-v1`, fora deste worktree.
3. **Não existe visão original documentada para CRM/Conversa como módulo.** O WhatsApp aparece como
   fonte de evidência, nunca como produto.
4. **Não existem os prompts originais** dos Macro-Prompts 1 e 2 no repositório. A intenção por trás
   dos pivôs de 26/07 só pode ser inferida pelos resultados.
5. **Não há registro de validação humana** das decisões de produto da Unidade 6 (home, navegação,
   posição do Copiloto).
6. **Não sei se o César viu as telas da Unidade 6.** Se viu e aprovou, várias "derivas acidentais"
   desta auditoria são na verdade decisões dele — e mudam de classificação.
7. **O Sprint Visual DeliveryOS V2**, declarado fonte visual canônica soberana, existe como `.zip` em
   `docs/design/canonical/`. Não foi aberto nesta auditoria; a conformidade visual foi avaliada contra
   os documentos derivados, não contra o cânone original.

---

## 14. Questões que somente César pode responder

Listadas aqui como itens de decisão; a versão em linguagem simples está no fim do documento.

1. O DeliveryOS **é** o Copiloto, ou o Copiloto é uma parte dele? (a Constituição de produto diz a primeira)
2. A superfície da Unidade 6 deveria ser o produto, ou um painel de auditoria para quem constrói?
3. As Unidades 1–6 foram uma mudança deliberada de rumo, ou uma fase de fundação dentro do rumo antigo?
4. `Estado_Atual_DeliveryOS.md` ainda é a memória oficial de produto, ou foi substituído?
5. Calmo/Ambiente/Foco continuam sendo o produto, ou foram abandonados?
6. O motor de 8 praças deve voltar a ser o núcleo, ou virou patrimônio histórico?
7. Quem é o usuário do que existe hoje: o gerente, ou quem constrói o sistema?

---

## 15. Opções de recuperação

Nenhuma é escolhida aqui.

### Opção A — Realinhamento leve (só narrativa e memória)
- **Muda:** a capa do Figma; um documento que declara a Unidade 6 como *painel de auditoria*, não
  como o produto; `Estado_Atual_DeliveryOS.md` atualizado; `NEXT_RESUME.md` passa a apontar para a
  memória de produto.
- **Permanece:** todo o código, todo o Figma 01.x e 02, toda a arquitetura.
- **Custo:** muito baixo (dias). **Risco:** baixo. **Reaproveitamento:** ~100%.
- **Resolve:** a confusão de propósito e a memória partida.
- **Permanece o problema:** o produto continua sem Calmo/Ambiente/Foco e sem jornadas.

### Opção B — Realinhamento de experiência
- **Muda:** nasce uma **superfície nova** — a home cognitiva (Calmo/Ambiente/Foco) — alimentada pelo
  `decisao.js` já existente. As 4 telas atuais viram a área de **diagnóstico**, acessível mas não
  inicial. O Copiloto deixa de ser item de menu e vira a própria home.
- **Permanece:** arquitetura inteira, Design System, componentes, contratos, Brain, testes.
- **Custo:** médio (semanas). **Risco:** médio — exige reconectar `perfil-delivery` à plataforma.
- **Impacto no Figma:** nova página de experiência; 01.x preservado; 02 reposicionado.
- **Reaproveitamento:** ~85%.
- **Resolve:** D2, D3, D4, D5, D10 e as jornadas 1, 3, 5.
- **Permanece o problema:** jornadas 2, 8, 11, 12 (histórico, padrão, memória) continuam sem base.

### Opção C — Realinhamento de produto
- **Muda:** B + implementação de **Resolução** e **Memória Operacional** (as duas peças declaradas
  conceituais desde 2026-07); propagação de `order_id` para destravar recomendação de pedido; decisão
  sobre o canal de aviso quando o gerente não está olhando.
- **Permanece:** toda a infraestrutura; o Brain vira consumidor de memória, não tela.
- **Custo:** alto (meses). **Risco:** alto — mexe em `ViagemAcumulada` e no contrato de eventos.
- **Reaproveitamento:** ~70%.
- **Resolve:** as 12 jornadas.
- **Permanece o problema:** depende de fonte real contínua (negociação iFood ainda aberta).

### Opção D — Reconstrução parcial da camada de apresentação
- **Muda:** descarta as 4 superfícies da Unidade 6 e o Figma 02; redesenha a partir das jornadas.
- **Permanece:** arquitetura, Design System, tokens, componentes, todo o backend.
- **Custo:** médio-alto. **Risco:** médio — descarta trabalho recente e correto.
- **Reaproveitamento:** ~75% (perde-se a camada de telas, não as fundações).
- **Resolve:** a estrutura de painel administrativo.
- **Permanece o problema:** sem B/C, redesenhar telas sem consciência reproduz o mesmo erro melhor
  desenhado.

---

## 16. Recomendação de próxima conversa

**Não abrir a Unidade 7.** A próxima conversa não deve ser de implementação — deve ser de decisão, e
tem uma pauta única: **onde mora a consciência do DeliveryOS, e o que aparece quando o gerente abre
o sistema.**

Sugestão de sequência para essa conversa:
1. César responde as perguntas do fim deste documento (30–40 min, sem tela aberta);
2. abrir a aplicação da Unidade 6 **junto com ele** e observar o que ele reconhece e o que não;
3. abrir o protótipo antigo (`tools/servir_v1.js`, o motor com Calmo/Ambiente/Foco) na mesma sessão,
   lado a lado — a comparação vai valer mais que qualquer documento;
4. só então escolher entre as opções A–D.

---

## 17. Ações que NÃO devem ser executadas ainda

- Não iniciar a Unidade 7.
- Não ampliar o B5 (rota de leitura do aparelho) — ele resolve um campo de tela, não o produto.
- Não apagar, reescrever ou "consertar" as superfícies da Unidade 6.
- Não reconectar `perfil-delivery` à plataforma antes da decisão de César.
- Não propagar `order_id` em `ViagemAcumulada` — é decisão de produto, não de adapter (D29 continua válida).
- Não tirar o Copiloto do modo shadow.
- Não redesenhar o Figma.
- Não atualizar `Estado_Atual_DeliveryOS.md` sem César — é a memória dele, não do modelo.
- Não implementar Memória Operacional nem Resolução (a proibição de 2026-07 continua de pé e continua certa).
- Não tratar nenhuma conclusão desta auditoria como autorização para construir.

---

## Tabela de rastreabilidade

| Afirmação | Fonte | Evidência | Explícita/Inferida | Confiança |
|---|---|---|---|---|
| DeliveryOS nomeia o módulo de consciência (Copiloto) | `docs/PRODUCT_CONSTITUTION.md` §1 | citação direta | explícita | **alta** |
| O produto é um sistema nervoso, não software de uso | `Manifesto` §1 | citação direta | explícita | **alta** |
| Métrica de sucesso = tempo sem olhar | `Manifesto` §6 | citação direta | explícita | **alta** |
| Proibido dashboard, grid de KPI, lista de pedidos | `Manifesto` §11 | citação direta | explícita | **alta** |
| 4 estados cognitivos com mecanismos medidos | `Modelo_Operacional_Consciencia` §1–7 | `DEBOUNCE/COOLDOWN/MAXFOCUS` citados e presentes em `motor.js:34` | explícita | **alta** |
| Foco = 4 linhas + sussurro, ação ≤4 palavras | `Camada_Decisao_Operacional` §"hierarquia oficial" | citação direta | explícita | **alta** |
| Operação Viva = único dono da decisão cognitiva | `Mapa_Mestre_Dominios` §2.1 | tabela "Calmo/Ambiente/Foco: único dono" | explícita | **alta** |
| Motor cognitivo existe e funciona | `src/perfil-delivery/motor.js:272` | `mode = inFoco?"foco":(inAmb?"ambiente":"calmo")` | explícita | **alta** |
| Correção Motor×Decisão foi implementada | commit `37ca1c9` (05/07) | diff com `dentroDoEscopo()` | explícita | **alta** |
| Memória de produto afirma que a correção está pendente | `Estado_Atual_DeliveryOS.md` §11 | contradição com `37ca1c9` | explícita | **alta** |
| Dois Copilotos, sem referência mútua | `grep` em `shadow.ts`, `conference-bridge.ts` | 0 ocorrências de `perfil-delivery` | explícita | **alta** |
| Calmo/Ambiente/Foco ausentes do código novo | `grep -rli` em `src/platform`, `src/product`, `src/conference-brain` | 0 arquivos | explícita | **alta** |
| Calmo/Ambiente presentes no legado | `grep -ro` em `prototipos/`, `app-v1/` | 48 ocorrências | explícita | **alta** |
| "gerente" ausente dos artefatos novos | `grep -rio` | `docs/figma` 0 · `docs/execution` 0 · `src/product` 0 | explícita | **alta** |
| Capa do Figma mede o produto em testes | screenshot nó `2:4` | cartão "TESTES · 629 verdes" | explícita | **alta** |
| Capa fora do cânone visual TATÁ | screenshot `2:4` vs. `DESIGN_TOKENS.json` | fundo escuro + verde neon vs. verde profundo/branco quente | explícita | média-alta |
| Copiloto é 4º de 11 no menu | `src/product/viewmodels/modulos.ts` | ordem e grupo | explícita | **alta** |
| 0/12 jornadas terminam em compreensão | análise cruzada §9 | dados ausentes por jornada | inferida | média-alta |
| Nenhuma capacidade original foi eliminada pela arquitetura | análise §8 | contrato de recomendação é superset do original | inferida | média |
| A deriva foi acidental, não deliberada | ausência de registro de decisão | lacuna de evidência #1 e #5 | inferida | **baixa-média** |

---

## Matriz intenção × estado atual

| Intenção original | Estado atual | Alinhado | Parcial | Desviado | Evidência |
|---|---|---|---|---|---|
| Sistema nervoso / propriocepção | plataforma observável com telas de estado | | | **✗** | §3, §10 |
| Nunca mente; declara confiança | trava de tipo + 22 estados + evidência obrigatória | **✓** | | | §5 |
| Ausência ≠ zero | `Campo<T>` sem `valor` quando não observado | **✓** | | | §5 |
| Nunca vigia nem pune | PII guard, sem ranking, dados proibidos respeitados | **✓** | | | §5 |
| O humano decide | servidor sem rota de escrita; zero botões | **✓** | | | §5 |
| Nunca grita lobo | confiança sem evidência não é apresentada | **✓** | | | §5 |
| Memória nasce do trabalho | event log append-only | **✓** | | | §5 |
| Observabilidade antes de inteligência | Unidades 1–5 | **✓** | | | §6 D1 |
| DeliveryOS **é** o Copiloto | Copiloto = 4º de 11 itens de menu | | | **✗** | §6 D2 |
| Calmo · Ambiente · Foco | ausentes de todo código e design novo | | | **✗** | §6 D4 |
| Uma atenção soberana, uma ação | 9 cartões + tabela + 3 métricas por tela | | | **✗** | §6 D3 |
| Foco = ação imperativa ≤4 palavras | título descritivo sobre saúde de fonte | | | **✗** | §8 |
| Proibido dashboard e lista | metric strips, tabelas, grids de cartão | | | **✗** | §6 D3 |
| Recuar quando tudo flui | não há estado de recuo; a tela é sempre densa | | | **✗** | §10 |
| Operação Viva = núcleo cognitivo | projeção de viagens com 9 dimensões | | | **✗** | §7 |
| Gerente como usuário central | 0 ocorrências nos artefatos novos | | | **✗** | §11 |
| Jornadas resolvidas | 0 de 12 terminam em compreensão | | | **✗** | §9 |
| Interface = consequência da inteligência | interface construída antes da inteligência ser religada | | **~** | | §7, §11 |
| Módulos futuros demarcados sem aprofundar | 7 módulos com lugar, ícone e visão; zero dado | **✓** | | | §6 D5 |
| Identidade visual canônica TATÁ | respeitada nas seções 01.x; **violada na capa** | | **~** | | §10 |
| Inteligência calibrada por dado real | 30 dias de backtest existem, desconectados | | **~** | | §6 D8 |

**Placar: 9 alinhados · 4 parciais · 10 desviados.** Os alinhados são as leis mais difíceis; os
desviados são quase todos sobre **experiência, foco e posição do Copiloto** — nenhum sobre integridade.

---

## Perguntas para o César

Sem jargão. Nenhuma respondida aqui.

1. Quando você imaginou o DeliveryOS pronto, o que aparecia na tela no momento em que **estava tudo bem**?
2. E no momento em que algo estava dando errado — o que você via primeiro?
3. Se o sistema pudesse te dizer **uma frase só** numa sexta-feira de pico, qual seria?
4. O "Copiloto" é o sistema inteiro, ou é uma parte do sistema? Quando você fala "DeliveryOS", você
   está falando dele?
5. Você abriu as telas que fizemos na última semana? O que você reconheceu ali, e o que te pareceu
   estranho ou de outro produto?
6. Aquela ideia de **Calmo, Ambiente e Foco** — ela continua de pé, ou você já não pensa mais assim?
7. O motor que a gente construiu antes, que escolhia uma praça e dizia "priorize duplas" — ele ainda
   é o coração da coisa, ou virou história?
8. Se o sistema nunca mais te desse um número, e só te dissesse **o que olhar agora**, isso seria
   melhor ou pior para você?
9. Quando você sai do restaurante, o que você quer que aconteça se a operação começar a piorar?
10. No dia seguinte, o que você quer saber sobre a noite anterior? Uma coisa só.
11. Você quer poder perguntar ao sistema *"aquilo que eu fiz ontem funcionou?"* — ou isso não importa?
12. O que é mais indispensável hoje: o sistema **saber** o que está acontecendo, ou o sistema **te
    avisar** quando importa?
13. Se você tivesse que jogar fora metade do que construímos para ter a outra metade funcionando de
    verdade na sua loja, qual metade você guardaria?
14. Existe alguma coisa que o sistema faz hoje que você acha que **não deveria** existir?
15. O que precisaria acontecer para você olhar para essa tela e pensar "isso mudou minha noite"?
16. Quem você imagina usando isso todo dia — você, o líder do turno, ou a equipe inteira?
17. Você prefere um sistema que fala pouco e você confia, ou um que mostra tudo e você confere?
18. Tem alguma coisa que você já me pediu e que você sente que sumiu no caminho?

---

*Auditoria analítica. Nenhum código, Figma, arquitetura ou memória executável foi modificado.*
