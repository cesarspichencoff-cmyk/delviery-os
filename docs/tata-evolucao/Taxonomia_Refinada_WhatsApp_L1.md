# Taxonomia Refinada — WhatsApp L1

> Refino a partir da T0B-A + aplicação heurística às **6.632 unidades de evidência**.  
> Contagens = unidades (não mensagens isoladas), ainda **não** taxa operacional.

---

## 1. Namespace estável (mantido)

Cultura · atendimento · cardápio · regra comercial · atraso · cancelamento · alteração · indisponibilidade · pedido errado · item faltante · embalagem · produção · conferência · caixa · logística · motoboy · comunicação interna · escalonamento · compensação · reclamação · elogio · falha de sistema · treinamento · regra informal · decisão excepcional · dúvida recorrente · erro · boa solução · risco · aprendizado · liderança · fofoca · conflito · autonomia · colaboração · ideia de melhoria.

---

## 2. Filhos úteis observados na mineração (propostos)

```text
escalonamento.consulta_confirmacao
escalonamento.autorizacao
escalonamento.sem_resposta_observada   # (limitação: pode haver resposta fora do export)

item_faltante.kit
item_faltante.combinado
item_faltante.molho_acompanhamento

embalagem.kit
embalagem.sacola
embalagem.lacre

atraso.producao_relatado
atraso.saida_motoboy_relatado
atraso.comunicacao_cliente

indisponibilidade.pausa_item
indisponibilidade.insumo

compensacao.cortesia
compensacao.valor_mencionado
compensacao.sem_criterio_explicito

lideranca.escala_plantao
lideranca.prioridade_turno

comunicacao_interna.grupo_operacional
comunicacao_interna.dm_hub

boa_solucao.recuperacao_pedido
ideia_melhoria.ferramenta_app
```

---

## 3. Multiclassificação

Uma unidade pode carregar várias categorias (ex.: `item_faltante` + `compensacao` + `escalonamento`).

Prioridade de **primária** (para ranking de padrões candidatos):

1. item_faltante / pedido_errado / cancelamento  
2. atraso / indisponibilidade  
3. embalagem / conferencia  
4. compensacao / reclamacao  
5. escalonamento / lideranca  
6. demais  

---

## 4. Volume relativo de unidades por categoria (L1)

> Heurística; supercontagens possíveis. **Não** é frequência de erro real.

| Categoria | Unidades (approx) | Meses distintos com unidade |
|---|---:|---:|
| escalonamento | 4.104 | 48 |
| lideranca | 1.055 | 47 |
| embalagem | 860 | 47 |
| compensacao | 846 | 48 |
| atraso | 834 | 45 |
| item_faltante | 448 | 45 |
| reclamacao | 374 | 46 |
| falha_sistema | 291 | 43 |
| indisponibilidade | 290 | 43 |
| ideia_melhoria | 264 | 46 |
| cancelamento | 194 | 41 |
| conferencia | 112 | 40 |
| boa_solucao | 97 | 41 |
| pedido_errado | 31 | 16 |
| caixa | 10 | 8 |
| logistica | 5 | 5 |

Categorias com poucas unidades permanecem no vocabulário mas **não** viram padrão candidato forte.

---

## 5. O que a taxonomia **não** captura bem no chat

| Tema | Limitação |
|---|---|
| Hora exata do erro de sacola | Só hora da **mensagem** |
| Volume de pedidos no momento | Precisa iFood |
| Praça real do item | Precisa composição |
| Fofoca vs fato | Revisão humana |
| Autonomia madura sem palavras-chave | Subdetecção |

---

## 6. Uso

- Classificar novas unidades L1+ com multiclasse.  
- Cruzar com iFood: mapear categorias de **erro/atraso/cancel** para eventos de pedido.  
- Não usar contagem de `escalonamento` isolada como KPI de “imaturidade”.  

---

*Taxonomia viva · refinada por L1 · extensível.*
