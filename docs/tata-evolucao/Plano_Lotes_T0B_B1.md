# Plano de Lotes — T0B-B1

> Ordem de processamento da **mineração controlada** após B0.  
> Não executa mineração nesta missão.  
> Entrada: `../deliveryos-private-sources/01_WORK_COPIES/`  
> Saída permitida no Git: apenas fichas anonimizadas em `docs/tata-evolucao/`.

---

## 1. Princípios dos lotes

1. Originais imutáveis **não** são abertos para edição.  
2. Extração e anotações só em **cópias de trabalho**.  
3. Cada lote tem critério de **parada/saturação** e entregável mínimo.  
4. Sem exposição (volume) → **sem** ranquear janela de risco.  
5. WhatsApp: amostragem estratificada (Plano_Mineracao_T0B), não leitura linear total na primeira semana.  
6. Fuso e dia operacional: **America/Sao_Paulo**, encerra **23:00**, `operational_day_key = local_date` (modelo temporal T0B-A).

---

## 2. Ordem dos lotes

| Ordem | Lote ID | Conjunto | Objetivo | Prioridade |
|---|---|---|---|---|
| 1 | **L1** | SET-WA (13 zips) | Extrair `_chat` para work; inventário por conversa (período, qtd msgs **sem** colar texto); amostragem; temas/escalonamento/omissão | P0.1 |
| 2 | **L2** | SET-IFOOD · `Dados_Claude.zip` | Listar arquivos internos + hash; identificar pedidos/logística/cardápio | P0.2 |
| 3 | **L3** | SET-IFOOD · pedidos 2026-05-27→06-25 | Timing e volume por dia/hora (exposição) | P0.2 |
| 4 | **L4** | SET-B3 · 8 PDFs | Texto nativo; séries cancel/avaliação/turno | P0.3 |
| 5 | **L5** | SET-AVAL | Comentários/estrelas agregados (sem PII no Git) | P1 |
| 6 | **L6** | SET-OP | Checklists, treino, escala (anonimizar nomes) | P1 |
| 7 | **L7** | SET-MID | Kit/comanda só se necessário; preferir descrição estrutural | P2 |
| 8 | **L8** | Cruzamento | Validar TC/CASE da Camada A com exposição | P0 |

---

## 3. Detalhe por lote

### L1 — WhatsApp

| Campo | Valor |
|---|---|
| Entrada | `01_WORK_COPIES/whatsapp/WA-01.zip` … `WA-13.zip` |
| Trabalho | Extrair cada zip em `work/whatsapp/WA-xx/_extract/` |
| Entregáveis Git | Contagem de msgs por WA-xx; períodos; temas candidatos atualizados; **zero** citações nominais |
| Amostra inicial | 3 conversas (hub / operacional / grupo) × 2 janelas (pico e vale) × anos 2024–2026 |
| Parada | Saturação de taxonomia (Plano Mineração §12) |
| Risco | Crítico — PII |
| Restrição | Não processar mídia embutida na B1 inicial |

### L2 — Pack Dados Claude

| Campo | Valor |
|---|---|
| Entrada | `ifood/Dados_Claude.zip` |
| Trabalho | Extrair lista de membros; hashear cada arquivo interno |
| Entregáveis | Inventário interno do pack (nomes genéricos de planilha + período se legível no nome) |
| Risco | Médio |

### L3 — Pedidos com janela explícita

| Campo | Valor |
|---|---|
| Entrada | `relatorio_pedidos_2026-05-27_2026-06-25.xlsx.zip` |
| Trabalho | Parse colunas de tempo; volume por `local_date` / hora |
| Entregáveis | Tabela agregada de exposição (pedidos/hora) **sem** IDs de cliente |
| Uso | Normalizar erros da L1/L4 |

### L4 — Bloco 3

| Campo | Valor |
|---|---|
| Entrada | `B3-PDF-01`…`08` |
| Trabalho | `pdftotext` ou extração equivalente; validar mês/ano no **conteúdo** |
| Entregáveis | Séries mensais agregadas; nota se rótulo de arquivo diverge |
| Risco | Baixo–médio |

### L5 — Avaliações

| Campo | Valor |
|---|---|
| Entrada | `avaliacoes/avaliacoes_ifood.xlsx` |
| Trabalho | Contar abas; agregar estrelas; **não** copiar comentários textuais para Git |
| Entregáveis | Distribuição de notas; temas de reclamação **codificados** (taxonomia) |

### L6 — Operacional / treino

| Campo | Valor |
|---|---|
| Entrada | `OP-01`…`OP-15`, tabela cardápio, roteiro |
| Trabalho | Extrair procedimentos e checklists; remover nomes de escala |
| Entregáveis | Lista de procedimentos candidatos a conteúdo |
| Duplicata | Processar OP-11 **ou** OP-12 (hash idêntico) |

### L7 — Mídia

| Campo | Valor |
|---|---|
| Entrada | jpeg/mp4 |
| Trabalho | Só se L6/embalagens exigirem; descrição do tipo de imagem (kit/comanda/UI), sem OCR de PII |
| Entregáveis | Notas de evidência visual genéricas |

### L8 — Cruzamento Camada A × B

| Campo | Valor |
|---|---|
| Entrada | Saídas L1–L5 + docs T0B-A |
| Trabalho | Promover/rebaixar TC e CASE; nunca “padrão” sem critérios |
| Entregáveis | Atualização de temas/casos; insumos de baseline |

---

## 4. Estimativa de esforço (ordem de grandeza)

| Lote | Volume B0 | Esforço relativo |
|---|---|---|
| L1 | 13 zips / ~3,2 MB | Alto (conteúdo denso) |
| L2 | ~15 MB zip | Médio (inventário) |
| L3 | ~2,5 MB | Médio |
| L4 | ~5,6 MB PDF | Médio |
| L5 | ~90 KB | Baixo |
| L6 | ~4 MB | Médio |
| L7 | ~1,9 MB | Baixo se seletivo |
| L8 | — | Médio |

---

## 5. Critérios de entrada para T0B-B1

- [x] B0 inventário e hashes  
- [x] Originais separados de work  
- [x] Lotes definidos  
- [ ] Autorização explícita **T0B-B1** (esta missão não inicia)  
- [ ] Operador ciente de política de privacidade  

---

## 6. O que **não** fazer na B1

- Commit de exports, extratos ou planilhas  
- Ranking de pessoas  
- Alertas operacionais reais  
- Cursos completos  
- Afirmar frequência sem exposição  

---

*Lotes prontos para autorização B1 · execução não iniciada.*
