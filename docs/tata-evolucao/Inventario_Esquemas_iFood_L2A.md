# Inventário de Esquemas iFood — L2A

> Schemas e cobertura dos packs L2/L3 em work copies.  
> Sem linhas de pedido no Git.  
> Derivados: `../deliveryos-private-sources/01_WORK_COPIES/DERIVED/IFOOD_L2A/`.

---

## 1. Arquivos analisados

| Pacote | Arquivos | Papel |
|---|---|---|
| L3 | `relatorio_pedidos_2026-05-27_2026-06-25.xlsx` (via zip) | Exposição principal L2A |
| L2 | `Dados_Claude.zip` → **16** xlsx extraídos | Histórico mensal + logística + qualidade resumida |
| Extra work | `negociacoes_ifood.xlsx`, B2-XLSX-* | Auxiliar (não núcleo da exposição L2A) |

Hashes orig=work validados na B0 (mismatch 0).

---

## 2. Schema — pedidos maio–jun (núcleo de exposição)

**Aba:** 1  
**Linhas de dados:** 8.305  
**Chave:** `ID COMPLETO DO PEDIDO` (UUID)

### Campos temporais

| Tipo | Campos |
|---|---|
| Absolutos | `DATA E HORA DO PEDIDO`, `DATA DO CANCELAMENTO`, `DATA DE AGENDAMENTO` |
| Durações (min) | preparo, alocação entregador, botão pronto, caminho loja, espera loja, caminho cliente, espera cliente, prometido, entrega realizada, **atraso vs prometido** |
| **Ausentes** | `ready_at` / `dispatched_at` / `delivery_at` **absolutos** (só durações) |

### Outros campos úteis

- `TURNO`, `STATUS FINAL DO PEDIDO`, `CANAL DE VENDA`, `TIPO DE ENTREGA`  
- `TIPO/MOTIVO/ORIGEM DO CANCELAMENTO`  
- `VALOR DOS ITENS (R$)` (valor, **não** contagem de linhas de item)  
- **Sem** colunas de composição item-a-item / praça  

### PII de cliente

Não necessário e **não** usado na base sanitizada privada (sem nome/telefone/endereço nas colunas de interesse operacional listadas).

---

## 3. Pack Dados Claude — inventário resumido

| Arquivo (genérico) | ~Linhas sheet1 | DateTime? | “Itens” no header? | Nota |
|---|---:|---|---|---|
| Relatorio Outubro 25 | ~7188 | sim | valor itens | pedidos mês |
| Relatorio Novembro 25 | ~7974 | sim | valor itens | pedidos mês |
| Relatorio Dezembro 25 | ~7273 | sim | valor itens | pedidos mês |
| Relatorio Janeiro | ~7432 | sim | valor itens | pedidos mês |
| Relatorio Fevereiro | ~7412 | sim | valor itens | pedidos mês |
| Relatorio Marco | ~7861 | sim | valor itens | pedidos mês |
| Logistica | **24905** | sim | valor total itens | série longa timing |
| Relatorio Cancelamentos | ~464 | sim | — | cancelamentos |
| Negociacoes Ifood | ~604 | sim | sim | negociações |
| Qualidade Operacao * | ~100 | — | — | agregado qualidade |
| Vendas * / Cardapio | poucas | — | — | resumo/cardápio |
| Relatorio Vendas | ~2 | — | — | resumo |

**Importante:** em todos os “Relatorio *” inspecionados, “ITEM” no header refere-se a **valor monetário dos itens**, **não** a linhas de composição. **Cobertura de composição (item lines) = 0% nestes packs.**

---

## 4. Períodos

| Fonte | Período real (local) |
|---|---|
| Pedidos L3 | **2026-05-27 → 2026-06-25** |
| Logistica (Claude) | a detalhar na L2B se necessário (24.905 IDs únicos) |
| Relatórios mensais Claude | Out/25–Mar (anos no nome/conteúdo) — sobreposição parcial com L3 em mai–jun **não** está nesses “Relatorio *” de out–mar |

---

## 5. O que a exposição L2A **tem** vs **não tem**

| Necessidade | Status |
|---|---|
| Pedidos/hora e /dia | **Sim** (L3) |
| Cancelamentos | **Sim** (status/motivo) |
| Proxy de atraso (min vs prometido) | **Sim** (duração) |
| ready/dispatch absolutos | **Não** (inferíveis só se política de soma for aprovada) |
| Contagem de itens / praça | **Não** nestes arquivos |
| Join mensagem↔pedido por ID | Raro no WA; não forçar |

---

*Schemas L2A · base para qualidade/dedup e modelo de exposição.*
