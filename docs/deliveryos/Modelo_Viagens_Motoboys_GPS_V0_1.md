# Modelo de Viagens, Motoboys e GPS — Entregas V0.1

---

## 1. Trip (objeto principal da execução própria)

Uma viagem: **1 motoboy** · **1+ pedidos** · **1+ paradas** · saída · rota · km · ocorrências · entregas · retorno.

### Estados de Trip

| Estado | Significado |
|---|---|
| draft | Rascunho de montagem |
| preparing | Separando sacolas / conferindo |
| assigned | Motoboy atribuído |
| collected | Coleta confirmada (QR/código/manual) |
| ready_to_depart | Pronto para sair |
| departed | Saiu da loja |
| in_route | Em rota |
| partially_completed | Algumas paradas ok |
| returning | Voltando |
| completed | Ciclo viagem ok |
| interrupted | Interrompida (ocorrência grave) |
| cancelled | Cancelada |
| under_review | Conflito / dúvida |

### Transições (resumo)

| De | Para | Ator típico | Regra |
|---|---|---|---|
| draft | preparing | expedição/LE | há ≥1 delivery |
| preparing | assigned | LE/sistema | rider escolhido |
| assigned | collected | rider | pickup confirm |
| collected | ready_to_depart | rider/sistema | checagem mínima |
| ready_to_depart | departed | rider | saída explícita |
| departed | in_route | sistema | GPS session on (se ativo) |
| in_route | partially_completed | rider | ≥1 stop done, restam |
| in_route / partial | returning | rider/sistema | todas done ou abort parcial |
| returning | completed | rider/LE | ReturnEvent **confirmado** |
| * | interrupted / cancelled / under_review | LE/sistema | com audit |

**Proibido:** pular para completed sem coleta/saída quando o modo exige; marcar disponível sem retorno confirmado.

### Km e rota

| Conceito | Definição |
|---|---|
| Distância estimada | Antes/planejada |
| Rota planejada | Sugestão (se houver) |
| Distância real observada | Soma GPS da sessão |
| Deslocamento incompleto | Sessão com buracos |
| Localização desatualizada | Último ponto velho |

Não usar km para ranking ou punição.

---

## 2. Motoboy: presença ≠ disponibilidade

### RiderPresenceAtStore
present · absent · unknown

### RiderAvailability (estados mínimos)

| Estado | Significado |
|---|---|
| na_loja_disponivel | Presente **e** livre para nova viagem |
| na_loja_apoio_expedicao | Na loja ajudando handoff marketplace — **não** livre imediato |
| preparando_saida | Em Trip preparing/collected/ready |
| em_rota | Trip departed/in_route |
| retornando | Trip returning |
| em_pausa | Pausa explícita |
| indisponivel | Fora de serviço |
| sem_atualizacao | Estado stale — **não** assumir disponível |

### Regras
1. Na loja ≠ disponível.  
2. Apoio expedição ≠ livre para sair.  
3. Retorno ≠ disponível até confirmação.  
4. sem_atualizacao ≠ disponível por suposição.  
5. Correção de estado com **auditoria**.

---

## 3. GPS — só viagem ativa

| Princípio | Conteúdo |
|---|---|
| Início | Explícito com Trip departed / consent session |
| Fim | Explícito no return completed ou cancel |
| Finalidade | Operacional (posição da viagem) |
| Proibido | Rastreamento permanente; ranking velocidade; comparação pública; punição auto |
| Visível | Status da sessão (ativa / sem sinal / encerrada) |
| Sem sinal | Modo offline local; não inventar posição |
| Storage | Local temporário → sync (`SyncPendingOperation`) |
| Perda | Sem perda silenciosa; conflict se dup |
| Correção | Possível com audit |

**GPSConsentSession:** purpose = `trip_tracking` · trip_id · started_at · ended_at.

---

## 4. Assignment e multi-pedido

Trip.stops ordenados.  
Um Delivery em no máximo uma Trip ativa.  
Reassign: cancela assignment anterior com audit.

---

*Viagens · presença ≠ disponibilidade · GPS limitado à viagem.*
