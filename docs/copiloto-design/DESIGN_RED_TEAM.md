# Design Red Team — Copiloto Delivery

Ataques de design para impedir que a UI destrua o produto.

---

## 1. Ameaças de categoria

| Ameaça | Sintoma na UI | Defesa |
|---|---|---|
| **Dashboard creep** | cards, KPIs, heatmaps no pico | hierarquia L0; Calmo vazio útil |
| **ERP creep** | formulários no pico | só fechamento curto pós-pico |
| **Alert fatigue** | toasts e badges infinitos | silence levels + um Foco |
| **False precision** | 73,2% de certeza | microcopy de faixa e confiança |
| **Surveillance** | ranking de pessoas, emoção de voz | proibições absolutas |
| **Focus thrash** | troca a cada 30s | stability + design de “manter” |
| **Automation theater** | botões que fingem executar o mundo | ação = recomendação + confirmação |
| **Tech cosplay** | esconde failed como calmo | technical_state honesto |

---

## 2. Perguntas obrigatórias antes de shippar tela

1. Isso nasceu da operação real ou de SaaS genérico?  
2. Reduz decisão no pico ou cria trabalho para o sistema?  
3. Mistura confiança com gravidade?  
4. Dá para usar com uma mão suja de luva?  
5. A voz cabe em 20s?  
6. Se o dado mentir, a UI admite?  
7. Parece vigilância?  
8. O Claude precisou inventar regra de Foco? (se sim, **para**)  

---

## 3. Anti-padrões com veredito

| Anti-padrão | Veredito |
|---|---|
| Fila de 5 “alertas” coloridos | **Rejeitar** |
| Mapa 6 setores sempre visível no Home Copiloto | **Rejeitar** no pico |
| Leaderboard de motoboys | **Rejeitar** |
| “IA confiante” animada | **Rejeitar** |
| Som de sirene | **Rejeitar** |
| Fechamento com 12 campos | **Rejeitar** |
| Swipe entre problemas | **Rejeitar** |
| Cor única = urgência+confiança | **Rejeitar** |

---

## 4. Red team por jornada

| Jornada | Ataque | Passa se |
|---|---|---|
| Calmo | “está vazio demais” | líder para de olhar e confia |
| Foco | “falta contexto” | 3 evidências bastam para agir |
| Multi-pressão | “mostre tudo” | um Foco; resto em L4 |
| Voz | “detalha mais” | detailed só sob pedido |
| Failed | “chame de calmo” | banner técnico obrigatório |
| Fechamento | “mais perguntas = mais dados” | máx. 3; info gain |

---

## 5. Herança visual (não reinventar gramática)

- Campo Vivo / consciência: luz = informação, vazio = saúde  
- Não importar literalmente o mapa de 6 setores do DeliveryOS para o Seleção ou Home genérica  
- Não renomear produto na UI para “TATÁ OS” sem autorização  

---

## 6. Critério de “red team aprovado”

Documento assinado (humano) com:

- [ ] Zero anti-padrão da §3 em builds de chão  
- [ ] Matriz de estados implementada  
- [ ] Teste de usabilidade P0 (ver plan) sem falha bloqueante  
- [ ] Handoff de inteligência consumido sem regras inventadas  

---

## 7. Frases que o design deve ousar dizer

- “Isso parece dashboard.”  
- “Isso está pedindo trabalho no pico.”  
- “Isso é vigilância disfarçada de qualidade.”  
- “Isso inventa certeza.”  
