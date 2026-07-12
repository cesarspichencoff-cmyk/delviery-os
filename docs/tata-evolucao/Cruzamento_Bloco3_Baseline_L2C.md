# Cruzamento Bloco 3 × Baseline L2C

> Dez pontos de referência L2C × o que o Bloco 3 (2023–2024) diz.  
> **Não forçar concordância.** Períodos em geral **não** se sobrepõem a 2025–2026.

---

## 1. Matriz de confronto

| # | Achado L2C | Bloco 3 | Veredito |
|---|---|---|---|
| 1 | Pico estável de volume ~19h | Faixas 18–20 / 20–22 como pico noturno; sem hora 19 isolada no texto | **Confirma em forma** (jantar/noite); definição de faixa **diferente** (2h vs 1h) |
| 2 | Pico atraso-flag ~19h | **Não aborda** atraso-flag/minutos vs prometido | **Não aborda** |
| 3 | Comunicação/100 maior 21–22h | Sem WhatsApp; sem taxa por pedido | **Não aborda** |
| 4 | Atraso nativo menor às 22h que às 19h | Sem métrica de atraso nativo | **Não aborda** |
| 5 | Domingo volume alto | Weekday: domingo frequentemente alto em jantar/total | **Confirma** (vários meses 2024) |
| 6 | Terça volume mais baixo | Terça frequentemente entre os menores | **Confirma** (forma) |
| 7 | Hora 17 exposição zero | Não mencionada; faixas pulam 16–18 | **Não aborda** (compatível com ausência) |
| 8 | Fluxo normal &lt;23h | Faixa **22:00–00:00** existe nos slides | **Usa outra definição** (inclui madrugada na faixa de horário) |
| 9 | Fev outlier de atraso (2026) | Só **Fev/2024** no lote | **Período incompatível** — ver §2 |
| 10 | Cancel ~0,9–2,5/100 (L2C) | Cancel PDF ~0,6–1,4/100 (2023–24) | **Mesma ordem de grandeza**; **não** mesma série |

---

## 2. Fevereiro — investigação específica

| Pergunta | Achado L4 |
|---|---|
| Existe PDF de fevereiro? | **Sim** — B3-DOC-003 **Fev/2024** |
| É o fevereiro da L2C? | **Não** (L2C = **Fev/2026**) |
| Há atraso-flag ou preparo? | **Não** |
| Cancel Fev/2024 | 85 / 5.966 ≈ **1,42/100** (não extremo vs outros meses do Bloco 3) |
| Motivos de cancel com “atrasado” | Presentes (contagens baixas junto a outros motivos); **“Erro sistema”** e logísticos também |
| Chamados “pedido atrasado” | Sim (ex.: 5 em um slide de 17 chamados) — **reclamação**, não atraso-flag |
| Mudança de processo/equipe documentada? | **Não** no texto extraível |
| Classificação da explicação para **Fev/2026** L2C | **inexistente / período incompatível** |

**Conclusão:** o Bloco 3 **não explica** o outlier de atraso-flag de fevereiro **2026**. No máximo oferece **contexto histórico** de que fevereiro **pode** ser mês operacionalmente pesado em reclamações/avaliações (737 avaliações em Fev/24 — alto no lote), sem causalidade.

---

## 3. Composição, item e praça

| Necessidade L2C | No Bloco 3? | Uso futuro |
|---|---|---|
| Composição item-a-item por pedido | **Não** | — |
| Praça / ambiente | **Não** | — |
| Categoria / cardápio | **Parcial** (ranking de itens vendidos) | Formação de cardápio; **não** cruzar como taxa de erro |
| Item associado a omissão | **Sim** (listas “Faltou X”) | Casos + trilha B exploratória; **não** integrar L2C sem denominador |
| Item associado a atraso | **Não** (só cancel “atrasado”) | — |
| Qtd itens por pedido | **Não** | — |

**Método seguro futuro (proposta, não executado):**  
casos de omissão anonimizados → taxonomia de item → taxa só se houver base de pedidos com composição primária (ainda ausente).

---

## 4. Risco de dupla contagem

| Risco | Mitigação |
|---|---|
| Somar Bloco 3 + relatórios iFood L2C | **Proibido** — anos e pipelines diferentes |
| Somar avaliações brutas + pós-moderação | Usar um único critério; PDF já mostra ambos |
| Contar “ocorrências” + “reclamações” + cancel como erros distintos do mesmo evento | Possível overcount — tratar como **sinais**, não união de conjuntos |
| Usar ranking de itens vendidos como “erros de item” | **Proibido** |

---

## 5. Implicação para DeliveryOS / medições

- Bloco 3 é **histórico de gestão visual 2023–2024**, útil para cultura e casos.  
- **Não** substitui baseline nativo L2C 2025–2026.  
- Faixa 22–00 do PDF **conflita** com regra oficial L2C de corte 23:00 se alguém reutilizar o slide sem adaptação.

---

*Cruzamento L4×L2C · confirma forma de volume; não fecha atraso 2026.*
