# Cruzamento Normalizado WhatsApp × iFood — L2B

> Período: **2026-05-27 → 2026-06-25** · fuso **America/Sao_Paulo**  
> `operational_day_key = local_date` · operação normal: `local_hour < 23`  
> Privado: `DERIVED/CROSS_L2B/` · **sem PII no Git**

---

## 1. Desenho

| Eixo | Definição |
|---|---|
| Numerador A | Unidades WA alta confiança, auditadas, elegíveis |
| Denominador principal | **8.124** pedidos válidos (fluxo normal) |
| Denominador secundário | 8.301 pedidos recebidos (fluxo normal) |
| Junção | **Agregada** por data / hora / weekday / período / semana — **sem** join mensagem↔pedido |
| Confiança temporal | `event_time_confirmed` vs `communication_time` |

### Períodos descritivos

| Rótulo | Horas locais |
|---|---|
| almoço | 11:00–14:59 |
| tarde | 15:00–16:59 |
| intervalo sem exposição | **17:00–17:59** (taxa proibida) |
| jantar | 18:00–22:59 |
| fora do fluxo normal | ≥ 23:00 |

---

## 2. Taxas Trilha A (restritas)

### 2.1 Indisponibilidade

| Campo | Valor |
|---|---|
| Métrica | unidades comunicadas (alta conf., auditadas) / 100 pedidos **válidos** |
| Numerador | **5** |
| Denominador | **8.124** |
| Taxa | **0,062 / 100** |
| IC95 (Wilson, escala /100) | ≈ **0,026 – 0,144** |
| Dias / semanas no período | 30 / ~5 |
| Estabilidade | hipótese fraca · período curto · n pequeno |
| Semântica | **incidência comunicacional normalizada — NÃO taxa real de erro** |

Por 100 pedidos recebidos (8.301): ≈ 0,060 / 100.

### 2.2 Compensação

| Campo | Valor |
|---|---|
| Numerador | **2** |
| Denominador | **8.124** |
| Taxa | **0,025 / 100** |
| IC95 (/100) | ≈ **0,007 – 0,090** |
| Flag | **amostra pequena** (n &lt; 5) |
| Semântica | comunicação de compensação ≠ falha automática |

### 2.3 Métricas só iFood (contexto de exposição)

| Métrica | Num | Den | /100 |
|---|---:|---:|---:|
| Cancelamentos / 100 recebidos (fluxo normal) | 177 | 8.301 | **2,13** |
| Atraso-flag (min&gt;0 vs prometido) / 100 recebidos | 3.147* | 8.301 | **~37,9** |

\*Flag de atraso do export; **não** é diagnóstico causal de cozinha.

### 2.4 Bloqueado

- taxa / 1.000 itens  
- taxa por praça / categoria de produto  
- composição inventada  

---

## 3. Dimensões temporais A

Todas as células A por hora/dia/weekday têm **numerador &lt; 5** → marcadas **amostra pequena · não padrão · sem recomendação operacional**.

| Dimensão | Achado descritivo |
|---|---|
| Weekday | Contagens A dispersas; sem dia dominante interpretável |
| Hora | Sem “pior hora” A |
| Período | Maioria das indisponibilidades auditadas no **jantar** (contagem absoluta pequena) |
| Semana | Forte peso em **W1** para indisponibilidade → risco de dependência de subperíodo |

---

## 4. Absoluto vs normalizado (unidades WA totais no período)

Todas as unidades L1 no período (qualquer categoria), por hora × pedidos:

| Hora | WA abs | Pedidos | WA / 100 pedidos |
|---:|---:|---:|---:|
| 14 | 25 | 343 | 7,3 |
| 15 | 28 | 91 | **30,8** (den. baixo — instável) |
| 16 | 24 | 49 | **49,0** (den. baixo — instável) |
| 17 | 15 | **0** | **sem taxa** |
| 18 | 13 | 1570 | 0,83 |
| 19 | 15 | 1745 | 0,86 |
| 20 | 9 | 1214 | 0,74 |
| 21 | 17 | 795 | 2,14 |
| 22 | 18 | 602 | 2,99 |

**Leitura:** o jantar concentra **pedidos**, não necessariamente a maior **incidência comunicacional** por pedido. Tarde (15–16) tem incidência aparente alta por **denominador frágil**. Hora 22 tem incidência normalizada maior que 19, mas ainda exige validação multi-período.

---

## 5. Sensibilidade ao canal dominante

| Item | Valor |
|---|---|
| Canal dominante (unidades WA no período) | **WA-05** |
| Share | **~28,8%** (não ~40% neste recorte de 30 dias) |
| Indisponibilidade sem WA-05 | 4 / 8124 → 0,049 /100 (vs 0,062) |
| Compensação sem WA-05 | 1 / 8124 → 0,012 /100 (vs 0,025) |

**Conclusão:** numeradores A são sensíveis a canais individuais (n minúsculo). Registrar **viés de comunicação** possível; não igualar volume de mensagens a volume de erros.

---

## 6. Trilhas B e C (resumo)

| Trilha | Categorias | Taxa oficial? |
|---|---|---|
| B exploratória | item_faltante, embalagem, falha_sistema, atraso, reclamacao, escalonamento | **Não** — ver `Analises_Exploratorias_L2B.md` |
| C qualitativa | lideranca, ideia_melhoria | **Não** |

---

## 7. Controles

| Controle | Status |
|---|---|
| Período num = den | **Sim** |
| After-23 separado | **Sim** (4 pedidos) |
| Células n&lt;5 | protegidas |
| Baixa exposição | não comparar com pico sem ressalva |
| Causalidade | **não afirmada** |
| PII no Git | **não** |

---

*Cruzamento L2B · taxas A publicadas com semântica comunicacional.*
