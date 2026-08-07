---
lifecycle:
  artefato: docs/design/VISUAL_SOURCE_OF_TRUTH.md
  status: ACTIVE
  authority_scope: visual_canon
  superseded_by: null
  atualizado_em: "2026-08-07"
  state_basis: 953a3fb
  question_refs: ["Q-011"]
---

# Fonte visual canônica global — Ecossistema TATA

| Campo | Valor |
|---|---|
| Status | **CANÔNICO · IMUTÁVEL nesta versão** |
| Data de registro | 2026-07-20 |
| Worktree de registro | `deliveryos-entregas-v1` / `feature/entregas-v1` |

## Autoridade principal (Nível 1)

**Sprint Visual DeliveryOS V2**

- Arquivo original: `docs/design/canonical/deliveryos-visual-v2/Sprint Visual DeliveryOS V2 (1).zip`
- PDF de apoio: `Sprint Visual DeliveryOS V2.pdf` (mesmo pacote conceitual)
- Conteúdo extraído (somente leitura): `docs/design/canonical/deliveryos-visual-v2/extracted/`

Este arquivo **não é inspiração**. É a **fonte visual principal** de:

DELIVERYOS COPILOTO · ENTREGAS · SELECAO · shell · módulos futuros · desktop · mobile · estados · inteligência percebida.

## O que o cânone define (extraído do Pacote Visual V2)

> “DeliveryOS não muda de tela. Ele muda de consciência.”

- Superfície de **leitura editorial**, não painel  
- **Uma atenção soberana**, **uma ação**  
- Tipografia: **Spectral** (editorial) · **Hanken Grotesk** (interface) · **IBM Plex Mono** (técnico)  
- Fundo quente / creme · **verde Tatá** (ação / vivo) · âmbar (tensão operacional) · neutro tracejado (incompleto) · cinza-ardósia (falha técnica)  
- Confiança = **solidez** (cheio vs desbotado/tracejado/interrompido)  
- Silêncio visual quando nada exige atenção  
- Mobile-first · respiro generoso (escala 4px)  
- **Preservar:** fundo claro, verde, tipografia editorial, foco único, linguagem humana  
- **Remover (anti-padrões):** anel-medidor, cards Ambiente com barras/%, três colunas de Foco com repetição, texto técnico genérico, labels de simulador no produto  

## Níveis de referência (hierarquia)

Ver `VISUAL_REFERENCE_HIERARCHY.md`.

## Manutenção

- Arquivo ZIP original **imutável**  
- Evolução = **nova versão** canônica, nunca overwrite silencioso  
- Manifesto: `CANONICAL_VISUAL_MANIFEST.json`  

## Proibido

Reduzir o Sprint a paleta de cores · usar app-v1 como baseline · declarar parentesco só por hex iguais.

---

## Decisão de expressão — César, 2026-08-07 (`Q-011`, origem PB18)

> **Aditivo, não substitutivo.** Nada acima foi alterado. Esta seção estende a lista de anti-padrões
> e a lista do que o cânone define, com a decisão humana que encerrou a rejeição da expressão V4.
> O Nível 1 continua sendo o Sprint Visual DeliveryOS V2. Isto não cria autoridade nova: registra,
> na autoridade que já existia, o que a próxima exploração deve perseguir e o que não pode repetir.
> A rejeição de 2026-08-05 é fato; esta é a resposta dela.

### Rejeitado na expressão V4 — some da mesa

- cards e blocos empilhados;
- dashboard convencional;
- texto pequeno demais;
- grande vazio sem função;
- área tratada como widget;
- foco tratado como mais um card;
- aparência genérica de produto de IA.

### Direção aceita para a próxima exploração

- uma **superfície operacional viva**, não uma composição de painéis;
- **territórios e células** no lugar de cards;
- **topologia coerente com a operação real** — o desenho tem a forma do trabalho;
- **pressão representada espacialmente**, não por barra nem por número solto;
- **o foco transforma a superfície** em vez de ocupar mais um lugar nela;
- **o estado calmo respira sem parecer vazio** — silêncio com presença, não tela morta;
- **narrativa editorial premium**;
- **hierarquia tipográfica forte**;
- **movimento semântico, nunca decorativo**;
- **evidência não anima**;
- **validação humana junto da recomendação**, não em outra tela;
- **mobile com fluxo próprio**, nunca desktop comprimido.

### O que esta seção não faz

Não escolhe fonte · não altera a hierarquia de níveis · não promove o Lab V4 · não inicia redesenho ·
não abre Visual Excellence. A exploração é missão separada, e começa por aqui, não pelo código.
