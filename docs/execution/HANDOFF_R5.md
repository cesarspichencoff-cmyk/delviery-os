---
lifecycle:
  artefato: docs/execution/HANDOFF_R5.md
  status: SUPERSEDED
  authority_scope: mission_continuity
  superseded_by: docs/execution/MISSION_LEDGER.jsonl
  atualizado_em: "2026-08-07"
  state_basis: 420591e
---

# Handoff R5 — histórico, fora da rota ativa

> **APOSENTADO EM 2026-08-07.** A continuidade entre missões é `docs/execution/MISSION_LEDGER.jsonl`.
> O detalhe técnico de R5 abaixo permanece íntegro e continua correto para consulta; o que mudou é
> que ele deixou de ser porta de entrada. Ele nasceu declarando substituir o `NEXT_RESUME.md`, e
> nenhum dos dois foi retirado — foi essa colisão de autoridades que a Fase 2 do VÉRTICE encerrou.

## 1. Estado

Branch `feature/deliveryos-hybrid-platform-foundation-v1`. Sem push, merge, PR ou deploy — nunca.

| Bloco | Estado | Gate |
|---|---|---|
| R5-A política temporal | ✅ | `npm run test:platform:r5a` (30) |
| R5-B invariantes I1–I10 | ✅ | `test:platform:r5b` (30) |
| R5-C tradução motor→Shadow | ✅ | `test:platform:r5c` (38) |
| R5-D0 prontidão | ✅ | `test:platform:r5d0` (28) |
| R5-D0-C confiança | ✅ | `test:platform:r5d0-confidence` (12) |
| R5-D0-L linhagem | ✅ | `test:platform:r5d0-lineage` (15) |
| R5-D0-S confiança durável | ✅ | `test:platform:r5d0-storage` (12) |
| R5-D1 catálogo/projetor | ✅ | `test:platform:r5d1-event-lineage` (31) |
| R5-D2 qualificação de fontes | ✅ | `test:platform:r5d2-producer-qualification` (38) |
| R5-D3 caminho shadow | ✅ | `test:platform:r5d3-shadow-path` |
| **R5-D conexão real** | **NÃO INICIADO** | — |

Agregador: `npm run test:platform:r5`. Regressões vizinhas: `:copiloto` (39), `:bridge` (45),
`:home` (44), `:recuperacao`, `:figma-parity` (23). Sempre `npx tsc --noEmit`.

## 2. Commits de referência

`bd1ad55` R5-A · `ad3b1bc` R5-B · `27ccfd2` R5-C · `b100943` R5-D0 · `ced38da` R5-D0-C ·
`2af52e1` R5-D0-L · `73f2f0b` R5-D0-S · `f1fe480` R5-D1 · `1a35ebe` R5-D2.

## 3. Decisões vigentes — não reabrir

- **C1** Ambiente informa, não orienta. **C3** Operação Viva é a dona final da atenção.
- **D29** sem `order_id` real, nenhuma recomendação de pedido. **D43** os dois motores não se
  conectam até I1–I10 verdes.
- **D57** OriginKit não bloqueia. **D59** PB11 bloqueia só o fechamento documental do Figma.
- **D62** `STALE 120` **não** é frescor de fonte — é teto de plausibilidade da espera de um pedido.
- **D66** rótulo de confiança nunca vira número. **D70** confiança é união discriminada
  (`nao_estimada` | `apurada`); `nao_estimada` **não é zero**. **D71** severidade não vira confiança.
- **D74** representação durável = `confianca_schema: "confianca@2"` + a mesma união; `confidence` é
  espelho de leitura. **D75** número legado ganha ramo `legado` e nunca é promovido.
- **D76** `LeituraOperacional` é **projeção**; não existe `leitura_operacional_criada`.
- **D77** carga nasce de trabalho aberto **contado**; ausência nunca vira número.
- **D78** ordem canônica é `occurred_at`, nunca `ingested_at`.
- **D79** PB8 resolvido por autoridade de evento — virou bloqueio de **emissão**.
- **D80** probe cuja segurança não se prova é recusado, sem tentar.
- **D81** trabalho por praça vem de **registro explícito da operação**, nunca de inferência.

## 4. Contratos criados

| Arquivo | O que é |
|---|---|
| `src/product/atencao/politica-temporal.ts` | eleição temporal (debounce 3 / cooldown 45 / maxfoco 8, em minutos) |
| `src/product/atencao/traducao-motor-shadow.ts` | tradutor puro motor→Shadow; nunca calcula confiança |
| `src/product/atencao/linhagem-eventos.ts` | `LinhagemDeEventos`, elegibilidade |
| `src/product/atencao/prontidao-r5d.ts` | preflight; **todas** as condições separadas |
| `src/platform/copiloto/confianca-duravel.ts` | round-trip durável da confiança |
| `src/product/eventos/catalogo-operacional.ts` | 4 eventos versionados + envelope |
| `src/product/eventos/projetar-leitura.ts` | projetor determinístico |
| `src/product/eventos/portas-produtores.ts` | portas (contrato) |
| `src/product/eventos/qualificacao-produtores.ts` | qualificação (medição) |
| `src/product/eventos/produtor-trabalho-praca.ts` | **R5-D3** produtor por registro explícito |
| `src/product/eventos/observador-saude.ts` | **R5-D3** saúde de fonte |
| `src/product/eventos/ledger-shadow.ts` | **R5-D3** ledger isolado, desligado por padrão |

## 5. Os quatro eventos e quem os produz

| Evento | Produtor | Estado |
|---|---|---|
| `pedido_ciclo_observado@1` | Gestor iFood (não implementado) | parcialmente qualificado |
| `trabalho_praca_observado@1` | **registro explícito da operação** (R5-D3) | **implementado, em shadow** |
| `capacidade_praca_observada@1` | nenhum | inacessível |
| `source_health_changed@1` | observador interno (R5-D3) | **implementado, em shadow** |

## 6. Bloqueadores

- **R5-D**: `R5D_BLOCKED_SHADOW_VALIDATION` — os dois produtores existem, mas o caminho shadow
  nunca rodou com operação real. Validar em campo antes de qualquer conexão.
- **`pedido_ciclo_observado`**: sem captura viva. Decisão de produto: vale construir o leitor
  passivo do DOM do Gestor iFood, sabendo que ele não tem histórico nem chave idempotente?
- **`capacidade_praca_observada`**: nenhuma fonte declara capacidade por praça.
- **PB11/PB13**: Figma pendente por cota de plano. Não bloqueia nada técnico.
- **PB9/C1, C7, C8**: conflitos de produto abertos.

## 7. Congelado — diff vazio obrigatório

`src/perfil-delivery/` · `src/product/viewmodels/` · `src/product/ui/` · `docs/figma/` ·
`politica-temporal.ts` · `linhagem-eventos.ts` · `confianca-duravel.ts` ·
`catalogo-operacional.ts` · `projetar-leitura.ts`.

## 8. Próximos passos, na ordem

1. **Validar o caminho shadow em campo** — um turno real com registro explícito, ledger shadow
   ligado, e comparar o projetado com o que a operação viu.
2. Decidir o produtor de `pedido_ciclo_observado`.
3. Só então R5-D: conexão em sombra atrás de flag desligada.

## 9. Lições que evitam retrabalho

- **L36** presença textual não prova código — guarda deve ler código sem comentário.
- **L37** mutação que não aplica não é invariante verde (cuidado com CRLF em arquivos antigos).
- **L38** mutação cega pode estar acusando a guarda vizinha.
- **L39** mutação precisa ser **material**: mexer só em tipo não altera execução (`tsx` não checa).
- **L40** cobertura é propriedade de cada gate, não do repositório.
- **L41** a própria fixture pode reproduzir a ordem certa por acidente — olhe os desempates.
