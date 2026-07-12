# Análise Temporal Restrita — L2B (Trilha A + exposição)

> Foco: tempo local, estabilidade entre semanas, absoluto vs normalizado.  
> **Sem “pior dia/hora” como veredito operacional.**

---

## 1. Política de tempo

| Regra | Valor |
|---|---|
| Fuso | America/Sao_Paulo |
| operational_day_key | local_date |
| Fluxo normal | local_hour **&lt; 23** |
| Madrugada no dia anterior | **proibido** |
| Hora 17 | exposição zero esperada · **sem taxa** |
| Após 23:00 | série separada |

Análises de horário em três camadas:

| Camada | Uso |
|---|---|
| A · event_time confirmado | só unidades com âncora temporal no texto |
| B · communication_time | padrão quando evento não confirmado |
| C · desconhecido | não forçar |

Na Trilha A elegível: indisponibilidade 3/5 com âncora; compensação **0/2** com âncora → horários de compensação são **comunicação**.

---

## 2. Volume de exposição (contexto)

Pedidos válidos por weekday (fluxo normal, período):

| Dia | Recebidos | Válidos | Cancel. |
|---|---:|---:|---:|
| Dom | 1532 | 1506 | 26 |
| Seg | 1010 | 998 | 12 |
| Ter | 804 | 794 | 10 |
| Qua | 1279 | 1252 | 27 |
| Qui | 1288 | 1255 | 33 |
| Sex | 1249 | 1211 | 38 |
| Sáb | 1139 | 1108 | 31 |

Pico de pedidos: **18–20h**. Tarde 15–16: volume baixo. 17h: zero.

Semanas (recebidos): W1≈2034 · W2≈2026 · W3≈1910 · W4≈1904 · W5≈427 (parcial no fim do pack).

---

## 3. Trilha A no tempo

### 3.1 Indisponibilidade (n=5 elegíveis)

| Dimensão | Observação | Interpretação permitida? |
|---|---|---|
| Semana | Maioria em W1 | **Não** como padrão — dependência de subperíodo |
| Weekday | Disperso | Não |
| Hora | 15, 19–21 | Não (n&lt;5 por célula) |
| Período | Predomínio jantar (contagem) | Descritivo apenas |

Taxa global: **0,062 / 100 pedidos válidos** (IC amplo).

### 3.2 Compensação (n=2 elegíveis)

| Dimensão | Observação |
|---|---|
| Datas | 2026-05-28 (12h), 2026-06-18 (22h) |
| Semanas | W1 e W4 |
| temporal_reference | **communication_time** em ambas |

Taxa global: **0,025 / 100** — **amostra pequena**.

---

## 4. Estabilidade entre semanas

| Pergunta | Resposta |
|---|---|
| Sinal A aparece em quantas semanas? | Indisponibilidade: ≥2; compensação: 2 |
| Direção consistente? | Contagens baixas demais para tendência |
| Depende de uma data? | Parcialmente (W1 puxa indisponibilidade) |
| Desaparece sem normalização? | N/A em n tão baixo |
| Classificação | **hipótese fraca** / **sinal isolado** — **não** padrão permanente |

Nenhuma hipótese temporal A pode ser “padrão permanente” com 30 dias e n≤5.

---

## 5. Absoluto × normalizado (WA total)

Hipótese operacional comum: “22h–23h tem mais mensagens, logo pior horário”.

| Evidência | Leitura |
|---|---|
| Absoluto no jantar 18–20 | mensagens **não** no topo (topo abs ≈ 14–16h) |
| Normalizado 18–20 | **baixa** incidência WA/100 pedidos (~0,7–0,9) |
| Normalizado 21–22 | sobe (~2,1–3,0) vs pico de pedidos |
| Normalizado 15–16 | muito alto, mas **denominador instável** (&lt;100 pedidos) |

**Conclusão temporal restrita:**  
1) Não declarar “pior horário de jantar” por volume absoluto de chat.  
2) 21–22h é **hipótese fraca** de maior incidência comunicacional por pedido (vs 19h).  
3) Tarde exige proteção de célula — não comparar com 1700 pedidos.

---

## 6. Fronteira 23:00

4 pedidos iFood · status concluído · fora do fluxo normal.  
Unidades A ≥23h **não** entram na taxa.  
**Impacto nas taxas A: nenhum** se a exclusão for mantida.

---

## 7. Comparações válidas (exemplos)

Permitido com ressalva:

- jantar vs jantar (mesma definição de período)  
- mesma weekday×hora entre semanas (quando n e den suficientes)  
- W1–W4 (W5 parcial)

**Proibido sem ressalva:** comparar hora 16 (49 pedidos) com hora 19 (1745) como se fossem estáveis.

---

*Análise temporal L2B · conservadora · 30 dias insuficientes para permanente.*
