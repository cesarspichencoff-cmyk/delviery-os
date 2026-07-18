# Red Team — Material existente de Entregas

Severidade: **A** alta · **M** média · **B** baixa  
Base: docs Entregas V0.1 + riscos já catalogados + leitura adversarial desta auditoria.

---

## 1. Riscos pedidos na Missão 1

| Risco | Sev | Material atual mitiga? | Residual |
|---|---|---|---|
| App genérico de logística | A | Parcial — tese anti-genérico implícita; **sem UI para provar** | Alto até protótipo disciplinado |
| Depender demais de mapa | M | **Sim** — mapa distração; GPS não Foco | Se mobile virar mapa-first |
| Excesso de telas | M | N/A visual; estados Trip muitos (13) | Podar na UX; doc já alerta “excesso de estados” |
| Excesso de status | M | Lista fechada V0.1 | Mostrar só status acionáveis no mobile |
| Trabalho manual na rota | A | Confirmações explícitas (bom) | Demais taps = fadiga; tentativa/recusa ausentes = improviso |
| Falta de fechamento real | A | **Mitigado forte** — return confirm + não auto-disponível | Se UX pular confirmação |
| Promessa ≠ execução | M | OV tem promised; Entregas tem execução | Não misturar ETA marketing com Trip completed |
| Ausência de confirmação | A | DeliveryConfirmation + handoff confirm | Method fraco; sem prova mínima opcional |
| Localização como punição | A | **Proibido** ranking/velocidade | Cultura + UI sem score |
| Ranking individual | A | **Proibido** | Copiloto/House não reintroduzir |
| Offline ruim | A | Regras pending/conflict | **Sem UX** = risco real de perda percebida |
| Conflito operação × entregador | M | Papéis LE vs rider conceituais | Sem fluxos de disputa de estado |
| Excesso de notificações | M | Não modelado | Definir silêncio na Missão 2 |
| Baixa legibilidade mobile | A | **Não especificado** | Bloqueante para V1 rider |

---

## 2. Ataques adicionais ao material

| # | Ataque | Resultado |
|---|---|---|
| 1 | “Na loja = livre” | **Contido** se UI respeitar RiderAvailability |
| 2 | Reimpressão cria 2 deliveries | **Contido** no modelo correlação |
| 3 | Fundir 2 pedidos mesmo endereço | **Contido** (proibido) |
| 4 | Entregas grita Foco “motoboy lento” | **Contido** em fronteiras; risco se ignorar |
| 5 | Completed sem retorno | **Contido** nas transições |
| 6 | GPS eterno | **Contido** consent session |
| 7 | Handoff burocrático com nome | **Contido** position_role |
| 8 | Design copiar Uber/iFood Courier | **Não contido** — zero wireframe próprio |
| 9 | Desktop 12 colunas de status | **Não contido** — falta hierarquia visual |
| 10 | Exceções de rua só no WhatsApp | **Aberto** — jornadas 9–14 ausentes |

---

## 3. Veredito red team

O **contrato resiste** bem a vigilância, duplicidade e fechamento falso.  
O **vácuo de design visual e de exceções de rua** é o que fará o produto parecer logístico genérico ou improvisado no WhatsApp se a Missão 2 não for disciplinada.

**Não redesenhar** as regras de GPS, anti-ranking, 1 delivery/pedido, return confirm, handoff por posição — elas são o diferencial.
