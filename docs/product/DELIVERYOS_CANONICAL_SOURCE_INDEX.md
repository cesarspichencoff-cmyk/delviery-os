# Índice canônico do DeliveryOS — fonte de verdade do produto

> **Este arquivo é índice vinculante, não manifesto.** Ele não redefine o produto e não concorre com
> os documentos fundadores: ele diz **onde o produto está escrito**, **em que ordem manda** e **o que
> não pode ser redefinido em silêncio**.
>
> Criado em 2026-08-01 pelo `CHECKPOINT CANÔNICO DE REALINHAMENTO`, sobre HEAD `d7c28e8`.
> Origem: `docs/auditoria/DELIVERYOS_PRODUCT_REALIGNMENT_AUDIT.md` e
> `docs/auditoria/DELIVERYOS_SOURCE_OF_TRUTH_RECOVERY.md`.
>
> **Leitura obrigatória no início de qualquer sessão**, junto com `docs/execution/NEXT_RESUME.md`.

---

## 1. Por que este arquivo existe

Entre 05/07 e 12/07 de 2026, o produto do DeliveryOS parou de avançar porque três documentos
terminaram com perguntas objetivas para o César que nunca foram respondidas. **Nenhuma dessas
perguntas estava registrada como bloqueio.** `BLOCKERS.md` tinha lugar para Android, PostgreSQL,
Docker e backup — e nenhum lugar para bloqueio de produto.

Ao mesmo tempo, `CLAUDE.md` §11 manda ler quatro arquivos de `docs/execution/`, e **nenhum deles
referenciava a memória de produto**. Quem retomava o trabalho encontrava o estado técnico e não
encontrava o produto.

Este índice fecha as duas portas.

---

## 2. Ordem de autoridade

Quando dois documentos discordarem, **vence o de número menor**.

| # | Documento | Governa |
|---|---|---|
| 1 | `docs/Constituicao.md` | filosofia; sobrevive ao próprio DeliveryOS |
| 2 | `docs/Leis_Fundamentais.md` | 12 leis red-teamed; teste único de qualquer ideia |
| 3 | `docs/Manifesto_Produto_Design.md` | constituição do produto; emoção, proibições, assinatura |
| 4 | `docs/Modelo_Operacional_Consciencia_DeliveryOS.md` | como a consciência decide (Calmo/Ambiente/Foco/Resolução) |
| 5 | `docs/deliveryos/Mapa_Mestre_Dominios_DeliveryOS_V0_1.md` | plataforma, domínios e fronteiras |
| 6 | `docs/Mapa_Sinais_Operacionais.md` | **o que** o sistema percebe — os 22 sinais |
| 7 | `docs/Mapa_Ambientes_V1.md` | **onde** isso aparece — os 6 ambientes |
| 8 | `docs/Logica_Embalagens_DeliveryOS_V0.md` | regra física: sacola, quente/frio, caixa |
| 9 | `docs/Camada_Decisao_Operacional.md` | **como** prioriza — o Copiloto |
| 10 | `docs/Estado_Atual_DeliveryOS.md` | memória executiva de produto |
| 11 | `docs/PRODUCT_CONSTITUTION.md` | identidade e cânone visual do ecossistema TATÁ |
| — | *(abaixo desta linha: execução, não produto)* | |
| 12 | `CLAUDE.md` · `docs/execution/**` | contrato de trabalho e memória técnica |
| 13 | `docs/figma/**` | camada de apresentação da Unidade 6 |

**Regra:** um documento de execução (12) ou de apresentação (13) **nunca** revoga um documento de
produto (1–11). Se contradisser, é o documento de execução que está errado.

### 2.1 Ordem visual vinculante — obrigatória antes de qualquer interface, CSS ou Figma

Autoridade declarada em **`docs/design/VISUAL_REFERENCE_HIERARCHY.md`**, com
`docs/design/CANONICAL_VISUAL_MANIFEST.json` e `docs/design/VISUAL_SOURCE_OF_TRUTH.md`.

| # | Fonte | Papel |
|---|---|---|
| 1 | **Sprint Visual DeliveryOS V2** | autoridade principal; prevalece sempre |
| 2 | **Organismo Operacional V3.3** | implementação validada da mesma linguagem |
| 3 | handoffs e regras canônicas associados (estados técnicos, cor, pressão, mobile, motion) | contrato de aplicação |
| 4 | Design System atual (`docs/figma/**`, tokens) | produção e acessibilidade |
| 5 | `app-v1`, protótipos e demos antigos | **só** referência histórica ou comportamental |

**Nível 5 não pode definir a expressão visual final.** O acervo dos níveis 1–3 está inteiro em
`docs/design/canonical/deliveryos-visual-v2/extracted/` — inclusive
`DeliveryOS Organismo Operacional.dc.html`, que é a expressão canônica da home.

Esta seção existe porque a ordem falhou duas vezes: a Unidade 6 e o bloco R2 desenharam sobre o
Nível 5. Ver **PB9** e **L33**. Guarda executável: `npm run test:platform:visual-order`.

---

## 3. Decisões canônicas

Consolidadas das declarações do César e da documentação recuperada. **Não reabrir sem ele.**

### 3.1 DeliveryOS

- É a **plataforma operacional completa**: domínios, dados, interfaces, memória e ativos de inteligência.
- **Não é sinônimo de Copiloto.**
- Fonte: `Mapa_Mestre_Dominios` §1 · declaração de César (2026-08-01).

### 3.2 Copiloto

- É um **ativo operacional central dentro** do DeliveryOS.
- **Não** é banco de dados, plataforma inteira nem rede de informações.
- Atua sobre sinais e estados **já sustentados** — não coleta dado novo.
- **Dentro do Foco**, reduz a decisão e oferece orientação prática.
- A decisão operacional relevante **permanece humana** (Lei 6).
- O **motor original** (`src/perfil-delivery/decisao.js`) e o **Copiloto Shadow**
  (`src/platform/copiloto/`) são **ativos diferentes**, aparentemente complementares, e **não devem
  ser conectados** antes de decisão explícita (ver §7, C3).
- Fonte: `Camada_Decisao_Operacional` · declaração de César (2026-08-01).

### 3.3 Operação Viva

- É o **núcleo de consciência**.
- É a **única dona** de Calmo, Ambiente e Foco.
- **Nenhum outro domínio cria Foco diretamente.**
- A projeção atual de viagens chamada `operacao-viva.ts` **deve ser preservada**, mas representa
  **apenas uma camada menor** da definição original.
- A divergência de nome e responsabilidade **não é resolvida neste checkpoint**.
- Fonte: `Mapa_Mestre_Dominios` §2.1 · `src/platform/projections/operacao-viva.ts`.

### 3.4 Experiência operacional

- **Calmo não significa tela vazia.** Calmo é conclusão da consciência, com pulso vivo.
- A interface **continua fornecendo informações que simplificam o trabalho** mesmo em Calmo.
- **Todos os problemas relevantes permanecem visíveis.**
- Problemas mais urgentes recebem **maior destaque**.
- **Apenas uma orientação principal pode ocupar o Foco.**
- **Os demais sinais não desaparecem.**
- Verde/amarelo/vermelho dos ambientes **não substituem** Calmo, Ambiente e Foco — são camadas distintas.
- **Um ambiente vermelho nunca pode ficar escondido** (`Mapa_Ambientes` §10).
- Fonte: `Modelo_Operacional_Consciencia` §2-4 · `Mapa_Ambientes` §10-12 · protótipo original em
  execução · declaração de César (2026-08-01).

> **Nota que encerra uma leitura errada:** a primeira auditoria interpretou o Manifesto como
> "um foco por vez, esconde o resto". **Está errado.** A exclusividade de slot governa a **ação
> prescrita**, não a visibilidade. O protótipo original mostra três problemas ao mesmo tempo.


### 3.5 Confirmações canônicas do César — 2026-08-01

**Estas três questões estão ENCERRADAS. Não reabrir, não perguntar de novo.**
Elas não criaram produto novo: confirmaram a arquitetura já desenhada nos mapas originais.

#### Nomenclatura das praças — verificada contra o seed e o motor

| Praça (código) | Nome canônico | Ambiente |
|---|---|---|
| `combinados` · `duplas` · `enrolados` | Combinados · Duplas · Enrolados | **Sushi** (subáreas) |
| `enrolados_quentes` | **Sushi Quentes** | **Sushi** (subárea) |
| `cozinha_quentes` | **Cozinha / Quentes da Cozinha** | **Cozinha** |

**"Sushi Quentes" é praça/fluxo, não temperatura.** Os 11 itens de `enrolados_quentes` cobrem item
por item a lista do César: `Ceviche · Hot Roll · Hot Roll Tatá · Hot Roll com Shimeji · Tartar de
Salmão · Temaki Ebiten · Temaki de Salmão Skin · Tuna Shisô Tartar · Uramaki Ebiten · Uramaki Ebiten
Especial · Uramaki de Salmão Skin`. Tartar e ceviche são frios e pertencem ao grupo — o que confirma
que o nome descreve o fluxo operacional.

**Cozinha / Quentes da Cozinha:** pratos quentes e entradas produzidos pela cozinha (yakisoba e
equivalentes). No seed são 31 itens em `cozinha_quentes`. *Nota: "yakisoba" não existe no seed atual
— lacuna E2, já registrada, não bloqueante.*

> ⚠ **Defeito de rótulo a corrigir (ação R1):** `DISPLAY.cozinha_quentes = "Quentes"` exibe a
> **Cozinha** com o nome que o César usa para **Sushi Quentes**. Não implementar ambientes antes de
> corrigir. Não corrigido neste checkpoint — `motor.js` é núcleo.

#### Ambiente Sushi — alternativa B

Sushi é **ambiente geral**, com **Combinados, Duplas, Enrolados e Sushi Quentes visíveis como
subáreas**. O sistema pode dizer "Sushi carregado" **sem esconder** qual subárea está causando o
congestionamento.

#### "Só quentes" — sinal de roteamento

> **Significa que o pedido vem de lugares que não precisam passar pela área do Sushi.**
> O pedido **pode ser montado na bancada do caixa**; a equipe entende que não há dependência da praça
> Sushi; serve para **roteamento e simplificação da montagem**. Não é etiqueta de temperatura.
> **Não significa prioridade automática**, salvo regra canônica que a sustente.

Compatível com S12 do `Mapa_Sinais_Operacionais` (*"só pratos quentes, sem itens frios pendentes"*),
e mais específico: a fonte dizia "verificar se dá pra fechar"; o César especifica **o destino**.
A redação operacional a preservar é a do César.

#### Reclassificação das cinco restantes — nenhuma bloqueia a recuperação inicial

| Questão | Nova classificação |
|---|---|
| Amarelo × vermelho (limiar) | usar a **calibração real já existente** como ponto de partida e validar no piloto. O César não precisa inventar números antes de ver o comportamento |
| Caixa | apresentar como **`sem medição automática`** quando não houver fonte. **Nunca verde por ausência de dado** |
| Conferência | preservar **risco por pedido**; carga da área permanece `sem medição` enquanto não houver fonte |
| Duas sacolas | só afirmar **com motivo sustentado**. A heurística ampla (47–61%) **não é verdade operacional** |
| Histórico Odhen/Teknisa | **bloqueio de fonte externa**, não de arquitetura visual nem da recuperação do produto |

---

## 4. Patrimônio original que não pode ser redefinido em silêncio

### 4.1 Os 22 sinais — `docs/Mapa_Sinais_Operacionais.md`

Registro: 🟢 calmo (responde sempre) · 🌫️ ambiente (clima) · 🔶 foco (raro, acionável).
Disponibilidade: **[A]** iFood agora · **[C]** cardápio · **[K]** KDS/impressora · **[S]** SAC.

| Família | Sinais |
|---|---|
| Expedição / saída | S1 pronto sem sair · S2 saída lenta · S3 saiu sem entregar |
| Produção / praças | S4 produção travada · **S5 praça sobrecarregada** · S6 surto de zona · S7 pedido que trava a fila · S8 pedido simples adiantável · S9 prontos → bancada do caixa |
| Custódia | S10 "cadê o pedido" 🟢 · S11 quem fechou a sacola |
| Fechamento | **S12 só pratos quentes → fechável** · S13 pedido fechável · **S14 mais de uma sacola** |
| Cardápio / pausa | **S15 item deveria estar pausado** · S16 pedido com item pausado · **S17 risco de ruptura** · **S18 item com pico de venda** |
| Integridade / erro | **S19 faltou item / cliente reclama** · S20 observação especial / alergia · S21 bebida-sobremesa-kit |
| Demanda | S22 ritmo acima do normal |

**Os sinais que César nomeou nesta conversa já existem:** praça sobrecarregada (S5) · somente quentes
(S12) · duas sacolas (S14) · itens saindo rapidamente (S18) · necessidade de pausa (S15/S17) ·
cliente reclamando (S19) · pedido atrasado (S1/S3/S4).

**Abandonar um sinal exige César** (§6).

### 4.2 Os 6 ambientes — `docs/Mapa_Ambientes_V1.md` §1

**Caixa · Sushi · Quentes · Cozinha · Conferência · Motoboy.**
Nomeados pelo próprio César. Cozinha é ambiente **separado** de Quentes, a pedido dele.

Regras que acompanham e não se negociam sem ele:
- Verde = tudo fluindo · Amarelo = acompanhar · Vermelho = virou ou vai virar Foco.
- **Caixa e Conferência não são mensuráveis hoje** — entram como "sem medição", **nunca** como Verde
  inventado (`Mapa_Ambientes` §7, §14).
- Proibido no Mapa de Ambientes: tabela, gráfico, KPI, ranking, lista longa, painel gerencial.
- **Regra absoluta do próprio documento:** nenhum Mapa de Ambientes pode ser implementado sem a
  validação do César sobre os 9 pontos da §"Regra absoluta".

### 4.3 Regra física — `docs/Logica_Embalagens_DeliveryOS_V0.md`

- Quente de cozinha **nunca** mistura com frio na mesma sacola.
- Combinado é produto fechado.
- 6 causas de segunda sacola (§11).
- **Regra de ouro:** só sinalizar "duas sacolas" / "só quente" quando a regra for confiável **e** o
  pedido for identificável. *"Informação bonita, mas não acionável, não deve aparecer."*
- **Estado atual:** o motor usa a heurística `segundaSacola = combo ou ≥8 itens`, que atinge 47–61%
  dos pedidos — proxy, **não** a regra real. Ver §5, pergunta P3.

---

## 5. Perguntas antigas — classificação completa

Quatro documentos terminam com perguntas ao César. **São 32, não 24** — o quarto conjunto
(`Auditoria_Fonte_Viva_Loja_V1.md` §8) não havia sido catalogado pelas auditorias.

Estados: `respondida pelo documento` · `respondida por César` · `respondida pela implementação` ·
`duplicada` · `obsoleta` · `aberta e material` · `aberta, não bloqueia`.

| # | Pergunta original (resumida) | Fonte | Estado | Evidência | Decisão afetada |
|---|---|---|---|---|---|
| E1 | Fish Katsu × Chickenkatsu são o mesmo prato? | Embalagens §15.1 | aberta, não bloqueia | seed tem os dois | catálogo de itens |
| E2 | Yakisoba existe no cardápio? | Embalagens §15.2 | aberta, não bloqueia | ausente do seed | catálogo |
| E3 | "Shikentatsu" — qual prato? | Embalagens §15.3 | aberta, não bloqueia | grafia garbled | catálogo |
| E4 | Battera / Baterá — grafia correta | Embalagens §15.4 | obsoleta | grafia; não muda regra | exibição |
| E5 | Sashimi avulso existe? | Embalagens §15.5 | aberta, não bloqueia | só em combinado no seed | regra de caixa |
| E6 | Carpaccio de salmão — qual item? | Embalagens §15.6 | aberta, não bloqueia | seed só tem "Trufado" | regra de caixa |
| E7 | Padronizar grafias de alias? | Embalagens §15.7 | obsoleta | decisão de exibição | nomenclatura |
| E8 | "Duas sacolas": explicar a causa ou só sinalizar? | Embalagens §15.8 | **respondida por César** | *"justificativa baseada em dados; dicas práticas de atuação"* (2026-08-01) | formato do sinal S14 |
| A1 | Sushi = Combinados + Duplas + Enrolados frios? | Ambientes §13.1 | **aberta e material** | hipótese não validada | mapa praça→ambiente |
| A2 | "Quentes" é hot roll/tempura ou pratos da cozinha? | Ambientes §13.2 | **aberta e material** | colisão: `DISPLAY.cozinha_quentes = "Quentes"` | **bloqueia os 6 ambientes** |
| A3 | 5 itens que são "Quentes" | Ambientes §13.3 | duplicada (A2) | mesma decisão | idem |
| A4 | 5 itens que são "Cozinha" | Ambientes §13.4 | duplicada (A2) | mesma decisão | idem |
| A5 | Existe sinal digital de caixa atolada? | Ambientes §13.5 | **aberta e material** | §7: Caixa não modelada | ambiente Caixa existe ou não |
| A6 | Dá para saber conferência lotada? | Ambientes §13.6 | **aberta e material** | §5: só risco por pedido | ambiente Conferência |
| A7 | Amarelo × vermelho: pedidos ou minutos? | Ambientes §13.7 | **aberta e material** | sem limiar definido | limiar dos 6 ambientes |
| A8 | "Motoboy vermelho": pedidos ou minutos? | Ambientes §13.8 | duplicada (A7) | mesma decisão | idem |
| P1 | De onde vem o número de comanda da bancada? | Praça/Comanda §1 | **respondida pelo documento** | `Auditoria_Fonte_Viva` §10.3: a comanda ("Relatório de Entrega") **existe, é única** e traz os três campos — capturável no instante da impressão | fonte de identificação |
| P2 | Os 3 últimos da comanda são sequenciais? | Praça/Comanda §2 | duplicada (P1) | idem | idem |
| P3 | Existe fonte digital da comanda exportável? | Praça/Comanda §3 | **respondida pelo documento** | idem P1 — via fila de impressão do Windows (Epson TM-T20X confirmada) | viabilidade da boqueta |
| P4 | O que faz um pedido virar "duas sacolas"? | Praça/Comanda §4 | **aberta e material** | heurística cobre 47–61% | **substitui proxy por regra** |
| P5 | "Só quente" muda o que a equipe faz? | Praça/Comanda §5 | **aberta e material** | dado real (14–23%), ação indefinida | sinal S12 é acionável ou informativo |
| P6 | Multi-praça: mostrar a que segura ou todas? | Praça/Comanda §6 | aberta, não bloqueia | `I.benches` já existe | apresentação do foco |
| P7 | Que pedido vale "adiantar" no calmo? | Praça/Comanda §7 | aberta, não bloqueia | `pracaUnica` real | sinal S8 |
| P8 | Algum item está na bancada errada? | Praça/Comanda §8 | duplicada (A2) | auditoria achou 0 casos | mapa praça→ambiente |
| F1 | Pedido some do Odhen/Teknisa — fica gravado? | Fonte Viva §8.1 | **aberta e material** | define se a captura no instante da impressão é obrigatória | arquitetura de captura |
| F2 | Driver da impressora é padrão ou específico? | Fonte Viva §8.2 | aberta, não bloqueia | Epson TM-T20X já confirmada na fila | opção técnica de captura |
| F3 | Layout da comanda muda por tipo de pedido? | Fonte Viva §8.3 | aberta, não bloqueia | parser | robustez do parser |
| F4 | Reimpressão tem campo diferenciador? | Fonte Viva §8.4 | aberta, não bloqueia | `pedido_interno` repetido | anti-duplicação |
| F5 | Pedidos do Animo entram no mesmo Odhen? | Fonte Viva §8.5 | aberta, não bloqueia | cobertura de canal | escopo da fonte |
| F6 | "LETRA B" é padrão fixo de combinado? | Fonte Viva §8.6 | aberta, não bloqueia | detalhe de parser | parser |
| F7 | Gestor: cartões no HTML ou carga por rolagem? | Fonte Viva §8.7 | **respondida pela implementação** | o próprio doc diz que é resolvível por inspeção, sem César | opção de leitura do DOM |
| F8 | Gestor tem "exportar / ver todos"? | Fonte Viva §8.8 | aberta, não bloqueia | alternativa à rolagem | opção de leitura |

### Contagem

| Estado | Qtd |
|---|---|
| Respondida pelo documento | **3** (P1, P3, e F7 por implementação) |
| Respondida por César | **1** (E8) |
| Respondida pela implementação | **1** (F7, contada acima) |
| Duplicada | **5** (A3, A4, A8, P2, P8) |
| Obsoleta | **2** (E4, E7) |
| **Aberta e material** | **8** (A1, A2, A5, A6, A7, P4, P5, F1) |
| Aberta, não bloqueia a recuperação inicial | **13** |
| **Total** | **32** |

### As 8 materiais, consolidadas

| P | Pergunta | Já perguntada? | Destrava |
|---|---|---|---|
| ~~P1~~ | ~~"Quentes" é hot roll/tempura ou pratos da cozinha?~~ | **RESOLVIDA 2026-08-01** | ver §3.5 |
| **P2** | Uma área "amarela" e uma "vermelha": a diferença é em pedidos esperando ou em minutos? | sim — §20 Q6 | limiares de todos os ambientes |
| **P3** | O que faz um pedido virar "duas sacolas" na prática? | sim — §20 Q3 | substitui a heurística de 47–61% pela regra real (S14) |
| ~~P4~~ | ~~"Só quente" muda o que a equipe faz?~~ | **RESOLVIDA 2026-08-01** | ver §3.5 |
| **P5** | Existe sinal digital de que a **caixa** está atolada, ou só se vê no olho? | sim — §20 Q5 | se Caixa é ambiente ou "sem medição" |
| **P6** | Dá para saber que a **conferência** está lotada, ou só que um pedido é arriscado? | **não** | se Conferência é estação ou risco por pedido |
| ~~P7~~ | ~~Sushi = Combinados + Duplas + Enrolados?~~ | **RESOLVIDA 2026-08-01** | ver §3.5 |
| **P8** | Quando o pedido sai da tela do Odhen/Teknisa, ele fica gravado em algum lugar? | **não** | define se a captura na impressão é obrigatória |

**Não reapresentar as 32.** Quatro (P4, P6, P7, P8) ainda não foram feitas; as outras quatro já estão
com o César desde a auditoria de recuperação.

---

## 6. Decisões que exigem validação explícita do César

Nenhuma destas pode ser tomada por modelo, por conveniência técnica ou por inércia de implementação:

1. mudança da **home**;
2. mudança de dono de **Calmo, Ambiente ou Foco**;
3. mudança do **papel do Copiloto**;
4. **criação, remoção ou reorganização** de módulos visíveis;
5. alteração das **jornadas** de gerente, boqueta, caixa e atendimento;
6. mudança no **significado de um ambiente**;
7. **conexão entre os dois motores** do Copiloto;
8. **abandono de um sinal** original;
9. transformação de **tela técnica em experiência principal**;
10. mudança das **regras de pausa**;
11. mudança das **ações recomendadas**;
12. uso de **dado de funcionário** que possa ampliar vigilância (Lei 4).

**Decisões técnicas rotineiras que preservem estas regras não precisam interromper a execução.**

---

## 7. Conflitos conhecidos, ainda abertos

| # | Conflito | Fontes em choque | Quem resolve |
|---|---|---|---|
| C1 | Ambiente pode carregar orientação de ação? | César quer "dicas práticas" nos secundários × `Modelo` §3 e `Mapa_Ambientes` §11 proíbem bloco de ação em Ambiente | César |
| C2 | Quem é "Operação Viva": núcleo cognitivo ou projeção de viagens? | `Mapa_Mestre` §2.1 × `operacao-viva.ts` | César |
| C3 | Qual motor é dono da atenção? | `decisao.js` × `shadow.ts` — ligar sem decidir recria o defeito corrigido em `37ca1c9` | César |
| C4 | "Quentes" = hot roll ou cozinha? | César × `DISPLAY.cozinha_quentes = "Quentes"` | César (P1) |
| C5 | Caixa e Conferência sem dado podem aparecer? | César quer ver × `Mapa_Ambientes` §7 proíbe verde inventado | César (P5, P6) |
| C6 | "Duas sacolas": heurística ou regra? | motor × `Logica_Embalagens` §11 | César (P3) |
| C7 | CRM, Evolução, Treinamento, RH, Gestão são módulos do DeliveryOS? | Unidade 6 × `Mapa_Mestre` (não existem) | César |
| C8 | Notificação fora da tela é permitida? | jornadas 15/16 × Manifesto §4 | César |

---

## 8. Telas técnicas × telas operacionais

Classificação das superfícies da Unidade 6 (`src/product/ui/surfaces/`, Figma página `02`):

| Superfície | Classificação | Regra |
|---|---|---|
| Design System, tokens, 22 estados, componentes (`campo`, `metric`, evidência, limitação) | **componentes reaproveitáveis** | preservar integralmente; servem à experiência original |
| Entregas | **superfície operacional de aprofundamento** | **não** é a home; virou home por ser a primeira implementada, não por decisão |
| Operação Viva (9 dimensões) | **superfície técnica de aprofundamento** | é telemetria, não consciência |
| Conference Brain | **console de inspeção e auditoria** | **não** deve ser apresentado como jornada principal da operação |
| Copiloto Shadow | **console de inspeção e auditoria** | **não** representa sozinho a experiência completa do Copiloto |
| 7 módulos futuros | **placeholder de navegação** | 5 deles (CRM, Evolução, Treinamento, RH, Gestão) não têm origem documental — ver C7 |
| Capa do Figma (nó `2:4`) | **substituir** | **não pode medir o valor do produto principalmente por quantidade de testes** |

**Nenhuma delas é substituta da home operacional original.**

---

## 9. Protótipo original — referência recuperada da experiência

`tools/serve_prototipo.js` · config `prototipo` em `.claude/launch.json` · porta 5178.
Executado e verificado em 2026-08-01:

```
DELIVERYOS            18:04
em fluxo                              ← CALMO nomeado
Duplas carregando                     ← AMBIENTE (rótulo 1)
Combinados acima do normal            ← AMBIENTE (rótulo 2)
ATENÇÃO / QUENTES EM RISCO            ← FOCO (situação)
→ liberar prontos pra bancada         ← FOCO (ação)
2 em andamento                        ← PULSO
REPLAY 12/06 · COMPOSIÇÃO SINTÉTICA   ← procedência declarada
```

Medição do DOM: **16 elementos com texto · 0 tabelas · 0 menus · 0 botões · 0 links · sem scroll.**

**Mostra Calmo, Ambiente, Foco e pulso simultaneamente. Não esconde problemas secundários.**
A interface principal **não deve começar por tabelas, saúde interna ou estrutura de módulos.**
O comportamento é canônico mesmo onde os nomes posteriores não forem.

---

## 10. Documentos históricos e de apoio

| Documento | Papel |
|---|---|
| `docs/Decisao_Correcao_Motor_Decisao.md` · `docs/Relatorio_Pos_Correcao_Motor_Decisao.md` | correção Motor×Decisão — **implementada** em `37ca1c9` (05/07) |
| `docs/Contrato_Motor_Decisao.md` | contrato entre atenção e ação |
| `docs/Medicao_Divergencia_Motor_Decisao.md` | 30,8% de troca proibida, medido |
| `docs/Auditoria_Fonte_Viva_Loja_V1.md` | fontes reais da loja; comanda; boqueta |
| `docs/Arquitetura_Sincronizacao_Local_V1.md` | como rodar na loja |
| `docs/Auditoria_Praca_Comanda_Atencoes_V1.md` | viabilidade medida das Atenções Leves |
| `docs/Estudo_Conversas_WhatsApp.md` | 4 anos de operação real |
| `docs/entregas-design-audit/JOURNEY_COVERAGE.md` | 20 jornadas de Entregas (8 completas, 7 parciais, 5 ausentes) |
| `docs/RedTeam_Modelo_Operacional_Consciencia.md` | ataque ao modelo de consciência |
| `docs/auditoria/DELIVERYOS_PRODUCT_REALIGNMENT_AUDIT.md` | primeira auditoria de deriva |
| `docs/auditoria/DELIVERYOS_SOURCE_OF_TRUTH_RECOVERY.md` | recuperação da fonte de verdade |

### Conceitos declarados conceituais — nunca implementar sem sequência

| Conceito | Fonte | Estado |
|---|---|---|
| **Resolução** | `Modelo` §7 | parcial (o foco é limpo; o motivo não é registrado) |
| **Memória Operacional** | `Modelo` §8 | conceitual — exige medir sinal antes (dívida 5 de `Estado_Atual` §9) |
| **Evolução** | — | **não existe em fonte original**; apareceu como módulo na Unidade 6 |

`Estado_Atual_DeliveryOS.md` §10 continua válido: *"Não implementar Memória Operacional nem Resolução
formal."* A proibição está certa e permanece.

### Fontes ainda não examinadas

1. `docs/design/canonical/deliveryos-visual-v2/*.zip` — Sprint Visual V2, declarado cânone visual
   soberano por `PRODUCT_CONSTITUTION.md` §2. **Nunca aberto.**
2. Worktree `deliveryos-copiloto-v33-implementation` — "implementação validada do Copiloto", nível 2
   da hierarquia visual. Fora deste repositório.

---

## 11. Como usar este índice

- **Início de sessão:** ler este arquivo e `docs/execution/NEXT_RESUME.md`. Se a missão tocar
  produto, experiência, home, Copiloto, sinais ou ambientes, ler também os documentos 1–11 da §2.
- **Antes de propor qualquer tela:** conferir §3.4, §4 e §8.
- **Antes de escrever a primeira linha de CSS ou abrir o Figma:** ler **§2.1** e
  `docs/design/VISUAL_REFERENCE_HIERARCHY.md`. Se a direção visual vier de um Design System
  encontrado no código, ou de `app-v1`, ela está vindo do nível errado — parar e voltar ao Nível 1/2.
- **Antes de qualquer decisão da lista §6:** parar e perguntar ao César.
- **Ao encontrar uma pergunta de produto sem resposta:** registrá-la em
  `docs/execution/BLOCKERS.md`, seção **BLOQUEIOS DE PRODUTO E DECISÕES HUMANAS** — nunca deixá-la
  apenas no corpo de um documento.

*Índice vinculante. Não redefine o produto; aponta onde ele está escrito.*
