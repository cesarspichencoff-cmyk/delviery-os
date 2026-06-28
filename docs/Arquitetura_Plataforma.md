# DeliveryOS — Arquitetura da Plataforma (sistema operacional completo para delivery)

> ⚠️ **Revisado pelo Red Team** ([RedTeam_Arquitetura.md](RedTeam_Arquitetura.md)): o núcleo encolheu
> (Consumo e Maestro são projeções, não núcleo), o Cadastro passou a ser event-sourced (parte da História),
> e o vocabulário do delivery virou um *Perfil* (dado, não código). Leia este doc com aquelas 5 correções aplicadas.

> **Régua única:** isso respeita ou contradiz a tese?
> **Tese:** em operação de alta rotatividade e tempo real, memória que depende de **ato separado** morre.
> Só sobrevive a memória que nasce como **subproduto do trabalho**.
>
> Este documento responde às 12 perguntas da revisão de arquitetura. Objetivo: uma plataforma que
> aguente crescer por anos, **não** um ERP de módulos-ilha.

---

## Princípio organizador (a frase que governa tudo)

**O DeliveryOS entende o estado da operação e transforma cada evento natural em memória.**

Disso decorre, deduzido (não escolhido):
- Existe **uma única verdade operacional**: a **História** — log append-only de transições e asserções.
- Tudo o mais (estoque, custo, erro, SAC, equipe, financeiro, "parados agora") é **projeção** dessa História.
- Módulo **não é** um banco de dados próprio. Módulo é uma **leitura** (projeção) + opcionalmente um **emissor** de novos eventos canônicos. Nenhum módulo tem verdade privada.

É isto que impede o ERP-ilha: num ERP comum, cada módulo tem sua tabela-verdade e você gasta a vida "integrando" módulos. Aqui não há o que integrar — todos **dobram o mesmo log**.

---

## 1. Qual é a visão completa do DeliveryOS?

Um **sistema operacional para operações de delivery de alta rotatividade**: ouve o que a operação já emite, mantém o **estado** de cada unidade de trabalho (pedido, insumo, pessoa), e projeta desse estado tudo que a gestão precisa — em tempo real (proteger o modo produtivo) e acumulado (o corpus que vira ativo).

Não é um monitor do iFood. Não é uma tela. O iFood é **uma fonte**. "Parados Agora" é **a primeira superfície visível**. Por baixo existe uma **plataforma event-sourced** sobre a qual todos os módulos nascem do mesmo núcleo.

A ambição é a mesma do TATÁ House: módulos completos (estoque, compras, fichas técnicas, equipe, SAC, financeiro) — mas **derivados de um núcleo só**, não montados como peças soltas.

## 2. Quais são os módulos principais?

Agrupados por que **dimensão da verdade** eles projetam:

**Fluxo (o pedido no tempo)**
- Operação · Pedidos · **Parados Agora** (wedge)

**Matéria (o que é consumido/produzido)**
- Fichas Técnicas · Kits · Embalagens · Produção · Estoque · Compras · Inventário · Contagem · Perdas

**Desfecho (o que deu certo/errado)**
- SAC · Erros

**Gente**
- Equipe · Treinamento

**Valor**
- Financeiro · Relatórios

**Transversal (lê tudo, não escreve nada)**
- Maestro / Inteligência da Operação

Todos compartilham a mesma História e os mesmos Cadastros. Um módulo novo = uma projeção nova, **nunca** uma nova fonte de verdade.

## 3. O que pertence ao núcleo operacional?

O núcleo é **agnóstico de fonte e de vertical**. Ele conhece só 5 coisas:

1. **Ontologia canônica** — `Unidade · Dimensão · Transição · Asserção · História`.
   - *Unidade* = o que se rastreia (pedido, insumo, embalagem, pessoa, lote).
   - *Transição* = o átomo: uma unidade mudou de estado (de→para, quando, fonte, confiança, procedência).
   - *Asserção* = um fato declarado sobre o mundo (ex.: "contagem física de salmão = 8 kg às 22h").
   - *História* = log append-only de transições + asserções (a verdade).
2. **Log append-only replay-safe** (`logTransicoes.ts`) — dedup por `event_id` determinístico; nunca sobrescreve.
3. **Motor de projeção** — dobra a História em estados/visões (`projecoes.ts`).
4. **Cadastros (dimensões compartilhadas)** — Produtos, Insumos, Embalagens, Kits, **Fichas Técnicas**, Fornecedores, Unidades de medida, Pessoas. Dado de referência, definido uma vez.
5. **Motor de consumo (ficha técnica → BOM)** — explode item de pedido em consumo de insumos/embalagens.

O que **não** é núcleo: regras de fornecedor (vivem em adaptadores), telas, IA, e qualquer lógica que ramifique por vendor. Já é assim no código (`adaptadores.ts` concentra o iFood; o núcleo não sabe a origem).

## 4. O que pertence a cada módulo (resumo)

| Módulo | É projeção de… | Emite evento manual? |
|---|---|---|
| Operação / Pedidos / **Parados Agora** | transições de fluxo | não |
| Fichas Técnicas / Kits / Embalagens | **cadastro** (referência) | sim — cadastro (set-once) |
| Produção | transições de fluxo (interior, via impressora/KDS) | não |
| Estoque | consumo teórico + entradas + contagens | não (teórico); calibra com contagem |
| Compras | risco de ruptura + consumo + estoque | sim — registrar entrada (chegada) |
| Inventário / Contagem | asserções de contagem física | **sim — ato físico inevitável** |
| Perdas | variância (teórico × contado) | parcial (registrar perda conhecida) |
| SAC / Erros | transições de desfecho × comanda | não (derivado); SAC pode anexar |
| Equipe / Treinamento | atribuição + padrões de erro por posição | não (derivado de escala×posto×hora) |
| Financeiro | custo (consumo×preço) + venda | não (derivado); preços via cadastro |
| Relatórios | queries sobre a História | não |
| Maestro / Inteligência | **todas as projeções** | **nunca escreve** |

## 5. Como o pedido alimenta estoque, compras, produção, erros, SAC, equipe e financeiro

Um único pedido dispara uma **cascata de projeções** — sem ninguém preencher nada por pedido:

```
PEDIDO RECEBIDO ─▶ Operação, Pedidos
   │
ACEITO ─▶ [Ficha Técnica explode itens] ─▶ CONSUMO TEÓRICO
   │                                          ├─▶ Estoque (baixa teórica)
   │                                          ├─▶ Financeiro (custo, margem)
   │                                          └─▶ Compras (necessidade, risco de ruptura, sugestão)
   │
PRODUÇÃO / PRONTO ─▶ Produção, Parados Agora
   │
SAIU / ENTREGUE ─▶ Operação, Parados Agora, Financeiro (venda realizada)
   │
RECLAMOU / PROBLEMA ─▶ SAC, Erros
   │
ITEM FALTOU (derivado: desfecho × comanda) ─▶ Erros
                                              ├─▶ Estoque (possível divergência/perda)
                                              ├─▶ Equipe (atribuição por posição/turno)
                                              └─▶ Treinamento (indicação se padrão recorrente)
```
Eventos que **não** vêm do pedido (e por isso são manuais, ver §8): **CONTAGEM** física → Inventário/Perdas; **ENTRADA** de compra → Estoque/Compras/Financeiro.

O ponto: a **venda deixa de ser só "pedido recebido"**. Via ficha técnica, ela vira consumo, custo, margem, risco e sugestão de compra — tudo projeção, zero digitação por pedido.

## 6. Como funciona o motor de ficha técnica / consumo por pedido

**Ficha Técnica** = função pura: `item de pedido → [ {insumo|embalagem, quantidade, unidade} ]`. É cadastro (definido uma vez, ajustável).

Exemplo (cadastro):
- `Hot Roll` → arroz 80g, salmão 30g, cream cheese 20g, nori 1un, embalagem_hot 1, hashi 1, shoyu 1, etiqueta 1, lacre 1.
- `Temaki Salmão` → arroz 60g, salmão 40g, nori 1un, embalagem_temaki 1, …
- `Kit p/2` → hashi 2, shoyu 2, gengibre 2, wasabi 2.

**Explosão (BOM):** pedido aceito → para cada item × qtd → soma o consumo de insumos/embalagens → gera **asserções de consumo teórico** ligadas ao pedido. É projeção sobre `História × Cadastro`.

Disso saem, todos derivados:
- **consumo real estimado** (Σ por insumo, por turno/dia);
- **custo do pedido** (Σ qty × custo unitário do insumo no cadastro);
- **margem** (preço de venda − custo);
- **necessidade de reposição** e **risco de ruptura** (consumo teórico + ritmo vs estoque);
- **sugestão de compra** (projeção sobre fornecedor × lead time × consumo);
- **diferença previsto × contado** (a base de Perdas, §8).

O `normalizador.ts` atual (kit→hashi/shoyu/…, hot→hot, salmão) é a **semente** disto: hoje resolve "de que o pedido depende" (criticidade); a ficha técnica é a versão completa com **quantidades**.

## 7. Como o estoque é alimentado automaticamente pelos pedidos

O estoque tem **duas camadas, propositalmente separadas** (honestidade que a pesquisa já travou: "proibido 'restam N' sem contagem"):

1. **Estoque teórico (derivado, contínuo, grátis):**
   `saldo_teórico = contagem_inicial + entradas − consumo_teórico − perdas_registradas`.
   Atualiza sozinho a cada pedido aceito. Dá **ritmo, tendência, risco de ruptura, sugestão de compra**.
2. **Estoque físico (verdade real, periódica, manual):** vem da **contagem** (§8).

Sem contagem inicial não há nível real — só consumo acumulado/ritmo (exatamente o que o motor já faz hoje em `disponibilidade`). Com a contagem, o teórico ganha âncora e a **variância** (físico − teórico) vira o sinal mais valioso de **perda/erro/desvio**.

## 8. Onde haverá input humano inevitável (e por que está ok)

Dois — e só dois — tipos de input manual são legítimos, porque **não são "log por pedido"**:

1. **Cadastro (set-once, amortizado):** produtos, insumos, embalagens, kits, **fichas técnicas**, receitas, unidades, fornecedores, preços. Você preenche uma vez; serve milhares de pedidos. Não é memória de esforço — é **dado de referência**.
2. **Ato físico inevitável (a contagem/inventário):** o sistema **não consegue observar** o mundo físico (quanto salmão sobrou). A contagem é o trabalho, não um log paralelo.

O truque que mantém isto fiel à tese: a contagem **deixa de ser "preencher planilha"** e vira **"calibrar a verdade física contra a memória que o sistema já acumulou"**. O sistema já sabe o consumo teórico; a contagem só fecha a diferença. O ato manual é **minimizado ao irredutível** e seu valor **multiplica** (revela perda/erro). Memória de esforço morre; **calibração de uma memória que já existe, não**.

## 9. Como evitar que vire um ERP comum (as leis de arquitetura)

1. **Uma verdade só.** Event-sourcing: a História é a fonte única; módulos são projeções. Proibido módulo com tabela-verdade própria.
2. **LITMUS de todo dado:** ele existe porque **pedimos** ou é **exalado** por um ato que o operador já faz pelo cliente? "Só-porque-pedimos por pedido" = proibido.
3. **Módulo = projeção, não silo.** Adicionar módulo = adicionar uma leitura, não uma integração.
4. **Manual só no inevitável** (cadastro set-once; contagem física), e sempre como calibração, nunca como log paralelo.
5. **Núcleo agnóstico de fonte.** Nenhuma projeção ramifica comportamento por vendor; fonte é só metadado.
6. **Vocabulário mínimo e emergente.** Cresce da realidade; modelo canônico grande de antemão = proibido.
7. **Toda tela manual se justifica contra a tese ou é cortada.** "Prefiro matar 10 boas ideias a perder a simplicidade."
8. **Maestro consome, não decide.** A inteligência mostra o estado; quem decide é humano.

## 10. Como manter a tese mesmo com módulos completos

Distinguindo **três tipos de memória** (e construindo só os dois que sobrevivem):

| Tipo | Sobrevive? | Como aparece aqui |
|---|---|---|
| **Subproduto do trabalho** (evento já emitido) | ✅ vive | pedido, comanda, lacre, status iFood → transições automáticas |
| **Referência (set-once)** | ✅ vive (amortizada) | cadastros, fichas técnicas, preços |
| **Esforço por evento** (log/checklist/preencher por pedido) | ❌ morre | **proibido** — foi o que matou o log em 2025 |

A tese **não** é "zero input humano". É "**nunca exigir log separado por evento para sustentar a memória operacional**". Módulos completos respeitam isso desde que: o operacional seja byproduct, o de referência seja set-once, e o físico (contagem) seja inevitável + minimizado + transformado em calibração de alto valor.

## 11. Qual é a ordem correta de construção

Cada passo é uma **projeção sobre o mesmo núcleo**; o que toca o chão e o manual entram por último e minimizados.

0. **Núcleo (já existe)** — História + projeções de fluxo (Camada 0). ✔
1. **Wedge "Parados Agora" (ao vivo)** — encantamento; prova o núcleo na operação. *(precisa do feed iFood em tempo real)*
2. **Fichas Técnicas + Motor de Consumo** — cadastro + BOM. **Maior alavanca**: destrava estoque/compras/financeiro **a partir dos pedidos que já temos**, sem novo input de chão.
3. **Estoque teórico + Compras** (risco, sugestão) — projeções sobre consumo.
4. **Contagem / Inventário → Perdas** — o ato físico inevitável; a variância vira ouro.
5. **Erros / SAC enriquecidos + Equipe / Treinamento** — atribuição e padrões.
6. **Financeiro (custo/margem) + Relatórios** — projeções de valor.
7. **Maestro / Inteligência** — por último; lê tudo.

Princípio: **observabilidade antes de inteligência**; byproduct antes de manual; projeção antes de tela.

## 12. Como o "Parados Agora" se encaixa como wedge

É a **ponta do iceberg**, não o iceberg. Ele:
- é a **primeira superfície visível** — prova que o sistema reduz investigação, mata o "cadê?" e protege o modo produtivo (os achados #3/#4 dos 4 anos de chat);
- roda **sobre o mesmo núcleo** (História → estado → parados) que vai alimentar **todos** os outros módulos;
- por isso, **construí-lo certo = construir o núcleo certo**. Ele conquista adoção e confiança no chão enquanto a plataforma compõe valor por trás (estoque, custo, perdas, corpus).

O wedge entra primeiro **porque é o encantamento mais barato e mais fiel à tese**; a plataforma cresce atrás dele sem nunca virar ilha.

---

## Arquitetura técnica (camadas)

```
            ┌──────────────────────────────────────────────────────────┐
  FONTES ──▶│ ADAPTADORES  (iFood · impressora/KDS · SAC · manual)      │  traduzem sinal → evento canônico
            └───────────────┬──────────────────────────────────────────┘
                            ▼
            ┌──────────────────────────────────────────────────────────┐
            │ NÚCLEO  ·  HISTÓRIA (log append-only, replay-safe)         │  ← a ÚNICA verdade
            │          ·  CADASTROS (produtos, fichas, fornecedores…)   │  ← referência compartilhada
            │          ·  MOTOR DE PROJEÇÃO  +  MOTOR DE CONSUMO (BOM)   │
            └───────────────┬──────────────────────────────────────────┘
                            ▼  (projeções — read models)
   ┌──────────┬──────────┬───────────┬─────────┬────────┬───────────┬──────────┐
   │ Parados  │ Estoque/ │ Produção/ │ Erros/  │ Equipe/│ Financeiro│ Maestro/ │
   │ Agora    │ Compras  │ F.Técnica │ SAC     │ Treino │ /Relat.   │ Intelig. │  (lê tudo,
   └──────────┴──────────┴───────────┴─────────┴────────┴───────────┴──────────┘     não escreve)
        ▲ manual inevitável só aqui: CADASTRO (set-once) · CONTAGEM (ato físico)
```

**Resumo em uma linha:** um núcleo event-sourced (História + Cadastros + Projeção + Consumo), alimentado por adaptadores de fonte, sobre o qual cada módulo é uma projeção da mesma verdade — o "Parados Agora" é o primeiro wedge visível; estoque/compras/financeiro nascem da ficha técnica explodindo os pedidos que já temos; o manual existe só no cadastro e na contagem física, sempre como calibração, nunca como log por evento.
