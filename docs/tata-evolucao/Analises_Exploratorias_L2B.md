# Análises Exploratórias — L2B (Trilha B)

> **ANÁLISE EXPLORATÓRIA — NÃO REPRESENTA PADRÃO CONFIRMADO**  
> Categorias gate B (L2A.1). Alta confiança apenas. Período 2026-05-27 → 2026-06-25.  
> **Proibido:** alertas, risco, pior dia/hora, recomendação automática, frequência real.

---

## 1. Contagens (alta confiança, fluxo normal hora &lt; 23)

| Categoria | n no período | Incidência exploratória / 100 válidos* |
|---|---:|---:|
| embalagem | **8** | 0,098 |
| reclamacao | **7** | 0,086 |
| atraso | **5** | 0,062 |
| falha_sistema | **4** | 0,049 |
| item_faltante | **3** | 0,037 |
| escalonamento | **2** | 0,025 |

\*Denominador: 8.124 pedidos válidos. Métrica = **sinal exploratório comunicacional**, não censo de erros.

Todas com **n &lt; 10**; a maioria com **n &lt; 5** → amostra pequena.

---

## 2. O que se pode descrever

| Tipo de saída | Status |
|---|---|
| Contagem total no período | Sim |
| Distribuição por data / hora / weekday | Sim (descritiva) |
| Incidência exploratória / 100 pedidos | Sim, com banner |
| Comparação descritiva abs vs volume | Sim |
| Hipótese geradora | Sim |
| Padrão confirmado | **Não** |
| Alerta / risco / ranking | **Não** |

---

## 3. Leitura transversal B

1. **N totais baixos** no recorte de 30 dias com codebook estrito — esperado após L2A.1.  
2. Distribuição absoluta tende a **acompanhar presença humana no chat**, não só pico de pedidos.  
3. Normalizar por pedidos **reduz** a narrativa de “jantar = pior” para várias comunicações.  
4. `escalonamento` alta confiança residual é **mínimo** (2) — o pool L1 era enganoso.  
5. `embalagem` e `reclamacao` lideram contagem B, ainda sem estabilidade semanal demonstrável.

---

## 4. Células e cobertura

Para qualquer fatia B:

- informar num, den, taxa exploratória, dias, confiança, cobertura;  
- se num &lt; 5 → **amostra pequena · não padrão · sem recomendação**;  
- se den baixo (ex. 15–16h) → **instabilidade**.

---

## 5. Trilha C (lembrete)

`lideranca` e `ideia_melhoria`: **somente qualitativas** (cultura/formação).  
**Sem taxa temporal** neste documento.

---

## 6. Uso permitido dos sinais B

| Destino possível | OK? |
|---|---|
| Gerar hipótese para ampliar período | Sim |
| Formação genérica (atenção a kit/reclamações) | Sim, cuidadoso |
| Procedimento | Só após mais dados |
| Alerta | **Não** |
| “Taxa real” | **Não** |

---

*Exploratório L2B · banner obrigatório em toda reutilização.*
