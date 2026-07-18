# Microcopy System — Copiloto Delivery

Consome: `response-contract`, `voice-intents`, textos de Foco do motor (via payload, não reescritos na UI sem contrato).

---

## 1. Voz da marca (tom)

| É | Não é |
|---|---|
| Direto, de bancada | Corporativo / BI |
| Calmo sob pressão | Alarmista |
| Honesto sobre limite | “100% certeza” |
| Processo | Pessoa |
| Curto | Relatório |

**Emoção-alvo:** calma; Foco = atenção justificada, nunca pânico.

---

## 2. Anatomia de uma mensagem

Ordem fixa (texto e áudio):

1. **Conclusão**  
2. **Evidência** (1–3 fatos)  
3. **Impacto** (se ajudar a agir)  
4. **Recomendação** (se segura)  
5. **Limite / dúvida** (se confiança ≠ alta ou dado frágil)

Exemplo canônico:

> A Conferência merece atenção. Cinco pedidos estão aguardando e dois estão próximos do prazo. Mantido o ritmo atual, outros três podem acumular nos próximos quinze minutos. Recomendo verificar primeiro os pedidos 184 e 191.

---

## 3. Vocabulário aprovado

| Usar | Evitar |
|---|---|
| atenção / pressão / crítico (níveis) | “emergência”, “alerta vermelho” sem critério |
| fila, tempo, pedidos | “throughput”, “SLA breach” no chão |
| Sushi, Quentes, Conferência, Motoboy, Caixa | jargão de praça interna crua na UI principal |
| leitura / confiança | “modelo preditivo”, “score” |
| verificar, priorizar, chamar | “otimizar resource allocation” |
| não sei / dado incompleto | silêncio que finge certeza |

---

## 4. Templates por tipo

### Foco com ação
- Título: substantivo + estado (`Conferência acumulando`)
- Ação: verbo no infinitivo ou “Recomendo + verbo”

### Foco puro
- “O ponto de atenção é X.”
- “Ainda não há ação segura para prescrever.”

### Ambiente
- Rótulos curtos: `Quentes acima do normal`, `saída lenta`
- Sem ponto de exclamação em série

### Calmo
- Opcional: “Nada pede atenção principal agora.”
- Preferível: presença sem frase de status longas

### Previsão
- “Tende a… nos próximos N min”
- Sempre: “não é certeza” se confiança média/baixa

### Anomalia
- “Fora do padrão: …”
- “Possível explicação… / Também pode ser…”
- “Para verificar: …”

### Técnico
- “A leitura está limitada.”
- “Não vamos inventar prioridade sem dado.”

### Fechamento — pergunta
- Observado + o que não sabemos + por que ajuda
- Opções explícitas: **Não sei** · **Pular**

---

## 5. Números

| Regra | Exemplo |
|---|---|
| Inteiros para contagem | 5 pedidos |
| Tempo em min redondo | ~18 min (não 18,37) |
| Faixa quando incerto | entre 6 e 9 |
| Máx. 3 números por fala | — |
| Sem % inventado | — |

---

## 6. Pedidos e IDs

- UI: `#184` ou últimos 4 se for UUID curto de demo
- Voz: “pedido cento e oitenta e quatro” ou “pedido 184”
- Nunca ler UUID completo

---

## 7. Confiança (sussurro)

| Confiança | Copy |
|---|---|
| alta | **não dizer** “alta confiança” |
| media | “Leitura com confiança moderada.” |
| baixa | “Leitura com baixa confiança — vale confirmar.” |

---

## 8. Proibições absolutas

- Culpa nominal (“Maria atrasou”)
- Ranking de pessoas
- Humor sarcástico no Foco
- Travessão decorativo em excesso (herança V1: copy limpa)
- “Sempre” / “nunca” em previsão
- Emoji como sistema de alerta

---

## 9. Localização

Português do Brasil, operação de delivery.  
Não misturar inglês de produto (`Focus`, `Queue`) na superfície do chão.
