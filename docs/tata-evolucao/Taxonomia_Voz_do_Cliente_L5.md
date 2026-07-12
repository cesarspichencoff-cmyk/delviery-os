# Taxonomia da Voz do Cliente — L5

> Multiclassificação sobre avaliações únicas.  
> Temas em texto livre **e** tags estruturadas iFood (após limpeza).

---

## 1. Eixos da taxonomia

| Família | Temas |
|---|---|
| Polaridade | elogio · reclamação (via polaridade) · misto · sugestão |
| Alimento | qualidade_alimento · temperatura · apresentação · sabor/porção · frescor (via qualidade) |
| Montagem | embalagem · kit · item_faltante · item_trocado · pedido incompleto |
| Tempo/logística | atraso · motoboy_logistica · prazo (via atraso) |
| Relação | atendimento · comunicação · recuperação · compensação |
| Catálogo | indisponibilidade · cardápio · app_sistema · preço |
| Risco | segurança_alimentar · risco_perda · recompra/fidelidade |

**Severidade:** baixo · moderado · alto · crítico · desconhecido  
(1 caso **crítico** por regex de segurança alimentar → **revisão humana**, sem diagnóstico automático.)

---

## 2. Temas em manifestações negativas/mistas (prioridade)

| Tema | n (pol. neg/mista) | /100 avaliações únicas |
|---|---:|---:|
| qualidade_alimento | 41 | 4,0 |
| apresentacao | 21 | 2,0 |
| porcao | 20 | 1,9 |
| **item_faltante** | **10** | 1,0 |
| temperatura | 9 | 0,9 |
| preco | 8 | 0,8 |
| **item_trocado** | **5** | 0,5 |
| motoboy_logistica | 4 | 0,4 |
| embalagem | 3 | 0,3 |
| kit (texto) | ~2 | amostra pequena |
| atraso (texto) | **0** | — |
| indisponibilidade | 1 | amostra pequena |

Células com n &lt; 5: **amostra pequena** — sem recorrência temporal afirmada.

---

## 3. Temas em manifestações positivas (tags + texto)

| Tema | n (pol. positiva) | Nota |
|---|---:|---|
| qualidade_alimento | 836 | Muito impulsionado por tag “Comida Saborosa” etc. |
| elogio | 746 | Tags positivas + texto |
| embalagem | 467 | “Boa embalagem” / sustentável |
| apresentacao | 454 | “Boa aparência” |
| porcao | 401 | “Boa quantidade” |
| temperatura | 291 | “Temperatura certa” |

**Interpretação:** a maioria das avaliações 5★ **não traz texto**; o elogio estruturado vem de **tags iFood** escolhidas pelo cliente. Isso é percepção positiva de alimento/embalagem/quantidade — **não** prova ausência de falha em todos os pedidos.

---

## 4. Separações obrigatórias

| Par | Regra |
|---|---|
| Fato vs relato | Só o que o export mede (nota, data, tags) é “fato de registro” |
| Causa percebida vs confirmada | Cliente pode atribuir causa → **causa percebida** |
| `review_at` vs ocorrência | Sem `order_at` → só tempo da **manifestação** |
| Tag positiva vs operação perfeita | Tag ≠ auditoria de cozinha |
| Nota alta vs sem falha | Nota 5 com texto misto existe (classificado misto quando detectável) |

---

## 5. Estados ausentes no export

| Estado | Status L5 |
|---|---|
| Avaliação bruta vs publicada | **desconhecido** |
| Moderação aceita/recusada | **desconhecido** |
| Resposta da loja | **ausente** |
| Recuperação documentada pela loja | **ausente** (só menção no texto do cliente, se houver) |

---

*Taxonomia L5 · pronta para formação e processo, não para ranking.*
