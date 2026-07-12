# Protocolos Prioritários — Rascunho L6B

> Doze rascunhos mínimos para validação. **Não** são manuais longos.

---

### P1 — Pausa e item 86

| Campo | Conteúdo |
|---|---|
| Objetivo | Pausar só com capacidade real e rastro |
| Gatilho | Insumo/item indisponível; incapacidade de produção; risco |
| Responsável | DS / AO / L (item); L (loja) |
| Passos | Confirmar causa → decidir escopo item/loja → registrar motivo/hora/responsável/impacto/retorno → executar no app → comunicar CX/SAC se afeta cliente |
| Comunicar | Área afetada + CX/SAC se pedidos em curso |
| Escalar | Pausa de loja; dúvida de segurança; impacto em muitos pedidos |
| Evidência | Registro com os 5 campos obrigatórios |
| Encerramento | Condição de retorno confirmada pela área |
| Lacunas | Intervalo numérico de revisão **não** definido |
| Decisão pendente | Calibração de tempos; tetos de comunicação |

---

### P2 — Item faltante

| Campo | Conteúdo |
|---|---|
| Objetivo | Corrigir omissão e fechar ciclo com cliente se necessário |
| Gatilho | Descoberta na loja ou reclamação |
| Responsável | Quem encontra + **SAC** se cliente; CX só se $ |
| Passos | Parar expedição se ainda na loja → conferir comanda → corrigir montagem **ou** abrir ciclo SAC → registrar tema omissão |
| Comunicar | Responsável da sacola; SAC se saiu |
| Escalar | Item principal; recorrência; $ |
| Evidência | O que faltou (categoria), se saiu ou não, ação |
| Encerramento | Pedido completo **ou** cliente encerrado pelo SAC |
| Lacunas | Taxonomia fina de item vs L2C composição |
| Decisão pendente | $ |

---

### P3 — Item trocado

| Campo | Conteúdo |
|---|---|
| Objetivo | Corrigir troca sem culpar pessoa em público |
| Gatilho | Conferência ou cliente |
| Responsável | Montagem + SAC se cliente |
| Passos | Confirmar comanda × conteúdo → isolar erro de processo → correção/reenvio via SAC → aprendizado privado |
| Escalar | Proteína/combinado; segurança; $ |
| Evidência | Esperado vs enviado (categoria) |
| Encerramento | Cliente ok ou política aplicada |
| Decisão pendente | $ |

---

### P4 — Kit e conferência

| Campo | Conteúdo |
|---|---|
| Objetivo | Kit certo na sacola certa |
| Gatilho | Todo fechamento de sacola |
| Responsável | **Dono da sacola** |
| Passos | Conferir pratos × comanda → lacre → kit conforme tabela (simples/completo/quente/kids/light/sobremesa) → multi-sacola se preciso → grampear |
| Comunicar | CX se multi-sacola (template) |
| Escalar | Falta crônica de material de kit |
| Evidência | Checklist mental/físico de kit |
| Encerramento | Sacola pronta para expedição |
| Fonte | OP-04 (proposta validação) |

---

### P5 — Responsável pela sacola

| Campo | Conteúdo |
|---|---|
| Objetivo | Um dono do ciclo de montagem/fechamento |
| Gatilho | Pré-turno e entrada de pedido no fluxo crítico |
| Responsável | Posição designada no pré-turno |
| Passos | Atribuir → manter até transferência explícita → ajudar sem “sumir com a responsabilidade” → encerrar na passagem ao próximo (expedição) |
| Comunicar | Transferência em voz alta / padrão do turno |
| Escalar | Pedido sem dono no pico |
| Evidência | Nome da posição no pré-turno (sem ranking) |
| Encerramento | Entrega formal ao próximo responsável |
| Status | **Oficial consolidada** (César) |

---

### P6 — Compensação e recuperação

| Campo | Conteúdo |
|---|---|
| Objetivo | Recuperar relação sem inventar R$ |
| Gatilho | Reclamação, omissão, atraso, qualidade |
| Responsável | **SAC** conduz; **CX** executa $ autorizado; LE/L autorizam acima da autonomia |
| Passos | Ouvir → classificar tipo (correção, reenvio, cortesia, desconto, voucher, estorno, crédito, exceção) → autorizar se preciso → executar → registrar → fechar ciclo |
| Comunicar | Cliente (SAC); CX se financeiro |
| Escalar | Segurança; valor acima do pendente; exceção comercial |
| Evidência | Tipo de ação, autorização, resultado |
| Encerramento | Cliente encerrado **ou** próximo passo datado |
| Lacunas | **LIMITE FINANCEIRO PENDENTE DO CÉSAR** |
| Decisão pendente | Tetos por função |

---

### P7 — Cancelamento

| Campo | Conteúdo |
|---|---|
| Objetivo | Cancelar com motivo e dono claros |
| Gatilho | Solicitação cliente/loja/iFood |
| Responsável | SAC (cliente); CX (canal/pedido); L se política |
| Passos | Classificar motivo (atraso, logístico, loja, cliente) → decidir se evita → executar → não misturar com “erro de cozinha” genérico |
| Escalar | Disputa; custo; imagem |
| Evidência | Motivo canônico |
| Encerramento | Status cancelado + registro |
| Lacunas | Runbook fino por motivo |
| Nota | Separar cancel nativo L2C de percepção |

---

### P8 — Atraso

| Campo | Conteúdo |
|---|---|
| Objetivo | Conter cascata sem parar a esteira |
| Gatilho | Pedido em risco; motoboy na loja; prazo impossível |
| Responsável | CX detecta; DS/boqueta lê o todo; LE redistribui |
| Passos | Sinalizar risco com contexto → identificar gargalo → priorizar pelos 5 critérios → manter próximas sacolas → comunicar cliente se SAC acionado |
| Escalar | Múltiplos pedidos; saturação; necessidade de pausa |
| Evidência | Pedido(s), praça, motoboy sim/não, ação |
| Encerramento | Pedidos críticos movidos ou pausa decidida |
| Lacunas | 45/55/65 **não oficiais** |
| Decisão pendente | Calibração de limiares |

---

### P9 — Falha de impressão ou sistema

| Campo | Conteúdo |
|---|---|
| Objetivo | Restaurar captura sem inventar pedidos |
| Gatilho | Não imprime; app/gestor fora; integrador |
| Responsável | CX IE; DS/LE apoiam; L se canal para |
| Passos | Diagnosticar (local vs iFood) → contorno seguro → registrar → não aceitar “pedido fantasma” |
| Escalar | Parada de canal |
| Evidência | Sintoma, horário, contorno |
| Encerramento | Canal estável ou pausa autorizada |

---

### P10 — Escalonamento com contexto

| Campo | Conteúdo |
|---|---|
| Objetivo | Eliminar “me ajuda?” vazio |
| Gatilho | Qualquer pedido de decisão/ajuda |
| Responsável | Quem escala |
| Passos | Informar: o quê · quantos pedidos · onde (praça) · impacto · o que já tentou · o que precisa agora |
| Escalar | Se silêncio e risco sobe |
| Evidência | Mensagem com os 6 elementos |
| Encerramento | Decisão registrada ou ação iniciada |
| Fonte | OP-10 / L1 (ruído a reduzir) |

---

### P11 — Comunicação pós-pico (21h–22h)

| Campo | Conteúdo |
|---|---|
| Objetivo | Tratar pressão de **comunicação** sem confundir com pior atraso nativo |
| Gatilho | Reclamações, multi-sacola, fechamentos, SAC |
| Responsável | SAC (cliente); CX apoio canal; LE se fila de casos |
| Passos | Separar `review_at`/mensagem de horário do erro → priorizar por severidade → não ranquear “pior hora” sem exposição |
| Escalar | Crise; segurança; volume de casos |
| Evidência | Caso + severidade + ação |
| Encerramento | Fila de comunicação zerada ou transferida |
| Fonte | L2C H3/H4; L5 |

---

### P12 — Fechamento e registro de aprendizado

| Campo | Conteúdo |
|---|---|
| Objetivo | Aprender sem fofoca nem ranking |
| Gatilho | Fim de turno / pós-incidente |
| Responsável | LE; cada função R |
| Passos | 1–3 fatos · impacto · ação preventiva · dono · sem nomes em canal amplo |
| Escalar | Padrão que exige mudança de regra |
| Evidência | Nota de aprendizado (Passaporte / registro privado) |
| Encerramento | Ação com dono ou “monitorar” explícito |
| Proibido | Quadro público de erros por pessoa |

---

*Rascunhos L6B · prontos para validação · sem manuais longos.*
