# Red Team — Operação Real da Loja

> Cenários adversariais de turno, chão de loja e falha de fonte.
> Complementa `Auditoria_Estrategica_DeliveryOS_Grok.md`.
> HEAD de referência: `a441bc7`. **Nenhum código alterado.**

---

## 1. Premissas do ataque

1. A loja não para para “usar o DeliveryOS”.
2. Impressão da comanda é sagrada (atrasar = falha de produto).
3. Gestor iFood e Odhen/Teknisa já competem por atenção; o DeliveryOS é o **terceiro** sistema.
4. Em pico, o operador ignora tela se ela mentiu uma vez.
5. Correção à caneta e reimpressão existem (confirmados).

---

## 2. Matriz de cenários

Cada cenário: o que a operação faz · o que o sistema pode errar · gravidade · sinal de detecção · o que NÃO fazer.

### R-01 — Segunda tranquila

| Campo | Conteúdo |
|---|---|
| **Operação** | Poucos pedidos; tempo para olhar monitor |
| **Risco** | Calibrar expectativas no “fácil”; esconder bugs de volume |
| **Gravidade** | Baixa se só calibrar; **Alta** se gate de promoção de fase |
| **Sistema pode** | Parecer perfeito com 5 pedidos e falhar com 20 |
| **Detecção** | Métricas de captura e latência por faixa de volume |
| **Não fazer** | Promover piloto só com segunda |
| **Bloqueia Sombra?** | Não |
| **Bloqueia real?** | Sim se for única prova |
| **Confiança** | Alta |

### R-02 — Sexta cheia

| Campo | Conteúdo |
|---|---|
| **Operação** | Pico; 20+ em preparo; gritos de sequência |
| **Risco** | Captura atrasa; UI grita demais; CPU do caixa compete |
| **Gravidade** | Crítica |
| **Sistema pode** | Silêncio (atrasado) ou gritaria (ambiente) |
| **Detecção** | Latência impressão→JSONL; % half-match; flips de modo/min |
| **Não fazer** | Automação de clique no Gestor da equipe |
| **Bloqueia Sombra?** | Live stress: sim para “sombra validada em pico” |
| **Bloqueia real?** | Sim |
| **Confiança** | Alta |

### R-03 — Domingo de pico

| Campo | Conteúdo |
|---|---|
| **Operação** | Pico maior; equipe cansada; menos paciência com UI |
| **Risco** | Mesmo que sexta + fadiga → ignora tela |
| **Gravidade** | Crítica para adoção |
| **Sistema pode** | Acertar tecnicamente e falhar socialmente |
| **Detecção** | Observação: “olhou / não olhou / xingou” (qualitativo, sem vigilância de pessoa) |
| **Não fazer** | Cobrar uso; ranking de quem olhou |
| **Bloqueia Sombra?** | Não |
| **Bloqueia real?** | Sim se feedback for “atrapalha” |
| **Confiança** | Média (comportamental) |

### R-04 — 20 pedidos simultâneos

| Campo | Conteúdo |
|---|---|
| **Operação** | Colunas cheias no Gestor; rolagem necessária |
| **Risco** | Modelo B/C do DOM; perda de status; casamento incompleto |
| **Gravidade** | Crítica para Motor A vivo |
| **Evidência doc** | `Auditoria_Fonte_Viva` §6; inspeção não determinada |
| **Detecção** | Contagem DOM vs contagem de coluna na UI iFood |
| **Não fazer** | Assumir Modelo A |
| **Bloqueia Sombra?** | Live status: sim até classificar modelo |
| **Bloqueia real?** | Sim |
| **Confiança** | Alta |

### R-05 — Impressão atrasada

| Campo | Conteúdo |
|---|---|
| **Operação** | Comanda demora a sair; produção já começou de cabeça |
| **Risco** | Capturador culpado mesmo se inocente; ou capturador realmente atrasou spool |
| **Gravidade** | Crítica |
| **Detecção** | Comparar timestamps SubmittedTime vs relógio; feedback caixa |
| **Não fazer** | Pausar fila, reconfigurar driver, “manter documentos impressos” em produção |
| **Critério de parada** | Qualquer atraso perceptível → desligar capturador |
| **Bloqueia Sombra?** | Se capturador ligado: sim até provar zero impacto |
| **Bloqueia real?** | Sim |
| **Confiança** | Alta |

### R-06 — Reimpressão

| Campo | Conteúdo |
|---|---|
| **Operação** | Segunda via da mesma comanda (rara, confirmada) |
| **Risco** | Pedido duplicado no motor; carga de praça 2×; foco fantasma |
| **Gravidade** | Alta |
| **Detecção** | Dedup `pedido_interno` + hash de itens; contagem diária reimpressões |
| **Não fazer** | Tratar toda impressão como pedido novo sem chave |
| **Bloqueia Sombra?** | Não se dedup testado em fixture |
| **Bloqueia real?** | Sim sem dedup |
| **Confiança** | Alta |

### R-07 — Cancelamento após impressão

| Campo | Conteúdo |
|---|---|
| **Operação** | Comanda já saiu; iFood cancela; papel ainda circula |
| **Risco** | Motor A deve cancelar; Motor B ainda tem itens; produção faz item morto |
| **Gravidade** | Alta |
| **Evidência** | Cancelamento só no Gestor (César) |
| **Detecção** | Evento `cancelado` prevalece; UI mostra cancelado se em foco |
| **Não fazer** | Inferir cancel da comanda; apagar histórico de itens sem marca de cancel |
| **Bloqueia Sombra?** | Não |
| **Bloqueia real?** | Sim se não houver evento cancel |
| **Confiança** | Alta |

### R-08 — Item riscado à mão (“não foi”)

| Campo | Conteúdo |
|---|---|
| **Operação** | Correção física pós-impressão |
| **Risco** | Sistema e Gestor divergem do papel final |
| **Gravidade** | Alta (falsa precisão) |
| **Detecção** | Não detectável digitalmente (limitação permanente V1) |
| **Não fazer** | Lista de itens como “sacola final” |
| **UI** | “Itens impressos” + honestidade de limitação |
| **Bloqueia Sombra?** | Não |
| **Bloqueia real?** | Se UI mentir: sim |
| **Confiança** | Alta |

### R-09 — Status sem comanda

| Campo | Conteúdo |
|---|---|
| **Operação** | Pedido no Gestor antes de imprimir (ou falha de captura de spool) |
| **Risco** | Tempo/atraso sem composição → praça sintética se mal implementado |
| **Gravidade** | Alta |
| **Arquitetura** | Nó half-match documentado |
| **Não fazer** | Fabricar itens; rodar motor de praça sintético sem rótulo em live |
| **Bloqueia Sombra?** | Não se estado `parcial_status` |
| **Bloqueia real?** | Sim se focar praça sem itens reais |
| **Confiança** | Alta |

### R-10 — Comanda sem status

| Campo | Conteúdo |
|---|---|
| **Operação** | Impresso; Gestor ainda não mostra / capturador de DOM falhou |
| **Risco** | Itens sem tempo → sem Motor A confiável |
| **Gravidade** | Alta |
| **Não fazer** | Inventar “recebido agora” sem observação |
| **Bloqueia Sombra?** | Não se `parcial_itens` |
| **Bloqueia real?** | Sim para Foco de tempo |
| **Confiança** | Alta |

### R-11 — Duas sacolas erradas (heurística)

| Campo | Conteúdo |
|---|---|
| **Operação** | Caixa monta sacolas pela regra real; sistema usa combo/≥8 |
| **Risco** | Foco de conferência no pedido errado |
| **Gravidade** | Alta se exibido; Média se só interno |
| **Evidência** | motor.js vs Logica_Embalagens |
| **Não fazer** | Atenção leve “duas sacolas” como fato |
| **Bloqueia Sombra?** | Não |
| **Bloqueia real?** | Sim para feature embalagem |
| **Confiança** | Alta |

### R-12 — Só quente errado

| Campo | Conteúdo |
|---|---|
| **Operação** | Pedido só quentes de cozinha; ou hot roll tratado como “só quente” |
| **Risco** | Hot roll é exceção (pode ir com frio); sinal errado |
| **Gravidade** | Média-Alta |
| **Não fazer** | Inferir “só quente” sem regra validada |
| **Bloqueia Sombra?** | Não |
| **Bloqueia real?** | Sim se sinal de embalagem for produto |
| **Confiança** | Média |

### R-13 — Só sobremesa errado

| Campo | Conteúdo |
|---|---|
| **Operação** | Sobremesa com frios OK; com quentes separa |
| **Risco** | Sinal de conferência genérico sem causa |
| **Gravidade** | Média |
| **Não fazer** | Empurrar sobremesa para Foco sem evidência de esquecimento |
| **Bloqueia Sombra?** | Não |
| **Bloqueia real?** | Parcial |
| **Confiança** | Média |

### R-14 — Motoboy travado

| Campo | Conteúdo |
|---|---|
| **Operação** | Prontos acumulam; Gestor “Pronto” sobe |
| **Risco** | Sinal `saida` saudável no motor histórico — se status live falhar, silêncio |
| **Gravidade** | Alta |
| **Detecção** | Coluna Pronto do Gestor vs `wE` no motor |
| **Não fazer** | Chamar motoboy por nome (Lei 4) |
| **Bloqueia Sombra?** | Não |
| **Bloqueia real?** | Se status live cego: sim |
| **Confiança** | Alta |

### R-15 — Conferência travada

| Campo | Conteúdo |
|---|---|
| **Operação** | Bancada de conferência cheia; risco por pedido ≠ fila de estação |
| **Risco** | Mapa de Ambientes “Conferência vermelha” sem dado de fila |
| **Gravidade** | Alta se inventar fila |
| **Evidência** | Mapa_Ambientes §5–7 |
| **Não fazer** | Verde falso em Conferência/Caixa |
| **Bloqueia Sombra?** | Não |
| **Bloqueia real?** | Sim para mapa 6 áreas sem validação |
| **Confiança** | Alta |

### R-16 — Fonte desconectada

| Campo | Conteúdo |
|---|---|
| **Operação** | Navegador do Gestor fechou; spool reader morreu; Wi-Fi do mini-PC caiu |
| **Risco** | UI em Calmo “saudável” |
| **Gravidade** | Crítica |
| **Detecção** | Heartbeat de capturador ≠ pulso operacional |
| **Não fazer** | Misturar health de fonte com `mode=calmo` |
| **Bloqueia Sombra?** | Shadow deve registrar disconnect |
| **Bloqueia real?** | Sim sem health |
| **Confiança** | Alta |

### R-17 — Internet oscilando

| Campo | Conteúdo |
|---|---|
| **Operação** | Gestor iFood falha; Odhen local pode continuar imprimindo |
| **Risco** | Comanda sem status prolongado; cancelamentos atrasados |
| **Gravidade** | Alta |
| **Detecção** | Age do último status > limiar |
| **Não fazer** | Dependência de nuvem para o cérebro local já com dados |
| **Bloqueia Sombra?** | Não |
| **Bloqueia real?** | Parcial (degradação esperada se honesta) |
| **Confiança** | Alta |

### R-18 — Reinício do computador

| Campo | Conteúdo |
|---|---|
| **Operação** | Caixa reinicia no meio do turno |
| **Risco** | Perda de fila em memória; jobs de spool perdidos; sessão Gestor |
| **Gravidade** | Alta |
| **Detecção** | Append-only em disco + recover |
| **Não fazer** | Estado só em RAM; auto-login com senha no repo |
| **Bloqueia Sombra?** | Não se recover testado |
| **Bloqueia real?** | Sim sem recover |
| **Confiança** | Alta |

### R-19 — Relógio errado

| Campo | Conteúdo |
|---|---|
| **Operação** | Windows com hora errada; fuso; NTP desligado |
| **Risco** | STALE/DEBOUNCE/MAXFOCUS distorcidos; “atraso 29 min” do Gestor vs relógio local |
| **Gravidade** | Alta |
| **Detecção** | Comparar relógio Windows vs celular; monotonic clock onde possível |
| **Não fazer** | Confiar cegamente em `Date.now()` sem sanidade |
| **Bloqueia Sombra?** | Parcial |
| **Bloqueia real?** | Sim se foco em atraso |
| **Confiança** | Média |

### R-20 — Arquivo corrompido

| Campo | Conteúdo |
|---|---|
| **Operação** | JSONL truncado no crash |
| **Risco** | Reader quebra; UI some |
| **Gravidade** | Média-Alta |
| **Detecção** | Skip linha inválida + log; nunca crashar o servidor de UI |
| **Não fazer** | Falhar fechado a tela inteira |
| **Bloqueia Sombra?** | Não se parser tolerante |
| **Bloqueia real?** | Sim se UI cair |
| **Confiança** | Alta |

### R-21 — Sistema exibindo dado antigo

| Campo | Conteúdo |
|---|---|
| **Operação** | Poll parado; cache; aba em background throttled |
| **Risco** | Ação sobre pedido já saído |
| **Gravidade** | Crítica |
| **Detecção** | “Atualizado há Xs” visível; stale → não Foco novo |
| **Não fazer** | Esconder idade do snapshot |
| **Bloqueia Sombra?** | Sombra deve logar age |
| **Bloqueia real?** | Sim |
| **Confiança** | Alta |

### R-22 — Operador ignorando a tela

| Campo | Conteúdo |
|---|---|
| **Operação** | Comportamento esperado se valor baixo ou erro prévio |
| **Risco** | Produto “existe” mas não reduz investigação |
| **Gravidade** | Estratégica |
| **Detecção** | Observação qualitativa de turno (não câmera de vigilância) |
| **Não fazer** | Alertas sonoros agressivos; gamificação; punição |
| **Bloqueia Sombra?** | Não — sombra é para isso |
| **Bloqueia real?** | Se ignorar por desconfiança: sim |
| **Confiança** | Média |

### R-23 — Tela poluída

| Campo | Conteúdo |
|---|---|
| **Operação** | Vários rótulos, pressões, mapa, listas |
| **Risco** | Vira dashboard; Lei 2 e 8 |
| **Gravidade** | Alta (produto) |
| **Detecção** | Contagem de elementos de atenção por estado |
| **Não fazer** | >1 ação; listas; KPIs no Foco |
| **Bloqueia Sombra?** | Não |
| **Bloqueia real?** | Sim se violar contrato cognitivo |
| **Confiança** | Alta |

---

## 3. Interações perigosas (combinações)

| Combinação | Efeito |
|---|---|
| R-04 + R-06 | 20 pedidos + reimpressão → explosão de half-match e dups |
| R-07 + R-08 | Cancel + rasura → papel e digital em estados diferentes |
| R-16 + R-21 | Fonte morta + UI sem age → Calmo mentiroso |
| R-05 + R-18 | Atraso de impressão após reboot → culpar DeliveryOS |
| R-11 + R-15 | Sacola errada + “conferência vermelha” inventada → gritaria inútil |

---

## 4. O que a operação real exige do Fable (mínimo)

1. **Pause/kill em 1 gesto** do capturador.
2. **Zero escrita** em Odhen, iFood, spool.
3. **Dedup** de reimpressão.
4. **Cancel prevalece**.
5. **Half-match** explícito, nunca sintético disfarçado.
6. **Health de fonte** ≠ Calmo.
7. **Age do snapshot** visível ou no log de sombra.
8. **Sem PII** desnecessária no snapshot.
9. **Sombra primeiro**: gravar o que *teria* mostrado, sem exigir olhar.
10. **Critério de parada** se impressão ou caixa reclamar.

---

## 5. Achados operacionais resumidos

| ID | Gravidade | Resumo | Bloqueia Sombra live? | Bloqueia real? |
|---|---|---|---|---|
| R-04 | Crítica | 20 pedidos / DOM desconhecido | Sim (status) | Sim |
| R-05 | Crítica | Impressão atrasada | Sim se capturador on | Sim |
| R-16 | Crítica | Fonte off = Calmo falso | Sim se não logar | Sim |
| R-21 | Crítica | Dado antigo | Sim se não age | Sim |
| R-07 | Alta | Cancel pós-print | Não | Sim sem evento |
| R-06 | Alta | Reimpressão | Não com dedup | Sim sem dedup |
| R-08 | Alta | Rasura | Não | Sim se UI final |
| R-11 | Alta | Sacola heurística | Não | Sim se feature |
| R-23 | Alta | Poluição UI | Não | Sim |

---

*Usar junto com `Cenarios_Extremos_PreLoja.md` para gates de fase.*
