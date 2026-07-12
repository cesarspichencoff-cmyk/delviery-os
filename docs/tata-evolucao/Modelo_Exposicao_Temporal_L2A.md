# Modelo de Exposição Temporal — L2A

> Como a base privada de pedidos foi agregada e o que ela **permite** calcular.  
> Sem taxas de erro WhatsApp. Sem “pior horário”.

---

## 1. Política de tempo (oficial)

| Regra | Valor |
|---|---|
| Fuso | **America/Sao_Paulo** |
| `local_date` | civil no fuso |
| `operational_day_key` | **= local_date** |
| Encerramento | **23:00** |
| Madrugada no dia anterior | **Proibido** |
| `local_hour ≥ 23` | fora do fluxo normal (`after_hours_class`) |

---

## 2. Períodos operacionais **descritivos** (proposta — validar com César)

Derivados do **histograma de pedidos** do pack L3 (8.305 pedidos). Contagens absolutas de pedidos por hora (não “risco”):

| Hora local | Pedidos (L3) | Rótulo proposto |
|---:|---:|---|
| 11–12 | 619+795 | abertura / almoço |
| 13–14 | 478+343 | pós-almoço |
| 15–16 | 91+49 | vale tarde |
| 17 | 0* | transição (*possível buraco de classificação/turno no export) |
| 18–20 | 1570+1745+1214 | **pico jantar** (maior volume) |
| 21–22 | 795+602 | pós-pico / fechamento |
| 23 | 4 | após 23:00 (separado) |
| 0–10 | 0 | sem pedidos neste pack |

\*O buraco na hora 17 merece validação (pode ser artefato de fuso/turno do export).

**Rótulos propostos para análise (não baseline oficial):**

- `abertura_almoco` (11–14)  
- `pre_pico_tarde` (14–17)  
- `pico_jantar` (18–21)  
- `pos_pico_fechamento` (21–23)  
- `after_23` (≥23)  

César pode ajustar cortes antes de qualquer uso em alerta/curso.

---

## 3. Agregação privada mínima (implementada)

Por `local_date` + janela **30 min** e **60 min**:

| Campo | Preenchido L2A? |
|---|---|
| local_date | sim |
| weekday | sim |
| local_hour (início da janela) | sim |
| time_window_30m / 60m | sim |
| operational_period | sim (rótulo proposto) |
| orders_received | sim |
| orders_cancelled | sim |
| orders_valid | sim |
| items_total | **não** (sem linhas de item) |
| average_items_per_order | **não** |
| orders_with_composition | 0 |
| source_coverage | `pedidos_pack_maio_jun` |
| data_quality | ok |
| context_missing | item_lines, absolute_ready_at, praca |

Extras no pedido sanitizado: `delayed`, `delay_min`, `prep_min`, `ready_btn_min`, `channel`, `after_23`.

---

## 4. Métricas **preparadas** (fórmulas prontas; erro WA só na L2B se categoria OK)

| Métrica | Numerador futuro | Denominador L2A |
|---|---|---|
| pedidos / hora / dia | — | orders_received |
| cancelamentos / 100 pedidos | orders_cancelled | orders_received |
| pedidos com atraso&gt;0 / 100 | orders_delayed | orders_received |
| unidades WA (cat elegível) / 100 pedidos | count unidades filtradas | orders_received no mesmo dia×faixa |
| unidades / 1.000 itens | count | **bloqueado** sem items_total |
| composition média | — | **bloqueado** |

**Nenhuma razão WA/iFood foi calculada como “taxa de erro confirmada” nesta L2A.**

---

## 5. Faixas de volume (descritivo L3)

| Observação | Valor |
|---|---|
| Média aproximada | 8305 pedidos / 30 dias ≈ **277 pedidos/dia** |
| Hora de maior volume absoluto | **19h** (1745 pedidos no pack) |
| Hora de menor volume (com pedidos) | **16h** (49) entre 11–22 |

Isso descreve **exposição**, não qualidade nem risco.

---

## 6. Limitações

1. Um único pack de ~30 dias — não generalizar sazonalidade anual.  
2. Sem composição → sem taxa por item/praça.  
3. Atraso é vs tempo **prometido**, não diagnóstico de causa.  
4. Hora 17 com zero pedidos — investigar antes de modelar “vale”.  
5. Logística Claude (24.9k) não fundida — evita double-count prematuro.  

---

*Exposição L3 pronta em DERIVED · pronta para L2B com categorias WA filtradas.*
