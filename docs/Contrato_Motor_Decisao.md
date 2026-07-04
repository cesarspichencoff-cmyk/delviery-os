# Contrato Motor × Decisão

> Responde ao achado principal de `docs/RedTeam_Modelo_Operacional_Consciencia.md`: `motor.js` elege
> qual tensão ocupa o slot de atenção; `decisao.js` recalcula, sozinho, qual ação mostrar — sobre
> **todos** os `sits` do minuto, não só o vencedor. Este documento define o contrato entre os dois.
> Nenhum código foi alterado para produzi-lo. Toda citação de comportamento "hoje" foi conferida agora,
> nos arquivos reais.

---

## 1. Qual deve ser a fonte da verdade da atenção?

**Hoje:** não há uma. `motor.js` elege `sess.active.sit` (severidade + `DEBOUNCE` + `COOLDOWN`,
`motor.js:264-270`) como a tensão que ocupa o slot. `decisao.js:decidir()` **ignora** essa eleição —
recebe `snap.sits` inteiro (todas as situações do minuto, vencedoras ou não) e roda seu próprio
`score` do zero (`decisao.js:45-151`).

**Contrato:** `sess.active.sit` é a **única fonte da verdade sobre qual tensão está sendo atendida**.
Nenhum outro componente decide "no que prestar atenção agora" — só ranqueia **dentro** do que já foi
decidido.

## 2. O slot de atenção obriga a decisão exibida, ou `decisao.js` pode escolher outra ação?

**Hoje:** `decisao.js` escolhe livremente — nada no código impede que o candidato vencedor de `score`
seja sobre uma `kind` diferente da `sess.active.sit.kind`. Pior: dois dos cinco tipos de candidato
(`fechar_simples`, `chamar_motoboy`) **nem nascem de `sits`** — são construídos direto de `ctx.wP`/
`ctx.wE` (`decisao.js:74-108`), sem nenhuma referência a qual situação abriu o foco.

**Contrato:** o slot **obriga**. `decisao.js` só pode escolher uma ação **causalmente ligada** à
`sess.active.sit` — nunca uma ação livre sobre qualquer tensão presente no minuto.

## 3. O que significa Foco dominante?

A tensão que **motor.js** elegeu para o slot único — a que tem maior severidade, sustentada por
`DEBOUNCE`, fora de `COOLDOWN`. É sobre **onde a atenção está**, não sobre o que fazer.

## 4. O que significa Ação dominante?

A melhor resposta operacional **para essa mesma tensão** — é sobre **o que fazer**, nunca sobre qual
tensão escolher (isso já foi decidido em §3). Hoje, sem o contrato, "ação dominante" significa algo
diferente: o vencedor do `score` de `decisao.js` entre candidatos de **qualquer** tensão do minuto —
por isso a pergunta 5 importa.

## 5. Foco dominante e ação dominante precisam ser a mesma coisa?

**Não precisam ser idênticos, mas precisam ter a mesma causa raiz.** Refinamento é permitido: o foco
pode ser "praça sobrecarregada" (agregado) e a ação, "priorizar o pedido âncora #X dentro dessa praça"
(específico) — isso já é exatamente o que `priorizar_praca` faz hoje (`decisao.js:53-71`, via
`ancoraDaPraca`). Isso **não é divergência** — é a mesma tensão, mais específica. Divergência proibida
é a ação vir de uma tensão **diferente**: foco aberto por praça sobrecarregada, ação mostrada sobre
"chamar motoboy" — sem nenhuma relação com a praça que abriu o foco.

## 6. Se não forem a mesma coisa, como declarar sem contradição?

Hoje `decisao.js`'s `rec` **substitui inteiramente** o texto de `buildFoco()` quando existe
(`app.js`: `if(rec){...} else {fhead.textContent=f.head...}`) — então não há uma contradição textual
literal (cabeçalho A, ação B visíveis ao mesmo tempo). A contradição é mais sutil e mais perigosa: **o
operador é interrompido por causa da tensão A** (foi ela que passou pelo `DEBOUNCE`/severidade), **mas
recebe uma mensagem inteira sobre a tensão B**, sem nenhuma menção de que A existe ou foi a razão real
da interrupção.

**Contrato:** se, dentro do escopo da tensão A, não houver nenhuma ação melhor que a descrição padrão
de `buildFoco(A)`, o sistema mostra `buildFoco(A)` — nunca substitui pelo texto de uma tensão não
relacionada. Trocar de assunto dentro de um foco ativo é proibido; trocar de **foco** (nova ignição,
novo debounce) é permitido, mas é uma transição explícita, não uma substituição de conteúdo silenciosa.

## 7. Divergências aceitáveis

- Ação mais específica que a tensão (praça → pedido âncora dentro da praça).
- Escolher, entre múltiplos candidatos da **mesma** `sits` entry (ex.: duas conferências
  simultâneas dentro do mesmo pedido), o de maior `score`.
- Ambiente mostrando tensões que **não** venceram o slot — isso já é o comportamento correto e
  esperado (`ambList`, `motor.js:274`), não é uma divergência a corrigir.

## 8. Divergências proibidas

- Ação de `kind`/causa raiz diferente da `sess.active.sit` (o caso central deste contrato).
- Ação nascida de `ctx.wP`/`ctx.wE` direto (`fechar_simples`, `chamar_motoboy`) quando o foco ativo é
  sobre outra fonte, sem nenhuma checagem de pertencimento à mesma tensão.
- Conteúdo do foco mudando dentro da mesma janela ativa (os mesmos 8 minutos de `MAXFOCUS`) sem
  nenhuma estabilidade própria — mesmo que "relacionado", instabilidade de texto dentro de 1 ciclo de
  foco quebra a promessa de "uma ação por vez".

## 9. Como este contrato protege a Lei da atenção sagrada (Lei 2)

Lei 2: o sistema mostra o mínimo que leva à ação certa, e **sempre devolve mais foco do que consome**.
Se a interrupção acontece por causa de A mas a instrução é sobre B, a atenção gasta em A não é
devolvida — o operador reage a uma urgência e recebe orientação sobre outra, arriscando agir errado ou
gastar tempo reconciliando as duas sozinho. O contrato garante que toda interrupção **paga
integralmente** pelo que consome: a ação sempre resolve (ou ajuda a resolver) exatamente a tensão que
justificou a interrupção.

## 10. Como impedir que `decisao.js` contradiga o motivo real do Foco

**Hoje** `decidir(snap, INFO, opts)` nem recebe `sess.active` — só `snap` (que contém `sits` cru) e
`INFO`. Não há como impedir a contradição sem essa informação chegar até `decisao.js`.

**Contrato:** `decisao.js` precisa saber qual é a tensão ativa (a chave/`kind` de `sess.active.sit`) e
restringir seu universo de candidatos a esse escopo antes de ranquear por `score`. Isso implica um
mapeamento explícito `kind → tipos de ação permitidos` (ex.: `kind:"praca"` → só `priorizar_praca`
daquela mesma praça; `kind:"saida"` → só `chamar_motoboy`/`conferir_saida`; `kind:"fechamento"` → só
`fechar_simples`/`olhar_pedido` daquele mesmo pedido; `kind:"conferencia"` → só `conferencia` daquele
mesmo pedido; `kind:"order"` → só `olhar_pedido`/`conferir_saida` daquele mesmo pedido). Este
mapeamento **não é código** — é a decisão de design que precisa ser tomada antes de qualquer
implementação.

## 11. Como este contrato afeta Calmo, Ambiente, Foco, Confiança e Resolução

- **Calmo:** inalterado — `decisao.js` não é chamado (`app.js` só chama `DEC.decidir` quando
  `m.mode==="foco"`).
- **Ambiente:** inalterado — mesma razão.
- **Foco:** passa a ter um universo de candidatos **restrito** ao escopo de `sess.active.sit`, não mais
  livre sobre todo o minuto.
- **Confiança:** sem mudança na fórmula (`confComp`, fonte real/sintética) — mas o contrato expõe um
  caso novo a decidir: **o que acontece quando não existe nenhum candidato dentro do escopo restrito?**
  Hoje isso não pode acontecer (porque o escopo é livre); com o contrato, pode. A resposta (mostrar
  `buildFoco` puro, sem bloco de ação) já está dada em §6 — não é um problema de confiança, é ausência
  de candidato.
- **Resolução:** o contrato não muda a mecânica de resolução (§7 do Red Team continua em aberto,
  granularidade praça-agregada vs. pedido-específica), mas remove uma fonte de ruído: hoje seria
  possível "resolver" `sess.active.sit` enquanto a ação mostrada era sobre outra coisa inteiramente —
  com o contrato, resolução e ação sempre se referem à mesma tensão.

## 12. O que NÃO deve ser implementado ainda

- O mapeamento `kind → tipos de ação permitidos` (§10) — precisa ser decidido e revisado antes de
  virar código, não decidido de improviso na hora de implementar.
- Qualquer filtro de escopo dentro de `decisao.js`.
- Qualquer UI ou sinalização de "nenhuma ação dentro do escopo" — é comportamento de interface, fora
  desta missão.
- Qual dos dois textos (`buildFoco()` ou `decisao.js`) sobrevive como fonte única de texto — o Red Team
  já observou que `buildFoco()` está "quase morto" na prática; decidir sua remoção/fusão é uma decisão
  de arquitetura separada, não parte deste contrato.
- Qualquer medição de quanto a divergência realmente acontece hoje nos 12 replays já rodados — essa é
  a Missão 1 recomendada no Red Team, e deveria vir **antes** de qualquer implementação deste contrato,
  para saber se o problema é raro ou frequente na prática.

---

## Tabela

| Tema | Como funciona hoje | Risco atual | Contrato recomendado | O que ainda não implementar |
|---|---|---|---|---|
| **Fonte da atenção** | `motor.js` elege `sess.active.sit` por severidade+`DEBOUNCE`+`COOLDOWN` (`motor.js:264-270`) | Nenhum — mecanismo único e já claro | `sess.active.sit` continua e se formaliza como a única fonte da verdade sobre qual tensão está sendo atendida | — |
| **Slot de atenção vs. Ação** | `decisao.js:decidir()` roda sobre **todo** `snap.sits`, ignorando qual venceu o slot; 2 de 5 tipos de candidato nem vêm de `sits` (vêm de `ctx.wP`/`ctx.wE` direto) | Ação exibida pode ser sobre tensão não relacionada à que abriu o foco | `decidir()` deve receber a tensão ativa e ranquear só candidatos causalmente ligados a ela | Filtro de escopo em código; mapeamento `kind→tipo` ainda não decidido |
| **Foco dominante** | = `sess.active.sit`, já bem definido | Nenhum | Mantém a definição atual — é sobre **onde** a atenção está | — |
| **Ação dominante** | = vencedor de `score` em `decisao.js`, sobre universo irrestrito | Pode ser sobre tensão diferente da dominante | Deve ser a melhor ação **dentro do escopo** da tensão dominante, nunca fora | Critério de "melhor ação restrita" — depende do mapeamento `kind→tipo` (§10) |
| **Divergência entre motor e decisão** | Não medida, não documentada antes deste contrato | Contradição silenciosa entre por que interrompeu e o que foi pedido para fazer | Divergência de especificidade (mesma causa, alvo mais específico) é aceitável; divergência de causa raiz é proibida | Telemetria/medição de frequência real da divergência (Missão 1 do Red Team) — fazer antes de codar |
| **Comportamento em múltiplos `sits`** | `sits.sort()` define 1 vencedor do slot; `decisao.js` reavalia `score` sobre todos, podendo escolher um `sits` diferente do vencedor de severidade | Foco pode "vazar" para tratar de tensão secundária sem nunca ter sido comunicada como tal | Tensões não-vencedoras continuam em Ambiente (comportamento já correto); ação dominante só pode nascer da vencedora | Hierarquia de múltiplas ações ou múltiplos focos simultâneos — continua proibido: 1 foco, 1 ação, sempre a mesma causa |
