# Mapa de Ambientes — Proposta V1

> **Proposta e diagnóstico. Nada foi implementado.** O estado Ambiente hoje mostra até 2 rótulos de
> clima (praça carregando / saída lenta). Este documento propõe evoluí-lo para um Mapa de Ambientes
> simples (até 6 áreas da operação, Verde/Amarelo/Vermelho), **sem virar dashboard e sem inventar
> lógica operacional**. Sobre o commit da auditoria (`bf694a2`). `motor.js` e `decisao.js` intocados.
> Nenhum arquivo de código alterado por este documento.
>
> **Regra absoluta:** nenhum Mapa de Ambientes pode ser implementado sem a validação do César sobre o
> mapa praça→ambiente e sobre os sinais de cor (ver §13 e regra final). Informação errada é pior que
> informação ausente — um item mostrado no ambiente errado destrói a confiança operacional.

---

## 1. Ambientes citados pelo César (6)

1. **Caixa** — de onde saem as comandas; separa sacola, cartinhas, embalagens, organização inicial.
2. **Sushi** — combinados, duplas e itens frios principais.
3. **Quentes** — hot, ebi tempura, shisô, tartar de salmão e itens quentes dessa praça.
4. **Cozinha** — itens preparados pela cozinha que impactam o fluxo e geram espera antes da conferência.
5. **Conferência** — onde o delivery abre sacolas, confere, junta pedidos e identifica pendências.
6. **Motoboy** — pedido dado como pronto, separado para retirada e despachado.

**Cozinha é tratada como ambiente separado de Quentes** nesta proposta, como o César pediu. Não
serão misturados sem regra validada.

## 2. Praças do motor × ambientes (o que parece pertencer a cada)

O motor tem **8 praças internas**, não 6 ambientes. O mapa abaixo é **hipótese a validar**, não fato.

| Ambiente do César | Praça(s) do motor que parecem pertencer | Confiança |
|---|---|---|
| Caixa | *(nenhuma praça do motor modela a caixa/comanda)* | **Não modelado** |
| Sushi | `combinados` + `duplas` + `enrolados` (frios) | Alta |
| Quentes | `enrolados_quentes` (Hot Roll, Ceviche) **e/ou** parte de `cozinha_quentes` | **Ambígua** |
| Cozinha | `cozinha_quentes` (Beef com Nirá, Chickenkatsu, Ebi Spicy) | Média |
| Conferência | sinal `conferencia` do motor + praças `montagem_outros`/`bar_bebidas`/`sobremesa` | Parcial |
| Motoboy | sinal `saida` do motor (prontos parados na expedição) | Alta |

**⚠ Colisão de nome crítica:** o motor **já exibe `cozinha_quentes` com o rótulo "Quentes"**
(`DISPLAY.cozinha_quentes = "Quentes"`). Mas o César usa "Quentes" para hot rolls/tempura e
"Cozinha" para os pratos da cozinha. Ou seja, o "Quentes" do motor ≈ a "Cozinha" do César. **Isto
precisa ser resolvido antes de qualquer implementação**, ou a tela mostrará a área errada.

## 3. Itens que parecem pertencer a Quentes

Candidatos (praça `enrolados_quentes`, 11 itens, todos quentes): **Ceviche, Hot Roll, Hot Roll Tatá**
e similares. O César cita "hot, ebi tempura, shisô, tartar de salmão" — parte disso (ebi/tempura)
pode estar na `cozinha_quentes` do seed, e "tartar de salmão" costuma ser **frio** (duplas). **A
lista exata de Quentes precisa vir do César** — não dá para inferir sem risco.

## 4. Itens que parecem pertencer à Cozinha

Candidatos (praça `cozinha_quentes`, 31 itens, todos quentes): **Beef com Nirá, Chickenkatsu, Ebi
Spicy** e similares. É a maior praça de itens quentes (31 de 43 itens quentes do cardápio).

## 5. Como diferenciar atraso de Quentes, Cozinha e Conferência

Com o dado atual, cada um tem uma origem diferente no motor:
- **Atraso de Cozinha** (`cozinha_quentes`): `load["cozinha_quentes"] > BASELINE (4)` e `maxmin` alto —
  pedidos em produção esperando essa bancada. Mensurável.
- **Atraso de Quentes** (`enrolados_quentes`): `load["enrolados_quentes"] > BASELINE (3)`. Mensurável,
  **se** o César confirmar que "Quentes" = essa praça.
- **Atraso de Conferência**: o motor não mede *fila* de conferência; mede *risco por pedido*
  (`conferencia` = 2ª sacola/bebida/kit/observação esperando). É um sinal de pedido, não de estação.
  Diferenciar "conferência lotada" de "pedido arriscado" **não é possível hoje** sem um dado de fila
  de conferência que não existe.

## 6. Quais dados atuais permitem medir cada ambiente

| Ambiente | Dado disponível hoje | Mensurável? |
|---|---|---|
| Caixa | nenhum (comanda não existe na origem; ver Auditoria de Comanda) | **Não** |
| Sushi | `load`/`maxmin` de combinados+duplas+enrolados, `sits kind:praca` | Sim |
| Quentes | `load`/`maxmin` de `enrolados_quentes` | Sim (depende do mapa) |
| Cozinha | `load`/`maxmin` de `cozinha_quentes` | Sim |
| Conferência | sinal `conferencia` (risco por pedido), não fila | Parcial |
| Motoboy | sinal `saida` (`wE` > `FLOORS.EXPED`) | Sim |

## 7. Quais ambientes NÃO são mensuráveis com a fonte atual

- **Caixa:** o motor não modela emissão de comanda nem organização inicial. Não há dado. Mostrá-lo
  como Verde/Amarelo seria **inventar operação**.
- **Conferência (como fila/estação):** só há risco por pedido, não throughput da estação. Só dá para
  dizer "há pedido arriscado esperando", não "a conferência está lotada".

## 8. Quais sinais poderiam indicar Verde

Uma área é **Verde** quando o motor não gera nenhuma situação para ela: `load[praça] <= BASELINE[praça]`
(sem entrada em `sits`) e, para Motoboy, nenhum pronto acima de `FLOORS.EXPED`. Tudo fluindo.

## 9. Quais sinais poderiam indicar Amarelo

**Amarelo** = há situação real, mas leve ou ainda não sustentada: `sits` com `sev` 1, **ou** `sev` 2
que ainda não passou o `DEBOUNCE` (3 min), **ou** que perdeu o slot único de Foco para algo mais
grave. É exatamente o que hoje já vira Ambiente. Consciência, não interrupção.

## 10. Quais sinais poderiam indicar Vermelho

**Vermelho** = a situação daquela área é a que **venceu o slot de Foco** (`sess.active.sit`), ou está
a um passo disso (`sev` ≥ 2 sustentada por `DEBOUNCE`, fora de `COOLDOWN`). Vermelho não fica
escondido no Ambiente — ele **é** (ou vira) o Foco.

## 11. Quando Amarelo deve continuar apenas no Ambiente

Enquanto a situação for `sev` 1, ou `sev` 2 não sustentada, ou perder o slot para outra área mais
grave. O Ambiente acompanha sem interromper — o relógio de persistência (`pending.since`) corre por
baixo, mas a tela não pede ação.

## 12. Quando Vermelho deve virar Foco

Quando a área é a `sess.active.sit` do motor: `sev` ≥ 2, sustentada por `DEBOUNCE`, fora de
`COOLDOWN`. **Este é exatamente o mecanismo que já existe** — o Mapa de Ambientes não decide foco;
ele só *colore* o que o motor já concluiu. Nenhuma lógica nova de decisão.

## 13. Perguntas objetivas para o César validar (respondíveis por áudio)

1. **Mapa praça→ambiente:** confirma que Sushi = Combinados + Duplas + Enrolados frios?
2. **Quentes × Cozinha:** "Quentes" para você é hot roll/tempura (a praça de enrolados quentes) ou os
   pratos da cozinha? E "Cozinha" é o quê exatamente? (o motor hoje chama a cozinha de "Quentes" — o
   nome precisa ser acertado).
3. **Itens de Quentes:** me diz 5 itens que você considera "Quentes".
4. **Itens de Cozinha:** me diz 5 itens que você considera "Cozinha".
5. **Caixa:** existe algum sinal digital de que a caixa está atolada, ou isso só se vê no olho?
6. **Conferência:** dá para saber quando a bancada de conferência está lotada, ou só dá para saber
   que um pedido específico é arriscado?
7. **Verde/Amarelo/Vermelho:** para você, quando uma área está "amarela" (acompanhar) e quando está
   "vermelha" (precisa agir agora)? Em pedidos esperando? Em minutos?
8. **Motoboy:** "motoboy vermelho" é quantos pedidos prontos parados, ou quantos minutos parados?

## 14. Riscos de implementar sem o mapa operacional

1. **Item no ambiente errado** — o risco central: mostrar um quente na Cozinha (ou vice-versa)
   repete exatamente o problema de confiança que a Auditoria de Praça acabou de corrigir.
2. **Colisão de nome Quentes/Cozinha** — implementar com o `DISPLAY` atual mostraria "Quentes" para a
   cozinha, contradizendo o vocabulário do César.
3. **Caixa e Conferência falsamente verdes** — mostrar uma área como saudável quando não há dado para
   saber é mentir por omissão (viola Lei 5 e Lei 12).
4. **Ambiente virar dashboard** — 6 cartões com cor podem escorregar para "painel de status" se
   ganharem números, gráficos ou virarem lista rolável. O limite (6 cartões, 3 linhas cada, sem
   número decorativo) precisa ser rígido.
5. **Piscar de cor** — sem um piso de estabilidade temporal, uma área pode alternar amarelo/verde a
   cada minuto (o Red Team do Modelo de Consciência já apontou isso para o Ambiente). Precisa de
   debounce próprio de cor antes de ir para a tela.

---

## Modelo visual futuro desejado (não implementar agora)

Até 6 cartões, um por ambiente. Cada cartão com **apenas** nome, estado (cor) e motivo curto:

```
Caixa            Sushi                      Quentes
Tudo fluindo     Atenção                    Atenção
Comandas em      Combinados com pedidos     Hot roll puxando espera
ritmo normal     acumulando

Cozinha          Conferência                Motoboy
Atenção          Tudo fluindo               Tudo fluindo
Itens da cozinha Pedidos saindo sem fila    Despacho sem acúmulo
segurando
```

Regras de cor: **Verde** tudo fluindo · **Amarelo** acompanhar · **Vermelho** virou ou vai virar
Foco. Vermelho nunca fica escondido no Ambiente. Ambiente mostra consciência; Foco mostra ação;
Calmo mostra tranquilidade.

**Proibido:** tabela, gráfico, KPI, ranking, lista longa, painel gerencial, dado sem ação, e mostrar
ambiente sem dado confiável como se fosse confiável (Caixa e Conferência entram como "sem medição"
até haver fonte, nunca como Verde inventado).

---

## Regra absoluta do Mapa de Ambientes

Nenhum Mapa de Ambientes pode ser implementado sem validação do César sobre:
1. Quais ambientes existem. 2. Quais praças pertencem a cada ambiente. 3. Quais itens são Cozinha.
4. Quais itens são Quentes. 5. Sinais de Verde. 6. Sinais de Amarelo. 7. Sinais de Vermelho.
8. Quando amarelo continua só no Ambiente. 9. Quando vermelho vira Foco.

Até lá, este documento é só o trilho. A próxima ação é **o César responder as 8 perguntas do §13**.
