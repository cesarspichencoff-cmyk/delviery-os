# Contradições e Lacunas — Bloco 3 (L4)

---

## 1. Contradições / divergências

### C-B3-01 — Rótulo de mês errado dentro do PDF (Ago/2024)

| Campo | Valor |
|---|---|
| objetos | Página de totais weekday vs título AGOSTO 2024 (B3-DOC-001) |
| definição | Rótulo “JUNHO” em slide de totais |
| impacto | Risco de citar número no mês errado |
| fonte mais confiável | **Título da capa** + consistência das demais páginas “AGOSTO” |
| decisão | Usar **Ago/2024**; marcar slide com rótulo residual como **suspeito** |

### C-B3-02 — Ano 2023 misturado ao lote 2024

| Campo | Valor |
|---|---|
| objetos | B3-DOC-004 Jan/**2023** vs demais 2024 |
| impacto | Série “mensal” do pacote **não** é um único ano |
| decisão | Tratar Jan/2023 como **bloco histórico isolado** |

### C-B3-03 — Faixa 22:00–00:00 vs regra operacional 23:00 (L2C)

| Campo | Valor |
|---|---|
| objetos | Slides de horário Bloco 3 × política L2C / Visão temporal TATÁ |
| impacto | Madrugada misturada ao “horário de pedidos” do relatório antigo |
| fonte mais confiável para operação atual | **Regra L2C** (America/Sao_Paulo, &lt;23h) |
| decisão | Não reutilizar o template de faixas sem atualizar |

### C-B3-04 — Ranking de clientes idêntico Nov vs Dez/2024 (suspeita)

| Campo | Valor |
|---|---|
| objetos | B3-DOC-007 (Nov) e B3-DOC-002 (Dez) |
| impacto | Possível copiar/colar de slide; dados de ranking **não confiáveis** |
| decisão | **Não usar** rankings de cliente; se necessário, reextrair de fonte primária |

### C-B3-05 — “Erros funcionário” vs política de não avaliar pessoas (TATÁ Evolução)

| Campo | Valor |
|---|---|
| objetos | Slides nominais de ocorrência × premissas do programa |
| impacto | Risco de ranking individual se reproduzido |
| decisão | Converter só em **hipótese de processo/função**; nomes fora do Git |

### C-B3-06 — Cancel “atrasado” ≠ atraso-flag L2C

| Campo | Valor |
|---|---|
| objetos | Motivo de cancelamento iFood × delay_min vs prometido |
| impacto | Confundir eixos nativo e de cancel |
| decisão | Manter semântica L2C; Bloco 3 como **contexto de motivo**, não baseline de atraso |

### C-B3-07 — Estudo “erros item-a-item” (legado) vs PDFs agregados

| Campo | Valor |
|---|---|
| objetos | Contradição C-06 já na T0B-A |
| decisão | Bloco 3 L4 confirma: PDFs são **agregados/listas**, não taxa item-a-item validada |

### C-B3-08 — Junho com páginas “JUNHO/JULHO”

| Campo | Valor |
|---|---|
| objetos | B3-DOC-005 |
| impacto | Ocorrências podem cruzar virada de mês |
| decisão | Período **provável** Jun/2024 para totais; ocorrências com ressalva de fronteira |

---

## 2. Lacunas

| Lacuna | Impacto |
|---|---|
| Sem 2025–2026 no Bloco 3 | Não explica L2C recente |
| Sem atraso-flag / preparo / espera | Não fecha baseline nativo |
| Sem praça / composição por pedido | Continua bloqueio L2C |
| Sem WhatsApp | Não confere H3 comunicação |
| Gráficos sem texto numérico | Confiança baixa em “desempenho” |
| Sem recomendações acionáveis datadas | Difícil status “implementada” |
| PII em rankings | Não reutilizável em docs públicos |

---

## 3. Recomendações antigas

| Achado | Status |
|---|---|
| Checklist implícito de kit/itens (via listas de erro) | **ainda relevante** (como necessidade de processo) |
| Separar motivos de cancel | **ainda relevante** |
| Qualquer meta numérica nos gráficos ilegíveis | **desconhecida / desatualizada** |
| Ranking de pessoas como gestão | **contraditória com regra atual** do programa (não usar) |

Nenhuma recomendação foi marcada “implementada e confirmada” — o PDF **não** traz evidência de implantação.

---

## 4. Destino dos achados (resumo)

| Destino | Exemplos |
|---|---|
| Formação | Kit, troca de item, omissões de alto giro |
| Procedimento | Conferência; corte 23h em relatórios |
| Matriz de autonomia | Indisponibilidade / cortesia (pouco no PDF; alinhar L2B) |
| Dados e medição | Não misturar cancel-atraso com atraso-flag |
| DeliveryOS futuro | Candidato a investigação: campos de omissão estruturados |
| Nenhuma ação | Rankings de cliente; slides copiados suspeitos |

**Alertas:** nenhum. No máximo **candidato a investigação** ou **informação histórica**.

---

*Contradições e lacunas L4.*
