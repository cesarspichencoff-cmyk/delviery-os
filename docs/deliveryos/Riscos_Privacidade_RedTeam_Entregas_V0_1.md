# Riscos, Privacidade, Desconhecidos e Red Team — Entregas V0.1

Severidade: **A** alta · **M** média · **B** baixa

---

## 1. Catálogo de desconhecidos

| ID | Desconhecido | Comportamento |
|---|---|---|
| U-01 | Canal não confirmado | Permanecer unknown |
| U-02 | Endereço incompleto | Bloquear saída ou flag |
| U-03 | Artefato sem pedido | Orphan; revisão |
| U-04 | Motoboy sem estado confiável | sem_atualizacao; não disponível |
| U-05 | Viagem sem localização | sem sinal; não inventar |
| U-06 | Entrega sem confirmação | não completed |
| U-07 | Retorno não confirmado | não disponível |
| U-08 | Externo sem vínculo | waiting unlinked |
| U-09 | Handoff não registrado | não handed_off |
| U-10 | Pedido duplicado possível | conflict/review |
| U-11 | Conflito entre impressões | under_review |
| U-12 | GPS indisponível | offline local |

**Regra:** mostrar desconhecido; **não inventar**.

---

## 2. Riscos

| Risco | Sev | Prevenção | Detecção | Resposta | Owner | Gate humano |
|---|---|---|---|---|---|---|
| Fusão errada de entregas | A | Níveis confiança; não nome+end só | conflict signals | Separar; audit | Entregas | Sim |
| Duplicidade por reimpressão | A | reprint flag; order_ref | 2 deliveries mesmo order | Merge attach artifact | Entregas | Se dúvida |
| Canal incorreto | M | unknown default | mismatch fonte | Corrigir audit | Entregas | Sim |
| GPS vigilância | A | só viagem; consent; fim explícito | sessão fora de trip | Encerrar; política | César/LE | Sim |
| Bateria / net instável | M | offline queue | pending queue | Sync depois | Entregas | — |
| Esquecer encerrar viagem | M | reminder conceitual; stale | trip longa | LE corrige | LE | Sim |
| Retorno falso | M | confirm explícito | geofence só com regra | Não auto-disponível | Entregas | Sim |
| Confirma entrega engano | M | confirmação consciente | contestação | Reabrir | LE | Sim |
| Handoff burocrático | M | posição do turno; 1 toque conceitual | tempo handoff | Simplificar | LE | — |
| Excesso de estados | M | V0.1 lista fechada | confusão UX | Podar depois | Produto | — |
| Mapa distração | M | não Foco por mapa | uso no pico | Fora do crítico | LE | — |
| PII / $ exposto | A | minimização | export errado | Scrub; audit | César | Sim |
| Dependência 1 integração | M | multi-fonte; unknown | queda Nimo/Tecnisa | Operar degradado | LE | — |
| Layout impressão muda | M | parser tolerante futuro | parse fail | insufficient_data | Produto | Sim |
| Nimo/Tecnisa down | M | fila manual | timeout | Modo manual | LE | — |
| Na loja = disponível errado | A | estados separados | métrica falsa capacidade | Corrigir estado | LE | Sim |
| Foco contaminado | A | só fatos com confiança | Foco por rumor | Núcleo filtra | Operação Viva | Sim |

---

## 3. Privacidade (síntese)

- GPS: finalidade operacional, sessão limitada.  
- Telefone/endereço: mínimo à entrega.  
- Sem ranking de motoboys.  
- Sem punição automática por km/tempo.  
- Audit de correções de estado.

---

## 4. Red team (cenários-chave)

1. Duas comandas mesmo pedido → 1 Delivery.  
2. Dois pedidos mesmo nome/endereço → 2 Deliveries.  
3. Reimpressão pós-saída → attach.  
4. GPS sem fim de sessão → não permanente.  
5. Handoff sem nome → ok por posição.  
6. Replay → sem dup Delivery.  
7. Offline pickup → pending sync.  
8. Sugerir Foco “motoboy lento” → **proibido** auto.

---

*Riscos e desconhecidos Entregas V0.1.*
