# Auditoria — Praça, Comanda e Atenções Leves (Interface V1)

> Missão bloqueante antes de qualquer Atenção Leve no Calmo (Correções 11, 12, 13 do primeiro
> pacote). **Diagnóstico apenas. Nenhum código foi alterado.** Sobre o commit `5edb107`. Medições
> feitas com o cérebro real (`motor.resolver`) sobre as 2 janelas reais já geradas (01/07 e 23/06),
> reproduzindo o mesmo caminho da interface (`app-v1/app.js`, `evidenciasDe`, linha 173).
> `motor.js` e `decisao.js` intocados.

---

## Resumo executivo

- **Nenhum item aparece com praça errada.** Na copy visível, item nenhum é rotulado com praça —
  só o nome do item é exibido. O seed não tem desalinhamento nome↔praça (0 casos).
- **O problema real é multi-praça mal explicado, não dado errado.** 87% (01/07) e 70% (23/06) dos
  pedidos dependem de mais de uma bancada. Um Combinado depende de combinados + duplas + enrolados
  (às vezes + quentes). Quando o foco é numa praça **dependente** (ex.: Enrolados), a evidência
  mostra "Combinado Kids" sem dizer que o pedido também depende de outras praças. É confuso, mas
  **o dado está correto** e o foco dominante do motor está certo.
- **Comanda não existe em nenhuma fonte atual.** Zero pedidos com comanda nas 2 janelas. O melhor
  identificador é o número curto do iFood, confiável dentro de uma janela (1 colisão em 238; 0 em
  116). "Comanda não informada" é honesto.
- **Atenções Leves: quase todas dependem do mapa operacional do César.** "Duas sacolas" (61%/47%)
  e "várias praças" (87%/70%) são comuns demais para virar sinal — virariam ruído. Nenhuma tem
  comanda para identificar o pedido na bancada.

---

## Auditoria 1 — Praça correta dos itens

**Como o item chega à praça (caminho real):**
`seed.praca_principal` → `adaptarItem` (`item.praca = praca_principal`) → `resolver` agrega
`benches = prodPr + depPr` (praça principal + `pracas_dependentes`) → interface exibe **só o nome
do item**, nunca uma praça ao lado dele.

**Respostas às perguntas obrigatórias:**
1. Combinado exibido como Enrolados? **Não como rótulo.** Um Combinado *aparece na lista de
   evidências de um foco de Enrolados* (porque depende da bancada de enrolados), mostrando o nome
   "Combinado Kids" — sem afirmar que ele "é" enrolados. 65 ocorrências em 01/07, 8 em 23/06.
2. Combinado exibido como Duplas? **Mesmo caso** — pode aparecer sob foco de Duplas (também é
   praça dependente do combinado). Nunca como rótulo de praça.
3. Item de uma praça exibido em outra? **Não.** Nenhum item recebe rótulo de praça na interface.
4. Problema no seed/cardápio? **Não.** 0 itens com nome sugerindo praça diferente da
   `praca_principal`. Combinados têm `pracas_dependentes: ["duplas","enrolados",...]` — isso é
   **correto**: combinado é montado em várias bancadas.
5. Problema no gerador da janela V1? **Não.** O gerador só passa `item_nome`, `quantidade`,
   `observacao`; o casamento com o seed é 100% (744/744 e 320/320).
6. Problema na camada visual? **Aqui sim, parcialmente.** `evidenciasDe` (app.js:173) faz
   `I.itens.find(x => x.praca === pracaFoco) || I.itens[0]`. Quando o foco é numa praça
   **dependente** e o pedido é um Combinado (item com `praca = combinados`), o `find` falha e cai
   no `itens[0]` (o combinado). Resultado: mostra o combinado sob um foco de enrolados/duplas, sem
   explicar a dependência múltipla.
7. Só pedido multi-praça mal explicado? **Exatamente isto.** É a natureza do caso.
8. Texto ruim, dado correto? **Sim** — o dado (`benches`, `nBenches`) está certo e disponível; a
   interface só não o mostra.
9. Dado realmente errado? **Não.**

**Conclusão da Auditoria 1:** não há praça errada. Há **omissão da dependência múltipla** na
apresentação. A correção segura (futura) é a interface dizer "Depende de Combinados, Duplas e
Enrolados" usando `I.benches` que já existe — sem tocar no motor.

## Auditoria 2 — Comanda e identificadores

**Campos que chegam ao pedido na janela V1:** `id, curto, r, p, s, e, c` — nada mais.

| Identificador | Existe? | Confiável? |
|---|---|---|
| Número curto do iFood (`curto`) | **Sim**, 100% dos pedidos | Dentro de uma janela sim (01/07: 1 número repetido em 238; 23/06: 0). Entre meses repete ~34% (memória do projeto) |
| ID completo (UUID) | Sim (interno) | Único, mas impossível de gritar na bancada |
| ID da integradora | **Coluna existe, sempre vazia** | Inútil hoje |
| Número da comanda | **Não existe em nenhum export** | — |
| Sequência da comanda | **Não existe** | — |

**Respostas:**
1. Comanda real em alguma fonte atual? **Não.** Nem no relatório de pedidos, nem no de logística.
2. Sequência da comanda? **Não.**
3. Campo confiável com os 3 últimos da comanda? **Não.**
4. `ID DO PEDIDO NA INTEGRADORA` sempre vazia? **Sim**, nas amostras auditadas.
5. ID curto do iFood confiável para exibição? **Sim, dentro da janela** — com a ressalva da colisão
   rara (2 pedidos com o mesmo número num período longo).
6. "Comanda não informada" é honesto? **Sim** — é a resposta correta: não inventa, não esconde.

**Conclusão:** a comanda, que a missão diz ter prioridade operacional, **não existe na origem
digital**. Ela vive só no papel da bancada. Sem uma nova fonte (impressora/KDS/integradora), a
interface não pode mostrá-la. O fallback correto é o número curto do iFood.

## Auditoria 3 — Pedidos multi-praça

**Volume:** 206/238 (87%) em 01/07 e 81/116 (70%) em 23/06 dependem de 2+ bancadas. **Multi-praça é
a norma, não a exceção.**

**Respostas:**
1. Interface deixa claro qual praça agir agora? **Sim** — o título do cartão nomeia a praça do foco
   (ex.: "Combinados segurando o fluxo"), que é a bancada gargalo escolhida pelo motor.
2. Interface deixa claro que o pedido também depende de outras praças? **Não.** Esta é a lacuna —
   `I.nBenches`/`I.benches` existem mas não são exibidos.
3. Algum multi-praça parecendo erro de praça? **Sim, na percepção** — combinado sob foco de
   enrolados sem explicação pode ser lido como erro. É apresentação, não dado.
4. Foco dominante continua correto? **Sim** — o motor elege a bancada gargalo; não foi tocado.
5. Ação dominante continua segura? **Sim** — troca proibida = 0, inalterada.

**Conclusão:** o foco e a ação estão certos. Falta a interface **nomear a dependência múltipla**
(dado já disponível). Correção futura de apresentação, sem motor.

## Auditoria 4 — Atenções Leves no Calmo (viabilidade, sem implementar)

Volume de cada candidata (proporção de pedidos da janela):

| Atenção Leve | 01/07 | 23/06 | Dado hoje | Regra hoje | Veredito de viabilidade |
|---|---:|---:|---|---|---|
| Duas sacolas | 61% | 47% | `segundaSacola` (heurística do motor: combo OU ≥8 itens) | Proxy, **não confirmada** | **Comum demais → ruído.** Precisa da regra real do César |
| Só quente | 14% | 23% | `soQuentes` (temperatura dos itens, real) | Derivada | Volume ok, mas **conceito operacional** (sacola quente separada?) precisa do César |
| Várias praças | 87% | 70% | `nBenches>1` (real) | Existe | **Comum demais → inútil** como sinal leve |
| Observação importante | 0% | 17% | `temObservacao` (texto real do item) | Real | **Mais confiável quando existe**, mas inconsistente entre janelas (01/07 sem obs no parse) |
| Pedido simples p/ adiantar | 13% | 30% | `pracaUnica` (real) | Existe | Candidata razoável, mas "adiantar" precisa de regra do César |

**Respostas por candidata (dado confiável / regra documentada / precisa do César):**
- **Duas sacolas:** dado é heurística, não medição; regra não documentada; **precisa do César**.
- **Só quente:** dado real (temperatura); regra operacional (o que fazer) **precisa do César**.
- **Várias praças:** dado real, mas comum demais para ser sinal — **não recomendado** como Atenção
  Leve sem um recorte (ex.: 3+ bancadas E esperando).
- **Observação:** dado real; **mais pronto**, mas depende de a janela ter observações e de nunca
  truncar (E2 do motor, ainda aberto).
- **Pedido simples para adiantar:** dado real (`pracaUnica`); **precisa do César** definir quando
  vale adiantar.

**Identificação mínima para ser acionável:** toda Atenção Leve precisaria de um identificador que a
equipe localize na bancada. Hoje só existe o número curto do iFood — **não há comanda**. Então o
formato desejado ("Comanda 087 / Duas sacolas") **é impossível hoje**; o máximo seria "Pedido #4268
/ Duas sacolas", com a ressalva de que a equipe usa comanda, não número do iFood.

## Auditoria 5 — Regras que NÃO podem ser inferidas

O sistema não pode, sozinho e com honestidade, decidir:
1. Se "duas sacolas" da heurística (combo ou ≥8 itens) bate com a realidade da bancada.
2. O que significa operacionalmente "só quente" (sacola separada? prioridade? nada?).
3. Quando um pedido "vale adiantar" (limiar, contexto).
4. Como a equipe encontra o pedido na bancada (comanda física, sequência, papel).
5. Se existe alguma fonte digital que traga ou possa trazer a comanda.

Inferir qualquer uma seria inventar operação — proibido pelo Manifesto e pela regra central desta
missão.

---

## Perguntas objetivas para o César (respondíveis por áudio)

1. **Comanda:** quando o pedido chega na cozinha, de onde vem o número de comanda que vocês usam na
   bancada? É impresso pela impressora do iFood, digitado por alguém, ou vem de outro sistema?
2. **3 últimos da comanda:** esses 3 números são sequenciais do dia (001, 002, 003...) ou têm outra
   lógica? Zeram todo dia?
3. **Fonte digital:** existe algum arquivo, tela ou sistema (KDS, impressora, integradora) que
   guarde o número da comanda junto do pedido? Se sim, dá para exportar?
4. **Duas sacolas:** o que faz um pedido virar "duas sacolas" na prática? É combinado grande? É item
   frio + quente junto? Quantos itens? Quem decide?
5. **Só quente:** "só quente" muda o que a equipe faz (sacola separada, prioridade)? Ou é só uma
   característica sem ação?
6. **Várias praças:** quando um combinado passa por várias bancadas, o que a equipe precisa saber na
   tela: qual bancada está segurando, ou todas as que faltam?
7. **Adiantar:** que tipo de pedido vale "adiantar" quando está calmo? O simples de uma bancada só,
   ou outro critério?
8. **Mapa de praças:** existe algum item que hoje está na bancada errada no seu entender? (para
   cruzar com o `data/cardapio_knowledge_seed.json`).

---

## Recomendação para a próxima missão

1. **Antes de qualquer Atenção Leve:** obter as respostas 1-8 do César (o mapa operacional). Sem
   elas, só "observação" e "pedido simples" seriam defensáveis, e ainda assim sem comanda.
2. **Correção de apresentação segura e independente do César** (candidata a missão própria, sem
   motor): a interface passar a mostrar a **dependência múltipla** ("Depende de Combinados, Duplas e
   Enrolados") usando `I.benches`, resolvendo a confusão do combinado sob foco de praça dependente.
   Isso é 100% apresentação, dado já existente, e ataca o único problema real encontrado.
3. **Comanda:** tratar como bloqueio de dado de origem — só avança com uma fonte nova (resposta 3).

---

## Confirmações

- **Nada foi implementado.** Nenhuma Atenção Leve, nenhuma regra nova, nenhum sinal no Calmo.
- **`motor.js` e `decisao.js` intocados** (diffs vazios).
- Único arquivo criado: este relatório (`docs/Auditoria_Praca_Comanda_Atencoes_V1.md`), diagnóstico.
- Combinados **não** aparecem com praça errada; o achado é multi-praça sem explicação (apresentação).
- Comanda **não existe** na origem; identificador atual = número curto do iFood.
