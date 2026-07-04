# Red Team — Modelo Operacional da Consciência do DeliveryOS

> Postura: atacar, não defender. Método idêntico ao `docs/RedTeam_Arquitetura.md` — achar o que quebra
> antes de alguém construir em cima. Cruzei linha a linha `docs/Modelo_Operacional_Consciencia_DeliveryOS.md`
> contra o código real de `src/perfil-delivery/motor.js` e `src/perfil-delivery/decisao.js`. Toda
> citação de código abaixo foi conferida agora, não de memória. Nenhum código foi alterado.
>
> **Veredito de abertura:** o modelo sobrevive em vocabulário e em boa parte do raciocínio, mas contém
> **pelo menos um overclaim factual** (afirma como "já implementado" algo que não existe no código) e
> **uma divergência arquitetural séria** entre `motor.js` e `decisao.js` que o documento não menciona e
> que muda o que é de fato mostrado ao operador. Isso não é detalhe — é exatamente o tipo de coisa que,
> entregue a 200 engenheiros, produziria 200 implementações incompatíveis.

---

## 1. O que realmente sobrevive

**A separação de confiança por fonte (Motor A/B/C) é sólida.** `confComp()` em `decisao.js:51`
(`fraca ? "baixa" : (fonteReal ? "alta" : "média")`) é simples, testável, e já provado em 12 janelas
reais de replay — confiança sobe automaticamente quando `fonteReal:true`, sem mudar nenhuma regra.
Resiste porque é código existente e validado, não promessa.

**A regra-mãe "baixa confiança nunca é crítico" sobrevive** porque nasceu de um bug real (caso
"402 min", documentado em `Camada_Decisao_Operacional.md`) e já está em produção. Não é aspiração —
é cicatriz de um incidente real, o tipo de regra que sobrevive porque já doeu uma vez.

**A exclusividade de slot (1 foco por vez) sobrevive.** `sess.active` é um valor único, nunca uma
lista (`motor.js:190,264-270`). Não há nenhum caminho de código que permita dois focos simultâneos.
Isso é uma garantia estrutural, não uma convenção — resiste a qualquer tentativa de contorná-la sem
reescrever `step()`.

**O piso de plausibilidade (`STALE=120`) sobrevive** porque foi calibrado contra dado real medido
(p99 de espera legítima), não intuído — `motor.js:34-38`. É a única constante do sistema com
justificativa estatística explícita no comentário do próprio código.

**A distinção "dado ausente nunca é preenchido" sobrevive** — `wmin > FLOORS.STALE` e
`up == null` (`motor.js:200-201,207-210`) sempre resultam em `continue`/`suspeitos`, nunca em um
valor fabricado. Isso é a aplicação mais limpa da Lei 5 em todo o código.

---

## 2. Ambiguidades perigosas

**Ambiguidade 1 — "Resolução" não tem granularidade única.** O modelo (§7) trata Resolução como um
conceito só: "a situação desaparece de `sits`". Mas isso significa coisas **diferentes** dependendo do
`kind`:
- Para `kind:"praca"` (chave `"pr:"+p`, `motor.js:231`), a chave é **agregada por praça** — não
  identifica quais pedidos específicos causam a sobrecarga. Se os 5 pedidos que causavam "Combinados
  carregando" saírem e 5 **outros** pedidos entrarem na mesma praça no mesmo nível de severidade, a
  chave `"pr:combinados"` continua a mesma — o código **não distingue** "resolveu e reapareceu" de
  "nunca resolveu". Um engenheiro implementando Resolução aqui logaria "situação persistente"; outro
  logaria "resolvida e reaberta" — ambos defensáveis, ambos incompatíveis.
- Para `kind:"order"/"fechamento"/"conferencia"` (chaves `"od:"+id`, `"fech:"+id`, `"conf:"+id`), a
  chave é **pedido-específica** — resolução aqui é limpa (o pedido saiu, a chave some).

O documento trata os dois casos como um conceito único. Não são. Qualquer implementação de "Resolução"
sem resolver essa divergência de granularidade primeiro vai gerar dado de memória inconsistente por
design, não por bug.

**Ambiguidade 2 — o que "interromper" realmente significa não é o que o modelo descreve.** O modelo
(§4, §6) descreve Foco como resultado de severidade + persistência (`DEBOUNCE`) + confiança. Isso é
verdade para **qual situação ocupa o slot de atenção** (`sess.active`, decidido em `motor.js`). Mas o
**conteúdo exibido** (a "AÇÃO RECOMENDADA" — cabeçalho, por quê, impacto) vem de
`DECISAO.decidir(snap, INFO, opts)`, que roda **toda vez que o modo é foco**, avaliando **todos os
`sits` daquele minuto** — não só `sess.active.sit` — e escolhe seu **próprio** vencedor por
`score` (`decisao.js:45-151`), sem nenhum `DEBOUNCE`/`COOLDOWN` próprio. Isso é detalhado no item 1 da
seção 4, abaixo — está listado aqui porque é a ambiguidade mais perigosa do documento: dois times
diferentes leriam "o Foco decide o que mostrar" e um implementaria achando que `buildFoco(sess.active.sit)`
é a fonte da verdade, outro que `DECISAO.decidir()` é. **Os dois têm razão parcialmente — e é isso que
é perigoso.**

**Ambiguidade 3 — "declarar o que não sabe" não tem um valor concreto para "desconhecido".** O modelo
(§1) lista "desconhecido" como uma das cinco categorias que a Consciência separa, ao lado de
observado/inferido/histórico/ausente. Mas o código só tem dois estados de confiança visíveis
(`alta/média/baixa` — `decisao.js:51`) mais um contador invisível (`suspeitos`). Não existe um valor
"desconhecido" que apareça em tela ou em `confianca`. Um time implementaria "desconhecido" como uma
quarta opção de `confianca`; outro entenderia que "desconhecido" É o que hoje vira `suspeitos` (nunca
mostrado). O documento não resolve qual dos dois é o modelo real.

---

## 3. Conceitos que parecem bons mas são frágeis

**"A Consciência declara o que sabe, suspeita e não sabe" — soa bem, mas hoje é um único campo string.**
Na prática, "declarar" é `confianca: "média"` e um sussurro de CSS com opacidade 42%
(`Camada_Decisao_Operacional.md §Apresentação`). Isso é honesto e funciona — mas a linguagem do modelo
("separar fato observado, hipótese inferida, memória histórica, dado ausente e desconhecido", §1) monta
uma epistemologia de 5 categorias sobre uma implementação de 3 valores possíveis. Qualquer engenheiro
que leia a prosa antes do código vai **superconstruir**: propor um enum de 5 estados, uma UI para cada
um, testes para cada combinação — inflando complexidade que a Lei 8 (na dúvida, subtrai) proíbe.

**"Alergia deveria pular o DEBOUNCE" (§4 do modelo) é sedutor e perigoso ao mesmo tempo.** A ideia
nasce de evidência real (24 pedidos com alergia em 11 dias). Mas remover o filtro de persistência para
qualquer classe de sinal é remover a **única** proteção que o sistema tem contra ruído momentâneo —
hoje é justamente o `DEBOUNCE` que impede 1 minuto de dado ruim virar foco. Uma detecção de "alergia"
por regex de observação de texto livre (do jeito que `docs/Proposta_Sinal_Conferencia_Dirigida.md` já
descreve — nunca implementado) tem taxa de falso positivo desconhecida. Pular debounce justamente no
sinal com **menos validação estrutural** (texto livre, sem schema) é o oposto de cauteloso — é abrir a
única porta sem tranca exatamente onde o dado é mais frágil.

**"Ambiente muda a sensibilidade da Consciência para risco futuro" (§3) não tem nenhum mecanismo real
por trás.** O modelo descreve S22 (ritmo acima do normal) como "indicador líder" que "antecede S5" e
"aumenta a sensibilidade" do sistema. **Isso não existe em código.** `cheg`/`intenso`
(`motor.js:275-276`) só alimentam a velocidade de animação do pulso em Calmo (`app.js`,
`--bd` = 4.4s vs 6s) — nunca criam uma entrada em `sits`, nunca entram em `ambList`, nunca são lidos por
`decisao.js`. A frase "Ambiente muda internamente a sensibilidade" é bonita e **não gera nenhuma
consequência hoje**. Isto é exatamente o tipo de frase que a missão pediu para reescrever — e eu não
reescrevi da primeira vez. Está sendo corrigido agora, nesta seção.

**"Foco como pedido âncora nomeado" soa preciso, mas a fórmula do desempate é arbitrária e não
documentada como tal.** `ancoraDaPraca()` (`decisao.js:27-35`): `sc = w.min * Math.max(1, I.nBenches) +
(I.ancora ? 60 : 0)`. O bônus de **+60** para pedidos-âncora (combinado/menu) é um número mágico sem
justificativa medida (diferente do `STALE=120`, que tem p99 citado). O modelo apresenta "pedido âncora"
como um conceito limpo de arquitetura; na prática é um score com uma constante inventada que ninguém
testou variar.

---

## 4. Conflitos e lacunas com o motor atual

**Conflito principal — já introduzido acima, detalhado aqui:** `motor.js` decide **qual situação ocupa
o slot de atenção** (severidade + persistência); `decisao.js` decide **qual ação é mostrada** (score,
recalculado do zero a cada minuto, sobre **todos** os `sits`, não só o ativo). Consequência prática
verificável: é **arquiteturalmente possível** que o slot de foco seja concedido por uma situação de
praça (`sess.active.sit.kind==="praca"`, severidade 3, que passou pelo `DEBOUNCE`), e o texto exibido em
tela seja sobre uma **conferência diferente** (`kind:"conferencia"`, que nunca passou por debounce
próprio, mas venceu o `score` daquele minuto em `decisao.js`). O modelo trata Foco como uma decisão
única; o código são duas decisões independentes que só coincidem quando os dois algoritmos concordam —
o que nunca foi provado formalmente, só observado empiricamente nos replays já rodados.

**O que já existe de forma similar ao modelo:** `sess.pending`/`sess.active`/`firedAt` já implementam,
sem nomear, exatamente o "gerente de atenção" que o modelo descreve — o vocabulário do documento
(Calmo/Ambiente/Foco) é uma tradução fiel do que `mode` já calcula (`motor.js:272`).

**Duplicação:** `buildFoco()` (`motor.js:290-340`) constrói um texto de foco (head/impactos/conseq/cmd)
**e** `decisao.js` constrói outro texto de recomendação (head/porque/primeiro/impacto) para a mesma
classe de situação (praça, fechamento, conferência, order). São duas implementações de "traduzir
situação em texto legível", mantidas em paralelo, com vocabulário e ênfase ligeiramente diferentes
(ex.: `buildFoco` para praça fala em "combinados segurando fluxo"; `decisao.js` fala em "X pedidos saem
se Y liberar"). O app.js escolhe `rec` sobre `f` quando ambos existem (`app.js`: `if(rec){...} else
{fhead.textContent=f.head...}`) — ou seja, **o texto de `buildFoco()` só aparece quando `decisao.js`
não gera candidato algum**, o que é raro (`decidir()` só retorna `null` se `!sits.length`, e se há foco
há sempre pelo menos 1 sit). Na prática, `buildFoco()` está **quase morto** — construído, mantido,
testado, mas dificilmente exibido. O modelo não menciona essa duplicação nem essa quase-obsolescência.

**Lacuna importante — bug de assimetria em `firedAt` (achado novo, não documentado em lugar nenhum
antes deste Red Team):**

```js
if (sess.active) { const cur = sits.find(s=>s.key===sess.active.key);
  if (!cur) sess.active=null;                                    // resolução antecipada — firedAt NÃO muda
  else { sess.active.sit=cur; if (t>=sess.active.until){
    sess.firedAt[sess.active.key]=t; sess.active=null; } } }      // timeout — firedAt é sobrescrito para t=agora
```
(`motor.js:267-268`)

Quando a situação **resolve antes do teto** (`!cur`), `firedAt[key]` **não é atualizado** — continua
com o valor gravado na ignição (`motor.js:270`: `sess.firedAt[sustained.key]=t;`). Quando a situação
**expira por teto** (`MAXFOCUS`), `firedAt[key]` **é sobrescrito** para o instante da expiração. Isso
significa: **o `COOLDOWN` de 45 min é contado a partir de momentos diferentes dependendo de como o
foco terminou** — da ignição, se resolveu cedo; da expiração, se estourou o teto. Um foco que resolve
em 1 minuto tem cooldown efetivo de 46 min a partir da ignição; um que estoura os 8 min de teto tem
cooldown de 45 min a partir do **fim**, ou seja, 53 min a partir da ignição. Essa diferença de ~7
minutos não é intencional em nenhuma documentação existente — é um efeito colateral não examinado. O
modelo de Consciência (§7, Resolução) **deveria** ter exposto essa inconsistência ao formalizar
"resolução" como conceito — e não expôs, porque foi escrito sem reler o código linha a linha nesse
ponto.

---

## 5. Resolução

**Não está suficientemente definida para ser implementada.** Decisões implícitas que o documento
finge já ter resolvido:

1. **Granularidade** (ver §2, Ambiguidade 1) — praça-agregada vs. pedido-específica. Sem decidir isso,
   não há schema possível para um "evento de resolução".
2. **O que conta como "resolvido de verdade"** — o documento propõe distinguir resolução real de
   demoção por teto (§7), mas o código **hoje trata os dois casos de forma diferente por acidente**
   (ver o bug de `firedAt` acima), não por design. Formalizar Resolução sem antes corrigir essa
   assimetria significa formalizar um comportamento que ninguém decidiu.
3. **Quem/o que dispara uma resolução "por ação humana"** — o modelo menciona (§7) "confirmar que a
   ação foi seguida", mas não existe, em nenhum lugar do código ou do plano de dados, um sinal que
   diga "o humano fez o que foi recomendado". Sem isso, a distinção entre "resolvido por ação" e
   "resolvido sozinho" é puramente teórica.

---

## 6. Memória Operacional

**Risco real e alto de virar log sofisticado — e o próprio documento já admite parte disso, mas não
até o fim.** O modelo diz (§8): "desfecho desconhecido permanece desconhecido, nunca vira sucesso
presumido". Isso é honesto, mas expõe o problema em vez de resolvê-lo: **se a maioria dos ciclos vai
ter `desfecho_confirmado = null` para sempre**, porque não existe hoje nenhuma fonte de confirmação
(nem no motor, nem nos dados recebidos do iFood até agora — cancelamento e negociação existem, mas
cobrem uma fração pequena e enviesada dos pedidos, como já registrado em
`docs/Auditoria_Dados_Estruturados.md`), então **Memória Operacional nasce estruturalmente vazia na
maior parte dos casos**. Um log com 90% dos campos em `null` não é "experiência estruturada" — é log
com um schema mais bonito. O documento não faz essa conta. Deveria.

**O que falta definir, concretamente, antes de qualquer implementação:**
- Qual **percentual real** de ciclos de foco hoje teria algum sinal de desfecho disponível (medível
  agora, sobre os replays já rodados — não implementado, não medido).
- Se esse percentual for baixo, **para que serve** uma memória majoritariamente `null`? O documento
  não responde — assume que "ela influencia o Aprendizado Estrutural" sem provar que há sinal
  suficiente para isso acontecer na prática.
- Se algum dia vier confirmação (ex.: avaliação do cliente, cancelamento evitado), o **atraso** entre o
  foco e essa confirmação pode ser de dias — a avaliação de um pedido de terça pode chegar só na
  auditoria semanal. O modelo não diz como (ou se) memória operacional lida com confirmação tardia.

---

## 7. Consciência

**O conceito carrega peso filosófico que a definição operacional não neutraliza totalmente.** A
definição em §1 do modelo é, tecnicamente, honesta: "camada operacional que recebe sinais, avalia
tensão, mede confiança...". Mas o **nome** "Consciência" — não "gerente de atenção", não "motor de
decisão operacional" — convida a associações que a Constituição e as Leis explicitamente proíbem: uma
entidade que "sabe", "suspeita", "decide". A Lei 6 é clara: "o humano decide; a máquina mostra". Chamar
a camada de "Consciência" e depois escrever frases como "ela decide entre Calmo, Ambiente, Foco e
Resolução" (§1) usa o verbo **decidir** para descrever o que, no código, é um `if/else` sobre limiares
numéricos fixos. Para um engenheiro que não leu `motor.js`, "a Consciência decide" soa a agente — o
tipo de leitura que motiva alguém a propor um serviço de ML/LLM "para a Consciência ficar mais
inteligente", violando a Lei 11 (observabilidade antes de inteligência) sem que ninguém tenha violado
uma linha explícita do documento — só seguido a metáfora até onde ela naturalmente leva.

**É operacional o suficiente?** Sim, na maior parte — cada seção (2 a 9) amarra a um mecanismo
concreto. **Mas o nome do capítulo-mãe (§1, "A Consciência") não é** — ele é o único lugar do
documento que fala em termos de "o que ela observa", "o que ela calcula", "como ela decide" sem, ele
mesmo, apontar que isso é **nomenclatura sobre código existente**, não uma entidade nova. A nota de
abertura do documento (linha 3: "Consciência não é metáfora nem entidade inteligente") tenta prevenir
isso — mas uma frase de aviso no topo não sobrevive a 200 leituras independentes tão bem quanto a
ausência do risco.

---

## 8. Ambiente e Foco

**Maior risco de Ambiente virar alerta disfarçado:** o teto de 2 itens (`ambList.slice(0,2)`,
`motor.js:274`) protege contra volume, mas não contra **frequência de troca**. Se os 2 itens de
ambiente mudam a cada minuto (praças diferentes cruzando e descruzando o baseline por 1 pedido de
diferença), o operador vê "clima" piscando de rótulo em rótulo — visualmente indistinguível de uma
lista de alertas rotativa, mesmo respeitando o limite de 2 ao mesmo tempo. O modelo não define nenhum
piso de **estabilidade temporal** para itens de ambiente (equivalente ao `DEBOUNCE` do foco) — só o
foco tem persistência exigida; o ambiente pode, por design atual, ser tão volátil quanto a exceção da
lista de alertas que o produto promete nunca ser.

**Maior risco de Foco em excesso:** a divergência motor.js/decisao.js (§4) significa que, mesmo com
`COOLDOWN` de 45 min bloqueando a **mesma chave de situação**, o **conteúdo exibido** pode mudar a cada
minuto dentro da janela de foco ativa, porque `decisao.js` reavalia `score` sobre todos os `sits` a
cada chamada — se dois candidatos têm score próximo, o vencedor pode alternar entre eles minuto a
minuto **sem nenhum cooldown próprio de conteúdo** (só a situação-slot tem cooldown; a ação exibida,
não). Isso pode se manifestar como o texto do foco mudando de "PRIORIZE DUPLAS" para "CONFIRA O #X" e
de volta, dentro dos mesmos 8 minutos de um único foco "ativo" — tecnicamente um foco só (pelo motor),
mas experimentado como dois ou três (pelo conteúdo).

**Maior risco de Foco em falta:** nenhum sinal de S6/S22 (ritmo, indicador líder) alimenta `sits` (ver
§3) — então qualquer sobrecarga de praça só vira sinal **depois** que já cruzou o baseline, nunca
antes. O modelo promete antecipação via Ambiente; o código não antecipa nada.

**Sobreposição na prática:** confirmada em código (não hipotética) — um foco de `kind:"praca"` pode
coexistir, em Ambiente, com um `kind:"fechamento"` sobre um pedido que está **dentro** daquela mesma
praça sobrecarregada — a mesma causa raiz aparece em dois vocabulários simultâneos (agregado vs.
individual) sem nenhuma referência cruzada entre os dois textos.

---

## 9. Decisão de Interromper

**Esta é a seção mais crítica e a que menos resiste ao ataque.** O modelo lista 8 critérios (§6): risco
de erro, risco de cliente, **risco de alergia**, impacto, **tempo disponível**, confiança, custo
cognitivo, possibilidade de prevenção. Conferindo contra o código:

| Critério do modelo | Existe hoje? |
|---|---|
| Risco de erro de conferência | ✅ `riscoConfAlto` |
| Risco de cliente (atraso) | ✅ `FLOORS.EXPED` |
| Risco de alergia | ❌ **não existe** — nenhuma detecção de texto de observação em `motor.js`/`decisao.js` |
| Impacto na operação | ✅ `unblock` |
| **Tempo disponível até virar problema real** | ❌ **não existe** — nenhum cálculo de "distância até o próximo piso" ou taxa de deterioração. Severidade é sempre reativa (razão atual), nunca projetiva |
| Confiança da conclusão | ✅ `confianca`, mas só como flag **global** (`fonteReal`), não por situação individual — ver próximo ponto |
| Custo cognitivo da interrupção | ✅ exclusividade de slot |
| Possibilidade de prevenção | ✅ `impacto` no texto do foco |

Duas das oito colunas do critério mais importante do documento **não existem em código**. Isso foi
apresentado no documento original como se já fossem mensuráveis hoje ("Como se mede hoje" — coluna que
eu mesmo escrevi) quando na verdade são aspiração. Isto é o overclaim mais grave deste documento e
está sendo corrigido aqui.

**Risco adicional não coberto pelo modelo:** `confianca` em `decisao.js` é um **booleano global**
(`fonteReal`), aplicado a **todos** os candidatos de composição naquele minuto. Não há mecanismo para
dizer "este pedido específico tem composição real, aquele outro ainda é sintético" — um cenário
totalmente plausível durante qualquer rollout gradual de fonte real (a própria
`docs/Decisao_Arquitetural_Composicao_Real.md` já aponta isso como caminho). Enquanto isso não for
resolvido, qualquer integração parcial de fonte real vai **ou** subestimar confiança real (mantendo
tudo em "média" até 100% da fonte estar migrada) **ou** superestimar confiança sintética (assumindo
`fonteReal:true` global cedo demais). O modelo de Consciência não menciona esse risco nem uma vez.

---

## 10. Riscos antes de implementar

1. **Duas fontes de verdade para "o que mostrar" (motor.js vs. decisao.js) sem reconciliação** — risco
   de perigosidade **alta**: o operador pode ver texto que não corresponde à situação que ganhou o
   direito de interromper, minando a credibilidade do "o sistema sabia antes de mim" (Manifesto §10).
2. **`firedAt` com semântica dupla e não intencional** — risco **médio**: cooldowns reais diferem do
   que qualquer documentação afirma, tornando qualquer análise futura de "quantas vezes o mesmo alerta
   repetiu" incorreta por construção.
3. **Overclaims no próprio documento de Consciência (S22/ritmo, tempo-disponível)** — risco **alto**:
   se aprovado sem este red team, uma equipe implementaria em cima de recursos que não existem,
   descobrindo o buraco só em produção.
4. **Confiança como flag global, não por situação** — risco **alto** justamente no momento mais
   sensível (rollout de fonte real parcial) — pode gerar confiança falsa em massa, exatamente o que a
   Lei 5 proíbe.
5. **Memória Operacional estruturalmente vazia** — risco **médio-alto**: investimento de engenharia
   em uma estrutura de dados que não terá sinal para preencher a maior parte dos campos, sem medição
   prévia de quanto sinal realmente existe.
6. **Nome "Consciência" convidando escopo indevido (IA, agente, personalidade)** — risco **médio**:
   não é um bug de código, é um risco de **deriva cultural** do time em torno de uma palavra.
7. **Ambiente sem piso de estabilidade temporal** — risco **médio**: pode piscar informação como uma
   lista de alertas disfarçada, exatamente o anti-padrão que o Manifesto proíbe.

---

## 11. O que NÃO deve ser implementado agora

- **Resolução como evento formal de código** — a granularidade (praça-agregada vs. pedido-específica)
  não está decidida, e implementar em cima da assimetria de `firedAt` sem corrigi-la primeiro
  cimentaria um bug como comportamento "oficial".
- **Memória Operacional como estrutura de dados** — sem medir primeiro qual fração de ciclos teria
  desfecho confirmável, é investimento às cegas (viola Lei 11: observar antes de tornar inteligente).
- **Qualquer sinal de "tempo disponível até piorar" (S6/S22 real)** — não existe hoje; implementar
  requer decidir baseline de ritmo, o que é calibração, fora do escopo desta missão e das anteriores.
- **Bypass de DEBOUNCE para qualquer classe de sinal (incluindo alergia)** — sem antes ter uma fonte de
  observação confiável e validada (hoje só existe em 1 dos formatos de export, sem schema), remover a
  única proteção contra ruído é apostar a confiança do produto em regex de texto livre.
- **Qualquer unificação de `buildFoco()` e `decisao.js`** sem antes decidir qual das duas é a fonte de
  verdade — fundir dois sistemas em conflito silencioso sem entender por que divergem esconde o
  problema em vez de resolvê-lo.

---

## 12. Próximas três missões recomendadas

### Missão 1 — Reconciliar motor.js × decisao.js (qual decide o quê)
**Objetivo:** eliminar a divergência entre a situação que ocupa o slot de atenção (`sess.active.sit`)
e a ação de conteúdo exibida (`DECISAO.decidir` sobre todos os `sits`).
**Perguntas a responder:** `decisao.js` deveria ser restrito a ranquear candidatos derivados **só** de
`sess.active.sit`? Isso já causou divergência observável nos 12 replays já rodados (auditoria
retroativa, sem mudar nada)? Qual das duas lógicas o César quer como fonte de verdade daqui pra
frente?
**Critério de sucesso:** rodar os 12 replays já existentes e confirmar, para cada minuto em modo foco,
se o `tipo`/`primeiro` de `decisao.js` sempre correspondeu à `kind`/`id` de `sess.active.sit` — reportar
o percentual exato de divergência (hoje desconhecido, nunca medido).

### Missão 2 — Corrigir e provar a assimetria de `firedAt` (cooldown)
**Objetivo:** decidir o comportamento pretendido de `COOLDOWN` (a partir da ignição ou da resolução
real) e corrigir `motor.js` para ser consistente nos dois casos (resolução antecipada vs. teto).
**Perguntas a responder:** qual comportamento é o certo, dado o objetivo de não repetir alerta cedo
demais? Corrigir isso muda os números já publicados nos 12 replays (`Relatorio_Evidencia_Composicao_Real_12_Janelas.md`)?
**Critério de sucesso:** diff explicado (não vazio, mas **entendido**) entre replay antes/depois da
correção — mesma disciplina de prova já usada na correção do builder do cardápio.

### Missão 3 — Medir se Memória Operacional teria sinal para existir
**Objetivo:** antes de desenhar qualquer estrutura de dados, medir **quanto** desfecho confirmável
existe hoje para os focos já resolvidos nos 12 replays (cancelamento, negociação, avaliação — quando
casável por evidência forte, nunca join fraco).
**Perguntas a responder:** que percentual de ciclos de foco resolvidos teria algum desfecho real
associável? Esse percentual é suficiente para justificar a estrutura descrita em §8, ou o conceito
precisa ser redesenhado (talvez memória só para uma fração de sinais, não todos)?
**Critério de sucesso:** número medido e documentado, não estimado — se vier abaixo de um piso
razoável (ex.: 20%), a recomendação objetiva é adiar Memória Operacional até a fonte contínua do
iFood (`docs/Pedido_iFood_Fonte_Continua_Composicao_Logistica.md`) resolver isso.

---

## Resposta objetiva à pergunta obrigatória

**Se este documento fosse entregue hoje para 200 engenheiros, as partes que gerariam interpretações
diferentes — e fariam o DeliveryOS perder sua essência com o tempo — são, em ordem de gravidade:**

1. **A relação entre `motor.js` e `decisao.js` não está no documento.** Metade dos engenheiros
   assumiria que a ação exibida sempre corresponde à situação que ganhou o slot de atenção; a outra
   metade descobriria, cedo ou tarde, que não é bem assim, e cada grupo construiria integrações
   futuras sobre premissas diferentes — este é o risco de maior consequência, porque afeta
   diretamente o que o produto **mostra**, e nada mina "o sistema sabia antes de mim" mais rápido do
   que a ação exibida não bater com a razão real do alerta.
2. **"Consciência" como nome puxaria arquitetura na direção errada.** Uma fração relevante do time
   leria a palavra e proporia um serviço central "inteligente" — um passo direto para violar a Lei 11
   (observabilidade antes de inteligência), não por má-fé, só por seguir a metáfora até o fim.
3. **Memória Operacional seria construída antes de medir se há dado para alimentá-la** — o padrão
   mais comum de over-engineering: desenhar o schema perfeito para um sinal que, medido, pode nem
   existir em volume suficiente.
4. **Resolução seria implementada em cima do bug de `firedAt` sem ninguém perceber**, porque o
   documento descreve o comportamento desejado, não o comportamento real do código — e comportamento
   real vence documentação todas as vezes que alguém for depurar produção às 22h de uma sexta.
