# Inventário e Períodos — Bloco 3 (L4)

> Oito PDFs de qualidade/operação em work copies.  
> Originais somente leitura; hashes original × cópia **iguais (8/8)**.  
> Privado: `../deliveryos-private-sources/01_WORK_COPIES/DERIVED/BLOCO3_L4/`  
> **Nenhum PDF, página ou PII no Git.**

---

## 1. Arquivos confirmados

| document_id | Arquivo work | Bytes | Páginas (~) | SHA-256 vs original |
|---|---|---:|---:|---|
| B3-DOC-001 | B3-PDF-01.pdf | 965.728 | 17 | **match** |
| B3-DOC-002 | B3-PDF-02.pdf | 564.076 | 14 | **match** |
| B3-DOC-003 | B3-PDF-03.pdf | 829.147 | 23 | **match** |
| B3-DOC-004 | B3-PDF-04.pdf | 835.390 | 27 | **match** |
| B3-DOC-005 | B3-PDF-05.pdf | 649.405 | 18 | **match** |
| B3-DOC-006 | B3-PDF-06.pdf | 572.675 | 17 | **match** |
| B3-DOC-007 | B3-PDF-07.pdf | 602.812 | 17 | **match** |
| B3-DOC-008 | B3-PDF-08.pdf | 606.734 | 17 | **match** |

Também presente no set (fora do escopo de mineração L4 de “oito PDFs”): `relatorio_qualidade_operacao_loja.zip` (12.024 B).

**Duplicidade exata entre os 8 PDFs:** não (tamanhos/hashes distintos).  
**Risco de reuso de slide/ranking:** DOC-007 e DOC-002 compartilham ranking de clientes visualmente idêntico (ver contradições).

---

## 2. Períodos (conteúdo > nome de arquivo)

Nomes `B3-PDF-0N` **não** codificam mês. Período lido do **título interno**.

| document_id | Período interno | Status | Observações |
|---|---|---|---|
| B3-DOC-001 | **Ago/2024** | **confirmado** | Título “AGOSTO 2024”; página de totais por weekday com rótulo residual **“JUNHO”** → **divergência de rótulo interno** |
| B3-DOC-002 | **Dez/2024** | **confirmado** | |
| B3-DOC-003 | **Fev/2024** | **confirmado** | **Não** é Fev/2026 da L2C |
| B3-DOC-004 | **Jan/2023** | **confirmado** | Ano **2023** (único do lote) |
| B3-DOC-005 | **Jun/2024** | **confirmado** / **provável** parcial | Algumas seções “JUNHO/JULHO” |
| B3-DOC-006 | **Mai/2024** | **confirmado** | |
| B3-DOC-007 | **Nov/2024** | **confirmado** | |
| B3-DOC-008 | **Out/2024** | **confirmado** | |

### Cobertura temporal do lote

| Ano | Meses cobertos |
|---|---|
| 2023 | Jan |
| 2024 | Fev, Mai, Jun, Ago, Out, Nov, Dez |

**Ausentes no Bloco 3:** Mar–Abr/2024, Jul, Set, e **todo 2025–2026** (incl. Fev/2026 L2C).

---

## 3. Método de extração

| Método | Uso |
|---|---|
| Extração textual de páginas | Principal (todas as páginas principais) |
| OCR em massa | **Não** executado |
| Leitura visual/OCR seletiva | Necessária só onde gráficos de “desempenho”/feedback **não** têm texto numérico extraível → confiança **baixa** nesses elementos |

---

## 4. Estrutura típica do relatório

Sequência recorrente (varia levemente por mês):

1. Total de pedidos + cancelamentos  
2. Pedidos iFood vs App  
3. Volume por weekday — almoço / jantar / total  
4. Motivos de cancelamento (quando presente)  
5. Faixas horárias 2h (10–12 … 22–00)  
6. Avaliações e estrelas + moderação  
7. Gráficos de feedback/desempenho (pouco texto)  
8. Ranking de clientes (**PII — não versionado**)  
9. Ocorrências / “erros funcionário” (**nominais — não versionados**)  
10. Lista de reclamações/omissões de item  
11. Avaliações de salão (quando houver)

---

## 5. Política de privacidade aplicada

- Nomes de clientes e funcionários **não** entram no Git.  
- IDs sintéticos: `B3-DOC-*`, `B3-EVID-*`, `B3-CASE-*`, `B3-FIND-*`.  
- Rankings nominais → só contagem/agregado ou descarte.

---

*Inventário L4 · períodos confirmados com ressalvas de rotulagem.*
