# Fluxos e Estados — Domínio Entregas V0.1

> Vinte fluxos ponta a ponta. Critério de sucesso = estado final + sem inventar desconhecido.

---

## Catálogo

### 1. Impressão observada
| | |
|---|---|
| Gatilho | Print |
| Atores | Sistema / observador |
| Inicial | — |
| Passos | PrintObservation → PrintedArtifact |
| Decisão | Registrar artefato |
| Final | artifact observed |
| Exceção | layout ilegível → insufficient |
| Audit | sim |
| Sucesso | artifact_id estável |

### 2. Correlação de múltiplas comandas
| | |
|---|---|
| Gatilho | 2+ artifacts |
| Passos | Sinais → confidence_level |
| Decisão | match level |
| Final | CorrelationRecord |
| Exceção | conflict → review |
| Sucesso | reimpressão não cria 2 deliveries |

### 3. Criação ou atualização da entrega
| | |
|---|---|
| Gatilho | confirmed/probable + order_ref |
| Passos | create Delivery ou attach |
| Final | Delivery draft/ready |
| Proibido | fusão silenciosa de 2 pedidos |
| Sucesso | 1 delivery por pedido lógico |

### 4. Classificação do canal
| | |
|---|---|
| Gatilho | sinais de canal |
| Decisão | channel known ou **unknown** |
| Proibido | inventar iFood/Nimo |
| Sucesso | desconhecido permanece se incerto |

### 5. Pedido próprio aguarda atribuição
| | |
|---|---|
| Gatilho | ready + canal próprio |
| Final | waiting_assignment |
| Fato OV | fila própria |

### 6. Formação de viagem
| | |
|---|---|
| Gatilho | 1+ deliveries + rider disponível |
| Passos | Trip draft→preparing→assigned |
| Sucesso | stops ordenados |

### 7. Motoboy confirma coleta
| | |
|---|---|
| Gatilho | QR/código/manual |
| Final | Trip collected |
| Exceção | código errado |

### 8. Motoboy sai
| | |
|---|---|
| Gatilho | DepartureEvent |
| Final | departed |
| Lado | GPSConsentSession start se GPS on |

### 9. GPS começa
| | |
|---|---|
| Gatilho | sessão ativa |
| Final | LocationObservations |
| Exceção | sem sinal → modo offline local |

### 10. Entregas concluídas (1+)
| | |
|---|---|
| Gatilho | DeliveryConfirmation por stop |
| Final | partial ou all done |
| Contestação | possível se engano |

### 11. Ocorrência em rota
| | |
|---|---|
| Gatilho | DeliveryIncident |
| Final | open; trip may interrupt |
| Sem | punição auto |

### 12. Retorno à loja
| | |
|---|---|
| Gatilho | ReturnEvent |
| Final | returning → completed se confirmado |
| Regra | não disponível até confirm |

### 13. Motoboy disponível de novo
| | |
|---|---|
| Gatilho | presença + disponibilidade explícita |
| Final | na_loja_disponivel |
| Proibido | auto por GPS geofence sem regra aprovada (pendente César) |

### 14. Pedido iFood pronto
| | |
|---|---|
| Gatilho | ready OV |
| Final | ready_awaiting_courier |

### 15. Entregador externo chega
| | |
|---|---|
| Final | courier_waiting |
| Fato | waiting count |

### 16. Handoff por posição
| | |
|---|---|
| Atores | position_role (+ apoio rider) |
| Final | handoff pending→done |
| Sucesso | sem exigir nome sempre |

### 17. Handoff encerra loja
| | |
|---|---|
| Final | handed_off |
| Fato | responsabilidade loja = 0 naquele pedido |

### 18. Offline e sync
| | |
|---|---|
| Gatilho | sem rede |
| Passos | SyncPendingOperation pending→synced/conflict |
| Sucesso | sem perda silenciosa |

### 19. Reimpressão após Delivery criada
| | |
|---|---|
| Passos | novo PrintedArtifact · correlate confirmed_match · **attach** |
| Sucesso | **não** cria segunda Delivery |

### 20. Duas entregas semelhantes separadas
| | |
|---|---|
| Gatilho | possible_match mas 2 order_ids ou 2 intents |
| Decisão | no merge; two Deliveries |
| Final | conflict resolvido como separado |
| Sucesso | cliente com 2 pedidos mantém 2 |

---

## Estados Delivery (síntese própria)

draft · identity_pending · ready · waiting_assignment · in_trip · out_for_delivery · delivered · failed · cancelled · under_review

(Marketplace: ver Modelo Expedição.)

---

*Fluxos Entregas V0.1 · 20 canônicos.*
