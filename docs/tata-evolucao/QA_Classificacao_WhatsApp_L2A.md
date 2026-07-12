# QA da Classificação WhatsApp — L2A

> Revisão amostral estratificada das **10 categorias prioritárias** da L1.  
> Método: amostra de **25 unidades/categoria** (total **250**), reabertura do texto na janela  
> `iso_start−5min … iso_end+5min` na cópia de trabalho; critérios estritos + sinal operacional.  
> **Não** é verdade populacional; **não** avalia pessoas.  
> Derivados privados: `../deliveryos-private-sources/01_WORK_COPIES/DERIVED/IFOOD_L2A/qa/wa_sample_qa_v2.json`.

---

## 1. Resultado por categoria

| Categoria | Pool L1 (unid.) | Amostra | TP | FP | Ambíguo | Precisão TP | Recomendação |
|---|---:|---:|---:|---:|---:|---:|---|
| escalonamento | 4104 | 25 | 0 | 25 | 0 | **0,00** | **reclassificar** antes de cruzamento direto |
| lideranca | 1055 | 25 | 0 | 7 | 18 | **0,00** | **reclassificar** (muito genérico) |
| embalagem | 860 | 25 | 17 | 7 | 1 | **0,68** | manter com caveat |
| compensacao | 846 | 25 | 5 | 14 | 6 | **0,20** | **reclassificar** / filtrar forte |
| atraso | 834 | 25 | 4 | 21 | 0 | **0,16** | **reclassificar** / filtrar forte |
| item_faltante | 448 | 25 | 16 | 0 | 9 | **0,64** | manter com caveat |
| reclamacao | 374 | 25 | 8 | 13 | 4 | **0,32** | reclassificar ou filtro operacional |
| falha_sistema | 291 | 25 | 14 | 1 | 10 | **0,56** | manter com caveat |
| indisponibilidade | 290 | 25 | 10 | 7 | 8 | **0,40** | usar só com filtro operacional |
| ideia_melhoria | 264 | 25 | 3 | 6 | 16 | **0,12** | **reclassificar** |

**Amostra total revisada:** 250 unidades.

### Interpretação da precisão

- **TP:** palavra-chave estrita **e** contexto operacional (pedido/cliente/sacola/kit/etc.).  
- **Ambíguo:** palavra-chave sem contexto operacional claro, ou conversa geral.  
- **FP:** janela sem confirmação da categoria (inclui superclassificação L1).  

`escalonamento` na L1 usava regra **muito ampla** (ex.: menções genéricas / “@” / pedidos de confirmação fracos) → **quase toda a amostra falha** no critério estrito de “consulta operacional real”.

---

## 2. Achados transversais da revisão

| Achado | Implicação |
|---|---|
| Muitas unidades são **conversa**, não ocorrência de pedido | Cruzamento com volume iFood não pode usar pool bruto de escalonamento/liderança |
| Decisão explícita no texto | Baixa fração amostral com sinal claro de decisão |
| Resultado (resolvido/cliente ok) | Raro no chat → campo `resultado` frequentemente desconhecido |
| Horário da mensagem = horário do evento | Só às vezes (`agora`, “há X min”); default: **comunicação**, não evento físico |
| Duplicidade entre canais | Não medida na amostra linha a linha; risco permanece para L2B |

---

## 3. Categorias para o cruzamento futuro

| Uso no cruzamento L2B | Categorias |
|---|---|
| **Elegíveis com caveat** (agregado, não causal) | `item_faltante`, `embalagem`, `falha_sistema` |
| **Elegíveis só após filtro operacional adicional** | `indisponibilidade` |
| **Não usar pool L1 cru** | `escalonamento`, `lideranca`, `compensacao`, `atraso`, `reclamacao`, `ideia_melhoria` |

“Não usar cru” ≠ descartar o tema: exige **reclassificação amostral maior** ou regras mais estritas antes de qualquer taxa.

---

## 4. Ajustes de regra sugeridos (para reprocessamento privado)

| Categoria | Ajuste |
|---|---|
| escalonamento | Exigir verbo de pedido de decisão + contexto de pedido/cliente; remover gatilhos genéricos |
| lideranca | Separar `escala_plantao` de menções vagas a “equipe” |
| atraso | Exigir motoboy/pronto/atraso **e** pedido/cliente; filtrar “demora” genérica |
| compensacao | Exigir cortesia/desconto/valor + contexto de problema |
| reclamacao | Exigir cliente/avaliação + sentimento de problema |

---

## 5. O que esta QA **não** faz

- Não reprocessa as 6.632 unidades.  
- Não confirma frequência real de erro.  
- Não cria ranking de pessoas.  

---

*QA amostral L2A · base para decidir o que pode entrar no cruzamento L2B.*
