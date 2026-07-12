# Modelo de Comandas, Impressões e Correlação — Entregas V0.1

> **Regra oficial:** múltiplos artefatos impressos podem representar **uma** entrega.  
> Artefato ≠ entrega. Reimpressão ≠ nova entrega.

---

## 1. PrintedArtifact

Representa **uma observação** de impressão (comanda Nimo, Tecnisa, etiqueta pequena, reimpressão, 2ª via).

| Pode | Não pode |
|---|---|
| Relacionar-se a Delivery existente | Criar automaticamente **nova** Delivery |
| Ajudar a confirmar canal, cliente, endereço, pedido | Fundir duas entregas reais em silêncio |
| Elevar confiança de correlação | Inventar canal |

---

## 2. Sinais de correlação

| Sinal | Uso |
|---|---|
| Código do pedido | Forte |
| Código da comanda | Forte |
| Nome normalizado | Médio (não basta sozinho) |
| Endereço + complemento normalizados | Médio-alto com outros |
| Horário de impressão / proximidade temporal | Médio |
| Valor | Médio |
| Itens (resumo) | Médio |
| Canal declarado | Se presente |
| Origem da impressão (Nimo/Tecnisa/…) | Técnica ≠ comercial |
| Flag reimpressão / 2ª via | Anti-duplicidade |
| Telefone parcial | **Só se permitido** e mínimo |

---

## 3. Níveis de confiança

| Nível | Significado | Ação |
|---|---|---|
| **confirmed_match** | Identidade estável com sinais fortes (ex. mesmo order_id) | Liga artifact → Delivery |
| **probable_match** | Sinais convergentes sem ID único | Liga com flag; pode pedir confirmação |
| **possible_match** | Hipótese fraca | Candidato; não fecha canal sozinho |
| **no_match** | Não relacionado | Artifact orphan ou outro delivery |
| **conflict** | Sinais incompatíveis (dois order_ids) | **Revisão humana** |
| **insufficient_data** | Dados insuficientes | **Desconhecido** — não inventar |

---

## 4. Regras oficiais

1. Nome + endereço iguais **não bastam** sozinhos (cliente pode ter 2 pedidos).  
2. Duas entregas distintas **não** se fundem silenciosamente.  
3. Replay **não** recria Delivery duplicada (idempotência por delivery_id / order_ref).  
4. Reimpressão **não** cria nova Delivery.  
5. Conflito → revisão (`under_review` / DeliveryCorrelationRecord).  
6. Dados insuficientes → unknown.  
7. Correlação **não inventa canal** — se só origem técnica, canal comercial pode permanecer desconhecido.  
8. Tecnisa/Nimo = fontes de impressão/integração; classificação comercial é passo separado.

---

## 5. Fluxo conceitual

```text
PrintObservation → PrintedArtifact
       ↓
DeliveryCorrelationRecord (nível)
       ↓
  confirmed/probable → attach Delivery existente ou criar 1 Delivery se order_ref novo e estável
  conflict → fila revisão
  insufficient → orphan + desconhecido
```

Criação de Delivery: preferir **um** order_ref da Operação Viva quando existir; senão candidato com baixa confiança.

---

## 6. DeliveryCorrelationRecord

| Campo | Conteúdo |
|---|---|
| artifact_ids | 1..n |
| delivery_id | opcional |
| confidence_level | enum acima |
| signals_used | lista |
| decided_by | system \| human |
| at | timestamp |

Auditoria: toda promoção de candidate → Delivery.

---

*Correlação V0.1 · multi-comanda · anti-duplicidade.*
