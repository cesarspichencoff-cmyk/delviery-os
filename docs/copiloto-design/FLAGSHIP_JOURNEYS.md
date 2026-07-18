# Flagship Journeys — Copiloto Delivery

Jornadas que a experiência **deve** acertar. Cada uma mapeia a cenários do mock (`mocks/copiloto/fixtures/scenarios`).

---

## J1 — Turno calmo (saúde)

| | |
|---|---|
| **Persona** | Líder de turno / operação |
| **Cenário mock** | `01_operacao_calma` |
| **Objetivo** | Confiar o suficiente para **não olhar** |
| **Fluxo** | Abre superfície → vê Calmo → zero lista → segue trabalho |
| **Sucesso** | Nenhum CTA desnecessário; presença serena |
| **Falha de design** | Dashboard “tudo verde com 12 cards” |

---

## J2 — Foco em Conferência com ação

| | |
|---|---|
| **Cenário** | `04_conferencia_acumulando` |
| **Objetivo** | Saber o quê, por quê, qual pedido olhar |
| **Fluxo** | Intervention/discreet → Foco “Conferência…” → evidência (5 pedidos, 2 no prazo) → recomendação 184/191 → follow-up implícito |
| **Sucesso** | Ação em &lt;10s de leitura; voz ≤20s se pedida |
| **Falha** | Lista de 20 pedidos iguais; jargão |

---

## J3 — Quentes em pressão

| | |
|---|---|
| **Cenário** | `03_quentes_pressao` |
| **Fluxo** | Foco Quentes → priorizar bancada / âncora → sem culpar pessoa |
| **Sucesso** | Linguagem de processo (“bancada”, “pedidos âncora”) |

---

## J4 — Motoboy / saída

| | |
|---|---|
| **Cenário** | `05_motoboy_acumulando` |
| **Fluxo** | Foco saída → chamar/liberar prontos antigos |
| **Sucesso** | Não expõe nome de entregador |

---

## J5 — Duas ou três pressões (um Foco)

| | |
|---|---|
| **Cenários** | `07`, `08` |
| **Objetivo** | Ver **uma** prioridade; alternativas só se pedidas |
| **Sucesso** | Sem “ranking de problemas”; alternatives colapsadas |

---

## J6 — Foco protegido contra oscilação

| | |
|---|---|
| **Cenário** | `10_foco_protegido_oscilacao` |
| **Objetivo** | Não trocar de tela a cada minuto |
| **Fluxo** | Foco A mantido; rival não “pisca” prioridade |
| **Sucesso** | Estabilidade perceptível; copy de “mantendo…” se útil |

---

## J7 — Troca legítima / crítica

| | |
|---|---|
| **Cenário** | `09_foco_mudanca_legitima` |
| **Fluxo** | Foco A → risco crítico B → transição com motivo |
| **Sucesso** | Usuário entende **por que** mudou |

---

## J8 — Previsão 10 / 30 min

| | |
|---|---|
| **Cenários** | `11`, `12` |
| **Fluxo** | Pergunta “em quinze minutos?” → conclusão + faixa + confiança + limite |
| **Sucesso** | Sem falsa precisão (“exatamente 7,42 pedidos”) |

---

## J9 — Anomalia sem acusação

| | |
|---|---|
| **Cenário** | `13_anomalia` |
| **Fluxo** | “Tem algo estranho?” → o que mudou + hipótese + alternativa + verificar |
| **Sucesso** | Zero tom de vigilância |

---

## J10 — Dado frágil / falha técnica

| | |
|---|---|
| **Cenários** | `14`–`17` |
| **Fluxo** | degraded/failed → UI honesta → não inventa Foco |
| **Sucesso** | Operador sabe que a leitura está limitada |

---

## J11 — Recomendação aceita / adaptada / ignorada

| | |
|---|---|
| **Cenários** | `18`–`20` |
| **Fluxo** | Registrar outcome sem julgar pessoa |
| **Sucesso** | Três estados de decisão humana claros e sem scorecard individual |

---

## J12 — Ação resolveu / não resolveu / efeito colateral

| | |
|---|---|
| **Cenários** | `21`–`23` |
| **Fluxo** | Follow-up de recuperação; side effect em linguagem de processo |

---

## J13 — Briefing pré-turno

| | |
|---|---|
| **Cenário** | `24_briefing` |
| **Fluxo** | Áudio ≤45s + texto na tela → pico, risco, preparação, limite da previsão |
| **Sucesso** | Cabe no caminho para a loja / início de turno |

---

## J14 — Fechamento 0 / 1 / 3 perguntas

| | |
|---|---|
| **Cenários** | `25`–`27` |
| **Fluxo** | Resumo → 0–3 perguntas → transcrição → confirma → salvar |
| **Sucesso** | ≤2 min; skip / não sei; sem formulário longo |
| **Falha** | survey de 15 campos; análise de emoção |

---

## J15 — Voz hands-free no pico

| | |
|---|---|
| **Cenário** | `28_voz` |
| **Fluxo** | “Qual o maior problema?” → áudio curto → tela com texto completo |
| **Sucesso** | Conclusão nos primeiros segundos; sem ler UUID |

---

## J16 — Modo sombra (sem automatizar)

| | |
|---|---|
| **Cenário** | `29_modo_sombra` |
| **Fluxo** | UI de observação/explicação; gates visíveis só para admin/líder produto |
| **Sucesso** | Não vende automação antes do gate |

---

## J17 — Aprendizado / memória epistêmica

| | |
|---|---|
| **Cenário** | `30_aprendizado` |
| **Fluxo** | Fato vs relato humano claramente separados na UI de memória |

---

## Mapa persona × jornada

| Persona | Jornadas primárias |
|---|---|
| Líder de turno | J1–J8, J13–J15 |
| Conferência / produção | J2–J3, J15 |
| Líder entrega | J4, J15 |
| Operador de voz | J15, J14 |
| Produto / sombra | J16, J10 |

---

## Critério de “flagship pronto”

Uma jornada flagship só está pronta quando:

1. payload do mock renderiza sem inventar campos;
2. copy passa no `MICROCOPY_SYSTEM`;
3. mobile e voz cobertos se a jornada for de pico;
4. falha/incerteza coberta se a jornada depender de dado.
