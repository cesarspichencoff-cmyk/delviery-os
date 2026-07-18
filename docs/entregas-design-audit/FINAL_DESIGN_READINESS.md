# Prontidão de Design — Entregas (Decisão)

---

## 1. Já pronto para protótipo final (só acabamento visual)

*Nada visual existe — o que está pronto é **conteúdo de domínio** para o primeiro protótipo fiel:*

- Máquina de estados **Trip** e transições  
- Separação **presença ≠ disponibilidade**  
- **Pickup → saída → paradas → retorno confirmado → completed**  
- Multi-pedido / partially_completed  
- Marketplace handoff por **posição**  
- Correlação comanda: reimpressão ≠ nova delivery; anti-fusão  
- Fatos → OV sem escrever Foco  
- GPS só na viagem + proibição ranking/punição  
- Desconhecidos U-01–U-12 (mostrar, não inventar)  

Estes **não devem ser redesenhados** conceitualmente na Missão 2 — só **expressos**.

---

## 2. Precisa de consolidação (definido, espalhado)

- 10 docs `deliveryos/*` → um **mapa mental único** de leitura para design (esta pasta audit)  
- Fluxos F1–F20 × jornadas essenciais 1–20 (gaps explícitos em `JOURNEY_COVERAGE`)  
- Offline Entregas × padrões Fable offline (sem misturar produtos)  
- Linguagem “consciência da viagem” vs fronteira OV  

---

## 3. Precisa de decisão de produto

| # | Decisão | Por quê |
|---|---|---|
| D1 | Taxonomia de ocorrências de rua (não atende, recusa, avaria, endereço) | Jornadas 9–13 ausentes |
| D2 | Volumes/sacolas na viagem: obrigatório ou opcional V1? | Gap conferência |
| D3 | Tentativas: N máximo e UX de “tentativa sem sucesso” | Estado ausente |
| D4 | Reenvio / reentrega: Entregas ou OV+Caixa? | Ausente |
| D5 | Mobile V1: rider-only vs rider+LE? | Escopo protótipo |
| D6 | Mapa: nunca / só sob demanda / nunca no pico loja | Red team mapa |
| D7 | Notificações: silêncio operacional de Entregas | Não modelado |
| D8 | Pagamento divergente: confirmar **fora** de Entregas | Fronteira $ |
| D9 | Retenção GPS/PII prazos | Pendente jurídico no doc |

---

## 4. Não deve entrar agora (V1)

- Ranking, gamificação, score de motoboy  
- Rastreamento permanente / geofence auto-disponível sem regra César  
- Integração live Copiloto  
- Write em Calmo/Ambiente/Foco  
- OCR completo de todas as impressoras  
- App genérico tipo “fleet dashboard”  
- Central de mensagens  
- Pagamentos/vouchers em Entregas  
- Multi-loja  

---

## 5. Futuro

- Arquivos reais (gate pendente César) calibrando correlação  
- Tempo médio handoff externo  
- Km real vs estimado (sem punição)  
- Batch handoff multi-pedido externo  
- Copiloto consumindo fila de saída / stale trip  
- Paper-first de expedição (se valer)  

---

## 6. Diferencial, lacuna, risco

| | |
|---|---|
| **Maior diferencial** | Fechamento **real** da viagem + presença≠disponibilidade + anti-duplicidade de impressão + handoff sem vigilância + Foco **não** capturado por Entregas |
| **Maior lacuna** | **Zero design visual** + **exceções de rua** não jornadas |
| **Maior risco** | Protótipo virar tracker genérico **ou** operação continuar no WhatsApp porque mobile offline/exceção não existiu |

---

## 7. Pronto para Missão 2?

**SIM** — com escopo de **consolidar UX a partir do contrato V0.1**, não reinventar o domínio.  
Missão 2 deve produzir hierarquia, estados de interface, jornadas de exceção acordadas e handoff visual — **sem** alterar `app-v1`/motor OV nem outros worktrees.
