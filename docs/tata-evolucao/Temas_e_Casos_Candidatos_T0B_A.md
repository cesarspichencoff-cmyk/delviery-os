# Temas e Casos Candidatos — T0B-A

> **Tema candidato (TC)** ≠ padrão real.  
> **Caso candidato** = esqueleto de treino baseado em documento; **não** é caso confirmado de um turno específico com contagem.  
> Eixos provisórios de organização (não ranking): omissão · atraso/comunicação · conferência/troca · embalagem · escalonamento/compensação/autonomia.

---

## 1. Temas candidatos a falha / atrito

| ID | Tema | Eixo | Classe | Evidência Camada A | O que a Camada B precisa |
|---|---|---|---|---|---|
| TC-01 | Item ou combinado não enviado (omissão) | omissão | **TC** | Estudo F5; mapa sinais “faltou/esqueceram” | Frequência real; praças; fotos |
| TC-02 | Kit incompleto ou molho faltante | omissão / embalagem | **TC** | Estudo F5–F6; kit 25/09/2023 | Checklist kit atual; desvios |
| TC-03 | Perda de custódia (quem fechou / cadê pedido) | conferência | **TC** | Estudo F3; S10–S11 | Se ainda crônico; papel do lacre |
| TC-04 | Pausa de item sem visibilidade no turno | atraso / cardápio | **TC** | Estudo F4 | Protocolo atual; quem libera |
| TC-05 | Pausa liberada por engano / estado perdido | atraso | **TC** | Estudo F4 | Ferramenta real vs chat |
| TC-06 | Prontos parados / motoboy / saída | atraso / logística | **TC** | Mapa sinais S1–S2; estudo motoboy | Séries iFood logística |
| TC-07 | Praça sobrecarregada (quentes/sushi/…) | atraso / produção | **TC** | Mapa sinais; menções de praça no estudo | Carga real por noite |
| TC-08 | Pedido simples vs multi-praça mal priorizado | produção | **TC** | Auditorias multi-praça 70–87% | Composição real |
| TC-09 | 2ª sacola / quente×frio errado | embalagem | **TC** + **CTR** | Embalagens vs heurística motor | Observação de montagem |
| TC-10 | Hot roll tratado como “só quente” indevido | embalagem | **HIP** | Embalagens exceção hot roll | Prática da equipe |
| TC-11 | Observação de cliente / alergia não conferida | conferência / atendimento | **TC** | Relatórios citam alergias em janelas; obs truncada em copy | Contagem real; fluxo SAC |
| TC-12 | Cancelamento após impressão | alteração / cancelamento | **FD** risco de processo | Fonte viva: cancel no Gestor | Como equipe reage hoje |
| TC-13 | Rasura na comanda (“não foi”) vs sistema | alteração | **FD** limitação | Parser/fonte viva | Frequência de rasura |
| TC-14 | Escalonamento tudo ao hub (fundador) | escalonamento | **TC** | Estudo F1–F2 | Amostra de threads |
| TC-15 | Escalonamento sem contexto / sem tentativa prévia | escalonamento | **HIP** | Visão Mestra implica qualidade de escala | Rubrica em B |
| TC-16 | Silêncio da liderança → decisão no escuro | autonomia | **HIP** | Visão Mestra §6 “se ninguém responder” | Frequência real |
| TC-17 | Compensação inconsistente | compensação | **DES** | Limites não documentados no Git | Política César |
| TC-18 | Reensino anual (não-retenção) | treinamento | **TC** | Estudo F7 | O que é reensinado e por quê |
| TC-19 | Ideia de placar/dias sem erro | cultura | **CTR** | Chat vs Leis | Garantir que não vira prática |
| TC-20 | Nomes de bancada confusos (Quentes/Cozinha) | produção | **CTR** | Mapa Ambientes | Validação César |

**Contagens citadas em docs legados (ex.: 415+ “faltou”, 1588 praças) = fato documental do estudo, não revalidado nesta missão.** Não usar como KPI sem recontagem B.

---

## 2. Casos candidatos para treinamento

Cada caso: **esqueleto didático**. Status: `candidato_documental` (não `confirmado_em_campo`).

### CASE-A01 — “Faltou o combinado na sacola”

| Campo | Conteúdo |
|---|---|
| Status | candidato_documental |
| Eixo | omissão |
| O que aconteceu | Pedido sai; cliente ou conferência posterior detecta combinado ausente |
| O que foi feito | (variável) reenvio / cortesia / investigação por foto |
| Resultado | (variável) |
| Ensinar ou alterar? | Sim — conferência de âncoras (combinado) + custódia |
| Fontes | Estudo F5; sinais de conferência |
| Classe | **TC** |

### CASE-A02 — “Kit / molho não foi”

| Campo | Conteúdo |
|---|---|
| Status | candidato_documental |
| Eixo | omissão / embalagem |
| O que aconteceu | Kit simples/kids incompleto |
| Ensinar | Conteúdo atual do kit; ponto de inclusão na montagem |
| Fontes | Estudo F5–F6 |
| Classe | **TC** |

### CASE-A03 — “De quem é / quem fechou?”

| Campo | Conteúdo |
|---|---|
| Status | candidato_documental |
| Eixo | conferência / cultura |
| O que aconteceu | Erro ou dúvida; ninguém sabe quem lacrou |
| Ensinar | Lacre + foto + **sem** caça punitiva (Lei 4) |
| Fontes | Estudo F3; S11 |
| Classe | **TC** |

### CASE-A04 — “Pausamos e o turno não soube”

| Campo | Conteúdo |
|---|---|
| Status | candidato_documental |
| Eixo | atraso / comunicação |
| O que aconteceu | Item pausado; liderança só vê no fim |
| Ensinar | Quem comunica pausa; onde o estado mora |
| Fontes | Estudo F4 |
| Classe | **TC** |

### CASE-A05 — “Prontos na bancada, motoboy não leva”

| Campo | Conteúdo |
|---|---|
| Status | candidato_documental |
| Eixo | atraso / logística |
| O que aconteceu | Pedidos prontos acumulam na saída |
| Ensinar | Quando chamar saída; o que não é “produção” |
| Fontes | Mapa sinais S1–S2 |
| Classe | **TC** / **FD** no desenho de sinal |

### CASE-A06 — “Quente com frio na mesma sacola”

| Campo | Conteúdo |
|---|---|
| Status | candidato_documental |
| Eixo | embalagem |
| O que aconteceu | Montagem ignora separação térmica |
| Ensinar | R-E03; exceção hot roll R-E04 |
| Fontes | Embalagens |
| Classe | **RV** regra + **DES** frequência |

### CASE-A07 — “Pedido quase fechável preso numa praça”

| Campo | Conteúdo |
|---|---|
| Status | candidato_documental |
| Eixo | produção |
| O que aconteceu | Só falta um item de praça lenta |
| Ensinar | Priorizar âncora; multi-praça |
| Fontes | Mapa sinais S7; auditorias multi-praça |
| Classe | **TC** |

### CASE-A08 — “Cliente pediu sem X / alergia”

| Campo | Conteúdo |
|---|---|
| Status | candidato_documental |
| Eixo | conferência / atendimento |
| O que aconteceu | Observação especial passa batido |
| Ensinar | Conferência de obs; nunca truncar risco |
| Fontes | Contratos cognitivos; relatórios de janela |
| Classe | **TC** |

### CASE-A09 — “Cancelou no iFood depois da impressão”

| Campo | Conteúdo |
|---|---|
| Status | candidato_documental |
| Eixo | cancelamento |
| O que aconteceu | Comanda já circula; status cancelado no Gestor |
| Ensinar | Fonte de verdade do cancel; parar produção |
| Fontes | Fonte viva |
| Classe | **FD** processo documentado |

### CASE-A10 — “Tudo sobe para o fundador”

| Campo | Conteúdo |
|---|---|
| Status | candidato_documental |
| Eixo | escalonamento / autonomia |
| O que aconteceu | Decisão rotineira vira DM |
| Ensinar | Matriz de autonomia por cargo; o que tentar antes |
| Fontes | Estudo F1; Visão Mestra |
| Classe | **TC** |

### CASE-A11 — “Ninguém respondeu e precisei agir”

| Campo | Conteúdo |
|---|---|
| Status | candidato_documental |
| Eixo | autonomia |
| O que aconteceu | Silêncio de liderança; decisão segura + comunicação depois |
| Ensinar | Visão Mestra §6 |
| Fontes | Visão Mestra |
| Classe | **RV** norma + **DES** frequência |

### CASE-A12 — “Cliente reclama atraso — o que oferecer?”

| Campo | Conteúdo |
|---|---|
| Status | candidato_documental |
| Eixo | compensação / atendimento |
| O que aconteceu | Reclamação; pressão por cortesia |
| Ensinar | Fidelizar **dentro de limites** — limites ainda **DES** |
| Fontes | Visão Mestra §5.8 |
| Classe | **HIP** até política de compensação |

---

## 3. Separação rigorosa

| Tipo | IDs | Significado |
|---|---|---|
| Candidato documental | CASE-A01…A12 | Pode virar rascunho de aula **após** validação |
| Confirmado em campo 2026 | — | **Nenhum** nesta T0B-A |
| Padrão real com frequência | — | **Proibido** declarar aqui |

---

## 4. Priorização **didática** (não é ranking de dor real)

Ordem sugerida para **desenvolver conteúdo** quando B validar:

1. Omissão / kit / conferência (A01–A03, A08)  
2. Escalonamento e autonomia (A10–A11)  
3. Pausa e comunicação (A04)  
4. Embalagem (A06)  
5. Saída/motoboy (A05)  
6. Cancel/rasura (A09)  
7. Compensação (A12) — **só com política**  

Substituível após T0B-B.

---

*Temas e casos Camada A · saturação didática, não estatística de loja.*
