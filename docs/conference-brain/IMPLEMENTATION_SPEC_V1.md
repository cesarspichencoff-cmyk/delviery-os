# Especificação técnica executável — Cérebro Operacional da Conferência V1

> Estado: **Sprint 1 implementado, em modo sombra, atrás de flag desligada em produção.**
> Branch: `feature/conference-brain-foundation-v1` · base `52611dd` · **7 commits**
> (`00b5728` contratos/modelo/flags · `e701041` ingestão/normalização/dedup ·
> `9c836a1` snapshots/estado sombra · `db86879` composição · `ebe781c` testes ·
> `6015ff4` correção do parser + validação · `32ca889` documentação).
> Este documento descreve o que **existe e roda**, não o que se pretende construir.
> Cada afirmação aqui pode ser conferida por arquivo, teste ou comando.

---

## 1. O que este cérebro é

A Conferência é a última etapa antes do pedido sair. É onde o erro fica caro:
depois dela não há revisão. O cérebro existe para responder **uma** pergunta —
*a Conferência está conseguindo dar conta agora?* — e para responder de forma
que a resposta possa ser conferida a olho.

O que ele **não** é: score, ranking, índice, atribuição de culpa, sistema de
movimentação de pessoas. Nada disso existe no código, e há teste travando cada
uma dessas ausências.

## 2. A decisão de produto que governa a V1

A leitura da Conferência é guiada por cinco sinais **observáveis**:

| Sinal | Como é medido | Onde vive |
|---|---|---|
| pedidos ativos | contagem de recebidos ainda não prontos/concluídos | `snapshots/engine.js` |
| convergência temporal | quantos ficaram prontos **na mesma janela** | `snapshots/engine.js` |
| ritmo de entrada/conclusão | entrada × conclusão por janela, e janelas seguidas piorando | `computeRhythm` |
| tempo interno até pronto | média da janela contra a média recente da própria operação | `computeRhythm` |
| prontidão da abertura | contexto do turno (entra no Sprint 2) | contrato pronto, sem fonte |

**A composição do pedido NÃO controla o estado global na V1.** Ela é contexto:
ajuda a conferir, evita erro, alimenta catálogo e treinamento. O contrato é
explícito no retorno — `affects_global_state: false` — e travado por teste.

## 3. Faixas de carga

```
< 30   calmo
30–49  fluindo
50–69  atencao
>= 70  urgencia
```

Regra igualmente obrigatória: **as faixas não operam sozinhas.** Atenção também
ocorre abaixo de 50 quando há convergência forte, ritmo piorando, entrada acima
da saída, tempo até pronto crescendo ou prontidão reduzida. Isso não é um peso
somado — são modificadores nomeados, cada um com sua razão legível.

Piso de segurança: um modificador só promove para `atencao` a partir de
`attention_floor_active = 20` pedidos ativos. Sem esse piso, uma noite de 6
pedidos com 8 prontos juntos viraria "atenção" — o que seria ruído, não sinal.

## 4. Arquitetura

```
fonte (adaptador)
   │  observe()            linhas brutas, sem interpretação
   ▼
ingestão  ──────────────►  ingestion_raw_records  (L0, com hash)
   │  normalizeRow()
   ▼
normalização  ─────────►   orders · order_items · order_status_events
   │  deduplicate()
   ▼
snapshots (janela 5/10 min)  ─────►  operational_snapshots
   │
   ▼
estado sombra  ─────────►  conference_state   (mode: "shadow", sempre)
   │
   └── composição (paralela, contexto do pedido, nunca entra no estado)
```

Camadas puras (sem I/O): normalização, snapshots, estado sombra, composição.
Camadas com I/O: adaptadores (leem arquivo local) e store (JSONL).

### Arquivos

| Caminho | Papel |
|---|---|
| `src/conference-brain/contracts/states.js` | estados da FONTE × estados da CONFERÊNCIA, separados |
| `src/conference-brain/contracts/rule-version.js` | toda regra com id, versão, data, fonte, modo, reversão |
| `src/conference-brain/contracts/schemas.js` | 9 entidades, chave natural, campos proibidos (PII) |
| `src/conference-brain/storage/store.js` | JSONL append-only, idempotente, nunca lança |
| `src/conference-brain/normalize/normalizer.js` | bruto → vocabulário do DeliveryOS |
| `src/conference-brain/normalize/dedupe.js` | resolução de duplicidade com divergência registrada |
| `src/conference-brain/ingestion/pipeline.js` | os 7 contratos de ingestão |
| `src/conference-brain/ingestion/adapters/*` | histórico HTML · payload estruturado |
| `src/conference-brain/snapshots/engine.js` | janelas e ritmo |
| `src/conference-brain/shadow/conference-state.js` | estado sombra explicável |
| `src/conference-brain/composition/hints.js` | sinais pontuais de composição |
| `src/conference-brain/flags.js` | feature flags |
| `tools/conference-brain/validate-historical.js` | validação executável contra dados reais |

## 5. Princípios travados por teste

1. **Carimbo ausente é ausência declarada, nunca estimativa.** Quando a fonte não
   observa `ready_at`, `active_orders` e `convergence` vêm `null` e a janela é
   marcada `fonte_nao_observa_pronto:...`. O estado vira `leitura_parcial` — nunca
   `calmo`. Fingir calma sobre cegueira seria a pior falha possível neste produto.
2. **Modo sombra é estrutural, não configuração.** `mode: "shadow"` é escrito
   direto no objeto de saída; `automaticDecisionsEnabled()` devolve `false`
   hardcoded, sem ler ambiente. Não existe flag que promova sombra a oficial.
3. **Sem PII.** `FORBIDDEN_FIELDS` rejeita nome de cliente, telefone, endereço,
   CPF, e-mail e texto de mensagem no momento da validação do registro.
4. **Sem ranking de pessoas.** Não existe entidade, campo ou cálculo por
   funcionário em nenhum ponto da fundação.
5. **Toda regra é reversível.** `defineRule` exige `id`, `version`, `date`,
   `source` e aceita `supersedes`/`revertTo`. Regra sem procedência não compila.
6. **Dinheiro inválido vira `null`, nunca `0`.** Zero é um valor; ausência não é.

## 6. O que foi deliberadamente NÃO implementado

Cada item abaixo foi pedido para ficar de fora, e ficou:

- score opaco de qualquer natureza;
- ranking de funcionários;
- atribuição de culpa;
- movimentação automática de pessoas;
- peso definitivo de complexidade por prato;
- uso direto do campo genérico `risco_de_erro: alto` do seed — 46% do cardápio
  o tem; usá-lo cru faria metade do menu gritar;
- percentual de atraso do iFood como verdade operacional principal — o número é
  contaminado pelo tempo prometido configurado na plataforma;
- fórmula composta de composição;
- `montagem_outros` como relógio ou carga total da Conferência. A praça contém
  apenas Gengibre, Gohan, Sunomono, Tarê e Wasabi: pode ser contexto de itens
  externos, jamais medida completa.

## 7. Como executar

```bash
# testes da fundação
node --test tests/conference-brain/*.test.js

# validação contra os dados históricos reais (sai != 0 se algo divergir)
node tools/conference-brain/validate-historical.js
node tools/conference-brain/validate-historical.js --json   # grava evidência

# suítes existentes (prova de não-regressão)
node --test tests/live/*.test.js tests/live/simulator/*.test.js
npm run copiloto:test
npm run capacidade:test
```

**Flags:** `CONFERENCE_BRAIN_FOUNDATION_V1` · `CONFERENCE_SHADOW_STATE_V1` ·
`CONFERENCE_COMPOSITION_HINTS_V1`. O comportamento correto (`flags.js`,
`readFlag`) é: se a variável de ambiente está **presente**, ela manda
(`"1"`/`"true"` liga, qualquer outro valor desliga); se está **ausente**, o
padrão depende de `NODE_ENV` — **ligada** em `development`/`test`, **desligada**
em qualquer outro ambiente (produção inclusive). Não é "desligada fora de
desenvolvimento/teste" de forma incondicional — é desligada por *padrão* fora
desses ambientes, e sempre pode ser forçada explicitamente por variável.

## 8. Estado de prontidão

| Pergunta | Resposta |
|---|---|
| Roda sobre dados reais? | Sim — 3.429 pedidos, 11.230 itens, 12 dias |
| Afirma estado operacional hoje? | **Não** — a fonte histórica não carimba PRONTO |
| Muda algo no Copiloto atual? | Não — nenhum arquivo existente alterado. Em produção as flags ficam desligadas por padrão; em desenvolvimento e teste ficam ligadas por padrão quando a variável de ambiente está ausente (ver §7 e `flags.js`) |
| Está pronto para produção? | Não, e não deve estar. É fundação em sombra |
| O que falta para afirmar carga? | Uma fonte que observe **pronto** e **saída** (Sprint 2) |

---

Documentos irmãos: [DATA_MODEL_V1](DATA_MODEL_V1.md) ·
[INGESTION_V1](INGESTION_V1.md) · [SHADOW_STATE_V1](SHADOW_STATE_V1.md) ·
[VALIDATION_V1](VALIDATION_V1.md) · [NEXT_SPRINTS](NEXT_SPRINTS.md)
