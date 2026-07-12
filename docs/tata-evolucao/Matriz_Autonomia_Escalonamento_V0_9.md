# Matriz de Autonomia e Escalonamento — V0.9

> Versão consolidada L6B (decisões César aplicadas).  
> **Não** é promoção automática de cargo.  
> **LIMITE FINANCEIRO PENDENTE DO CÉSAR** onde couber valor.

---

## 1. Códigos

| Código | Significado |
|---|---|
| **E** | Pode executar |
| **EC** | Executa e comunica |
| **Q** | Deve consultar antes |
| **A** | Exige autorização |
| **IE** | Interrompe e escala imediatamente |
| **R** | Registra depois |
| **—** | Fora da função (não é dono) |
| **$** | Envolve valor → **LIMITE FINANCEIRO PENDENTE DO CÉSAR** |

Funções: **DJ** Júnior · **DP** Pleno · **DS** Sênior · **CX** Caixa · **SAC** · **AO** Assistência · **LE** Liderança em exercício · **PL** Preparação liderança · **L** Liderança.

---

## 2. Matriz por situação

| Situação | DJ | DP | DS | CX | SAC | AO | LE | L |
|---|---|---|---|---|---|---|---|---|
| Item faltante (descoberta na loja) | EC+R | EC+R | EC+R | C+R | **E** investigação/cliente | EC | A se reenvio/$ | A exceção |
| Item faltante (cliente reclama) | C | C | C | C | **E** ciclo completo | Q | A $ | A |
| Item trocado | EC+R | EC+R | EC+R | C | **E** cliente | EC | A $ | A |
| Kit incompleto | E+R | E+R | E+R | C | E se cliente | EC | A se padrão | — |
| Embalagem / vazamento | E+R | E+R | E+R | C | E cliente | EC | A $ | A |
| Pausa de **item** (86) | — | Q | **EC+R** se indisp. confirmada | C | C se impacta cliente | **EC+R** | **A/EC** | A loja |
| Pausa da **loja** | — | — | Q/IE | C | C | IE | **A/IE** | **A** |
| Indisponibilidade (comunicar) | C | C | EC | C | E | EC | E | — |
| Compensação (decisão) | — | Q | Q | — | **Q/A** conduz | Q | **A** | **A** $ |
| Compensação (execução financeira) | — | — | — | **E** se autorizado | C | — | A | A |
| Reenvio | Q | Q | Q/A | C | **E** relação | Q | A | A |
| Estorno técnico | — | — | — | **E** se autorizado | C | — | A | A |
| Cancelamento (com cliente) | — | Q | Q | C | **E** | Q | A | A |
| Atraso (detecção interna) | C | EC | **IE** | **IE** | C | EC | IE | — |
| Atraso (cliente) | C | C | C | C | **E** | Q | A $ | A |
| Falha de impressão | C | C | IE | **IE** | C | IE | IE | A se canal |
| Falha de sistema / iFood | C | C | IE | **IE** | EC | IE | IE | A |
| Conflito com motoboy | C | EC | EC | C | E se cliente | EC | **A** | A |
| Reclamação (nota/texto) | C | C | C | C | **E** | Q | A $ | A |
| Qualidade / frescor (percepção) | C | C | EC | C | **E** | Q | A | A se segurança |
| Risco segurança alimentar | IE | IE | IE | IE | **IE** | IE | **IE** | **A** |
| Alteração de pedido | Q | Q | Q | E rotina | E | Q | A exceção | A |
| Pedido sem responsável | EC | EC | **E** atribui | C | C | EC | E | — |
| Multi-sacola (avisar) | C | C | C | **E** | E | — | — | — |
| Gargalo entre praças | C | EC | **EC/IE** | C | — | EC | **E** redistribui | A estrutural |
| Responsável pela sacola (ser dono) | E | E | E | — | — | — | C | — |
| Transferir responsável da sacola | EC | EC | EC | — | — | — | E | — |

---

## 3. Separação SAC × Caixa (oficial)

| Papel | Faz | Não faz |
|---|---|---|
| **SAC** | Ouvir, investigar, responder, propor recuperação, fechar ciclo com cliente, registrar | Não “some” com o financeiro sem regra; não executa estorno sem caixa |
| **Caixa** | Lançar, pagar, estornar tecnicamente, conferir financeiro, executar $ **autorizado** | Não é dono da narrativa de recuperação; não decide exceção comercial sozinho no pico sem autonomia |

Cooperação no pico: permitida; **propriedade** permanece explícita (quem fecha o ciclo com o cliente = SAC).

---

## 4. Pausa / 86 (resumo de autoridade — César)

| Ação | Quem pode | Condição |
|---|---|---|
| Pausar **item** | L, AO, DS | Indisponibilidade confirmada **ou** incapacidade real de produção |
| Registro obrigatório | Quem pausa | Motivo, horário, responsável, impacto, condição de retorno |
| Retirar pausa | Área responsável confirma | Não “reabre no chute” |
| Pausar **loja** | L (e LE com A em risco) | Decisão de liderança |
| Pausa preventiva grave | Maior autoridade presente | Segurança, falha generalizada, dano evidente + comunicar já |
| Proibido | Qualquer um | Pausar só para aliviar pressão sem avaliar capacidade/consequência |

---

## 5. Compensação (estrutura sem valores)

| Tipo | Condução | Execução $ | Autonomia |
|---|---|---|---|
| Correção / substituição | SAC + produção | — | E/Q conforme gravidade |
| Reenvio | SAC + LE | CX se custo | A se acima do pendente |
| Cortesia / desconto / voucher / crédito | SAC propõe | CX executa se autorizado | **$ PENDENTE CÉSAR** |
| Estorno | SAC + L/LE | **CX** | A |
| Exceção comercial | L | CX | **só L** |

---

## 6. O que sai da dependência rotineira do César

- Kit, quente/frio, multi-sacola, expedição com app.  
- Dono da sacola e “pedido parado”.  
- Escalonamento com contexto.  
- Pausa de **item** com registro (DS/AO dentro da proposta).  
- Investigação e resposta inicial (SAC).

## 7. O que permanece exclusivo da liderança

- Pausa de loja (salvo emergência documentada).  
- Exceções comerciais e limites acima da autonomia.  
- Redistribuição estrutural de praças / salão.  
- Crise reputacional grave.  
- Calibração futura de limiares de saturação.

---

*Autonomia V0.9 · pronta para validação César · sem ranking e sem R$.*
