# MAPA DE CAMPOS — COMANDAS E ETIQUETAS REAIS

| Campo | Valor |
|---|---|
| Gate | Zero — fontes reais |
| Data | 2026-07-20 |
| Worktree | `deliveryos-entregas-v1` / `feature/entregas-v1` |
| Fontes | Fotografias reais (pacote WA 2026-07-13); R1 consolidado (20 fotos); `Parser_Comanda_Tecnisa_V1.md` |
| Regra | Artefato impresso ≠ Delivery. Reimpressão ≠ nova entrega. Exemplos **anonimizados**. |

---

## 0. Inventário de layouts observados

| ID layout | Nome visual | Origem técnica observada | Uso operacional | Evidência |
|---|---|---|---|---|
| **L1** | **Relatório de Entrega** (térmica longa) | Odhen / Teknisa / ForSale | Sacola; expedição; motoboy próprio ou handoff | Fotos 2026-04 (ex.: pedido interno 0000208183, ORIGEM ForSale) |
| **L2** | **Comanda compacta** (clip na sacola) | App/canal próprio (Link / site) | Identificação rápida de endereço e pagamento | Fotos 2026-06 (ex.: pedido 16.510 / 16.513) |
| **L3** | **Link Delivery App** (cupom completo) | App próprio Link Delivery | Pedido + itens + totais + pagamento | Fotos 2026-03 (ex.: pedido 15697, 15689) |
| **L4** | **Relatório com bloco iFood** | Odhen + código curto iFood | Handoff marketplace | R1 + Parser Tecnisa (campo `IFOOD......` + ORIGEM iFood) |
| **L5** | Anotações manuscritas | Caneta na comanda | Canal (“App”), volumes, correções | “App” manuscrito; itens riscados “não foi” (César confirmou: só no papel) |

**R1:** 5 compactas · 9 relatórios detalhados · 1 formato app · 5 comprovantes app delivery.  
**Correlação automática com planilha:** nenhum vínculo confirmado (sem order_id compartilhado na planilha).

---

## 1. Modelo L1 — Relatório de Entrega (Odhen/Teknisa)

Campos lidos no papel (exemplos sintéticos; estrutura fiel às fotos).

| Nome visual | Exemplo anonimizado | Significado operacional | Quem usa | Etapa | Obrigatório no papel? | Pode ausente? | Pode mudar? | Identifica | Duplicidade | Privacidade | Destino no app novo |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Título “Relatório de Entrega” | — | Tipo de artefato | Todos | Impressão | sim (layout) | não | não | artefato | reimpressão possível | baixa | `PrintedArtifact.source_layout` |
| Operador | `000000001001` | Código operador/caixa | Loja | Expedição | sim (visto) | raro | sim | técnico | fraco | baixa | `print.operator_code` (opcional) |
| Entregador | vazio ou `3004 - DELIVERY ITAIM` | Zona/equipe de impressão, **não** motoboy da casa | Expedição | Pré-saída | nem sempre | sim | sim | fraco | fraco | baixa | **Nunca** preenche `Trip.courier_actor_id` (motoboy casa) nem `Handoff.external_courier_ref` |
| Emissão | `11/04/2026 20:27:41` | Impressão | Todos | Impressão | sim | não | reimp muda | artefato | reimp ≠ novo pedido | baixa | `printed_at` |
| Pedido (interno) | `0000208183` | ID sequencial Odhen | Conferência, expedição, motoboy | Todo ciclo físico | sim | não | não (ID) | **pedido** | reimpressão repete | média | `order_ref` interno / `delivery.external_ids.odhen` |
| Agendamento | vazio | Pedido agendado | Operação | Pré | layout | sim (vazio) | sim | pedido | — | baixa | `scheduled_for` se preenchido |
| Consumidor | `carolina` | Nome no ticket | Motoboy, loja | Rota / handoff | sim | raro | sim | cliente (fraco sozinho) | homônimos | **alta** | `customer.display_name` mascarável |
| ORIGEM | `ForSale` / `iFood` | Canal técnico/comercial | Expedição | Classificação | sim (visto) | pode faltar em L2 | sim | canal | — | baixa | `channel` (não inventar se ausente) |
| Bloco ENDEREÇO | rua, nº, apto, bairro, CEP, cidade | Destino | Motoboy | Rota | sim L1 | parcial | sim | endereço | — | **alta** | `address.*` |
| REFERENCIA | vazio ou texto | Acesso | Motoboy | Rota | layout | sim | sim | endereço | — | média | `address.reference` |
| Formas de Pagamento | vazio / online | Pagamento | Motoboy (troco) | Entrega | layout | sim | sim | pagamento | — | **alta** (valor) | `payment.method` / flags |
| Produtos Vendidos | item × qtd × valor | Conteúdo sacola | Conferência | Montagem | sim L1 | não | **caneta** | volume/itens | — | média | `items[]` (conferência; não verdade absoluta se riscados) |
| Acréscimo/Tx.Entrega | `8,00` | Taxa | Conferência | — | variável | sim | sim | pagamento | — | média | `payment.delivery_fee` |
| TOTAL | `104,00` | Total | Conferência / motoboy | — | sim L1 | não | reimp | pagamento | — | **alta** | `payment.total` (só conferência) |
| Pedido + código de barras (rodapé) | mesmo número + barcode | Match físico | Expedição | Coleta/handoff | sim L1 | — | — | **pedido** / artefato | reimp | média | `barcode` / `order_ref` |
| Anotação “App” (caneta) | `App` | Classificação canal | Loja/motoboy | Expedição | não | sim | sim | canal (hipótese) | — | baixa | evento/observação, **não** estado automático |

### Classificação de dados (L1)

| Categoria | Campos |
|---|---|
| Dado do pedido | Pedido interno, Agendamento, barcode, Emissão |
| Dado do cliente | Consumidor |
| Dado de pagamento | Formas, taxa, TOTAL |
| Dado de endereço | ENDEREÇO, REFERENCIA, bairro, CEP |
| Dado de volume | linhas de produtos (qtd); **não** “nº de sacolas” explícito no papel |
| Dado de expedição | Operador, Entregador (código zona) |
| Observação | REFERENCIA, caneta, OBS (quando presente — ver L4) |
| Identificador técnico | Operador, Pedido, barcode |
| Só visual/impressão | Título, traços, checkboxes `[ ]` nos itens |

---

## 2. Modelo L2 — Comanda compacta (clip)

| Nome visual | Exemplo anonimizado | Significado | Quem / etapa | Obrig. | Ausente? | Muda? | Identifica | Dup. | PII | Destino app |
|---|---|---|---|---|---|---|---|---|---|---|
| Marca “D” / clip | — | Fixação na sacola | Expedição | — | — | — | artefato físico | — | baixa | — |
| Pedido | `16.510` | ID canal próprio (formato curto) | Motoboy | sim | não | não | **pedido** | reimp | média | `order_ref` canal próprio |
| Data/hora | `29/06/26 19:57` | Momento pedido/impressão | Todos | sim | não | reimp | artefato | — | baixa | `printed_at` / `ordered_at` (ambíguo sem fonte) |
| Nome | `L. I.` (anon.) | Cliente | Motoboy | sim | não | sim | cliente fraco | — | **alta** | display name |
| Telefone | `(11) 9XXXX-XXXX` | Contato | Motoboy | sim | raro | sim | cliente médio | — | **alta** | `phone` mascarado; mínimo |
| Endereço + Comp + Bairro + Cidade + CEP | … | Destino | Motoboy | sim | parcial | sim | endereço | — | **alta** | `address.*` |
| Ponto de referência | vazio | Acesso | Motoboy | layout | sim | sim | endereço | — | média | `reference` |
| Entrega (taxa) | `R$ 10,00` | Taxa | Motoboy | variável | sim | sim | pagamento | — | média | fee |
| Total do pedido | `R$ 156,00` | Total | Motoboy | sim | não | sim | pagamento | — | **alta** | total |
| Forma de pagamento | `Pagamento online com cartao (Visa)` | **Já pago online** → sem cobrança na porta | Motoboy | sim | raro | sim | pagamento | — | média | `payment.settled_online` / method |
| Anotação caneta (ex. “OK”) | marca | Conferência humana | Motoboy/loja | não | sim | sim | evento local | — | baixa | observação; não estado automático |

**Itens de produto:** frequentemente **ausentes** neste layout (só cabeçalho + total).  
**Volumes de sacola:** não impressos; podem ser inferidos só por observação física (não no papel).

---

## 3. Modelo L3 — Link Delivery App (cupom com itens)

| Nome visual | Exemplo anonimizado | Categoria | Notas |
|---|---|---|---|
| Estabelecimento | `TATA SUSHI` | visual | Identidade loja |
| Pedido | `15697` | pedido | ID numérico app |
| Data | `22/03/2026 19:41` | pedido/artefato | |
| Nome / Telefone | sintético | cliente | PII alta |
| Forma de entrega | `Delivery` | pedido | vs balcão |
| Endereço completo + Bairro + Comp + Cidade + CEP | … | endereço | |
| Ponto de referência | texto | endereço | |
| Produtos do pedido (Qtd × Produto × Valor) | lista | volume/itens | conferência |
| Valor do pedido / Taxa / Total | … | pagamento | |
| Forma de pagamento | `Pix (online)` / cartão | pagamento | online = sem cobranca porta |
| Anotação “App” | caneta | canal | hipótese de canal próprio |

---

## 4. Modelo L4 — iFood (via Parser Tecnisa + R1)

Campos adicionais / distintos (estrutura documentada; exemplos sintéticos):

| Nome visual | Exemplo | Significado | Destino app |
|---|---|---|---|
| `IFOOD......` / código curto | `0724` | ID curto plataforma | `Handoff.external_order_ref` (e/ou short ref) |
| ORIGEM | `iFood` | Canal marketplace | `channel = ifood` |
| Tel. Consumidor | `0800…` (proxy) | **Não** é celular real do cliente | **não** usar como contato real sem validação |
| OBS. | valor, ID transação, COD cancelamento | misto pagamento/sistema | parse cuidadoso; **cancelamento não confiar só na comanda** (César: status cancelado no Gestor iFood) |
| Produtos | lista | volumes/itens handoff | volumes esperados → conferidos no Handoff |

**Regra operacional (R1 + COR):** motoboy da casa **não** entrega iFood ao cliente. Fluxo = **Handoff** (fora de Trip). Comanda serve para **localizar e conferir** a sacola, não para criar Trip própria.

### Expedição / Handoff iFood — comanda vs loja (courier **não** é usuário)

O entregador iFood **não** tem cadastro, conta, app, disponibilidade, Trip, GPS, rota, ranking nem confirmação de entrega no Entregas.  
Referência externa existe **só** no agregado Handoff. Quem confirma é o **funcionário interno autorizado**.

| Conceito | Vem da comanda? | Quem confirma | Obrigatório para concluir? |
|---|---|---|---|
| Pedido identificado / correto | sim (`Pedido` / código iFood) | Interno | **sim** |
| Volumes esperados | sim (itens/qtd) + contagem | Interno | **sim** |
| Volumes entregues/conferidos | **não** (ato na loja) | Interno | **sim** |
| `courier_verified` | **não** | Interno | **sim** |
| `courier_verification_method` | **não** | Interno | **sim** |
| Ref. mascarada / código plataforma | **não** (ou short code no papel) | Interno se disponível | mínimo; **não** exigir nome/doc |
| Responsável interno (`conference_actor`) | **não** | Interno | **sim** |
| Ator do repasse (`handoff_actor`) | **não** | Interno | **sim** |
| Horário do repasse | **não** | sistema + interno | **sim** |
| Exceção | se divergência | Interno | quando houver |

**Sem verificação pelo interno** → Handoff **pendente** ou **exceção**.  
**Após `handoff_confirmed`:** encerra responsabilidade física da loja; sem Trip/GPS/rota do courier; status posterior só integração oficial iFood.  
**UI:** **EXPEDIÇÃO IFOOD** / **HANDOFF IFOOD** — foco no **pedido e conferência**, não em “Entregadores iFood”.

---

## 5. Separação obrigatória (resumo)

| Camada | O que é | O que não é |
|---|---|---|
| **PrintedArtifact** | Uma impressão física observada | Entrega lógica |
| **Pedido** | order_ref (Odhen / app / iFood short) | Viagem |
| **Delivery** | Unidade lógica de entrega do pedido **próprio** | Artefato; iFood final |
| **Trip** | Viagem do **motoboy da casa**; COR: `courier_actor_id` = rider casa | Handoff; courier externo |
| **Handoff / Expedição iFood** | Repasse na loja ao courier externo; ref. **mínima** só no Handoff | Trip; usuário do módulo; app do courier |
| Correção caneta | Fato no papel | Estado do iFood/sistema |

### Papéis técnicos (nunca misturar)

| Papel | Campo COR / conceito | Objeto | Usuário Entregas? |
|---|---|---|---|
| Motoboy da casa (rider) | `Trip.courier_actor_id` | Trip | **Sim** |
| Courier externo iFood | `courier_verified` + method + ref. mascarada/código se houver | **Só Handoff** | **NÃO** |
| Funcionário interno (conferência/repasse) | `conference_actor` / `handoff_actor` | Handoff | **Sim** |
| Campo impresso “Entregador” (zona) | — | **Descartado** para atribuição | — |

---

## 6. Riscos de duplicidade

1. Reimpressão do mesmo `Pedido` → segundo artefato, **mesma** Delivery.  
2. Layouts L1 e L2 do “mesmo” pedido se reimpressos em sistemas diferentes → correlação por sinais fortes (ID), nunca só nome+endereço.  
3. Nome + endereço iguais **não** unem pedidos (R1).  
4. Código “Entregador” no papel ≠ assignment do motoboy da casa.

---

## 7. Lacunas vs operação (o que a comanda **não** prova)

| Ausente na comanda | Onde existe hoje |
|---|---|
| trip_id | **não existe** na planilha/forms |
| Identidade do motoboy da casa | formulário IDA (nome digitado) / grupo |
| Confirmação de entrega | implícita / chat / volta genérica |
| Nº de sacolas | observação física / chat |
| Chegada / verificação courier iFood | loja (ato de Handoff); não a comanda sozinha |
| Fechamento de ocorrência | bilaterais, pouco estruturado |
| Vínculo com formulário IDA | **não automático** |
| `Trip.courier_actor_id` | form IDA / app (motoboy casa) — **nunca** do campo Entregador impresso |

### Privacidade / descarte (comanda → sistema)

| Entra com finalidade | Não entra / mínimo |
|---|---|
| order_ref, barcode, origem, itens/qtd, endereço de rota, flag online-pago, layout | telefone completo em export; “Entregador” zona como rider; cancelamento inferido do papel; PII em logs públicos |
| Layout desconhecido | **conferência manual** (não auto-promover Delivery/Handoff) |

Enumerações de estado/evento: **somente** COR-ENTREGAS-V1 @ 1.0.3.

---

## 8. Confirmação pedida ao César (comandas)

1. Layout L1 ForSale = sempre pedido **próprio**?  
2. Layout L2/L3 “App” = canal site/Link? Há outro canal impresso?  
3. Campo “Entregador” impresso: confirmado que **não** atribui motoboy nem courier externo?  
4. Volumes/sacolas: próprio com resolução humana; iFood **obrigatório** para concluir Handoff — de acordo?  
5. Layout desconhecido → conferência manual — de acordo?  
6. Falta algum modelo de etiqueta pequena de sacola **além** destes?

---

*MAPA_CAMPOS_COMANDAS · Gate Zero V2 · sem modelo de dados definitivo · aguarda validação César.*
