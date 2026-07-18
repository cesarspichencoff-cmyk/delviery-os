# Relatório de Qualidade dos Dados — Copiloto

**Data:** 2026-07-18  
**Ambiente:** worktree `deliveryos-grok-copiloto-intelligence`  
**Branch:** `grok/copiloto-intelligence-pack`

## Resumo

| Dimensão | Avaliação |
|---|---|
| Qualidade geral (ambiente isolado) | **Parcial** |
| Eixo tempo/desfecho (docs históricos) | Alta (quando bruto presente) |
| Eixo composição/praça tempo real | Média-baixa |
| Caixa | Ausente |
| Brutos multi-mês no worktree | **Ausentes** (gitignored) |

## Presente no worktree

- `data/cardapio_knowledge_seed.json` (199 itens / 8 praças)
- `data/exemplo_noite_real.csv` (5 pedidos demo)
- Código `src/live`, `src/perfil-delivery`, `src/core`, `src/ingest`
- Documentação de auditorias prévias (9 meses / ~70k pedidos **descritos**, não reingestados aqui)

## Ausente no worktree

- Exports xlsx/html multi-mês
- JSONL iFood real
- Fontes privadas (WhatsApp, etc.) — corretamente fora do escopo autorizado

## Classificação (campos-chave)

Ver `docs/copiloto/DATA_AUDIT.md`.

## Impacto no pacote

- Baselines e backtest usam série **synthetic_calibrated** (rótulo explícito).
- Limiares iniciais configuráveis; não apresentados como verdade calibrada de produção.
- Gates de produto exigem recalibração quando brutos forem montados no worktree com autorização.

## Não feito (de propósito)

- Não apagar, “corrigir” ou imputar dados silenciosamente
- Não copiar fontes privadas para o worktree
- Não acessar Supabase/produção
