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
3. **Sushi Quentes** — bancada quente do sushi, ligada à praça interna `enrolados_quentes`.
4. **Cozinha** — itens preparados pela cozinha que impactam o fluxo e geram espera antes da conferência.
5. **Conferência** — onde o delivery abre sacolas, confere, junta pedidos e identifica pendências.
6. **Motoboy** — pedido dado como pronto, separado para retirada e despachado.

**Cozinha e Sushi Quentes são ambientes separados**, confirmado por César em 26/09/2026.

## 2. Praças do motor × ambientes (o que parece pertencer a cada)

O motor tem **8 praças internas**, não 6 ambientes. A separação **Sushi Quentes × Cozinha** foi confirmada por César em 26/09/2026; os demais limites mantêm o grau de evidência indicado.

| Ambiente do César | Praça(s) do motor que parecem pertencer | Confiança |
|---|---|---|
| Caixa | *(nenhuma praça do motor modela a caixa/comanda)* | **Não modelado** |
| Sushi | `combinados` + `duplas` + `enrolados` (frios) | Alta |
| Sushi Quentes | `enrolados_quentes` | **Alta — confirmado em 26/09/2026** |
| Cozinha | `cozinha_quentes` | **Alta — confirmado em 26/09/2026** |
| Conferência | sinal `conferencia` do motor + praças `montagem_outros`/`bar_bebidas`/`sobremesa` | Parcial |
| Motoboy | sinal `saida` do motor (prontos parados na expedição) | Alta |

**Colisão de nome resolvida em 26/09/2026:** `enrolados_quentes` é exibida como **Sushi Quentes** e `cozinha_quentes` como **Cozinha**. Os IDs internos não mudaram.

## 3. Sushi Quentes

A praça interna `enrolados_quentes` é o ambiente **Sushi Quentes**. O roteamento continua item a item pelo seed; o nome da praça não transforma todo produto em “quente de cozinha”.

## 4. Cozinha

A praça interna `cozinha_quentes` é o ambiente **Cozinha** e contém **pratos e entradas**.
A embalagem depende do papel operacional:
- prato → 1.500;
- entrada → não herda 1.500;
- Guioza e Tempurá de milho → entradas com 650 selada;
- Ebi Spicy → entrada, sem caixa inferida nesta revisão.

## 5. Como diferenciar atraso de Sushi Quentes, Cozinha e Conferência

Com o dado atual, cada um tem uma origem diferente no motor:
- **Atraso de Cozinha** (`cozinha_quentes`): `load["cozinha_quentes"] > BASELINE (4)` e `maxmin` alto —
  pedidos em produção esperando essa bancada. Mensurável.
- **Atraso de Sushi Quentes** (`enrolados_quentes`): `load["enrolados_quentes"] > BASELINE (3)`. Mensurável.
- **Atraso de Conferência**: o motor não mede *fila* de conferência; mede *risco por pedido*
  (`conferencia` = 2ª sacola/bebida/kit/observação esperando). É um sinal de pedido, não de estação.
  Diferenciar "conferência lotada" de "pedido arriscado" **não é possível hoje** sem um dado de fila
  de conferência que não existe.

## 6. Quais dados atuais permitem medir cada ambiente

| Ambiente | Dado disponível hoje | Mensurável? |
|---|---|---|
| Caixa | nenhum (comanda não existe na origem; ver Auditoria de Comanda) | **Não** |
| Sushi | `load`/`maxmin` de combinados+duplas+enrolados, `sits kind:praca` | Sim |
| Sushi Quentes | `load`/`maxmin` de `enrolados_quentes` | Sim |
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

## 13. Validações ainda abertas

A separação **Sushi Quentes × Cozinha** está resolvida. Permanecem apenas perguntas de instrumentação:
1. Caixa: existe sinal digital de fila/atraso?
2. Conferência: há dado de fila/throughput ou apenas risco por pedido?
3. Quais limites reais promovem Verde/Amarelo/Vermelho?
4. Qual limiar real promove atraso de Motoboy?

## 14. Riscos de implementar sem o mapa operacional

1. **Item no ambiente errado** — o risco central: mostrar um quente na Cozinha (ou vice-versa)
   repete exatamente o problema de confiança que a Auditoria de Praça acabou de corrigir.
2. **Caixa e Conferência falsamente verdes** — mostrar uma área como saudável quando não há dado para
   saber é mentir por omissão (viola Lei 5 e Lei 12).
3. **Ambiente virar dashboard** — 6 cartões com cor podem escorregar para "painel de status" se
   ganharem números, gráficos ou virarem lista rolável. O limite (6 cartões, 3 linhas cada, sem
   número decorativo) precisa ser rígido.
4. **Piscar de cor** — sem um piso de estabilidade temporal, uma área pode alternar amarelo/verde a
   cada minuto (o Red Team do Modelo de Consciência já apontou isso para o Ambiente). Precisa de
   debounce próprio de cor antes de ir para a tela.

---

## Modelo visual futuro desejado (não implementar agora)

Até 6 cartões, um por ambiente. Cada cartão com **apenas** nome, estado (cor) e motivo curto:

```
Caixa            Sushi                  Sushi Quentes
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
