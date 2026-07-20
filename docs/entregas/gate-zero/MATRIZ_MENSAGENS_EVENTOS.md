# MATRIZ MENSAGENS → EVENTOS

| Campo | Valor |
|---|---|
| Fontes | Grupo “Tatá Sushi Entregas” (export WA); R1 (52.626 grupo + 5.104 bilaterais; 57.730 pós-dedup); amostras 2026 |
| Regra soberana | **Mensagem ≠ evento transacional confirmado.** Candidato no máximo. Confirmação humana ou formulário/app antes de estado definitivo. |
| Gate | Zero |
| Data | 2026-07-20 |

---

## 1. Papel do grupo na operação real

Observado:

- Coordenação de **saídas** e **quem levou o quê**.  
- Endereços e pedidos colados pela loja (`Tata Sushi`).  
- Chegada / atraso de **courier iFood**.  
- Problemas de **interfone**, portaria, cliente.  
- Troco, maquininha, comprovantes.  
- Retirada / devolução / reenvio sob ordem da loja.  
- Mídia (fotos de comanda/sacola) como evidência visual **não estruturada**.  
- Pedidos de suprimento (ex.: sacola P no Poke) misturados ao canal de entregas.

**Não observado como padrão:** fechamento estruturado de ocorrência com status final no próprio grupo (R1: confirmação explícita rara nos filtros).

---

## 2. Contagens lexicais (grupo export — aproximadas, 2026-07)

Sinais de string, **não** ocorrências confirmadas (podem sobrepor e incluir ruído):

| Padrão | ~contagem no export | Interpretação bruta |
|---|---|---|
| cliente | 421 | contexto geral |
| pronto | 211 | pronto / “pronto” iFood / linguagem mista |
| endere* | 152 | endereço/acesso |
| chegou | 111 | chegada (cliente, courier, pedido) |
| não atende / nao atende | ~119 | falha de contato |
| ifood | 78 | marketplace / handoff |
| saindo | 58 | saída em andamento |
| troco | 28 | pagamento |
| voltando | 25 | retorno à loja |
| devol* | 11 | devolução |
| peguei / levei / faltou | ~7 cada | coleta / volume |
| manda outro | 1 | reenvio / substituição |

R1 (sinais bilaterais/grupo classificados): saída/rota 133; endereço 57; pagamento 66; cliente não atende 1 (filtro estrito); item/qualidade 27; handoff iFood 76; ação recuperação 15; fechamento explícito ~3.

---

## 3. Matriz de padrões → eventos candidatos

### 3.1 Ciclo de viagem própria

| Exemplo anonimizado | Interpretação possível | Evento candidato | Confiança | Confirmação necessária | Risco se automático | Pode alterar estado sozinho? |
|---|---|---|---|---|---|---|
| “Saindo” / “Estou saindo com esse pedido agora” | Motoboy declara saída | `trip_departed` / confirma ida | média | Form IDA ou botão app + trip_id | Saída falsa; sem paradas | **NÃO** |
| “Estou saindo com esses três” | Multi-pedido na mesma saída | `trip_departed` + 3 deliveries | média-alta intenção | Lista de order_ref no app | Contagem errada | **NÃO** |
| “As três q eu peguei eu dei saída” | Coleta + ida form | `pickup` + `trip_departed` | média | Conferência volumes + form | Volumes errados | **NÃO** |
| “Tá qse saindo” | Preparando | `preparando_saida` | baixa | — | Ruído | **NÃO** |
| “Eu já estou voltando” | Retorno iniciado | `trip_return_started` | média | GPS regras COR ou check-in loja | Retorno falso | **NÃO** (só com regra COR) |
| “voltei” (se ocorrer) | Na loja | `return_detected` / volta form | média | Form VOLTA / auto-return COR | Disponibilidade falsa | **NÃO** sem confirmação |
| “Esse pedido saiu” (loja) | Info a terceiros | `delivery_left_store` | baixa-média | Quem saiu + trip | Pedido errado | **NÃO** |
| “Cláudio que levou” / “Foi segundo pedido” | Atribuição e ordem | `assignment` / stop sequence | média | trip_id | Atribuição errada | **NÃO** |
| “Levei mais um” | Add stop em viagem ativa | `delivery_added_to_trip` | média | App com evento imutável | Perde histórico | **NÃO** |
| “Esse pedido não saiu / erro daqui” | Cancelamento de saída | `delivery_not_dispatched` | média | Operação | Culpa/estado errado | **NÃO** |

### 3.2 Parada / cliente / acesso

| Exemplo anonimizado | Interpretação | Evento candidato | Confiança | Confirmação | Risco | Auto? |
|---|---|---|---|---|---|---|
| “Ele não atende o interfone” | Falha contato local | `customer_unreachable` / tentativa | média | Motoboy confirma no app | Ocorrência prematura | **NÃO** |
| “Não atende o celular também” | Segunda tentativa | `attempt_failed` | média | App | — | **NÃO** |
| “Avisa que estou na portaria” | Chegada física | `arrival_at_stop` (declarado) | média | Opcional + GPS chegada_detectada | ≠ entregue | **NÃO** p/ entregue |
| “Portaria falou que não chegou” | Conflito loja×motoboy | `location_dispute` | média | Humano | Conflito de verdade | **NÃO** |
| “Ela está descendo” | Cliente a caminho | progresso local | baixa | — | — | **NÃO** |
| Endereço colado pela loja (rua, apto) | Instrução de rota / add | `address_provided` / add stop | alta como instrução | Aceite do motoboy no app | Endereço errado no chat | **NÃO** estado Delivery sem aceite |
| “Manda outro” | Reenvio / 2ª unidade | `resend_requested` | baixa-média | Líder | Pedido duplicado | **NÃO** |

### 3.3 Pagamento / volumes

| Exemplo | Interpretação | Evento | Conf. | Confirmação | Risco | Auto? |
|---|---|---|---|---|---|---|
| “Esse pedido é troco para 300?” | Dúvida pagamento | `payment_query` | média | Comanda + caixa | Cobrança errada | **NÃO** |
| “O troco está na sacola” | Instrução | `cash_change_note` | média | — | — | **NÃO** (nota) |
| “Faltou volume” / “faltou” | Divergência sacola | `volume_missing` | média | Conferência | Bloqueio indevido | **NÃO** |
| “Trazer as maquininhas e comprovantes” | Processo caixa | fora Entregas core | — | Caixa | — | **NÃO** Entregas |

### 3.4 iFood / handoff

| Exemplo | Interpretação | Evento | Conf. | Confirmação | Risco | Auto? |
|---|---|---|---|---|---|---|
| “O outro pedi um entregador no ifood” | Alocação plataforma | `platform_courier_requested` | média | Gestor iFood | — | **NÃO** no app casa como Trip |
| “Pronto, ele tá chegando” + nome courier | Courier a caminho | `marketplace_courier_arriving` | média | Visual na loja | Nome errado | **NÃO** handoff done |
| “Entregador do iFood chegou” | Presença loja | `marketplace_courier_arrived` | média-alta se visual | Quem recebe na porta | Handoff sem volumes | **NÃO** |
| “Pedido do ifood para reenviar” | Exceção plataforma | `platform_resend` | média | Expedição | Virar Trip casa | **NÃO** |
| “Via ifood / botão pronto” | Instrução plataforma | processo OV/expedição | — | — | Misturar com próprio | **NÃO** Trip |

### 3.5 Ocorrência / recuperação

| Exemplo | Interpretação | Evento | Conf. | Confirmação | Risco | Auto? |
|---|---|---|---|---|---|---|
| “César pediu pra ir retirar um combinado que cliente reclamou” | Devolução/retirada | `return_pickup_ordered` | alta intenção | Motoboy aceita + occurrence | Sem fechamento | **NÃO** fecha sozinho |
| “Já estou indo retirar” | Ação em curso | `recovery_in_progress` | média | — | — | **NÃO** resolved |
| “Cliente vai deixar na portaria” | Acordo | `recovery_arrangement` | média | — | — | **NÃO** |
| “Pedido voltou” | Devolução à loja | `delivery_returned_to_store` | média | Conferência física | — | **NÃO** |
| “Ufa obrigada” (loja) | Alívio / possível fim social | **não** é fechamento formal | baixa | Líder/gerente | Fechar sem evidência | **NÃO** |

### 3.6 Disponibilidade / presença

| Exemplo | Interpretação | Evento | Conf. | Auto? |
|---|---|---|---|---|
| “Felipe já saiu?” | Consulta presença/rota | query | — | **NÃO** |
| “Acabou de sair!” | Info | `departed` fraco | baixa | **NÃO** |
| “Estou na loja” (se ocorrer) | Presença | `presence_at_store` | média | **NÃO** = disponível |
| “Ta voltando?” (loja pergunta) | Sondagem | — | — | **NÃO** |

---

## 4. Jornada típica reconstruída (mensagens + planilha)

```text
[Loja] cola endereço/pedido no grupo
   → [Motoboy] aceita implicitamente / “saindo”
   → Form IDA (se lembrar)
   → [Rota] problemas de interfone/troco no grupo
   → [Motoboy] “voltando”
   → Form VOLTA
   → disponibilidade inferida
```

Pontos cegos: alteração de paradas só no chat; handoff iFood sem registro; ocorrência sem occurrence_id.

---

## 5. Classes de automação (R1 + Gate Zero)

| Classe | Uso de mensagem | Permitido? |
|---|---|---|
| A — validação formato | não aplica | — |
| B — com confirmação humana | sugerir evento a partir de padrão | **sim**, com CTA |
| C — sugestão | agrupar, correlacionar | sim, nunca commit |
| D — manual estruturada | abrir ocorrência pré-preenchida | sim |
| E — proibida | ranking, punição, estado definitivo só por NLP | **proibido** |

---

## 6. Conversas bilaterais (recuperação)

Padrão R1:

`relato cliente → triagem loja → hipótese → ação prometida → ação executada → confirmação? → encerramento ou silêncio`

| Estado | Mensagem sozinha basta? |
|---|---|
| Aberto | não (precisa abrir occurrence) |
| Ação prometida | não = executada |
| Executada | não = fechada |
| Fechada sem confirmação | status explícito permitido (R1) |
| Não resolvido / info insuficiente | manual |

---

## 7. Dúvidas para o César (mensagens)

1. O app deve **substituir** o grupo ou conviver?  
2. Quais frases, se houver, a loja trataria como “comando oficial”?  
3. Fotos de comanda no grupo: devem virar upload de artefato no app?  
4. Suprimentos (sacolas, Coca) no grupo de entregas: fora de escopo do módulo?

---

*MATRIZ_MENSAGENS_EVENTOS · Gate Zero · nenhuma mensagem isola estado definitivo.*
