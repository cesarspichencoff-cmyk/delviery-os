# Voice and Audio UX — Copiloto Delivery

Contratos: `docs/copiloto/VOICE.md`, `src/copiloto/voice-intents.js`, `response-contract.js`.

---

## 1. Papel da voz

| Voz faz | Voz não faz |
|---|---|
| consulta hands-free no pico | análise de emoção/sotaque/sinceridade |
| briefing e fechamento guiados | vigilância contínua |
| confirmação de registro simples | substituir julgamento humano |

---

## 2. Modos de fala (TTS / leitura)

| Modo | Duração | Conteúdo |
|---|---|---|
| **short** | ≤ 8s | só conclusão (+ ação se couber) |
| **normal** | ≤ 20s | conclusão + evidência essencial + ação |
| **detailed** | sob pedido | texto completo; ainda sem tabelas |

Sempre: **texto completo na tela** (`screen_full_text`).

---

## 3. Fluxo de interação por voz

```
idle → listening → processing → speaking → confirm? → idle
         ↓ error        ↓ low conf
       reprompt      clarify / fallback
```

| Estado | UI | Áudio |
|---|---|---|
| listening | mic ativo, pulso | opcional earcon curto |
| processing | “um momento” | silêncio &lt;1.5s ideal |
| speaking | texto acompanhando | TTS |
| needs confirm | chips Sim/Não/Editar | pergunta curta |

---

## 4. Intents e UX

Catálogo: 23 intents (`voice-intents`).

| Grupo | Exemplo | Resposta UI |
|---|---|---|
| Estado | “Como está o Delivery?” | overview / Foco |
| Área | “Como está a Conferência?” | area status |
| Pedidos | “Quais em risco?” | 2–3 IDs |
| Previsão | “Em quinze minutos?” | forecast + limite |
| Ação | “O que recomenda?” | recommendation ou foco puro |
| Registro | “Registrar que… apoio” | confirmação explícita |
| Fechamento | “Fechar o turno” | fluxo ≤2 min |
| Briefing | “Briefing” | ≤45s |

**Ambiguity:** perguntar uma coisa só (“Qual área?”).  
**Fallback:** `state.overview` ou “Não entendi — pode repetir?”

---

## 5. Fechamento por áudio (flagship)

1. Copiloto: resumo (short/normal)  
2. Uma pergunta  
3. Pessoa responde  
4. Transcrição na tela  
5. Confirma / corrige  
6. Próxima (máx. 3) ou salvar  
7. Resumo final  

Chips sempre: **Não sei** · **Pular**  
Ideal 60s; máximo 120s.  
Sem pergunta se turno sem fato relevante (cenário 25).

---

## 6. Briefing por áudio

- Máx. 45s  
- Ordem: cenário → pico → risco → preparação → limite  
- Opt-in no início do turno; não forçar todo login  

---

## 7. Earcons (opcional)

| Evento | Som |
|---|---|
| entrar em Foco intervention | 1–2 notas curtas (opt-in; herança V1) |
| falha técnica | tom neutro distinto de Foco |
| fim de fechamento | confirmação suave |

Sem sirene. Sem loop.

---

## 8. Privacidade de áudio

- Sem gravação permanente de voz por padrão  
- Transcrição de fechamento = dado operacional local, sem análise paralinguística  
- Proibido: humor, estresse, “engajamento”  

---

## 9. Erros de voz

| Erro | Copy | Next |
|---|---|---|
| não entendi | “Pode repetir em uma frase?” | listening |
| sem permissão mic | “Ative o microfone ou use o texto.” | teclado |
| intent sem dado | “Não tenho leitura segura disso agora.” | fallback |
| tech failed | “A leitura está fora; não invento prioridade.” | technical UI |

---

## 10. Critérios de aceite de voz

- [ ] Conclusão nos primeiros 2–3s  
- [ ] Normal ≤20s  
- [ ] Tela espelha texto completo  
- [ ] Não lê UUID/tabela  
- [ ] Confirm em writes  
- [ ] Zero feature de emoção  
