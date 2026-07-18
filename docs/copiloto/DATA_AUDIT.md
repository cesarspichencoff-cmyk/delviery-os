# Auditoria de Dados — Copiloto Delivery

> Escopo: worktree isolado `deliveryos-grok-copiloto-intelligence` @ e299cbc.
> Brutos multi-mês **não estão versionados** neste worktree (`data/raw/` gitignorado e vazio).
> Esta auditoria cruza: documentação versionada no repo + código (`motor.js`, `src/live`, ingest) + seeds presentes.

## Princípio

Não presumir que “meses de export” = meses de informação confiável no ambiente de código.
O que existe **no worktree** ≠ o que a operação já coletou em máquinas privadas.

## Fontes

| Fonte | Onde no worktree | Período documentado | Status no worktree |
|---|---|---|---|
| Relatórios iFood mensais (56 col) | docs only (`Auditoria_Dados_Estruturados.md`) | 10/2025–03/2026 | **Ausente** (bruto) |
| Logística iFood (29 col) | docs only | 04–06/2026 | **Ausente** (bruto) |
| Cancelamentos / Negociações | docs only | 04–07/2026 | **Ausente** (bruto) |
| Cardápio knowledge seed | `data/cardapio_knowledge_seed.json` | estático | **Presente** |
| CSV ponte exemplo | `data/exemplo_noite_real.csv` | 5 pedidos | **Presente** (demo) |
| Fonte viva live | `src/live/*` | tempo real (simulador) | **Presente** (código) |
| Motor tempo/estado | `src/perfil-delivery/motor.js` | replay | **Presente** |
| Inventário lotes HTML 01/07 | docs only | janela ~24h | **Ausente** (bruto) |

**Meses auditados (documentação do repo):** ~9 meses de pedido-a-pedido (out/2025–jun/2026, ~70k pedidos) descritos em docs — **não reprocessados neste pacote** por ausência dos arquivos brutos no worktree.

## Classificação de campos (síntese)

### Confiável (para histórico / reconciliação D+1 quando bruto disponível)
- ID completo do pedido (UUID iFood)
- Timestamps de ciclo: recebido / pronto / saiu / cancelado (relatório tradicional)
- Status de desfecho (CONCLUDED/CANCELLED/…)
- Tempos logísticos oficiais (alocação, espera na loja, etc.)
- Seed de cardápio (199 itens / 8 praças) — conhecimento de item

### Utilizável com cautela
- ID curto (ambiguidade ~1,4% no mesmo dia)
- Composição real por pedido (só janelas pontuais / cancelados / HTML 01/07)
- Popularidade agregada de cardápio
- Avaliações/NPS (agregados e tags)

### Incompleto
- Eventos por praça (pronto-por-praça) — **ausente**
- Início/fim de Conferência como etapa nativa — **ausente**
- Caixa como fila operacional instrumentada — **ausente**
- Disponibilidade de motoboy em tempo real — parcial/documental
- Observações do cliente — raras/dependem de comanda

### Inconsistente
- Join por ID curto sem política de confiança
- Sobreposição Logística ∩ relatório (dedup obrigatório por ID completo)

### Ausente no worktree
- Arquivos xlsx/html brutos multi-mês
- WhatsApp / fontes privadas (fora do ambiente autorizado)

### Não recomendado
- Tratar composição sintética como fato de praça
- Inventar carimbo ausente
- Ranking individual a partir de tempos

## Uso tempo real vs histórico

| Classe | Tempo real | Histórico |
|---|---|---|
| Timestamps iFood (quando live/export) | sim (live) / D+1 (export) | sim |
| Composição item | só com comanda/API/HTML | parcial |
| Carga por praça | inferida (hoje sintético/parcial) | baseline com cautela |
| Motoboy espera loja | sim se coluna logística/live | sim |
| Caixa | não | não |

## Qualidade geral

**Média-alta para eixo tempo/desfecho (quando bruto presente); média-baixa para eixo praça/item em tempo real; baixa para Caixa.**

No ambiente isolado deste pacote: qualidade operacional **parcial** — seed + código + docs; séries históricas sintéticas calibradas para baselines/backtest de referência.

## Riscos de interpretação
1. Confundir baseline provisória do motor com calibração estatística.
2. Tratar picos de 1 minuto como pressão.
3. Atribuir atraso a pessoa.
4. Usar sinal externo sem validação de impacto.
