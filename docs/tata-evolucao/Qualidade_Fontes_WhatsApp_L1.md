# Qualidade das Fontes WhatsApp — L1

> T0B-B1-L1 · branch `research/tata-evolucao-grok` · base `f77952a`  
> Processamento só em `../deliveryos-private-sources/01_WORK_COPIES/`  
> Originais imutáveis hasheados e batidos com work (13/13, mismatch 0).  
> **Nenhum trecho de conversa, nome ou dado identificável neste documento.**

---

## 1. Identidade dos 13 exports

| Conceito | Quantidade |
|---|---:|
| Arquivos export (zip) | **13** |
| Conversas extraídas (`_chat.txt`) | **13** (1:1 com export) |
| Grupos operacionais vs 1:1 | Mistura (há canais de grupo e canais individuais; **sem** mapear identidades no Git) |
| Arquivos de mídia embutidos nos zips | **0** nos containers (só `_chat.txt`; mídia aparece como *placeholder* no texto) |

IDs artificiais: `WA-SOURCE-001` … `WA-SOURCE-013` ↔ arquivos de trabalho `WA-01` … `WA-13`.

---

## 2. Contagem de mensagens (recontagem L1)

Método: parser de linhas no formato iOS  
`[DD/MM/YYYY, HH:MM:SS] autor: texto` · fuso interpretado como **America/Sao_Paulo** (offset −03 fixo pós-2019).  
Multiline: linhas sem cabeçalho anexadas à mensagem anterior.

| Métrica | Valor |
|---|---:|
| **Linhas/mensagens parseadas (total)** | **171.456** |
| Mensagens de sistema / placeholder de mídia | **16.841** |
| Mensagens de conteúdo (não-sistema) | **154.615** |
| Unidades de evidência operacional (agrupadas) | **6.632** |

### Reconciliação com contagens antigas (docs Git)

| Fonte legada | Número | Relação com L1 |
|---|---:|---|
| Estudo WhatsApp | 171.448 | Diferença **+8** vs 171.456 (~0,005%) — essencialmente a **mesma ordem** de total de linhas parseáveis |
| Auditoria Nível 2 | 155.333 | Próximo de **não-sistema** 154.615 (diferença **~718 / 0,5%**) — auditoria provavelmente excluiu sistema/placeholders com regra ligeiramente diferente |

**Conclusão:** a divergência histórica 171k vs 155k **não é mistério de volume real** — são **dois contadores** (total de linhas vs conteúdo humano/operacional). L1 adota:

- **Total parseado:** 171.456  
- **Conteúdo não-sistema:** 154.615  

Qualquer % futura deve declarar qual denominador usa.

---

## 3. Cobertura temporal real

| Campo | Valor |
|---|---|
| Início (min `local_date`) | **2020-04-26** |
| Fim | **2026-06-25** |
| Fuso | America/Sao_Paulo |
| Encerramento operacional declarado | 23:00 (dia operacional = `local_date`) |

### Por export (mensagens totais / período)

| source_id | Msgs totais | Período local |
|---|---:|---|
| WA-SOURCE-001 | 2.046 | 2026-02-14 → 2026-06-25 |
| WA-SOURCE-002 | 21.152 | 2022-09-21 → 2026-06-16 |
| WA-SOURCE-003 | 16.582 | 2025-06-10 → 2026-06-24 |
| WA-SOURCE-004 | 22.904 | 2024-11-13 → 2026-06-24 |
| WA-SOURCE-005 | 68.501 | 2022-07-23 → 2026-06-24 |
| WA-SOURCE-006 | 6.454 | 2023-01-10 → 2025-04-11 |
| WA-SOURCE-007 | 8.782 | 2022-11-22 → 2026-06-24 |
| WA-SOURCE-008 | 1.013 | 2022-07-20 → 2024-01-31 |
| WA-SOURCE-009 | 7.797 | 2022-11-17 → 2026-05-02 |
| WA-SOURCE-010 | 1.196 | 2025-09-24 → 2026-06-23 |
| WA-SOURCE-011 | 2.360 | 2024-09-26 → 2026-06-24 |
| WA-SOURCE-012 | 3.300 | 2020-04-26 → 2026-06-24 |
| WA-SOURCE-013 | 9.369 | 2025-07-25 → 2026-06-24 |

**Lacunas:** coverage desigual (um canal concentra ~40% do volume); um canal encerra em 2024-01; outro em 2025-04.

---

## 4. Qualidade por eixo

| Eixo | Avaliação |
|---|---|
| Timestamp de mensagem | **Alta** no texto; **não** = horário do erro físico |
| Autoria | Presente no export; no derivado L1 colapsada em papéis (`authority_hub` / `participant` / `group_channel`) — **sem nomes no Git** |
| Anexos | Referenciados como ocultados/omitidos; **não** recuperáveis do zip |
| Duplicidade entre exports | Sem hash-idêntico de arquivo; **sobreposição temática** entre canais (mesma decisão discutida em mais de um lugar) — unidades podem superestimar se não deduplicar na B2 |
| Mensagens após 23:00 | Contadas à parte (comunicação noturna / registro tardio); **não** movidas para o dia anterior |
| Integridade | 13/13 extrações OK; 0 zips corrompidos |

---

## 5. Limitação metodológica da classificação L1

- Classificação por **heurística de palavras-chave** + agrupamento temporal (45 min, mesmas categorias).  
- **Não** é taxonomia humana linha a linha.  
- `escalonamento` pode ser superestimado por menções genéricas / pedidos de confirmação.  
- Unidades de evidência ≠ erros confirmados de pedido.  

---

## 6. Onde ficam os derivados privados

```text
../deliveryos-private-sources/01_WORK_COPIES/DERIVED/WA_L1/
  extract/WA-xx/_chat.txt
  indexes/summary.json
  indexes/units.json
  mine_l1.js
```

**Fora do repositório Git.**

---

*Qualidade L1 · contagem reconciliada · privacidade preservada no Git.*
