# Esquema do Modo de Mapeamento — Sprint 2.1 (privacidade corrigida no Sprint 2.2)

`src/conference-brain/live/mapping-mode.js` — evolução da Fase 14 do Sprint 2.
Continua **somente leitura**: nunca executa ação no portal, nunca clica, nunca
muta, nunca persiste HTML bruto, nunca extrai valor de atributo que pareça PII.

> **Correção de privacidade (Sprint 2.2, bloqueador 1):** até o Sprint 2.1, a
> sanitização de texto curto (`candidateStatusTexts`/`candidateActionLabels`)
> era por BLOCKLIST — só rejeitava texto contendo palavras como
> "telefone"/"nome". A rechecagem independente provou que um nome de pessoa
> real ("Joao Silva") passava direto, por não conter nenhuma palavra
> proibida. Corrigido para ALLOWLIST em `live/pii-guard.js`: só passa
> literalmente o que bate com vocabulário funcional conhecido (os mesmos
> padrões usados para mapear as dimensões); qualquer outro texto vira
> `{redacted:true, text_category, text_length, text_hash}` — nunca some
> (perderia sinal estrutural), nunca aparece bruto. Ver
> `docs/conference-brain/LIVE_VALIDATION_V1.md` §8.

## 1. O que a assinatura estrutural captura agora

Além dos candidatos genéricos do Sprint 2 (contagem de `div`/`table`/`badge`/
`card`/`button`, nomes de classe, textos curtos de status), o Sprint 2.1
adiciona `functional_candidates`:

| Categoria | Função | O que procura |
|---|---|---|
| Modo de layout | `candidateLayoutModeHints` | tokens "expedição"/"quadros"/"kanban" em classe ou rota sanitizada |
| Colunas | `candidateColumnHints` | nomes de classe com `column`/`coluna`/`lane`/`board-` |
| Ações | `candidateActionLabels` | texto de `<button>`, sanitizado por allowlist (`pii-guard.js`) — nunca texto bruto que não bata com vocabulário conhecido |
| Tags de tempo | `candidateTimeTags` | `"N min"` perto de classe `tag`/`time`/`tempo` |
| Sinais logísticos/agrupamento/agendado/loja/QR | `candidateSemanticHints` | vocabulário conhecido (entregador, agrupado, agendado, loja aberta/fechada, QR code) |
| Seletor de unidade | `candidateUnitSelectorHints` | vocabulário de troca de loja/unidade |
| Modais/chat/notificação | `candidateOverlayHints` | o que pode cobrir a lista de pedidos |
| Acessibilidade | `candidateA11yAttributes` | só NOMES de `role`/`aria-*` — nunca o valor (pode ter PII) |

Tudo isso entra na assinatura (`stable_signature`) e portanto no `hash` — a
assinatura agora reage a mudança de modo/coluna/ação, não só a card/badge
genéricos (testado: `assinatura reage a mudanca de modo/coluna/acao`).

## 2. O que continua igual

- nunca persiste HTML bruto (`persists_no_html: true`);
- `pii_like_attributes_flagged` continua sinalizando presença sem extrair valor;
- `signaturesMatch(a, b)` continua comparando duas capturas para detectar
  mudança de layout;
- roda igualmente sobre HTML real (relatório histórico do Sprint 1) e sobre
  HTML sintético de teste — a diferença é só a fonte da string.

## 3. Como isto alimenta uma sessão supervisionada futura

Nenhuma destas funções escolhe um seletor sozinha. Elas produzem **candidatos**
— nomes de classe, contagens, textos curtos — para um humano confirmar contra
a tela real e preencher a configuração de seletores do adaptador
(`live/browser-adapter.js#extractCycleObservation`, parâmetro `selectors`).
O comando exato para essa sessão está em `LIVE_VALIDATION_V1.md` §4 (não
executado nesta missão).

## 4. Limitação explícita

Testado contra o único HTML real disponível neste ambiente — o relatório de
composição do Sprint 1, que é um **documento diferente** da tela de gestão de
pedidos (é um export de relatório, não o Gestor ao vivo). Contra esse HTML,
`functional_candidates` retorna tudo vazio/`false` — resultado correto e
honesto (o relatório realmente não tem esse vocabulário), não uma falha da
função. A prova de que as funções DETECTAM o vocabulário quando ele existe
está nas fixtures sintéticas de `tests/conference-brain/multidimensional-model.test.js`.
