# Codebook de Categorias Operacionais — L2A.1

> Definições operacionais para reclassificação do WhatsApp (unidades de evidência).  
> Uso: calibrar numerador da futura L2B. **Não** avalia pessoas.  
> Implementação privada: `../deliveryos-private-sources/01_WORK_COPIES/DERIVED/IFOOD_L2A1/`.

---

## 0. Princípios

1. Classifica-se a **unidade de evidência** (janela de mensagens), não a linha isolada.  
2. Palavra-chave sozinha **não** basta.  
3. Exige-se âncora operacional (`pedido`, `cliente`, `ifood`, item/kit, sistema, etc.) salvo regra específica.  
4. Negação e conversa geral → exclusão ou baixa confiança.  
5. Campos mínimos de unidade válida: `unit_id`, `wa`, `local_date`, `local_hour`, `n_msgs`, texto da janela, categoria, `conf`.

**Confiança:** `alta_confianca` | `media_confianca` | `baixa_confianca` | `ambiguo` | `descartado`.

**Só `alta_confianca` entra no numerador quantitativo da L2B.**

---

## 1. item_faltante

| Campo | Definição |
|---|---|
| **Definição operacional** | Indício de que item/componente do pedido não foi enviado ou chegou ausente. |
| **Inclusão** | `faltou`, `veio sem`, `esqueceram de mandar/enviar/colocar`, `não mandaram/enviaram`, com âncora de item/pedido/cliente. |
| **Exclusão** | Falta de gente/escala; “não faltou”; hipotético “se faltar”; conversa sem pedido. |
| **Exemplo + (anon.)** | “Faltou o shoyu no pedido do cliente.” |
| **Exemplo − (anon.)** | “Falta gente no jantar.” / “Se faltar molho avisa.” |
| **Ambíguo** | “Faltou algo?” sem resposta nem item. |
| **Confusão** | `embalagem` (kit incompleto vs item do cardápio); `reclamacao`. |
| **Mínimos** | Sinal de ausência + âncora item/pedido/cliente. |

---

## 2. embalagem

| Campo | Definição |
|---|---|
| **Definição** | Problema ou ação sobre kit, sacola, lacre, acompanhamentos de embalagem (shoyu/hashi/wasabi). |
| **Inclusão** | kit/sacola/lacre/embalagem ligados a montar/fechar/conferir/erro/cliente; 2ª sacola. |
| **Exclusão** | “kit” de limpeza/ferramenta; menção genérica sem operação. |
| **Exemplo +** | “Fecha a sacola com lacre e confere o kit.” |
| **Exemplo −** | “Kit de limpeza na área.” |
| **Ambíguo** | Só “kit” sem verbo operacional. |
| **Confusão** | `item_faltante`, `conferencia` (L1). |

---

## 3. falha_sistema

| Campo | Definição |
|---|---|
| **Definição** | Falha de ferramenta digital/física que impede fluxo (iFood, impressora, Odhen, Teknisa, comanda). |
| **Inclusão** | impressora/não imprime; iFood caiu/bug; odhen/teknisa; sistema travou; comanda não sai. |
| **Exclusão** | “sistema de trabalho/escala” no sentido de processo humano. |
| **Exemplo +** | “Impressora não imprime a comanda.” |
| **Exemplo −** | “Nosso sistema de escala mudou.” |
| **Ambíguo** | “iFood” sem sintoma. |
| **Confusão** | `indisponibilidade` (pausa voluntária ≠ queda). |

---

## 4. indisponibilidade

| Campo | Definição |
|---|---|
| **Definição** | Pausa de loja/item, 86, insumo esgotado, delivery que não sobe. |
| **Inclusão** | pausei/pausar/pausa iFood|delivery|item; 86; sem salmão/insumo; esgotado; não está subindo. |
| **Exclusão** | Pausa de café/almoço da equipe; “sem pausa”. |
| **Exemplo +** | “Pausei o temaki, sem salmão.” |
| **Exemplo −** | “Pausa pro café.” |
| **Ambíguo** | “pausa” sem objeto. |
| **Confusão** | `falha_sistema`, `cardapio`. |

---

## 5. atraso

| Campo | Definição |
|---|---|
| **Definição** | Pedido/cliente/motoboy em atraso operacional (não atraso de pagamento). |
| **Inclusão** | atraso/atrasado ligado a pedido|cliente|motoboy; pronto há X min; aguardando motoboy; não saiu ainda. |
| **Exclusão** | “sem atraso”; atraso de salário/pagamento; demora genérica sem pedido. |
| **Exemplo +** | “Pedido atrasado, motoboy não chegou.” |
| **Exemplo −** | “Demora de sempre no trânsito” sem pedido. |
| **Ambíguo** | Só “motoboy” sem atraso. |
| **Confusão** | `logistica`, `compensacao` (cortesia por atraso). |

---

## 6. compensacao

| Campo | Definição |
|---|---|
| **Definição** | Oferta ou pedido de cortesia, desconto, reembolso ou item compensatório ao cliente. |
| **Inclusão** | cortesia, reembolso, desconto+cliente/pedido, compensar, N reais de cortesia, “vou mandar um hot”. |
| **Exclusão** | “compensa a pena”; “vale a pena”; desconto de cardápio sem problema. |
| **Exemplo +** | “Vou dar cortesia de 10 reais pro cliente.” |
| **Exemplo −** | “Compensa fazer o combo.” |
| **Ambíguo** | “desconto” sem cliente/problema. |
| **Confusão** | `reclamacao`, `escalonamento` (pedir autorização para compensar). |

---

## 7. reclamacao

| Campo | Definição |
|---|---|
| **Definição** | Cliente insatisfeito, reclamação explícita ou avaliação ruim (estrelas/nota). |
| **Inclusão** | reclama*; cliente bravo/irritado/chateado; 1 estrela; avaliação ruim; nota baixa. |
| **Exclusão** | “sem reclamação”; 5 estrelas; “não reclama”. |
| **Exemplo +** | “Cliente reclamou e deu 1 estrela.” |
| **Exemplo −** | “Cliente elogiou, 5 estrelas.” |
| **Ambíguo** | “estrela” sem polaridade. |
| **Confusão** | `item_faltante`, `atraso`, `compensacao` (consequência). |

---

## 8. escalonamento

| Campo | Definição |
|---|---|
| **Definição** | Pedido explícito de autorização/decisão a hub de autoridade sobre caso operacional. |
| **Inclusão** | pode autorizar; autoriza; o que faço com…; preciso de autorização; posso cancelar/compensar/pausar?; me confirma se pode. |
| **Exclusão** | “ok/valeu/bom dia”; `@` isolado; “pode?” social; menção a nome sem pedido de decisão. |
| **Exemplo +** | “Posso compensar esse pedido? Autoriza?” |
| **Exemplo −** | “Pode ser amanhã o plantão?” (escala ≠ escalonamento de caso). |
| **Ambíguo** | “me ajuda” sem caso. |
| **Confusão** | `lideranca`, `compensacao`, `duvida_recorrente` (L1). |

---

## 9. Tratamento separado (não entra em taxa temporal)

### lideranca

- **Uso:** cultura, escala, plantão, equipe, contratação — **qualitativo**.  
- **Não** usar em taxa por hora/dia até método próprio.  
- Exemplo +: “Escala de amanhã com reforço.”  
- Exemplo −: “equipe” genérico em elogio.

### ideia_melhoria

- **Uso:** formação e cultura — **qualitativo**.  
- Exemplo +: “Ideia: contador de dias sem erro de kit.”  
- Exemplo −: “sem ideia do que fazer no pedido” (dúvida operacional).

---

## 10. Campos de unidade válida (mínimo)

| Campo | Obrigatório |
|---|---|
| unit_id, wa, local_date, local_hour | sim |
| n_msgs, iso_start/iso_end | sim |
| categoria + conf | sim |
| has_decision / time_anchor | desejável |
| resultado (resolvido) | frequentemente ausente |
| PII (nome, telefone, etc.) | **proibido** no Git |

---

## 11. Método de confiança (resumo)

| Conf | Regra |
|---|---|
| alta | padrão primário do codebook + âncora ops + suporte (multi-msg, decisão, âncora temporal ou texto longo) |
| media | primário + ops sem suporte extra |
| baixa | soft keyword + ops, ou primário sem ops |
| ambiguo | soft isolado |
| descartado | exclusão, vazio ou sem sinal |

---

*Codebook L2A.1 · base da reclassificação privada e dos gates.*
