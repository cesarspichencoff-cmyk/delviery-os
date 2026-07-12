# Padrões Candidatos — WhatsApp L1

> **Padrão candidato** ≠ padrão confirmado ≠ taxa real de erro.  
> Critério L1: ≥5 unidades · ≥3 meses distintos (e/ou múltiplos canais no agregado).  
> Heurística de texto; revisão humana e iFood ainda obrigatórios.

---

## 1. Prioridade (top 10 para formação / processo)

| ID | Nome | Cats | Unidades | Meses | Por que importa | Ação candidata | Status |
|---|---|---|---:|---:|---|---|---|
| WA-PAT-001 | Consultas e confirmações frequentes à autoridade | escalonamento | 4104 | 48 | Dependência de decisão/confirmação no chat | Matriz de autonomia; FAQs; briefing | candidato |
| WA-PAT-002 | Coordenação de escala, plantão e equipe | lideranca | 1055 | 47 | Staffing consome canal operacional | Procedimento de escala fora do improviso | candidato |
| WA-PAT-003 | Kit / sacola / molhos / lacre no discurso | embalagem | 860 | 47 | Forma física do pedido e kit | Treino montagem + checklist | candidato |
| WA-PAT-004 | Compensação e cortesia discutidas no chat | compensacao | 846 | 48 | Decisões financeiras ad hoc | Política de limites (César) | candidato |
| WA-PAT-005 | Atraso e motoboy/saída relatados | atraso | 834 | 45 | Dor de tempo e expedição | Cruzar carimbos iFood | candidato |
| WA-PAT-006 | Omissão (“faltou / esqueceram enviar”) | item_faltante | 448 | 45 | Erro clássico de cadeia | Conferência e custódia | candidato |
| WA-PAT-007 | Reclamação de cliente no canal interno | reclamacao | 374 | 46 | Atendimento e recuperação | Trilha atendimento | candidato |
| WA-PAT-008 | Falha de sistema / impressão / app | falha_sistema | 291 | 43 | Quando o processo depende de ferramenta | Contingência operacional | candidato |
| WA-PAT-009 | Pausa / não sobe / segurar delivery | indisponibilidade | 290 | 43 | Controle de cardápio sob pressão | Protocolo de pausa visível | candidato |
| WA-PAT-010 | Ideias de melhoria / app / processo | ideia_melhoria | 264 | 46 | Cultura de evolução | Pipeline de ideias → caso | candidato |

### Também candidatos (secundários)

| ID | Tema | Unidades | Meses |
|---|---|---:|---:|
| WA-PAT-011 | Cancelamento discutido | 194 | 41 |
| WA-PAT-012 | Conferência / “quem fechou” | 112 | 40 |
| WA-PAT-013 | Boa solução / recuperação | 97 | 41 |
| WA-PAT-014 | Pedido errado / trocado | 31 | 16 |
| WA-PAT-015 | Caixa / comanda | 10 | 8 |

---

## 2. Casos críticos candidatos (graves, não “padrão” só por n)

| ID | Descrição genérica | Por que isolado ou crítico |
|---|---|---|
| WA-CRIT-001 | Omissão de item âncora (combinado) com impacto em cliente | Gravidade alta mesmo se n relativo |
| WA-CRIT-002 | Compensação de alto valor sem critério escrito | Risco financeiro e inconsistência |
| WA-CRIT-003 | Silêncio prolongado em decisão urgente no canal | Risco de autonomia sem rede |

*(Detalhamento didático em `Casos_Candidatos_WhatsApp_L1.md` — sem trechos brutos.)*

---

## 3. Explicações alternativas (obrigatórias)

| Padrão | Alternativa a considerar |
|---|---|
| Alto escalonamento | Canal é o **lugar certo** para decidir; não só “falta de autonomia” |
| Muitas msgs 22h–23h | Comunicação de fechamento, não necessariamente mais erros |
| Embalagem frequente | Treino + mudança de kit (ex. marco 2023) gera reensino |
| Compensação alta | Pico de reclamações em certas épocas; falta iFood |

---

## 4. O que **não** fazer com estes candidatos

- Publicar “pior dia da semana” só com volume de mensagens.  
- Atribuir a pessoas.  
- Ativar alerta DeliveryOS.  
- Chamar de padrão confirmado.  

---

## 5. Próximo filtro (após L2/L3 iFood)

Para cada WA-PAT-00x de erro/atraso:

1. Taxa / 100 pedidos na mesma `local_date` e faixa horária.  
2. Se exposição ausente → permanece **candidato de comunicação**, não de risco operacional normalizado.  

---

*Padrões candidatos L1 · heurística · aguardam cruzamento e revisão humana.*
