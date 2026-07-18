# Failure and Uncertainty — Copiloto Delivery

Regra-mãe: **dado incompleto é aceitável; dado falso é veneno.**  
Confiança baixa ≠ gravidade baixa.

---

## 1. Taxonomia de falha (design)

| Código | Significado | UI |
|---|---|---|
| `incomplete` | campos faltando | degraded; verificar |
| `stale` | dado atrasado | degraded + “última atualização” |
| `source_mismatch` | fontes discordam | anomalia técnica; não agir no chão |
| `disconnected` | fonte caiu | failed |
| `low_confidence` | leitura frágil | sussurro / needs_verification |
| `oscillation` | pico curto | não interromper |
| `no_safe_action` | Foco puro | sem CTA falso |
| `empty_shift` | sem fato no fechamento | 0 perguntas |

---

## 2. technical_state

| Estado | Banner | Foco operacional | Interrupção |
|---|---|---|---|
| healthy | ausente | normal | normal |
| degraded | “Leitura parcial” | permitido com verificação | preferir discreet |
| failed | “Sem leitura confiável” | **proibido inventar** | silent/técnico |

Copy failed:

> A leitura da operação está indisponível. Não vamos indicar prioridade até o dado voltar.

---

## 3. Incerteza na hierarquia visual

| Sinal de incerteza | Forma |
|---|---|
| confiança media/baixa | caption / badge secundário |
| needs_verification | CTA “Confirmar na bancada” não substitui ação operacional |
| forecast | verbo “tende”; faixa low–high |
| anomaly | hipótese + alternativa lado a lado |
| epistemic human_report | rótulo “relato do turno” ≠ “fato do sistema” |

**Proibido:** ícone de alerta idêntico para sev 3 alta confiança e sev 1 baixa confiança.

---

## 4. Empty states

| Empty | Mensagem |
|---|---|
| Sem Foco | Calmo / presença — não “0 errors 🎉” |
| Sem anomalias | “Nada fora do padrão com confiança suficiente.” |
| Sem pedidos em risco | “Nenhum pedido em risco claro agora.” |
| Sem baseline real | “Previsão ainda em calibração provisória.” (dev/sombra) |

---

## 5. Recuperação

| Evento | UX |
|---|---|
| Reconnect | atualiza; se Foco mudou por critical, explicar |
| Dado volta de stale | remove banner; não “spam de success” |
| Usuário confirma normalização | resolve Foco com confirmação |

---

## 6. Erros de permissão

| Permissão | UI |
|---|---|
| sem `operator_read` | bloqueio calmo |
| sem `leader_close_shift` | esconder fechamento ou pedir líder |
| write memory | sempre confirmar por voz/texto |

---

## 7. Princípios de red-team de falha

1. Nunca preencher buraco com média inventada na UI  
2. Nunca esconder degraded  
3. Nunca transformar falha técnica em “operação calma”  
4. Nunca culpar a equipe pelo gap de dado  

---

## 8. Cenários mock de referência

`14` incompleto · `15` atrasado · `16` conexão · `17` falha técnica · `10` oscilação · Foco puro quando action null
