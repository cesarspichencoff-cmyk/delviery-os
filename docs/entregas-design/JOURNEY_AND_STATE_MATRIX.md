# Matriz de Jornadas e Estados — Protótipo Entregas V0.1

20 jornadas consolidadas para o protótipo.  
Estados de Trip/Delivery do contrato V0.1 preservados.

---

## 1. Estados de referência (não reinventar)

**Trip:** draft · preparing · assigned · collected · ready_to_depart · departed · in_route · partially_completed · returning · completed · interrupted · cancelled · under_review  

**Stop:** pending · arrived · done · skipped  

**Attempt result:** success · failed · deferred · abandoned_safety  

**Sync:** pending · synced · conflict  

---

## 2. Jornadas do protótipo (20)

### J1 — Preparar viagem com múltiplas entregas
| | |
|---|---|
| **Ator** | Expedição / LE |
| **Início** | ≥2 deliveries ready waiting_assignment |
| **Info principal** | Pedidos, volumes_expected, canal |
| **Ação dominante** | Criar Trip + adicionar stops |
| **Exceções** | Pedido some / canal unknown |
| **Conclusão** | Trip draft/preparing com N stops |
| **Confirmação** | — |
| **Desktop** | Sim (mesa) |
| **Mobile** | Não (ou só leitura) |

### J2 — Adicionar e ordenar entregas
| | |
|---|---|
| **Ator** | Expedição |
| **Início** | Trip em draft/preparing |
| **Info** | Lista de candidatos + ordem |
| **Ação** | Add/remove stop; reordenar sequence |
| **Exceções** | Delivery já em outra trip ativa |
| **Conclusão** | stops[] estáveis |
| **Confirmação** | Implícita ao salvar ordem |
| **Desktop** | Sim |
| **Mobile** | Não |

### J3 — Atribuir entregador
| | |
|---|---|
| **Ator** | LE / expedição |
| **Início** | Trip preparing |
| **Info** | Riders **na_loja_disponivel** (não só presentes) |
| **Ação** | Assign rider |
| **Exceções** | Rider só em apoio expedição |
| **Conclusão** | Trip assigned |
| **Confirmação** | Assignment accepted (se fluxo pedir) |
| **Desktop** | Sim |
| **Mobile** | Notificação ao rider |

### J4 — Conferir volumes
| | |
|---|---|
| **Ator** | Expedição + rider |
| **Início** | assigned / collected |
| **Info** | expected vs checked vs received |
| **Ação** | Conferir; rider confirma received |
| **Exceções** | **E07** bloqueia saída |
| **Conclusão** | volumes alinhados ou override LE |
| **Confirmação** | PickupConfirmation + received_by_rider |
| **Desktop** | Sim |
| **Mobile** | Sim (received) |

### J5 — Registrar handoff (marketplace ou loja→rider)
| | |
|---|---|
| **Ator** | position_role / rider |
| **Início** | ready_awaiting_courier ou pickup própria |
| **Info** | order_ref, volumes, papel |
| **Ação** | Confirmar handoff / coleta |
| **Exceções** | exception; externo saiu |
| **Conclusão** | handed_off ou collected |
| **Confirmação** | Sim (papel + tempo) |
| **Desktop** | Marketplace forte |
| **Mobile** | Coleta própria |

### J6 — Registrar saída
| | |
|---|---|
| **Ator** | Rider |
| **Início** | ready_to_depart |
| **Info** | Resumo stops + volumes ok |
| **Ação** | DepartureEvent |
| **Exceções** | Bloqueio por E07 |
| **Conclusão** | departed; GPS session se ativa |
| **Confirmação** | Explícita |
| **Desktop** | Observa |
| **Mobile** | CTA principal |

### J7 — Acompanhar viagem
| | |
|---|---|
| **Ator** | LE (desktop) / rider (mobile) |
| **Início** | in_route |
| **Info** | Progresso stops; stale; offline |
| **Ação** | LE: monitorar; rider: próxima ação |
| **Exceções** | sem atualização |
| **Conclusão** | Contínuo até retorno |
| **Confirmação** | — |
| **Desktop** | Lista trip, **não** mapa-hero |
| **Mobile** | Próximo passo |

### J8 — Confirmar entrega
| | |
|---|---|
| **Ator** | Rider |
| **Início** | No stop; attempt started |
| **Info** | Ref + volumes |
| **Ação** | DeliveryConfirmation + volumes_delivered |
| **Exceções** | Vai para J9–J12 |
| **Conclusão** | stop done; attempt success |
| **Confirmação** | **Obrigatória** (não inferir) |
| **Desktop** | Atualiza |
| **Mobile** | CTA |

### J9 — Cliente não atende (E01)
| | |
|---|---|
| **Ator** | Rider → LE se preciso |
| **Início** | Attempt no stop |
| **Info** | Código E01 |
| **Ação** | Registrar failed attempt + next_action |
| **Exceções** | — |
| **Conclusão** | retry / continue_route / await_le |
| **Confirmação** | Registro do attempt |
| **Desktop** | Fila se LE |
| **Mobile** | Fluxo exceção rápido |

### J10 — Endereço incorreto (E02)
| | |
|---|---|
| **Ator** | Rider + LE |
| **Início** | Não localiza / incompleto |
| **Info** | E02 + nota |
| **Ação** | await_le ou return |
| **Conclusão** | Correção ou retorno |
| **Confirmação** | LE se alterar ref |
| **Desktop** | Sim |
| **Mobile** | Sim |

### J11 — Entrega recusada (E05)
| | |
|---|---|
| **Ator** | Rider |
| **Início** | Cliente recusa |
| **Info** | E05 |
| **Ação** | Não deixar pedido; volumes_returned path |
| **Conclusão** | Retorno necessário |
| **Confirmação** | Attempt + depois return |
| **Desktop** | Sim |
| **Mobile** | Sim |

### J12 — Avaria (E06)
| | |
|---|---|
| **Ator** | Rider |
| **Início** | Dano visível |
| **Info** | E06; aceita? |
| **Ação** | Entrega com ressalva **ou** recusa+retorno |
| **Conclusão** | Confirmation+incident **ou** return |
| **Confirmação** | Sim |
| **Desktop** | LE se disputa |
| **Mobile** | Sim |

### J13 — Viagem parcialmente concluída
| | |
|---|---|
| **Ator** | Sistema + rider |
| **Início** | ≥1 stop done, restam |
| **Info** | partially_completed |
| **Ação** | Continuar rota ou abort parcial (LE) |
| **Conclusão** | Próximo stop ou returning |
| **Desktop** | Visível |
| **Mobile** | Próxima parada |

### J14 — Retorno à loja
| | |
|---|---|
| **Ator** | Rider |
| **Início** | Todos done/skipped ou decisão retorno |
| **Info** | volumes a devolver |
| **Ação** | ReturnEvent provisional → confirmed |
| **Conclusão** | returning → aguarda confirm loja |
| **Confirmação** | **Obrigatória** na loja/LE ou rider check-in |
| **Desktop** | Fechamento |
| **Mobile** | CTA retorno |

### J15 — Operação offline
| | |
|---|---|
| **Ator** | Rider |
| **Início** | Sem rede |
| **Info** | Badge offline; ações locais |
| **Ação** | Confirmar/exceção local → SyncPending |
| **Conclusão** | Ops pending |
| **Confirmação** | Local agora; servidor depois |
| **Desktop** | Vê gap se stale |
| **Mobile** | Primário |

### J16 — Sincronização posterior
| | |
|---|---|
| **Ator** | Sistema + rider |
| **Início** | Rede volta |
| **Info** | k pendentes |
| **Ação** | Sync idempotente |
| **Conclusão** | synced ou conflict |
| **Desktop** | Conflitos |
| **Mobile** | Progresso mínimo |

### J17 — Conflito
| | |
|---|---|
| **Ator** | LE (+ rider info) |
| **Início** | conflict sync ou under_review correlação |
| **Info** | Dois estados candidatos |
| **Ação** | Resolução humana; **sem** auto-merge sensível |
| **Conclusão** | under_review resolvido |
| **Confirmação** | Audit LE |
| **Desktop** | **Sim** |
| **Mobile** | Aviso; não resolver sozinho se sensível |

### J18 — Fechamento da viagem
| | |
|---|---|
| **Ator** | Rider + LE |
| **Início** | Return confirmed + reconciliação volumes |
| **Info** | delivered + returned vs expected |
| **Ação** | Completar trip |
| **Conclusão** | Trip **completed**; rider pode ficar disponível |
| **Confirmação** | **Obrigatória** |
| **Desktop** | Sim |
| **Mobile** | Confirma chegada loja |

### J19 — Fechamento pendente
| | |
|---|---|
| **Ator** | LE / sistema |
| **Início** | Return provisional ou volumes divergentes ou sync pending |
| **Info** | O que falta comprovar |
| **Ação** | Completar prova; não liberar disponibilidade cedo |
| **Conclusão** | Sai de pendente → J18 ou under_review |
| **Desktop** | Fila “fechamento pendente” |
| **Mobile** | Aviso se rider ainda responsável |

### J20 — Reenvio vinculado
| | |
|---|---|
| **Ator** | LE (decisão) + Entregas (nova trip/delivery) |
| **Início** | Original failed/returned; decisão de reenviar |
| **Info** | related_delivery_id; novo delivery_id |
| **Ação** | Criar nova Delivery + eventualmente nova Trip |
| **Exceções** | $ com Caixa fora |
| **Conclusão** | Nova unidade em waiting_assignment |
| **Confirmação** | Vínculo auditável |
| **Desktop** | Sim |
| **Mobile** | Só se nova trip atribuída |

---

## 3. Contagem

| | Qtd |
|---|---:|
| Jornadas protótipo | **20** |
| Com desktop primário | maioria J1–J5, J17–J20 |
| Com mobile primário | J4–J16, J18 |
| Novas vs audit Missão 1 | Exceções de rua e reenvio **agora definidas** |

---

## 4. Mapa estado → UI (síntese)

| Estado Trip | Desktop | Mobile |
|---|---|---|
| preparing / assigned | Mesa montagem | Coleta volumes |
| ready_to_depart | Checklist saída | CTA sair |
| in_route / partial | Acompanhar | Próximo passo |
| returning | Fila retorno | CTA loja |
| completed | Arquivo do dia | — |
| under_review | Fila conflito | Aviso |
