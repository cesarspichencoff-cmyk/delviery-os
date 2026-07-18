# Cobertura de Jornadas — Entregas

**Regra desta missão:** não criar jornadas novas; só mapear o que já existe nos materiais do worktree.

Fontes: `Fluxos_Estados_Entregas_V0_1` (F1–F20), `Modelo_Viagens_*`, `Modelo_Expedicao_*`, `Modelo_Comandas_*`, `Fundacao_*`.

Legenda: **C** completa (gatilho→passos→final→exceção) · **P** parcial · **A** ausente como jornada de produto · **D** só domínio, sem UX.

---

## Matriz das 20 jornadas essenciais

| # | Jornada | Onde aparece | Grau | Notas |
|---|---|---|---|---|
| 1 | Preparar uma viagem | F6; Trip draft→preparing | **C** (domínio) | Sem wireframe |
| 2 | Adicionar entregas | F3, F5, F6; Assignment | **C** | 1 delivery/pedido |
| 3 | Ordenar paradas | TripStop.sequence; F6 “stops ordenados” | **P** | Sucesso declarado; sem regras de reordenação UX |
| 4 | Atribuir entregador | F6 preparing→assigned; Assignment | **C** | |
| 5 | Conferir volumes | PickupConfirmation; preparing | **P** | Pickup existe; **volumes** não modelados em detalhe |
| 6 | Registrar saída | F8 DepartureEvent | **C** | GPS session start |
| 7 | Acompanhar viagem | F9 GPS; in_route; RouteObservation | **P** | Observação; proíbe mapa como Foco; **sem UI** de acompanhamento |
| 8 | Confirmar entrega | F10 DeliveryConfirmation | **C** (domínio) | Contestável; method pouco detalhado |
| 9 | Cliente não atende | — | **A** | Só cabível em Incident genérico |
| 10 | Endereço incorreto | U-02 endereço incompleto | **P** | Bloqueio/flag; sem jornada de correção |
| 11 | Pedido avariado | — | **A** | Incident type livre |
| 12 | Pagamento divergente | Fronteiras: $ é Caixa futuro | **A** (fora Entregas) | Não contaminar |
| 13 | Entrega recusada | — | **A** | Incident genérico |
| 14 | Reenvio | — | **A** | Não modelado como reissue de entrega |
| 15 | Retorno à loja | F12 ReturnEvent | **C** | Não disponível até confirm |
| 16 | Funcionamento offline | F18 SyncPendingOperation | **P** | Regras; sem jornada mobile detalhada |
| 17 | Reconciliação posterior | conflict sync; under_review | **P** | Conceito; sem fluxo LE desenhado |
| 18 | Fechamento da viagem | returning→completed | **C** | Fechamento **real** exigido |
| 19 | Ocorrência não resolvida | F11 Incident open | **P** | open/resolved; sem SLA/UX |
| 20 | Múltiplas entregas mesma viagem | F6; F10 partial; multi-stop | **C** | partially_completed |

---

## Fluxos canônicos extras (não na lista 1–20)

| Fluxo doc | Cobertura |
|---|---|
| F1–F4 impressão/correlação/canal | Forte (pré-viagem) |
| F14–F17 marketplace handoff | Forte (paralelo à viagem própria) |
| F19 reimpressão | Forte anti-dup |
| F20 duas entregas semelhantes | Forte anti-fusão |

---

## Contagens

| Classe | Qtd |
|---|---:|
| Completas (domínio) | **9** (#1,2,4,6,8,15,18,20 + marketplace como bloco à parte) |
| Completas estritas na lista 1–20 | **8** (#1,2,4,6,8,15,18,20) |
| Parciais | **6** (#3,5,7,10,16,17,19 → 7 se contar 10) |
| Ausentes | **5** (#9,11,12,13,14) — #12 fora de domínio |

Ajuste contagem final para resposta:

- **Completas:** 8 (1,2,4,6,8,15,18,20)  
- **Parciais:** 7 (3,5,7,10,16,17,19)  
- **Ausentes:** 5 (9,11,12,13,14)  

---

## Implicação para design final

Jornadas de **formação de viagem, saída, confirmação, retorno, multi-parada e handoff marketplace** estão **contratadas** o bastante para protótipo de domínio.  
Jornadas de **exceção de rua** (não atende, avaria, recusa, reenvio) e **reconciliação offline rica** são o buraco principal da Missão 2 de produto — **não** de wireframe por estética.
