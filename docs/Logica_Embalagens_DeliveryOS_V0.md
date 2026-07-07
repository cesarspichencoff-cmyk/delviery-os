# Lógica de Embalagens — DeliveryOS V0

> Documentação técnica oficial da lógica de embalagem do delivery, transcrita fielmente do documento
> operacional revisado com o César (`Logica_Embalagens_DeliveryOS_V0_Final_Dyo.docx`). **É base de
> entendimento, não código.** Não deve alterar o sistema sem revisão técnica e validação operacional.
> Nenhum motor de embalagem foi implementado; `motor.js`, `decisao.js`, seed e cardápio permanecem
> intocados. Onde o documento diverge do seed atual, a divergência está registrada na §14 (aliases) e
> na §15 (pendências) — **o seed não foi alterado**.

---

## 1. Objetivo da lógica de embalagens

Organizar a lógica real de embalagem do delivery (caixas, sacolas, separação de quente e frio,
categorias e regras de montagem) para servir de base ao DeliveryOS. O sistema deve, no futuro,
calcular caixas e sacolas por **categoria, volume, temperatura, compatibilidade e estabilidade** —
sempre respeitando que combinado é produto fechado e que quente de cozinha não mistura com frio.

**Regra de ouro para o sistema:** o DeliveryOS só deve sinalizar "duas sacolas", "só quente" ou
qualquer atenção leve quando a regra estiver confiável **e** o pedido estiver identificável.
Informação bonita, mas não acionável, não deve aparecer.

## 2. Princípios gerais

1. **Categoria antes de sabor.** Temaki, uramaki, hosomaki, hot roll, dupla e sashimi seguem regra
   por categoria. O sabor não muda a caixa.
2. **Combinado é produto fechado.** A caixa do combinado é definida pelo próprio combinado. Item
   extra pedido pelo cliente vai separado pela regra da própria categoria.
3. **Quente com frio separa.** Itens quentes da cozinha e itens frios vão em sacolas separadas.
4. **Frio com frio pode juntar** se houver espaço e estabilidade.
5. **Quente com quente pode juntar** se couberem e forem compatíveis.
6. **Hot roll é exceção prática.** Pode ir com frios; não obriga sacola quente separada; se houver
   quentes de cozinha e couber, pode ir preferencialmente com os quentes.
7. **Volume decide sacola extra.** Sem espaço, o pedido vira duas ou mais sacolas.
8. **Não inventar regra.** Dúvida sobre item, praça, caixa ou sacola → registrar pendência, nunca
   inferir.

## 3. Categorias de itens

Categorias operacionais para classificar cada item antes de escolher a caixa:

- **Dupla / Dyo** — unidade dupla de sushi ou Dyo; a caixa muda pela quantidade.
- **Enrolados** — inclui **Uramaki, Hosomaki e Hot Roll**; o sabor não altera a regra.
- **Temaki** — categoria própria; sabor não altera.
- **Sashimi** — categoria própria; o peixe não altera a regra principal de caixa.
- **Combinado** — produto fechado; caixa definida pelo próprio combinado.
- **Prato quente da cozinha** — itens quentes que geram espera antes da conferência.
- **650 selada** — itens menores da cozinha, úmidos, com molho, delicados ou frios delicados.
- **Sobremesa** — pode ir com frios, nunca com quentes.
- **Bebida** — regra própria por tipo e volume.

## 4. Regras por tipo de caixa

| Caixa | Uso |
|---|---|
| **240** | 1 dupla de sushi **ou** 1 Dyo. Menor caixa de dupla simples. |
| **450** | 2 a 3 duplas/Dyo · 1 enrolado · 1 temaki · 1 sashimi · sobremesas (Tatá Chocolate, Shoocream) quando aplicável. |
| **650 selada** | Itens menores/úmidos/delicados da cozinha e frios delicados (ver §5). |
| **750** | 4 a 5 duplas/Dyo · 2 enrolados · 2 a 3 temakis · 2 a 4 sashimis · **Battera** (sempre) · **Carpaccio de salmão** (sempre) · combinado para 1 pessoa. |
| **1.000** | **Tirashi** sempre; nunca outra caixa. Normalmente sacola média, salvo composição fria maior. |
| **1.500** | 6+ duplas · 3+ enrolados · 4 a 6 temakis · 5+ sashimis · combinado sushi + sashimi para 2 pessoas · pratos quentes grandes da cozinha. Se não couber, complementar com caixas menores. |
| **1.600** | Combinado sushi para 2 pessoas · combinado sushi tradicional para 2 pessoas. Caixa de combinado fechado; não usar para extras soltos. |

**Itens confirmados para caixa 650 selada:** Guioza · Edamame · Missoshiru · Tempurá de milho ·
Tartar de salmão · Tartar de atum spicy · Tuna Shiso · Ceviche · Sunomono.

**Itens quentes grandes em caixa 1.500** (conforme o documento; grafias a validar na §14/§15): Beef
com Nirá · Salmão grelhado · Katsu Don · Fish Katsu · Yakisoba (em geral) · Tempurá de Legumes ·
Tempurá de Camarão · Tempurá Misto · Frango Teriyaki · "Shikentatsu" (grafia a validar) · outros
pratos quentes grandes equivalentes.

## 5. Regras por categoria

**Duplas e Dyo** (a mesma regra vale para toda dupla de sushi e para Dyo):

| Quantidade | Caixa |
|---|---|
| 1 | 240 |
| 2 a 3 | 450 |
| 4 a 5 | 750 |
| 6 ou mais | 1.500 |

**Enrolados** (uramaki, hosomaki, hot roll — sabor não altera):

| Quantidade | Caixa |
|---|---|
| 1 | 450 |
| 2 | 750 |
| 3 ou mais | 1.500 (se não couber tudo, complementar com caixas menores até caber) |

**Temakis:**

| Quantidade | Caixa |
|---|---|
| 1 | 450 |
| 2 a 3 | 750 |
| 4 a 6 | 1.500 |
| Acima de 6 | 1.500 + complemento conforme volume |

**Sashimis:**

| Quantidade | Caixa |
|---|---|
| 1 | 450 |
| 2 a 4 | 750 |
| 5 ou mais | 1.500 (pouco comum, mas a regra é 1.500) |

**Itens de caixa fixa:** Battera → sempre 750 · Carpaccio de salmão → sempre 750 · Tirashi → sempre
1.000 (nunca outra caixa).

## 6. Regras de sacola

**Sacola grande** — caixas grandes e pedidos volumosos:
- Comporta até 4 caixas 1.500 e até 4 caixas 1.600, respeitando estabilidade e altura.
- Caixa 1.500 quente usa sacola grande.
- Caixa 1.500 fria pode ir com caixa 650 fria **ou** com caixa 750 fria na mesma sacola grande, se couber.
- Caixa 1.600 fria pode ir com caixa 650 fria na mesma sacola grande, se couber.
- Nunca misturar caixa quente com caixa fria na mesma sacola.
- Encaixa a largura de uma 1.500; a altura pode receber outros itens só se não misturar quente/frio
  e a montagem ficar estável.

**Sacola média** — volumes médios:
- Comporta até 4 caixas 650 seladas.
- Carpaccio de salmão em 750 (quando não em composição fria maior).
- Tirashi em 1.000 (quando não em composição fria maior).
- Ajustável ao volume real, sem misturar quente com frio.

**Sacola pequena** — volumes pequenos:
- Até 4 caixas 450.
- Até 3 caixas 650 seladas.
- Cervejas e saquês 300 ml quando separados ou acompanhando frios, com segurança de montagem.

## 7. Separação de quente e frio

| Situação | Regra |
|---|---|
| Frio com frio | Pode ir junto se couber e ficar estável. |
| Quente com quente | Pode ir junto se couber e for compatível. |
| Quente com frio | **Sempre separar** em sacolas diferentes. |
| Hot roll com frio | Pode ir junto. Não exige sacola quente separada. |
| Hot roll com quente de cozinha | Pode ir preferencialmente com os quentes, se couber. |
| Sobremesa com frio | Pode ir junto se couber. |
| Sobremesa com quente | Separar. |

## 8. Bebidas

| Bebida | Regra |
|---|---|
| Refrigerantes em lata | Acompanham sacola fria quando há espaço. A partir de 6 latas, sacola separada. |
| Vinhos e saquês 720 ml | Sacola grande separada. |
| Cervejas e saquês 300 ml | Podem ir com frios ou em sacola pequena, se não comprometerem a montagem. |

## 9. Sobremesas e mochis

- Sobremesas podem ir com frios se houver espaço; **nunca** com quentes.
- Mochis de sabores diferentes vão em embalagens separadas.
- Pote pequeno de mochi comporta até **2 mochis do mesmo sabor**.
- Pote grande (referência: Missoshiru) comporta até **4 mochis do mesmo sabor**.

| Item | Regra |
|---|---|
| Tatá Chocolate | Sobremesa. Pode ir com frios se couber. |
| Shoocream | Sobremesa. Pode ir com frios se couber. |
| Mochi | Separar sabores. Até 2 iguais no pote pequeno, até 4 iguais no pote grande. |

## 10. Combinados e extras

- Combinados são produtos fechados. **Não** adicionar itens extras dentro da caixa do combinado.
- Item extra pedido pelo cliente vai **separado**, conforme a regra da própria categoria.

| Tipo de combinado | Caixa |
|---|---|
| Combinado para 1 pessoa | 750 |
| Combinado sushi + sashimi para 2 pessoas | 1.500 |
| Combinado sushi para 2 pessoas | 1.600 |
| Combinado sushi tradicional para 2 pessoas | 1.600 |

## 11. Regras para duas ou mais sacolas

O pedido vira duas ou mais sacolas quando:
1. Houver quente de cozinha e frio no mesmo pedido.
2. Houver bebida grande (vinho ou saquê 720 ml).
3. Houver 6 ou mais latas de refrigerante.
4. O volume ocupar todo o espaço da sacola.
5. A estabilidade da montagem ficar comprometida.
6. Não for possível separar fisicamente quente e frio na mesma sacola.

**Regra operacional para o sistema:** a atenção leve "duas sacolas" só deve aparecer quando o sistema
conseguir apontar **o pedido específico** e **a causa provável** (ex.: quente e frio no mesmo pedido,
ou volume acima da capacidade da sacola).

## 12. Relação futura com Atenções Leves e Mapa de Ambientes

Esta lógica pode, **no futuro** (nada implementado agora), alimentar:
- Atenções Leves no Calmo (ver `docs/Auditoria_Praca_Comanda_Atencoes_V1.md`).
- Identificação de pedido com duas ou mais sacolas · só quente · só frio · volumoso · com item
  delicado · com bebida grande · com sobremesa separada.
- Apoio a **Caixa**, **Conferência** e **Motoboy** no Mapa de Ambientes
  (`docs/Mapa_Ambientes_V1.md`).
- Memória Operacional e Tribunal de Erros (conceituais, ainda não construídos).

Ligação direta com a auditoria: a lógica de embalagem é a **regra operacional documentada** que a
Auditoria de Atenções apontou como faltante — "duas sacolas" hoje é heurística do motor
(`segundaSacola = combo ou ≥8 itens`, 47-61% dos pedidos), não a regra real de separação
quente/frio + volume descrita aqui. Este documento é o insumo para, um dia, substituir a heurística
por regra validada — **mas só depois da matriz técnica e da validação (§16)**.

## 13. Regras que ainda não devem ser automatizadas

Não usar sabor para decidir caixa quando a regra é por categoria. Não colocar extra dentro da caixa
de combinado fechado. Não misturar quente de cozinha com frio na mesma sacola. Não tratar hot roll
como item que obriga sacola quente separada. Não usar caixa 1.600 para extras soltos. **Não inferir
comanda, sacola ou caixa quando a regra não estiver clara.** Não exibir "duas sacolas" sem indicar
qual pedido e por qual motivo.

## 14. Tabela de nomes e aliases

Nomes validados pelo César cruzados com o seed atual (`data/cardapio_knowledge_seed.json`).
**O seed não foi alterado.** Status: Confirmado · Possível alias · Não encontrado · Precisa validar.

| Nome validado (César) | Nome no seed | Categoria | Status | Observação |
|---|---|---|---|---|
| Dyo | Dyo de Atum, Dyo de Salmão… | Dupla/Dyo | **Confirmado** | Regra por categoria; sabor não importa. |
| Guioza | Guioza | 650 selada | **Confirmado** | Não usar "Gyoza". |
| Temaki | Temaki de Salmão… | Temaki | **Confirmado** | Regra por categoria. |
| Uramaki | Uramaki Califórnia… | Enrolados | **Confirmado** | — |
| Hosomaki | **Hossomaki** de Atum… | Enrolados | **Possível alias** | Seed grafa "Hossomaki" (dois s); César "Hosomaki". |
| Hot Roll | Hot Roll, Hot Roll Tatá | Enrolados | **Confirmado** | Exceção prática (vai com frios). |
| Sashimi | *(só dentro de combinados)* | Sashimi | **Precisa validar** | Não achei item "Sashimi de X" avulso no seed; confirmar se existe sashimi avulso. |
| Sunomono | Sunomono | 650 selada | **Confirmado** | — |
| Tuna Shiso | **Tuna Shisô Tartar** | 650 selada | **Possível alias** | Seed grafa "Shisô" e acrescenta "Tartar". |
| Tirashi | Tirashi | 1.000 | **Confirmado** | Não usar "Tiradito". |
| Battera | **Baterá** de Salmão, Baterá de Spicy Tuna | 750 | **Possível alias** | Seed grafa "Baterá" (com acento). Doc diz "Battera com um T" — grafia a acertar. |
| Ceviche | Ceviche | 650 selada | **Confirmado** | Não usar "Cerviche/Cerveithe". |
| Missoshiru | **Missoshiro** · Nasu no Missô | 650 selada | **Possível alias** | Seed grafa "Missoshiro" (com o final). |
| Fish Katsu | **Fish Katsu** *e* **Chickenkatsu** (ambos existem) | Quente 1.500 | **Precisa validar** | O seed tem os dois como itens distintos (frango × peixe). O doc diz usar "Fish Katsu" no lugar de "Chicken Katsu" — confirmar se são o mesmo prato ou dois pratos diferentes no cardápio. |
| Tempurá de Legumes / Camarão / Misto | Tempurá de Legumes, de Camarão, Misto | Quente 1.500 | **Confirmado** | Corrige a anotação antiga "camarão de legumes". |
| Tempurá de milho | **Tempurá de milho doce** | 650 selada | **Possível alias** | Seed acrescenta "doce". |
| Edamame | Edamame | 650 selada | **Confirmado** | — |
| Tartar de salmão / atum spicy | Tartar de Salmão, Tartar de Atum Spicy | 650 selada | **Confirmado** | — |
| Salmão grelhado | Salmão Grelhado | Quente 1.500 | **Confirmado** | — |
| Frango Teriyaki | Frango Teriyaki | Quente 1.500 | **Confirmado** | — |
| Katsu Don | **Katsudon** | Quente 1.500 | **Possível alias** | Seed grafa junto "Katsudon". |
| Carpaccio de salmão | **Carpaccio de Salmão Trufado** (não há "de Salmão" puro) | 750 | **Possível alias** | Seed só tem "Trufado" e "de Polvo Espanhol"; confirmar qual é o "Carpaccio de salmão" da regra. |
| Beef com Nirá | Beef com Nirá | Quente 1.500 | **Confirmado** | Doc escreveu "Bife con ira" (fonético); seed = "Beef com Nirá". |
| Yakisoba | *(não encontrado)* | Quente 1.500 | **Não encontrado** | Nenhum item "Yakisoba" no seed atual. |
| Shikentatsu | *(não encontrado)* | Quente 1.500 | **Não encontrado** | Grafia garbled; validar qual prato é (§15). |
| Tatá Chocolate | Tatá chocolate com sorvete de caramelo salgado | Sobremesa | **Possível alias** | Seed tem nome mais longo. |
| Shoocream | **Choux Cream** | Sobremesa | **Possível alias** | Seed grafa "Choux Cream". |
| Mochi | Mochi | Sobremesa | **Confirmado** | Separar por sabor. |

## 15. Pendências e perguntas para o César

Pendências reais (não genéricas), respondíveis por áudio:

1. **Fish Katsu × Chickenkatsu:** o cardápio tem os dois. São o mesmo prato (só grafia) ou dois
   pratos diferentes (frango e peixe)? A lógica de embalagem trata os dois igual (quente 1.500)?
2. **Yakisoba:** não existe no seed atual. É item ativo do cardápio? Se sim, entra como quente 1.500?
3. **"Shikentatsu":** qual é o prato exatamente? Grafia oficial? (o documento pediu validar).
4. **Battera / Baterá:** o nome correto tem um T ("Batera"/"Battera") ou é "Baterá" como no seed?
5. **Sashimi avulso:** existe item "Sashimi de X" vendido sozinho, ou sashimi só aparece dentro de
   combinado? (a regra de caixa por quantidade de sashimi precisa de item avulso para valer).
6. **Carpaccio de salmão:** o "Carpaccio de salmão" da regra é o "Carpaccio de Salmão Trufado" do
   seed, ou existe um carpaccio de salmão simples?
7. **Grafias de alias** (Hosomaki/Hossomaki, Missoshiru/Missoshiro, Tuna Shiso/Shisô, Katsu
   Don/Katsudon, Tempurá de milho/milho doce, Shoocream/Choux Cream): manter a grafia do César como
   nome de exibição e o seed como origem, ou padronizar o seed depois (missão separada)?
8. **Causa de "duas sacolas":** a operação quer que o sistema explique a causa (quente e frio,
   bebida grande, ou volume), ou basta sinalizar "duas sacolas"?

## 16. Próxima missão recomendada

1. **César responde as 8 perguntas da §15** (áudio) — destrava as grafias e os itens faltantes.
2. **Matriz técnica** (missão de documentação): categoria → caixa → sacola → temperatura → exceções,
   já reconciliada com o seed, como tabela única de referência.
3. **Só depois** transformar a lógica em função do DeliveryOS (motor de embalagem) — com backtest
   sobre pedidos reais, exatamente como as outras camadas do projeto. Nunca antes da validação.
4. A automação de "duas sacolas / só quente" no Calmo só entra depois da matriz técnica **e** do Mapa
   de Ambientes validado (`docs/Mapa_Ambientes_V1.md`) — nunca inferida.

---

## Síntese

A lógica de embalagem é uma **camada operacional crítica**. O sistema deve calcular caixas e sacolas
por categoria, volume, temperatura, compatibilidade e estabilidade — respeitando que combinado é
produto fechado e que quente de cozinha não mistura com frio. Este documento é o entendimento fiel da
regra; a implementação só vem depois de matriz técnica e validação humana.
