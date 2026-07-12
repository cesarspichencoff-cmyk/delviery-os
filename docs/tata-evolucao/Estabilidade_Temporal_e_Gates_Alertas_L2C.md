# Estabilidade Temporal e Gates de Alertas — L2C

> Classificações permitidas: descritivo · sinal isolado · hipótese fraca · recorrente em 2+ períodos · instável · incompatível · aguardando dados.  
> **Proibido:** “padrão permanente” · alerta aprovado nesta missão.

---

## 1. Reteste das hipóteses L2B

| ID | Hipótese | Status L2B | Status L2C | Decisão |
|---|---|---|---|---|
| H3 | 21–22h elevada vs 18–20 após normalizar | fraca | **recorrente (overlap multiperíodo)** | **Manter** como hipótese metodológica |
| H4 | “Pior jantar” de chat some com /100 ped. | recorrente | **recorrente (reforçada)** | **Manter** |
| H2 | Compensações sobem após pico | fraca/rejeitar | **rejeitada / fraca** (n) | **Rejeitar** como regra |
| H6 | Dependência de uma semana | recorrente | ainda válida em n baixo | **Manter ressalva** |
| H7 | Canal dominante enviesa | recorrente | **recorrente** | **Manter ressalva** |
| H8 | 23h distorce taxas se incluído | rejeitada (se excluir) | **descritivo** — manter exclusão | **Manter política** |
| — | Pico volume = pico atraso nativo | (nova) | **hora 19 coincide** | **Descritivo nativo** |
| — | Taxas A estáveis mês a mês | — | **hipótese fraca** (n) | **Não generalizar** |

### Hipóteses **mantidas**
1. Normalizar comunicação por exposição (H4 / governança).  
2. 21–22h pode ter mais WA/100 que 18–20 sem ser o pior atraso nativo (H3 + q9).  
3. Viés de canal e de subperíodo em numeradores A.

### Hipóteses **rejeitadas / enfraquecidas**
1. 22h = pior horário absoluto de mensagens sem normalizar.  
2. Compensações “sempre pós-pico”.  
3. Chat/100 como proxy de atraso nativo (na verdade **anticorrelaciona** no pico 19h).  
4. Padrão permanente de erro com um mês de WA.

---

## 2. Estabilidade nativa (iFood)

| Sinal | Meses | Estabilidade |
|---|---|---|
| Forma horária do volume | 9 | alta |
| Hora 17 = 0 | 9/9 | total |
| Cancel/100 | 9 | moderada (0,9–2,5) |
| Atraso-flag/100 | 9 | **instável** (22–59; Fev outlier) |
| Preparo P50 | 8 blocos | moderada (27–35 min) |

---

## 3. Gates para futuro alerta operacional

Nenhum alerta **aprovado** em L2C.

### Permanecer em validação exige **todos**
- exposição normalizada  
- ação operacional clara  
- ≥ 2 períodos independentes  
- direção consistente  
- amostra suficiente  
- não depender de 1 data  
- não depender de 1 canal  
- baixo falso positivo  
- métrica observável na operação  

### Avançar a “aprovado para teste” (futuro) exige ainda
- ≥ 3 períodos independentes **ou** 8 semanas completas  
- validação humana  
- ação específica + limite de repetição + fadiga  
- **aprovação do César**

### ALERT-CAND-001
Reclassificado como **REGRA DE GOVERNANÇA ANALÍTICA** — **não** exibir à equipe como alerta operacional.

### Candidatos em validação (operacionais)
**Nenhum** atende amostra + multi-período + ação clara sem dependência de canal.

Sinal H3 (21–22 WA/100) permanece **hipótese**, não candidato de alerta de loja, até haver:
- definição de ação (o que o turno faria diferente?),  
- separação communication_time vs event_time,  
- e n de categorias A/B estável.

---

## 4. Formação e processo (sem curso)

| Destino | Conteúdo |
|---|---|
| Formação | Ler pico de pedidos ≠ pico de chat/100; atraso nativo é outra curva |
| Processo | Sempre normalizar; excluir 17h e ≥23h; reportar com/sem canal dominante |
| Processo | Manter eixos nativo vs comunicação separados em qualquer relatório |
| Dado adicional | Ampliar overlap WA com reclass se quiser taxas A mensais robustas |

---

*Estabilidade e gates L2C · zero alertas ativos.*
