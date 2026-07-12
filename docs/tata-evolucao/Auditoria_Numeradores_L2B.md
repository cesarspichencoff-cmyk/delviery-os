# Auditoria dos Numeradores — L2B (Trilha A)

> Período comum obrigatório: **2026-05-27 → 2026-06-25** · `America/Sao_Paulo`  
> Categorias A: `indisponibilidade`, `compensacao`  
> Fonte: unidades de **alta confiança** (L2A.1) + revisão unitária com codebook  
> Privado: `../deliveryos-private-sources/01_WORK_COPIES/DERIVED/CROSS_L2B/audit/`  
> **Sem PII. Sem mensagens brutas no Git.**

---

## 1. Regras da auditoria

Para cada unidade candidata A no período:

1. Contexto da janela da unidade (não mensagem isolada)  
2. Confirmar ocorrência operacional distinta  
3. Remover duplicidade (mesmo canal + data + hora + subtipo)  
4. Confirmar `local_date` no período comum  
5. Separar `event_time` vs `communication_time`  
6. Classificar subtipo / contexto / resultado  
7. Elegibilidade para taxa: fluxo normal (`local_hour < 23`, fora de hora 17 e fora de janela sem pedidos)

`temporal_reference = communication_time` quando o horário real do evento não está confirmado.

---

## 2. Denominador (exposição iFood L3)

| Denominador | Valor | Uso |
|---|---:|---|
| Pedidos recebidos no período | 8.305 | referência |
| Fluxo normal (`hora < 23`) | **8.301** | cancelamentos / atraso-flag |
| **Válidos** fluxo normal (não cancelados) | **8.124** | **denominador principal das taxas A** |
| Cancelados fluxo normal | 177 | métrica iFood |
| Após 23:00 | **4** | série separada; **não** no fluxo normal |

---

## 3. Indisponibilidade

| Etapa | n |
|---|---:|
| Candidatas alta confiança no período | **6** |
| Revisadas | 6 |
| Confirmadas (qualquer fluxo) | 5 |
| **Elegíveis para taxa (fluxo normal)** | **5** |
| Ambíguas | 1 |
| Descartadas / duplicatas | 0 / 0 |
| Com horário de evento provável | 3 |
| Só horário de comunicação | 2 |
| Resultado conhecido no texto | 1 |
| Resultado desconhecido | 4 |

### Subtipos (elegíveis)

| Subtipo | n | Nota |
|---|---:|---|
| pausa_loja | 2 | não é erro automático |
| pausa_produto | 1 | |
| item_indisponivel | 1 | |
| sem_causa_conhecida | 1 | |

### Distribuição temporal (elegíveis, contagem)

- Semanas: W1 concentrada (maioria) + W3  
- Períodos: jantar (maioria), 1 tarde  
- Horas: 15, 19, 20, 21 (disperso)  
- Canais: WA-03, WA-05, WA-12, WA-13  

**Todas as células por hora/dia têm n &lt; 5 → amostra pequena; sem padrão.**

---

## 4. Compensação

| Etapa | n |
|---|---:|
| Candidatas alta confiança no período | **6** |
| Revisadas | 6 |
| Confirmadas (qualquer fluxo) | 3 |
| **Elegíveis para taxa (fluxo normal)** | **2** |
| Ambíguas | 1 |
| Descartadas | 2 |
| Duplicatas | 1 |
| Fora de fluxo / sem denominador (ex.: ≥23h, hora 17, &lt;11h) | 1+ |
| Com horário de evento confirmado | **0** |
| Só horário de comunicação | **2** |
| Resultado conhecido | 1 |
| Resultado desconhecido | 1 |

### Tipos e contextos (elegíveis)

| Tipo | n |
|---|---:|
| compensacao_generica | 1 |
| compensacao_sem_motivo_documentado | 1 |

| Contexto | n |
|---|---:|
| falha_logistica (sinal no texto) | 1 |
| motivo_desconhecido | 1 |

**Compensação não é tratada como falha.** Pode ser recuperação comercial.

`n = 2` → **amostra pequena**; taxa global só descritiva.

---

## 5. Após 23:00 e hora 17

| Classe | Tratamento |
|---|---|
| Pedidos iFood 23:00 (4) | `fronteira_encerramento` / pedido real boundary; **fora** do denominador normal |
| Unidades WA ≥23h | fora do numerador de taxa |
| Hora 17 | exposição **zero esperada**; **sem taxa** |
| Hora &lt; 11 | fora da janela de pedidos do pack; sem taxa |

---

## 6. Gate para calcular taxa

| Categoria | Numerador auditado? | Pode publicar taxa global? | Pode “pior hora/dia”? |
|---|---|---|---|
| indisponibilidade | **Sim** (5 elegíveis) | Sim, com ressalva de amostra | **Não** |
| compensacao | **Sim** (2 elegíveis) | Sim, só descritiva (n&lt;5) | **Não** |

---

## 7. Semântica obrigatória

Publicar como:

- **unidades comunicadas de alta confiança por 100 pedidos válidos**  
- **incidência comunicacional normalizada**

**Não** publicar como: taxa real de erro, desempenho de equipe, risco comprovado.

O WhatsApp mede **comunicação observável**, não o censo de ocorrências.

---

*Auditoria L2B · numerador A fechado antes das taxas.*
