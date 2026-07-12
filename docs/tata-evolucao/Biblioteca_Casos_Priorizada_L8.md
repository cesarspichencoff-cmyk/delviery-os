# Biblioteca de Casos Priorizada — L8

> Esqueletos didáticos anonimizados. **Não** reproduzem conversa real nem diálogos completos.  
> Fontes: T0B-A · L1 · L4 · L5 · L6A · L6B. Prioridade = onda de produção Fase 1.

---

## 1. Inventário e prioridade

| Onda | Foco | IDs |
|---|---|---|
| **Onda 1** (T1) | Cultura, kit, omissão, sacola, escalonamento, comunicação | B01–B03, K01–K03, O01–O03, S01–S03, E01–E03 |
| **Onda 2** (T1–T2) | Troca, atraso, pausa, compensação, recuperação, pós-pico | T01, A01–A03, P01, C01–C03, R01–R02, PP01–PP02 |
| **Onda 3** (T2) | Cancelamento, falha sistema, liderança, motoboy, qualidade | X01, F01, L01–L02, M01, Q01 |
| **Positivos** (todas as ondas) | Colaboração, antecipação, boa recuperação, etc. | B01–B03, R01, S03, E03, L02 (ângulo positivo) |

**Total priorizado L8: 36 case_ids** (esqueleto completo abaixo em grupos; todos seguem o mesmo schema).

---

## 2. Schema de blueprint de caso

```
case_id · formação · função · situação · contexto · info disponível · info ausente
· decisão possível · risco · princípio · resposta esperada · erros de raciocínio
· evidência · resultado conhecido · necessidade validação César
```

---

## 3. Casos — Cultura e boas práticas

### CASE-L8-B01 — Colaboração com dono da sacola
| Campo | Conteúdo |
|---|---|
| formação | F1 |
| função | DJ–DS |
| situação | Pico; colega ajuda a montar; o dono designado permanece |
| contexto | Pré-turno atribuiu posição |
| info disponível | Quem é o dono; pedido em montagem |
| info ausente | — |
| decisão possível | Ajudar e devolver; ou transferir explicitamente |
| risco | Ninguém fecha o ciclo |
| princípio | Ajuda não é favor; responsabilidade não some |
| resposta esperada | Ajuda + confirma dono em voz alta |
| erros de raciocínio | “Ajudei, então não é mais meu” |
| evidência | P5; R-L6B-02 |
| resultado conhecido | Candidato documental |
| validação César | Não (regra já oficial) |

### CASE-L8-B02 — Qualidade preservada sob pressão
| Campo | Conteúdo |
|---|---|
| formação | F1 / F3 |
| função | DS / LE |
| situação | Pressão por velocidade; risco de misturar quente/frio |
| princípio | Qualidade antes da velocidade |
| resposta esperada | Manter padrão; priorizar pelos 5 critérios, não “atalhar” kit |
| erros de raciocínio | “Depois a gente vê” |
| evidência | OP-04; L6B princípios |
| validação César | Não |

### CASE-L8-B03 — Comunicação clara no canal
| Campo | Conteúdo |
|---|---|
| formação | F2 |
| função | CX / SAC |
| situação | Cliente pergunta status; equipe usa ESTADO+IMPACTO+AÇÃO |
| resposta esperada | Ex.: aguarda Quentes; bloqueia conferência; precisa previsão |
| erros de raciocínio | “cadê?” / “já vai” vazio |
| evidência | Decisão César L8; OP-10 roteiro |
| validação César | Tom de voz (opcional) |

---

## 4. Casos — Kit, omissão, troca, embalagem, sacola

### CASE-L8-K01 — Kit incompleto na conferência
| Campo | Conteúdo |
|---|---|
| formação | F1 + trilha DJ | função | DJ/DP | situação | Kit simples incompleto antes de grampear |
| resposta esperada | Completar pelo tipo de kit; dono da sacola confere |
| protocolo | P4 | evidência | OP-04; L5 omissão | validação César | Conteúdo atual do kit se mudou |

### CASE-L8-K02 — Quente com frio
| Campo | Conteúdo |
|---|---|
| formação | F1 | função | DJ | situação | Tentativa de embalar quente junto com frio |
| resposta esperada | Separar; multi-sacola se necessário | R-L6B-05 provisória piloto |

### CASE-L8-K03 — Multi-sacola sem aviso
| Campo | Conteúdo |
|---|---|
| formação | F2 | função | CX | situação | Pedido grande sai em N sacolas; cliente não avisado |
| resposta esperada | Template multi-sacola antes da saída | P4 / C-CX05 |

### CASE-L8-O01 — Omissão descoberta na loja
| Campo | Conteúdo |
|---|---|
| formação | F2 | função | DP/DS | situação | Combinado falta antes da expedição |
| resposta esperada | Parar; corrigir; registrar; não expedir incompleto | P2 |

### CASE-L8-O02 — Omissão relatada pelo cliente
| Campo | Conteúdo |
|---|---|
| formação | F2 | função | SAC | situação | Cliente acusa item faltante após entrega |
| info ausente | Foto/comanda às vezes | resposta esperada | Investigar; não culpar sem fato; abrir P6 se preciso |
| validação César | Limites $ |

### CASE-L8-O03 — Kit omitido + avaliação
| Campo | Conteúdo |
|---|---|
| formação | F2 | função | SAC | situação | Nota baixa por kit; padrão L5 |
| resposta esperada | Ciclo de recuperação + aprendizado P12 (sem reply histórico no export = treinar capacidade) |

### CASE-L8-T01 — Item trocado
| Campo | Conteúdo |
|---|---|
| formação | F2 | função | Montagem + SAC | situação | Esperado A, saiu B |
| resposta esperada | Isolar processo; corrigir/reenviar via SAC; aprendizado privado | P3 |

### CASE-L8-S01 — Pedido parado sem dono
| Campo | Conteúdo |
|---|---|
| formação | F1 | função | Todos | situação | Sacola sem responsável no fluxo crítico |
| resposta esperada | Atribuir agora; comunicar estado | P5 / OP-11 |

### CASE-L8-S02 — Transferência implícita
| Campo | Conteúdo |
|---|---|
| formação | F1 | função | DJ | situação | “Fica aí pra mim” sem passagem clara |
| resposta esperada | Transferência explícita ou manter dono | P5 |

### CASE-L8-S03 — Pré-turno com posições claras (positivo)
| Campo | Conteúdo |
|---|---|
| formação | F3 / F1 | função | LE | situação | LE atribui donos por posição antes do pico |
| resposta esperada | Mapa de posições; todos sabem | evidência | R-L6B-02 |

---

## 5. Casos — Pausa, atraso, cancelamento, sistema

### CASE-L8-P01 — Pausa de item com registro
| Campo | Conteúdo |
|---|---|
| formação | F3 | função | DS/AO/LE | situação | Insumo indisponível; dúvida se pausa |
| resposta esperada | Confirmar causa; 5 campos; revisão no horário ou a cada **15 min**; retirar com área |
| erros | Pausar só por pressão; sem rastro | validação César | Implantação |

### CASE-L8-A01 — Proteção do pico 19h
| Campo | Conteúdo |
|---|---|
| formação | F3 | função | DS/LE | situação | Volume e atraso nativo altos |
| resposta esperada | 5 critérios; não praça fixa; sinal com contexto | evidência | L2C |

### CASE-L8-A02 — Cliente no atraso
| Campo | Conteúdo |
|---|---|
| formação | F2 | função | SAC | situação | Cliente cobra tempo |
| resposta esperada | Não inventar ETA; investigar estado; P6 se política | 

### CASE-L8-A03 — Pico operacional vs pressão 21–22h
| Campo | Conteúdo |
|---|---|
| formação | F1/F2/F3 | função | LE/SAC | situação | Dois momentos distintos |
| resposta esperada | 19h protege fluxo; 21–22h fecha ciclos | não escolher “pior hora única” |

### CASE-L8-X01 — Cancelamento pós-impressão
| Campo | Conteúdo |
|---|---|
| formação | F2 | função | SAC/CX | situação | Cancel após comanda |
| resposta esperada | Motivo; dono; parar produção se ainda dá | P7 |

### CASE-L8-F01 — Falha de impressão/sistema
| Campo | Conteúdo |
|---|---|
| formação | F3 | função | CX/DS/LE | situação | Comanda não sai / app instável |
| resposta esperada | IE; contenção; não improviso silencioso | P9 |

---

## 6. Casos — Compensação, recuperação, escalonamento, liderança

### CASE-L8-C01 — Tipo de recuperação sem valor
| Campo | Conteúdo |
|---|---|
| formação | F2 | função | SAC | situação | Cliente elegível a cortesia/reenvio |
| resposta esperada | Classificar tipo; **não inventar R$**; escalar se acima do pendente | P6 |

### CASE-L8-C02 — SAC conduz, Caixa executa
| Campo | Conteúdo |
|---|---|
| formação | F2 | função | SAC/CX | situação | Estorno autorizado |
| resposta esperada | SAC fecha relação; CX lança; propriedade explícita |

### CASE-L8-C03 — Exceção comercial
| Campo | Conteúdo |
|---|---|
| formação | F3 | função | L | situação | Pedido fora da autonomia |
| resposta esperada | Só liderança; registrar | **$ pendente** |

### CASE-L8-R01 — Boa recuperação (positivo)
| Campo | Conteúdo |
|---|---|
| formação | F2 | função | SAC | situação | Reconhece percepção; próximo passo claro; fecha ciclo |
| resposta esperada | Padrão L5 proposto (7 passos) | evidência | Boas práticas L5 (conceitual) |

### CASE-L8-R02 — Avaliação sem resposta histórica
| Campo | Conteúdo |
|---|---|
| formação | F2 | função | SAC/LE | situação | Export sem reply — lacuna de capacidade |
| resposta esperada | Treinar capacidade futura de resposta; medir depois | validação César | Processo de reply |

### CASE-L8-E01 — Escala “me ajuda?” vazio
| Campo | Conteúdo |
|---|---|
| formação | F1 | função | Todos | situação | Mensagem sem qtde/praça/impacto |
| resposta esperada | ESTADO+IMPACTO+AÇÃO | P10 |

### CASE-L8-E02 — Ninguém responde; agir seguro
| Campo | Conteúdo |
|---|---|
| formação | F1/F4 | função | DP/DS | situação | Silêncio da liderança |
| resposta esperada | Opção mais segura; comunicar assim que der | Visão Mestra §6 |

### CASE-L8-E03 — Escala com contexto (positivo)
| Campo | Conteúdo |
|---|---|
| formação | F1 | função | DS | situação | “3 pedidos aguardam Quentes; bloqueia 2 expedições; precisa previsão 5 min” |
| resposta esperada | Modelo institucional |

### CASE-L8-L01 — Correção sem humilhar
| Campo | Conteúdo |
|---|---|
| formação | F3 | função | LE | situação | Erro de kit no pico |
| resposta esperada | Corrigir fato; debrief depois; sem ranking | P12 |

### CASE-L8-L02 — Discordância responsável depois (positivo)
| Campo | Conteúdo |
|---|---|
| formação | F3/F4 | função | PL/LE | situação | Ideia de melhoria pós-turno |
| resposta esperada | Fatos + proposta; hierarquia no crítico respeitada |

### CASE-L8-PP01 — Fila de casos 21h30
| Campo | Conteúdo |
|---|---|
| formação | F2/F3 | função | SAC/LE | situação | Pós-pico comunicacional |
| resposta esperada | Priorizar fechamento; P11 | 

### CASE-L8-PP02 — Aprendizado no fechamento
| Campo | Conteúdo |
|---|---|
| formação | F1/F3 | função | LE | situação | 1 fato do dia vira proposta de aprendizado |
| resposta esperada | Fluxo governança; sem fofoca | P12 |

### CASE-L8-M01 — Fricção com motoboy
| Campo | Conteúdo |
|---|---|
| formação | F2/F3 | função | LE/SAC | situação | Conflito na saída; cliente no meio |
| resposta esperada | Proteger cliente; LE na relação operacional; sem escalada pública |

### CASE-L8-Q01 — Risco de segurança alimentar
| Campo | Conteúdo |
|---|---|
| formação | F2/F3 | função | Todos → IE | situação | Dúvida de frescor/segurança |
| resposta esperada | Interromper; escalar; não “mandar assim mesmo” | 

---

## 7. Cobertura por tema (checklist)

| Tema | Casos |
|---|---|
| cultura | B01–B03, L01–L02 |
| atendimento | B03, R01–R02, O02, A02 |
| omissão / kit / troca / embalagem / sacola | O*, K*, T01, S* |
| pausa / indisponibilidade | P01 |
| compensação / recuperação | C*, R* |
| atraso / cancelamento / sistema | A*, X01, F01 |
| escalonamento / pico / pós-pico | E*, A01, A03, PP* |
| autonomia / liderança / boas práticas | E02, L*, B*, S03, R01 |

---

## 8. O que **não** está nesta biblioteca

- Diálogos completos · prints · mídia · nomes · contagens revalidadas como KPI.  
- Casos que dependam só de 45/55/65.

---

*Biblioteca L8 · 36 esqueletos · ondas 1–3 · sem PII.*
