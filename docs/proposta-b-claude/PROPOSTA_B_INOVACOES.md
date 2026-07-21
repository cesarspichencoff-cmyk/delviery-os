# Proposta B — Inovações Próprias

> Ideias não pedidas pelo César, nascidas da análise dos dados reais.
> Cada uma com problema, evidência, custo e recomendação. Proposta independente (Claude).

---

## I1 · Índice de Concentração (o "eixo 2" da Conferência)

**Problema.** O sistema hoje só saberia dizer "quantos pedidos existem". Mas os dados mostram que
volume não explica sofrimento: 304 pedidos com pico 28 correram melhor que 159 com pico 58.

**Evidência.** r = 0,842 entre pico de simultâneos e tempo interno; 40 dias de alto volume fluidos
vs 18 dias de volume médio problemáticos.

**Ideia.** Medir explicitamente **quantos pedidos ficaram prontos na mesma janela curta** (6–10 min)
como métrica de primeira classe — não derivada, não escondida. É a única métrica que captura
"engasgar mesmo com as praças fluindo".

**Dado necessário:** carimbo absoluto de "pronto" (hoje só há duração).
**Custo:** baixo. **Risco:** baixo. **Benefício:** alto — é a variável central da etapa.
**Recomendação: IMPLEMENTAR** (após o carimbo existir). Em sombra primeiro.

---

## I2 · Detector de contaminação de métrica externa

**Problema.** Fevereiro/2026 registrou 56,6% de atraso contra 20,3% em março, com volume, pico e
tempo interno praticamente iguais. Se o sistema tivesse aprendido com fevereiro, teria aprendido
uma configuração da plataforma, não a operação.

**Evidência.** Comparação mensal completa (§2 de PADROES_DE_SUCESSO_E_FALHA).

**Ideia.** Um verificador permanente que compara **métricas internas** (tempo até pronto) com
**métricas externas** (atraso vs prometido). Quando divergem além de um limiar, o sistema declara:
*"o indicador externo mudou sem que a operação mudasse — provável alteração de configuração"*.

**Dado necessário:** nenhum novo. **Custo:** baixo. **Benefício:** alto — protege todo aprendizado futuro.
**Recomendação: IMPLEMENTAR.** É barato e evita ensinar mentira ao sistema.

---

## I3 · Memória de episódio comparável

**Problema.** "21 pedidos ativos" não significa nada sozinho. Significa muito se a pessoa souber
que num domingo às 20h o normal são 12.

**Evidência.** Perfis por dia da semana são nítidos e estáveis (terça: pico 29; sexta: pico 59).

**Ideia.** Toda leitura carrega comparação com **os N dias mais semelhantes** (mesmo dia da semana,
mesma faixa horária, volume próximo) — e mostra o desfecho daqueles dias. Não é previsão: é
memória. *"Nos últimos 4 domingos nessa faixa, isso deu em X."*

**Dado necessário:** nenhum novo (já temos 267 dias). **Custo:** baixo-médio.
**Recomendação: IMPLEMENTAR.** Transforma número em significado sem prever nada.

---

## I4 · Separar "não sei" de "está tudo bem"

**Problema.** Hoje uma célula sem fonte e uma célula tranquila podem parecer iguais. Isso corrói a
confiança: quando o operador descobre que o verde era ignorância, para de acreditar no verde.

**Evidência.** Direta do produto atual — Cozinha e Caixa exibiam "sem dados" indistintamente de calmo.

**Ideia.** Tornar `fontes_ausentes[]` um **campo obrigatório de toda leitura**, e o produto
apresentar ausência com forma visual distinta de tranquilidade. Já parcialmente adotado; a inovação
é torná-lo **estrutural e obrigatório**, nunca opcional.

**Custo:** baixo. **Recomendação: IMPLEMENTAR.**

---

## I5 · Custo de erro por item, não complexidade por item

**Problema.** A pergunta usual é "esse item é complexo?". A pergunta útil na Conferência é
**"o que acontece se esse item for esquecido?"**. Esquecer o hashi e esquecer o prato principal
têm complexidades parecidas e consequências opostas.

**Ideia.** Modelar **impacto do erro** separado de **probabilidade do erro** e de **complexidade de
produção** — três eixos, nunca colapsados. A Conferência deveria priorizar por *impacto × probabilidade*,
não por dificuldade.

**Dado necessário:** conhecimento do produto (Stage 2) + histórico de reclamações (avaliações/WhatsApp).
**Custo:** médio. **Recomendação: PESQUISAR** — depende do conhecimento de item, ainda não reconstruído.

---

## I6 · Prontidão como denominador, não como checklist

**Problema.** Sem prontidão, todo engasgo parece pressão, e a ação sugerida vira "acelerem" quando
a causa era falta de sacola.

**Ideia.** A prontidão não é uma tela de abertura: é o **denominador** de toda leitura do turno.
A mesma carga com a Conferência descoberta é um estado diferente da mesma carga com equipe completa.

**Dado necessário:** coleta mínima de abertura (não existe hoje).
**Custo:** médio (coleta nova). **Recomendação: EXPERIMENTAR EM SOMBRA.**

---

## I7 · Registro de decisão com validade

**Problema.** Numa operação de 4 anos com rotatividade, o "porquê" morre. Regras são criadas,
abandonadas e recriadas sem que ninguém saiba que já falharam.

**Evidência.** As categorias já mineradas do WhatsApp incluem `ideia_melhoria`, `lideranca` e
`escalonamento` com marcador `has_decision` — ou seja, decisões existem e estão dispersas em conversa.

**Ideia.** Entidade `decision` append-only com `vigente_de/até`, motivo e evidência. Uma regra
revogada continua visível **com o motivo**. O sistema pode então dizer: *"isso já foi tentado em
março e foi abandonado porque…"*.

**Custo:** baixo. **Benefício:** alto e crescente com o tempo.
**Recomendação: IMPLEMENTAR.**

---

## I8 · Silêncio como métrica de sucesso

**Problema.** Todo produto operacional tende a falar demais e ser desligado.

**Evidência.** 91,2% do tempo a operação está abaixo de 30 ativos. Se o sistema falar nesses
momentos, será ruído em 9 de cada 10 minutos.

**Ideia.** Medir e exibir, para a própria equipe de produto, **quanto tempo o sistema ficou em
silêncio** e **quantas vezes falou**. Meta explícita: falar raro e certo. Um aumento na taxa de fala
é um alarme de qualidade, não um sinal de mais valor entregue.

**Custo:** baixo. **Recomendação: IMPLEMENTAR.**

---

## I9 · Recuperar o valor do pedido (a melhoria mais barata que existe)

**Problema.** Não há como estimar magnitude do pedido sem itens.

**Evidência.** O relatório bruto do iFood **tem** `VALOR DOS ITENS (R$)`; as camadas derivadas o
descartaram na sanitização (verificado: 0 registros com valor em 70.071 pedidos).

**Ideia.** Recuperar o campo. Valor não é item, mas é o **único proxy de magnitude disponível sem
coleta nova** — permite separar "10 pedidos pequenos" de "10 pedidos grandes", hoje indistinguíveis.

**Custo:** quase zero. **Risco:** baixo (é dado que já foi coletado).
**Recomendação: IMPLEMENTAR PRIMEIRO.** Melhor razão custo/benefício de toda a proposta.

---

## Recusadas deliberadamente

| Ideia | Por que não |
|---|---|
| Previsão de demanda por ML | Sem composição e sem prontidão, aprenderia ruído. Voltar quando houver fonte. |
| Score único de pressão | Colapsa carga e convergência, que pedem ações diferentes. |
| Alocação automática de pessoas | Fere princípio inegociável — o humano decide. |
| Gamificação / ranking de equipe | Vigilância disfarçada. Fora da constituição do produto. |
| Otimização de rota | Domínio do Entregas, não deste cérebro. |
| Detecção de anomalia sem causa | Gera alarme que ninguém sabe acionar. Sem `fontes_ausentes`, vira ruído. |

## Ordem recomendada

1. **I9** (valor do pedido) — custo ~zero, ganho imediato
2. **I2** (contaminação de métrica) — protege todo o resto
3. **I4** (ausência ≠ tranquilidade) — confiança
4. **I3** (episódio comparável) — significado sem previsão
5. **I1** (concentração) — depende do carimbo de pronto
6. **I7** (decisão com validade) · **I8** (silêncio) — memória e disciplina
7. **I6** (prontidão) — coleta nova
8. **I5** (custo de erro) — depende do conhecimento de item
