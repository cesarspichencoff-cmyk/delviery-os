# Usability Test Plan — Copiloto Delivery

Objetivo: validar se a experiência **reduz carga mental** e **acelera a ação certa**, sem virar dashboard ou vigilância.

---

## 1. Escopo

| Inclui | Exclui |
|---|---|
| Foco, Calmo, Ambiente | TATÁ Seleção |
| Voz de consulta e fechamento curto | Treino de motor/ML |
| Mobile no pico | Identidade visual final pixel-perfect (pode ser mid-fi) |
| Failed/degraded | Deploy produção |

**Protótipo:** mock `http://localhost:5188` + superfície Claude consumindo fixtures 01–30.

---

## 2. Participantes

| Perfil | N | Notas |
|---|---:|---|
| Líder de delivery / turno | 3–5 | primário |
| Conferência / produção | 2–3 | Foco de área |
| Quem usa voz no caos | 2+ | overlap ok |

Sem gravar emoção para “score de performance individual”.  
Consentimento só para melhorar o produto.

---

## 3. Ambiente

- Celular real ou frame 390px  
- Áudio com fone opcional  
- Simular barulho de loja (opcional, baixo)  
- Facilitador + observador  

---

## 4. Tarefas P0 (obrigatórias)

| ID | Tarefa | Fixture | Sucesso |
|---|---|---|---|
| T1 | “A operação está ok? O que você faria?” | 01 | descreve calmo sem procurar lista |
| T2 | “O que precisa de atenção? Qual pedido olhar?” | 04 | cita Conferência + 184/191 em ≤30s |
| T3 | “Há duas frentes ruins — o que prioriza a tela?” | 07/08 | aceita um Foco; não exige ranking |
| T4 | “O sistema pisca outro problema — você troca?” | 10 | mantém ou articula por que manter |
| T5 | “Como estaremos em 15 min?” | 11 | repete conclusão + incerteza |
| T6 | “A leitura caiu.” | 16/17 | não inventa prioridade |
| T7 | Por voz: “Qual o maior problema?” | 28 | age sem ler a tela toda |
| T8 | Fechamento com 1 pergunta | 26 | completa ≤2 min com skip/não sei disponíveis |

---

## 5. Tarefas P1

| ID | Tarefa | Fixture |
|---|---|---|
| T9 | Briefing início de turno | 24 |
| T10 | Anomalia “tem algo estranho?” | 13 |
| T11 | Recomendação ignorada — o que a UI comunica? | 20 |
| T12 | Efeito colateral | 23 |

---

## 6. Métricas

| Métrica | Como | Alvo direcional |
|---|---|---|
| Time to first correct action | cronômetro T2 | ↓ vs baseline mental sem UI |
| Focus thrash perception | “a tela mudou demais?” 1–5 | ≤2 |
| Trust when failed | T6 | não age em Foco fantasma |
| Voice reliance | T7 sem olhar | completa intent |
| Closing burden | duração T8 | ≤120s |
| Dashboard smell | pergunta aberta | 0 menções espontâneas a “painel cheio” como desejo no pico |
| Surveillance smell | “pareceu vigiar alguém?” | 0 sim |

**Qualitativo (obrigatório):** citação do que faria no jantar de sexta real.

---

## 7. Roteiro da sessão (~35 min)

1. Consentimento e contexto (3)  
2. Calmo T1 (4)  
3. Foco T2–T3 (8)  
4. Estabilidade T4 (4)  
5. Previsão + falha T5–T6 (6)  
6. Voz T7 (5)  
7. Fechamento T8 (5)  
8. Debrief (5)  

---

## 8. Critérios de go / no-go para integração visual

| Go | No-go |
|---|---|
| ≥80% T2 corretas sem ajuda | usuários pedem “lista de todos os problemas” e a UI cede no pico |
| T6 sem Foco inventado | failed parece calmo |
| T8 ≤2 min | fechamento vira formulário |
| Zero smell de vigilância | ranking / culpa |

---

## 9. Instrumentação ética

- Log de tarefa e tempo — **sem** score de pessoa  
- Gravação de tela opcional, com delete após síntese  
- Não usar áudio para inferir emoção  

---

## 10. Artefatos de saída

- Notas por tarefa  
- 5 clips de fricção  
- Lista de mudanças de copy/hierarquia (não de regras de Foco)  
- Atualização do `DESIGN_HANDOFF` se necessário  
