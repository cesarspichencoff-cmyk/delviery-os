# Modelo Operacional da Consciência do DeliveryOS

> Documento conceitual e arquitetural. Nenhum código, seed, motor ou baseline foi alterado para
> produzi-lo. Onde este modelo já existe implementado (`src/perfil-delivery/motor.js`,
> `src/perfil-delivery/decisao.js`), ele é **nomeado e explicado**, não inventado — cito o mecanismo
> exato. Onde o modelo exige uma camada que **ainda não existe em código** (Resolução formal, Memória
> Operacional estruturada), digo isso explicitamente. Nunca chamar de implementado o que é conceitual.
>
> **Princípio central:** DeliveryOS não muda de tela. Ele muda de consciência.
>
> **Pergunta que este documento responde:** como uma consciência operacional decide no que prestar
> atenção, quando permanecer em silêncio e quando vale a pena interromper a atenção humana?

---

## 0. O que é "Consciência" aqui (para não virar metáfora vazia)

Consciência **não é** uma entidade inteligente, não é IA, não é uma metáfora de marketing. É o nome
que damos à **camada de decisão operacional que já existe em código**: a combinação de
`MOTOR.step()` (que observa e classifica situações) e `DECISAO.decidir()` (que ranqueia a melhor ação),
mais o "gerente de atenção" que já vive dentro de `step()` (debounce, cooldown, teto de foco). Este
documento dá nome único e vocabulário unificado a mecanismos que já existem espalhados, e estende esse
vocabulário para as duas peças que a evidência das últimas fases mostrou que faltam: um fechamento de
ciclo explícito (Resolução) e uma memória estruturada do que aconteceu (Memória Operacional).

Toda vez que uma frase abaixo parecer bonita sem gerar uma consequência de código, threshold, campo de
dado ou regra de interface, ela foi reescrita — se ainda parecer assim, é falha deste documento, não
intenção.

---

## 1. A Consciência

**Definição operacional:** a Consciência é a camada que recebe sinais observados, mede severidade,
estima impacto físico, calcula confiança pela fonte do dado, e decide entre **Calmo**, **Ambiente**,
**Foco** ou **Resolução** — uma decisão por minuto, nunca uma lista.

**O que ela observa continuamente** (concreto, já implementado em `MOTOR.step`):
- carga por praça (pedidos vivos vs. baseline daquela praça);
- tempo de cada pedido em produção e em expedição, comparado a pisos (`FLOORS.PROD`, `FLOORS.EXPED`);
- composição do pedido (praça única, 2ª sacola, bebida/kit/sobremesa, observação do cliente);
- ritmo de chegada de novos pedidos;
- se um pedido já saiu, foi entregue ou foi cancelado (para nunca ressuscitar o que já terminou).

**O que ela calcula:**
- **severidade** (1 a 3, pela razão entre carga observada e o piso/baseline da praça ou zona);
- **impacto físico** (`release impact` — quantos pedidos saem se esta praça liberar; quem é o
  "pedido âncora" que mais seguraria o fluxo);
- **confiança** (alta/média/baixa, pela origem do dado — ver §5);
- **score de decisão** (a fórmula de `DECISAO.decidir`: `unblock×2 + carga×0,5 + severidade`, e
  variantes por tipo de ação).

**Como ela separa fato observado, hipótese inferida, memória histórica, dado ausente e desconhecido**
— cinco categorias, cinco tratamentos diferentes, nunca misturados:

| Categoria | Como aparece hoje | Exemplo |
|---|---|---|
| **Fato observado** | `procedencia:"observado"`, `confianca:"alta"` | carimbo de "pronto" do iFood |
| **Hipótese inferida** | `procedencia:"inferido"`, `confianca` proporcional à fonte | praça provável de um pedido via composição sintética |
| **Memória histórica** | ainda **não formalizada** — ver §8 | um padrão de erro recorrente por praça/turno |
| **Dado ausente** | campo fica `null`, nunca preenchido por chute | pedido sem carimbo de saída — o sistema não inventa a hora |
| **Desconhecido/implausível** | contador `suspeitos`, nunca vira foco | espera > `STALE` (120 min) — silenciado, não escondido: contado à parte |

**Como decide entre Calmo, Ambiente, Foco e Resolução** — mecanismo exato:
1. Se nenhuma situação (`sits`) cruza o piso de severidade → **Calmo**.
2. Se há situação(ões) mas nenhuma sustentada o suficiente para virar foco, ou o slot de foco já está
   ocupado por algo mais grave → as até 2 mais relevantes viram **Ambiente**.
3. Se a situação mais severa persiste por `DEBOUNCE` (3 min) e não está em `COOLDOWN` (45 min desde a
   última vez que essa mesma situação foi ao foco) → vira **Foco**, com teto de `MAXFOCUS` (8 min).
4. Quando a situação que gerou o foco deixa de existir na fotografia do minuto (`sits.find` não a
   encontra mais) **ou** o teto de tempo é atingido → **Resolução** (ver §7).

**Como evita interromper demais:** `DEBOUNCE` (exige persistência, não reage a pico de 1 minuto),
`COOLDOWN` (não repete o mesmo alerta por 45 min), `MAXFOCUS` (não deixa um foco "grudar" — depois de
8 min, mesmo não resolvido, ele demove para ambiente), exclusividade de slot (só 1 foco por vez — o
resto vira clima, nunca fila).

**Como evita interromper de menos:** o piso de severidade é medido contra baseline real, não intuição;
o `STALE` garante que dado que desaparece (sem carimbo de saída, por exemplo) não é simplesmente
ignorado — ele é contado como `suspeitos` (visível em auditoria/backtest), para que uma lacuna
sistemática de dado seja percebida por quem constrói o produto, mesmo que nunca vire foco ao operador.

**Como declara o que sabe, suspeita, e não sabe:** o campo `confianca` (alta/média/baixa) mais o
sussurro de UI que só aparece quando a confiança não é alta (§9 de `Camada_Decisao_Operacional.md`) —
"a certeza é silenciosa". Nunca existe confiança "100% fingida": ou o dado sustenta alta, ou o sistema
diz que suspeita.

---

## 2. Calmo

**Calmo é uma conclusão da Consciência, não a ausência dela.** É o resultado de avaliar tudo e concluir
que nada, agora, justifica atenção.

**Condições que permitem Calmo:** zero situações cruzando o piso de severidade em toda a operação —
nenhuma praça acima do baseline, nenhum pedido preso além do piso de produção/expedição, nenhuma
composição de alto risco esperando demais.

**Pequenas tensões que não quebram Calmo:** uma praça 10-20% acima do baseline por poucos minutos
(severidade 1, abaixo do piso que já gera situação); um pedido isolado ligeiramente acima do tempo
normal mas dentro da margem que a própria operação absorve sem risco real.

**O que o operador vê (e não vê) em Calmo:** vê o **pulso** — hoje, literalmente, "N em andamento"
(`vital.textContent`) — nunca uma lista de pedidos, nunca contagem por praça, nunca um KPI. Não vê
nada que precise ser lido ou interpretado.

**Como Calmo transmite confiança sem virar dashboard:** o pulso é a prova de vida. Não é tela vazia —
é tela que respira (o próprio `--bd` de intensidade de pulso já existe no protótipo, variando com
`intenso`). Vazio assustaria ("será que travou?"); o pulso resolve isso sem adicionar nenhuma
informação a mais.

**Como evitar que Calmo pareça falta de monitoramento:** o pulso muda de ritmo conforme o volume real
(`intenso` quando o ritmo de chegada é alto) — ele reage ao mundo, então prova que está vivo e
calculando, mesmo quando a conclusão é "nada a fazer".

---

## 3. Ambiente

**Ambiente é o clima da operação — meteorologia, nunca um alerta suave disfarçado.**

**O que transforma um sinal em Ambiente (não Foco):** severidade 1, ou severidade 2+ que ainda não
passou pelo `DEBOUNCE`, ou uma situação real mas que perde o slot único de foco para outra mais grave
naquele minuto. Ambiente é onde ficam as até 2 situações **seguintes** em relevância, nunca a mais
grave escondida.

**O que a Consciência altera internamente ao perceber Ambiente:** o relógio de persistência
(`pending.since`) começa a contar para essa situação — ela está sob observação para, se persistir,
virar Foco. Internamente é vigilância ativa; externamente é clima passivo. Essa assimetria é
proposital: o sistema trabalha mais do que mostra.

**Como Ambiente muda a sensibilidade da Consciência para risco futuro:** um sinal de ritmo (S22 —
"ritmo acima do normal") é, por natureza, um **indicador líder**: ele antecede S5 (praça
sobrecarregada) antes dela travar de fato. Ambiente é onde a Consciência acumula evidência para o
Foco que talvez venha, sem gastar atenção humana antes da hora.

**Como Ambiente deve ser sentido sem poluir a interface:** no máximo 2 rótulos curtos ("Quentes
carregando", "saída lenta"), com cor/intensidade proporcional à severidade (`--warm`), sem números, sem
lista, sem bloco de ação — a diferença estrutural entre Ambiente e Foco é que Ambiente **nunca** tem o
bloco "AÇÃO RECOMENDADA".

**Como impedir que Ambiente vire lista de alertas disfarçados:** o teto rígido de 2 itens simultâneos
(nunca 5, nunca uma lista rolável) e a proibição estrutural de ação prescrita em modo ambiente —
ambiente informa clima, nunca manda fazer algo.

**Exemplos reais (do Mapa de Sinais Operacionais):** quentes carregada (S5), expedição lenta / saída
lenta (S2), volume crescendo acima do normal (S22), muitos pedidos compostos na mesma janela,
logística pressionada (motoboy demorando, mas ainda dentro do piso de foco).

---

## 4. Foco

**Foco não é acessado manualmente — é criado pela Consciência quando ela decide que vale interromper.**
Antes de qualquer foco nascer, a pergunta obrigatória é: **"esta interrupção melhora a operação?"**

**Quais sinais geram hipótese de Foco:** qualquer situação (`sits`) com severidade ≥2 — praça muito
acima do baseline, pedido individual muito além do piso, fechamento pendente de praça única, ou
conferência de alto risco (2ª sacola + bebida/kit/observação) perto do limite de espera.

**Como uma hipótese vira Foco real:** ela precisa (1) ser a mais severa entre as concorrentes daquele
minuto, (2) ter persistido por `DEBOUNCE` (3 min — não reage a pico de 1 minuto), (3) não estar em
`COOLDOWN` para a mesma chave nos últimos 45 min, e (4) não ter sido classificada como `suspeitos`
pelo teto de plausibilidade (`STALE`).

**Critério de interromper ou não** — a pergunta "isto melhora a operação?" respondida em números:
`score = unblock×2 + carga×0,5 + severidade` (para praça) e fórmulas análogas para as outras
categorias (`fechar_simples`, `chamar_motoboy`, `conferencia`, `conferir_saida`/`olhar_pedido`) —
maior score, maior retorno de atenção investida, vence.

**Como escolhe o Foco dominante entre múltiplos riscos:** `sits` é ordenado por severidade primeiro,
depois pela magnitude (nº de pedidos, pico de espera, ou impacto de liberação); em empate, severidade
decide. Só o vencedor vira foco — todo o resto (mesmo real, mesmo grave) recua para Ambiente naquele
minuto, porque o slot é único por desenho.

**Como o Foco separa fato, hipótese, desconhecido, confiança, origem, impacto e ação** — a hierarquia
já em produção (`Camada_Decisao_Operacional.md`), reafirmada aqui como parte do modelo de consciência:

1. **AÇÃO** — imperativo, ≤4 palavras ("PRIORIZE DUPLAS", "CHAME MOTOBOY");
2. **Por quê** — 1 linha, o fato/hipótese que gerou o foco;
3. **Primeiro olhar** — 1 linha, o pedido/praça exato a olhar (nunca "veja a lista");
4. **Impacto** — 1 linha, o que se ganha agindo agora;
5. **Confiança** — sussurro, só quando ≠ alta — é aqui que "desconhecido" e "hipótese" se declaram sem
   drama.

O que é **hipótese** (composição sintética) nunca aparece com a mesma força visual do que é **fato**
(timing real) — a confiança modula a intensidade da apresentação, nunca só o texto.

**Como evitar Foco excessivo:** `MAXFOCUS` (8 min de teto por foco, mesmo não resolvido) +
`COOLDOWN` (45 min de silêncio pós-foco na mesma situação) + exclusividade de slot (nunca dois focos
simultâneos, nunca fila de focos).

**Como evitar Foco insuficiente:** o piso de severidade nasce de baseline medido (nunca intuído), e o
`DEBOUNCE` é curto (3 min) o bastante para não perder janela de ação real.

**Exemplo com consequência prática — pedido com alergia:** a evidência recente (`Relatorio_Replays_Reais_Jun20-30.md`,
`Proposta_Sinal_Conferencia_Dirigida.md`) mostrou 24 pedidos com alergia declarada em 11 dias — risco
de saúde, não só de atraso. **Conceitualmente**, este é o único tipo de sinal que deveria poder
**pular o `DEBOUNCE`** — a persistência de 3 minutos existe para filtrar ruído de praça/tempo, mas uma
alergia declarada é fato no instante em que o pedido é composto, não algo que precise "se confirmar
por 3 minutos". **Isto ainda não está implementado** — é a consequência arquitetural que este modelo
exige, registrada aqui, não codificada.

**Anti-exemplo — combinação de pedido complexo + Ambiente pressionado:** um pedido com 2ª sacola e kit
chegando durante uma noite já em Ambiente de "quentes carregada" **não** deve automaticamente virar
Foco só pela soma de dois climas — precisa passar pelo mesmo portão de severidade+debounce que
qualquer outro. Pressão ambiente **aumenta a probabilidade** de o próximo sinal virar foco mais rápido
(porque a operação já está mais tensa), mas não substitui o critério.

---

## 5. Confiança

**Confiança é a confiança da própria Consciência em suas conclusões — nunca a confiança do operador
nela.**

**Como é medida:** pela origem do dado que sustenta a conclusão, não pela gravidade da situação
(gravidade e confiança são eixos independentes — ver a regra-mãe do caso "402 min" no §6):

| Fonte | Confiança |
|---|---|
| Motor A (tempo/estado — carimbos reais do iFood) | **alta** |
| Motor B (composição) com fonte sintética | **média** (teto — nunca sobe sozinha) |
| Motor B com fonte real (`fonteReal:true`) | **alta**, automaticamente, sem mudar nenhuma regra |
| Severidade fraca / nada a destravar | **baixa** |
| Dado ausente ou implausível (`STALE`) | **nenhuma — não aparece**, vira `suspeitos` |

**Como afeta o comportamento do sistema:** confiança alta → o sussurro de incerteza **some** (a
certeza é silenciosa); confiança média/baixa → o sussurro aparece explicitamente ("confiança média").
A severidade (o quão grave) e a confiança (o quão certo) nunca se misturam num único número — uma
situação pode ser grave e incerta ao mesmo tempo, e o sistema precisa dizer as duas coisas
separadamente.

**Como impede conclusões falsas:** a regra-mãe (já em produção, nascida do bug real "402 min"):
**baixa confiança nunca aparece como CRÍTICO.** Um sinal com dado ruim não pode "parecer bug" — se o
sistema não tem certeza, ele fala baixo, nunca forte. É a aplicação direta da Lei 12 (nunca grita
lobo) e da Lei 5 (nunca mente) no nível de severidade visual.

---

## 6. Decisão de Interromper

A pergunta central: **"vale gastar atenção humana agora?"** Critérios, todos já mensuráveis hoje ou
identificados pela evidência recente:

| Critério | Como se mede hoje | Fonte |
|---|---|---|
| Risco de erro de conferência | 2ª sacola / kit / bebida sem checagem | `riscoConfAlto` no motor |
| Risco de cliente (atraso) | tempo acima do piso de expedição | `FLOORS.EXPED` |
| **Risco de alergia** | observação com termo de alergia | conceitual — ver §4, ainda não codificado |
| Impacto na operação | `release impact` (quantos pedidos destravam) | `unblock` em `DECISAO` |
| Tempo disponível até virar problema real | distância até o piso de severidade seguinte | severidade 1→2→3 |
| Confiança da conclusão | fonte do dado (§5) | `confianca` |
| Custo cognitivo da interrupção | 1 foco por vez, nunca empilha | exclusividade de slot |
| Possibilidade de prevenção | agir agora evita quantos erros/atrasos | `impacto` no bloco de foco |

**Quando interromper:** severidade ≥2 sustentada, confiança suficiente para a gravidade anunciada, e
impacto físico mensurável (algo realmente destrava ou se evita agindo agora).

**Quando não interromper:** severidade 1, ou confiança insuficiente para o nível de urgência que a
situação pediria, ou dado marcado `suspeitos`.

**Quando só mudar para Ambiente:** situação real mas de severidade insuficiente, ou perdendo o slot
para algo mais grave no mesmo minuto, ou um indicador líder (ritmo, tendência) que ainda não travou nada.

**Quando observar em silêncio (Calmo):** nenhuma situação cruza piso algum.

---

## 7. Resolução

**Resolução é o fechamento de ciclo da Consciência — o momento em que ela para de prestar atenção a
algo que estava olhando.** Hoje, parcialmente implementada (o foco é limpo quando a situação
desaparece ou o teto de tempo é atingido); o que falta é **distinguir os dois motivos**, o que este
modelo torna explícito como próximo passo.

**O que a Consciência deve avaliar neste momento:**
1. A situação desapareceu **antes** do teto de tempo (`MAXFOCUS`)? → provável sinal de que algo mudou
   de fato (praça liberou, pedido saiu, conferência foi feita).
2. A situação persiste e só saiu de foco porque o **teto de tempo** foi atingido? → isso **não é**
   resolução real, é demoção por tempo — precisa reentrar em Ambiente, não ser tratado como "resolvido".

**O que ela deve registrar** (hoje não registrado — conceitual): a chave da situação, quanto tempo
ficou em foco, se desapareceu por resolução real ou por teto, e — quando existir dado de desfecho
real (cancelamento, negociação, avaliação) — se o resultado bateu com o que o foco previa.

**Como transforma experiência em Memória Operacional:** só os ciclos de Resolução **real** (não os
demovidos por teto) viram candidatos a memória — e mesmo assim, só como **observação**, nunca como
conclusão automática (ver §8).

**Como evita aprendizado errado:** nunca infere que "a ação recomendada funcionou" sem confirmação —
sem um sinal positivo explícito (ex.: pedido saiu logo depois, cancelamento evitado), o desfecho fica
marcado como **"resolvido, causa desconhecida"**, nunca como sucesso presumido. Isso seria mentir
sobre confiança (Lei 5) da forma mais perigosa: inventar causalidade.

---

## 8. Memória Operacional

**Memória Operacional é experiência estruturada, não log.** Ela nasce como subproduto dos ciclos de
Resolução (§7) — nunca de um esforço separado de registrar (Lei 1).

**O que deve virar memória:** ciclos de foco **resolvidos de verdade** (não demovidos por teto), com
seu tipo, severidade, confiança na hora da decisão, e — quando disponível — o desfecho real observado
depois. Não vira memória: cada minuto calmo, cada situação de ambiente que nunca escalou, dados
`suspeitos`.

**Como separa observado, inferido, confirmado e desconhecido:** mesma disciplina de vocabulário do
resto do modelo — um registro de memória tem `confianca_na_decisao` (o que se sabia então) e
`desfecho_confirmado` (o que se sabe depois, podendo ser `null` = desconhecido). Nunca colapsar os
dois num "funcionou/não funcionou" binário sem evidência.

**Como a memória influencia futuros Ambiente e Focos:** **nunca automaticamente.** Segue exatamente o
fluxo de Aprendizado Estrutural já estabelecido no projeto: `observação → evidência → proposta →
aprovação humana → regra`. Memória Operacional é o insumo bruto dessa observação — nunca um atalho
para pular a aprovação humana (Lei 6, Lei 11).

**Como evita virar ruído ou aprendizado falso:** um registro com desfecho desconhecido continua
desconhecido para sempre, a menos que uma nova evidência o confirme — nunca é tratado como "sem
problema" por omissão. É a mesma regra que já rege calibração de baseline no projeto: nenhuma
calibração acontece sem dado real e aprovação explícita.

---

## 9. Fontes de Tensão

As fontes de tensão que a Consciência já reconhece (ou deveria, pela evidência recente), com o
princípio de apresentação: **tensão e intensidade primeiro; origem e ação, depois** — exatamente a
ordem já fixada em `Camada_Decisao_Operacional.md` (AÇÃO → por quê → primeiro olhar → impacto →
confiança-sussurro).

| Fonte de tensão | Registro típico |
|---|---|
| Praça sobrecarregada | Ambiente → Foco |
| Saída/motoboy lento | Foco (dado real, confiança alta) |
| Pedido preso individual | Foco |
| Fechamento pendente de praça única | Foco (oportunidade, não risco) |
| Conferência de alto risco (2ª sacola/bebida/kit) | Foco |
| **Observação com alergia** | conceitual — deveria ser Foco imediato, sem debounce (§4) |
| Ritmo de chegada anômalo (surto) | Ambiente (indicador líder) |
| Item pausado ainda entrando em pedidos | Foco (quando implementado — S15/S16) |

---

## 10. Consequências para Arquitetura e Interface

**O que mostrar/esconder por estado cognitivo:**

| Estado | Mostra | Esconde |
|---|---|---|
| Calmo | pulso (`N em andamento`) | tudo o resto |
| Ambiente | até 2 rótulos curtos + cor de severidade | números, listas, ação |
| Foco | 4 linhas + sussurro de confiança | score, ranking completo, dados-fonte, `suspeitos` |
| Resolução | nada (o foco simplesmente recua) | o próprio ciclo de resolução (invisível ao operador) |

**Como a arquitetura deve representar sinal, confiança, hipótese e resolução:** os campos já existem
para sinal e confiança (`sits`, `confianca`, `procedencia`); **resolução como evento distinto** (ver
§7) e **memória operacional como estrutura** (ver §8) são as duas extensões que este modelo pede —
nenhuma delas contradiz o núcleo existente, ambas são camadas de leitura sobre a mesma História, no
mesmo espírito de "derivado nunca vira evento" já estabelecido na arquitetura do projeto.

**Como evitar que a interface vire dashboard:** exclusividade de slot em todos os estados (nunca mais
de 1 foco, nunca mais de 2 ambientes), e nenhum estado além do Foco carrega um bloco de ação.

**Fluxo obrigatório:** `estado (sits) → atenção (gerente: pending/sustained/active) → decisão
(DECISAO.decidir) → resolução (cur=null ou teto) → memória (conceitual, pendente de construção)`.

---

## 11. Riscos e Proteções

| Risco | Proteção |
|---|---|
| **Consciência ansiosa** (interrompe demais) | `DEBOUNCE` + `MAXFOCUS` + `COOLDOWN` + exclusividade de slot |
| **Consciência passiva** (interrompe de menos) | piso de severidade medido (não intuído) + `STALE` torna ausência de dado visível em auditoria (`suspeitos`), nunca some sem rastro |
| **Confiança falsa** | regra-mãe "baixa confiança nunca é CRÍTICO"; confiança sempre rotulada pela fonte |
| **Aprendizado errado** | fluxo `observação→evidência→proposta→aprovação humana→regra`; desfecho desconhecido nunca vira sucesso presumido |
| **Foco banalizado** | `COOLDOWN` de 45min na mesma chave; confiança sintética tem teto (nunca "alta" sem fonte real) |
| **Ambiente virando alerta disfarçado** | teto de 2 rótulos; proibição estrutural de bloco de ação em modo ambiente |
| **Calmo parecendo falta de informação** | pulso vivo, reativo ao ritmo real (`intenso`), nunca tela morta |
| **Sistema parecendo vigilância da equipe** | Lei 4 — autoria (quem montou, quem fechou) existe só para aprender/calibrar, nunca aparece como "quem errou"; nenhum placar, nenhum ranking de pessoa |

---

## 12. Leis Operacionais

1. **DeliveryOS não muda de tela. Ele muda de consciência.**
2. **Calmo é ausência de necessidade de pensar** — não ausência de cálculo.
3. **Ambiente é clima, não alerta.** Nunca carrega um bloco de ação.
4. **Foco é atenção humana justificada** — nasce de severidade + persistência + confiança, nunca de
   um único pico.
5. **A Consciência só interrompe quando a interrupção melhora a operação** — medido, não sentido.
6. **Memória Operacional é experiência acumulada, não log** — nasce da Resolução, nunca de esforço
   separado de registrar.
7. **O sistema deve declarar o que não sabe** — confiança é sempre proporcional à fonte, nunca fingida.
8. **Silêncio é sinal de saúde** — Calmo prova que está vivo pelo pulso, não pelo vazio.
9. **Atenção humana é recurso sagrado** — um foco por vez, nunca fila, nunca empilhamento.
10. **Nenhum desfecho presumido** — resolução sem confirmação fica marcada como desconhecida, para sempre, até prova em contrário.

---

## Tabela-Resumo Final

| Conceito | Entrada (sinais) | Decisão da Consciência | Saída esperada | Proteção contra erro |
|---|---|---|---|---|
| **Calmo** | nenhuma situação cruza piso de severidade | concluir que nada precisa de atenção agora | pulso vivo (`N em andamento`), nenhum outro dado | pulso reage ao ritmo real — nunca tela morta |
| **Ambiente** | situação(ões) de severidade 1, ou 2+ ainda não sustentada/sem slot | manter sob observação, comunicar clima sem prescrever ação | até 2 rótulos curtos + cor de severidade | teto de 2 itens; proibido bloco de ação |
| **Foco** | situação de severidade ≥2, sustentada por `DEBOUNCE`, fora de `COOLDOWN`, fonte confiável | interromper com 1 ação ranqueada por impacto físico | 4 linhas + sussurro (ação · por quê · primeiro olhar · impacto · confiança) | `MAXFOCUS`, `COOLDOWN`, exclusividade de slot, regra-mãe de confiança |
| **Resolução** | situação desaparece de `sits`, ou `MAXFOCUS` atingido | distinguir resolvido-de-fato vs. demovido-por-teto (conceitual) | foco recua, ciclo se fecha (hoje: silencioso; deveria: registrar tipo de fechamento) | nunca presumir causa sem confirmação |
| **Memória Operacional** | ciclos de Resolução real (não os por teto) | estruturar como observação rotulada (confiança na decisão × desfecho confirmado/desconhecido) | insumo para o fluxo de Aprendizado Estrutural — nunca regra automática | desfecho desconhecido permanece desconhecido; aprovação humana obrigatória antes de virar regra |
