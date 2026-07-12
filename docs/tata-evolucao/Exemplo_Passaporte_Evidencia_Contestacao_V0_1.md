# Exemplos Sintéticos — Passaporte, Evidência, Líder e Contestação V0.1

> Pessoa **fictícia**. Sem nome real. Trilha: **Delivery Pleno**.  
> Face do Passaporte: resposta em **&lt;10 segundos**.

---

## 1. Passaporte V0 sintético

**ID sintético:** `PART-DP-07` (não é pessoa real)

| Campo | Valor sintético |
|---|---|
| **trilha_atual** | Delivery Pleno · Onda 1 (F1+F2 leve) |
| **proximo_passo** | Demonstrar no turno: pedido parado → comunicar **estado + impacto + ação** (sem “cadê?”) |
| **competencias_demonstradas** | C-DJ03 (B) · C-T02 (B) — aprovadas por DS em semana 2 |
| **evidencia_necessaria** | 1 observação de comunicação com contexto no pico **ou** simulação E01 refeita |
| **validador_possivel** | Delivery Sênior do turno · se dúvida, LE |
| **foco_desenvolvimento** | Escalonamento com contexto (C-T03) |
| **status_contestacao** | nenhuma |

### Leitura em &lt;10 s
| Pergunta | Resposta do cartão |
|---|---|
| Onde estou? | DP · Onda 1 |
| O que faço agora? | próximo_passo (comunicação com contexto) |
| O que demonstrar? | evidencia_necessaria |
| Quem valida? | DS (ou LE) |
| Como contestar? | Avisar LE + 1 linha no verso do cartão → status “aberta” |

**Não inclui:** score · ranking · potencial · promoção · personalidade · disciplina · histórico longo.

---

## 2. Registro de evidência (exemplo sintético)

### EV-PROT-001 — adequada (comportamento observado)

| Campo | Valor |
|---|---|
| evidence_id | EV-PROT-001 |
| competência | C-DJ03 / C-T02 |
| situação | Pico; pedido na bancada sem dono claro |
| **comportamento observado** | Identificou o pedido sem responsável, assumiu a sacola em voz alta, pediu ajuda pontual ao colega **sem** transferir de forma implícita, confirmou kit com o colega e passou à expedição com confirmação verbal |
| resultado | Pedido saiu com dono explícito até a passagem |
| fonte | Observação DS no turno |
| validador | DS-TURN-A (sintético) |
| confiança | média-alta (viu o ato) |
| status | aprovada |
| data | 2026-07-08 (sintética) |
| contestação | possível em 7 dias de piloto |

**Inadequado (não usar):** “Demonstrou maturidade e proatividade.”

### EV-PROT-002 — incompleta (vai gerar contestação)

| Campo | Valor |
|---|---|
| evidence_id | EV-PROT-002 |
| competência | C-T03 |
| situação | Pico 19h |
| **comportamento observado (incompleto)** | “Não ajudou no pico.” |
| resultado | — |
| fonte | LE apressado |
| validador | LE-TURN-B |
| confiança | baixa |
| status | **contestada → suspensa** |
| data | 2026-07-15 |

---

## 3. Fluxo do líder (uma decisão dominante)

**Entrada:** DS envia EV-PROT-001 em papel (1 linha + competência).

| Passo | Ação do LE/DS | Tempo |
|---|---|---|
| 1 | Ver a evidência | 5 s |
| 2 | Escopo? (montagem/dono = sim para DS) | 5 s |
| 3 | Fonte e contexto suficientes? | 10 s |
| 4 | **Validar** / devolver / insuficiente | 15 s |
| 5 | Reconhecer força **ou** 1 foco (não os dois longos) | 15 s |
| 6 | Lembrar contestação (“se discorda, 1 linha”) | 5 s |
| 7 | Encerrar — atualiza Passaporte `proximo_passo` se preciso | 10 s |

**Total quando claro:** **&lt; 1 minuto**.  
Sem relatório longo. Sem comparar com outros PART-*.

Se evidência sensível ($ / acusação de pessoa): LE **não** valida sozinho se foi quem criou o relato — escala César ou segundo validador.

---

## 4. Contestação e correção (cenário)

### Narrativa sintética
1. LE registra EV-PROT-002: “Não ajudou no pico.”  
2. PART-DP-07 contesta: “Estava em Quentes com 2 pedidos; DS viu.”  
3. Status → **contestada / suspensa**.  
4. Passaporte: **não** mostra “falha de C-T03 consolidada”; `status_contestacao = aberta`.  
5. Revisão: DS confirma ajuda em Quentes; comunicação poderia melhorar, mas a frase original era falsa/incompleta.  
6. Correção: EV-PROT-002v2 — “No pico, permaneceu em Quentes com dois pedidos sob sua posição; não foi observada comunicação de estado à bancada.”  
7. Histórico: v1 arquivada com motivo “incompleta”; v2 em revisão.  
8. Resultado: ou **insuficiente** (sem prova de C-T03) ou nova observação futura — **não** consolidar v1.  
9. Passaporte: contestação `resolvida`; foco permanece comunicação; sem punição.

### Regras demonstradas
- Contestada ≠ consolidada.  
- Separar fato de interpretação.  
- Histórico auditável em papel (grampear v1 atrás de v2).

---

## 5. Verso do cartão Passaporte (contestação em papel)

```text
CONTESTAÇÃO
Data: ____
Evidence_id: ____
Motivo (1 linha): _______________________________
Assinatura participante: ____
Recebido por: ____  Status: aberta
```

---

*Exemplos V0.1 sintéticos · &lt;10 s · &lt;1 min validação.*
