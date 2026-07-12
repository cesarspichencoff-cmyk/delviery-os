# Plano de Baseline V0 — TATÁ Evolução

> Define **como** medir o ponto de partida da Fase 1. **Não inventa números nem metas %**
> antes da coleta. Metas só após baseline validado por César.

---

## 1. Propósito do baseline

Saber, com honestidade:

- o que já se repete (erros prioritários);
- quanto a operação depende de escalar para a liderança em decisões rotineiras;
- se o escalonamento é precoce, adequado ou silencioso;
- se competências ensinadas se traduzem em comportamento;
- quanto tempo, por função, até autonomia segura.

Sem isso, qualquer “sucesso do piloto” é marketing.

---

## 2. Métricas prioritárias

### M1 — Repetição de erros prioritários

| Campo | Conteúdo |
|---|---|
| **Definição** | Contagem de ocorrências de categorias prioritárias de erro (ex.: item faltante, kit, pedido errado) por período |
| **Fonte necessária** | WhatsApp (relatos) + Bloco 3 / qualidade iFood + reclamações se existirem; futuro: captura de casos |
| **Unidade** | eventos / semana (ou / 1000 pedidos quando volume iFood disponível) |
| **Período mínimo** | 4 semanas contínuas **ou** 1 mês agregado histórico |
| **Limitações** | WhatsApp sub-representa chão; imagens de erro no chat muitas vezes irrecuperáveis; relatos ≠ todos os erros |
| **Risco de interpretação** | Aumento de relatos pode ser **mais honestidade**, não mais erro |
| **Método de coleta** | T0B: amostrar relatos + agregar PDFs/xlsx; T3: log de casos da Academia |
| **Validação** | César + liderança: lista dos 5 erros que “doem de verdade” |

### M2 — Dependência de liderança para decisões rotineiras

| Campo | Conteúdo |
|---|---|
| **Definição** | Proporção de decisões do tipo “já coberto por regra/treinamento” que ainda sobem para César/liderança |
| **Fonte necessária** | WhatsApp (hub César); observação de turno (T3); casos |
| **Unidade** | % de escalonamentos rotineiros / total de escalonamentos classificados (amostra) |
| **Período mínimo** | 2–4 semanas de amostra rotulada |
| **Limitações** | Difícil separar rotina vs exceção sem taxonomia; viés de quem escreve no chat |
| **Risco de interpretação** | Queda de mensagens pode ser “desistiu de perguntar”, não autonomia |
| **Método** | Amostra de threads; classificar `escalonamento.*` + `autonomia.*`; revisão humana |
| **Validação** | César confirma o que é “rotina esperada por cargo” |

### M3 — Qualidade do escalonamento

| Campo | Conteúdo |
|---|---|
| **Definição** | Distribuição: adequado · precoce · tardio · silêncio (ninguém responde) · com contexto vs sem contexto |
| **Fonte necessária** | WhatsApp; futuro: formulário de caso com campo “consultei liderança?” |
| **Unidade** | % por classe em amostra |
| **Período mínimo** | 50 escalonamentos rotulados ou 4 semanas |
| **Limitações** | Tom e urgência subjetivos; precisa de rubrica curta |
| **Risco de interpretação** | “Bom escalonamento” não é “menos mensagens” |
| **Método** | Rubrica de 5 itens (fato, tentativa prévia, impacto, horário, proposta) |
| **Validação** | Liderança calibra 10 exemplos juntos |

### M4 — Aplicação prática das competências

| Campo | Conteúdo |
|---|---|
| **Definição** | Evidência de **comportamento** e **consistência**, não só conclusão de conteúdo |
| **Fonte necessária** | Simulações (T1–T2); observação de turno (T3); casos; **não** só quiz |
| **Unidade** | checklist por competência: conhecimento / simulação / comportamento / consistência (0–1 cada) |
| **Período mínimo** | Após primeiro ciclo de trilha (T1+); baseline **pré-Academia** = amostra de 5 situações reais por função se possível |
| **Limitações** | Observação cara; risco de Hawthorne |
| **Risco de interpretação** | Confundir “fez certo uma vez” com consistência |
| **Método** | Passaporte V0 só mostra o validado por humano; métrica interna agregada sem ranking |
| **Validação** | César define competências P0 por função antes de medir |

### M5 — Tempo para autonomia por função

| Campo | Conteúdo |
|---|---|
| **Definição** | Tempo desde início na função (ou início da trilha) até critérios mínimos de autonomia do cargo |
| **Fonte necessária** | RH/datas de função (lacuna atual); Passaporte; liderança |
| **Unidade** | dias ou turnos |
| **Período mínimo** | coorte de N≥3 pessoas por função (senão só qualitativo) |
| **Limitações** | Sem RH localizado na T0A; funções mistas |
| **Risco de interpretação** | Pessoas diferentes; não usar para punir lentidão |
| **Método** | Definir marcos por cargo (júnior/pleno/sênior); medir no piloto T3 |
| **Validação** | Liderança + César |

---

## 3. Métricas de apoio (secundárias)

| ID | Ideia | Uso |
|---|---|---|
| M6 | Cancelamentos por motivo (iFood/PDF) | Contexto de qualidade |
| M7 | Avaliações por estrela / comentários (sem PII) | Tendência, não pessoa |
| M8 | Reabertura de dúvidas recorrentes | Priorizar conteúdo |
| M9 | Casos capturados / semana no piloto | Adoção da captura |
| M10 | Itens com 2ª sacola / multi-praça (se dados) | Formação de montagem |

---

## 4. O que **não** medir no V0

- Ranking de funcionários  
- “Engajamento” genérico de app  
- Tempo de tela na Academia como proxy de competência  
- Polaridade de mensagens WhatsApp automática como “clima” sem revisão  

---

## 5. Fases de medição

| Fase | O que fazer |
|---|---|
| **T0B** | Inventariar fontes de M1–M3; recontar WhatsApp com método; extrair séries de Bloco 3 se houver |
| **T1–T2** | Baseline qualitativo de competências; rascunho de rubricas |
| **T3 (piloto 30 dias)** | Coleta formal M1–M5 com captura de casos |
| **T4** | Relatório de baseline consolidado + **só então** discussão de metas |

---

## 6. Responsáveis (propostos)

| Papel | Responsabilidade |
|---|---|
| César | Valida lista de erros prioritários, marcos de autonomia, metas futuras |
| Grok / pesquisa | Métodos, fichas, agregados anonimizados |
| ChatGPT | Consolida desenho de medição no plano de fases |
| Liderança loja | Observação de comportamento no piloto |
| Fable | Fora desta medição cultural (exceto se dado DeliveryOS for reutilizado com autorização) |

---

## 7. Saída do baseline (quando existir)

Um único documento futuro (não nesta T0A):

`docs/tata-evolucao/Baseline_Fase1_YYYY-MM.md`

Com: métodos usados · números com intervalo de confiança verbal · limitações · **sem** meta % se a amostra for fraca.

---

*Plano de baseline · zero metas inventadas na T0A.*
