# Interface V1 (interna, descartável)

Primeira superfície mobile da V1 — prova a tese visual mínima do
`docs/Contrato_Estado_Cognitivo_V1.md`: Calmo existe, Ambiente existe, Foco aparece quando vale
gastar atenção, com ação dominante segura ou **foco puro com dignidade**. Se precisar ser
reconstruída depois da validação, isso é sucesso, não fracasso.

## Como rodar

```bash
node tools/gerar_janela_v1.js   # 1) prepara a janela real 01/07 (uma vez; sai em data/generated/, fora do Git)
node tools/servir_v1.js        # 2) serve em http://localhost:5179/  (no celular: IP da máquina na mesma rede)
```

Abrir no navegador do celular ou desktop. Os controles no rodapé são do **replay de demonstração**
(janela histórica real) — não fazem parte do produto operacional.

## Regras que esta superfície obedece (e que qualquer sucessora deve obedecer)

- Cérebro real, sem cópia: carrega `src/perfil-delivery/motor.js` + `decisao.js` por `<script>`.
- `DECISAO.decidir(R, INFO, { fonteReal: true, active: sess.active })` — **sempre com `active`**.
- `rec === null` → foco puro (`buildFoco()`), sem bloco de ação e sem pedir desculpa.
- Só composição real (janela 01/07: 238 pedidos, 744 itens, 100% casados com o seed).
- Observação do cliente aparece **completa** (vinda de `INFO`, fonte primária), com aviso
  "conferir na comanda" — nunca truncamento silencioso (defeito E2 do contrato, neutralizado na
  superfície sem tocar o motor).
- Markup `<b>` dos textos do motor é removido (E4) — tudo renderiza como texto puro.
- Sem dashboard, sem lista, sem KPI, sem segundo foco, sem ação em Ambiente.

## Camada de apresentação (pacote de correções V1)

- Copy sem travessão, meia-risca, seta ou ponto médio; frases com maiúscula inicial; linguagem de
  bancada ("Duplas precisam de atenção", "Tem mais pedidos que o normal"). A tradução é só
  apresentação — nunca muda causa raiz, nunca inventa dado, nunca altera a decisão.
- Todo foco com pedido-alvo mostra "Pedido #curto" (ID curto real do iFood, exposto pelo gerador).
- Desktop: "Por que agora" concreto + no máximo 3 evidências (pedidos/itens que puxam a atenção,
  com item real e tempo de espera) + resumo em 1 frase. Mobile não mostra evidências.
- Som opcional ao ENTRAR em foco (WebAudio, 2 notas curtas, padrão desligado, botão no rodapé).
  Só toca durante o replay tocando; nunca repete dentro do mesmo foco.

## Correção de apresentação multi-praça (docs/Auditoria_Praca_Comanda_Atencoes_V1.md)

A auditoria mostrou que 70-87% dos pedidos dependem de mais de uma bancada (um combinado é montado
em combinados + duplas + enrolados). Antes, quando o foco era numa praça **dependente**, o cartão
mostrava um item de combinados sem explicar a dependência múltipla — dava a sensação errada de item
em praça errada. Correção, **só apresentação, usando `I.benches` que o motor já produz**:

- Cartão: quando o pedido-alvo depende de várias bancadas, uma linha curta explica. Se o foco é numa
  praça, prioriza-a: "Atenção agora em Enrolados. Pedido também depende de Combinados, Quentes e
  Duplas." Caso contrário: "Pedido depende de Combinados, Duplas e Enrolados."
- Desktop: cada pedido de evidência ganha "Também passa por X e Y." quando é multi-praça.
- Pedido de bancada única (ex.: fechamento, que é `pracaUnica`) **não** recebe linha de dependência
  — evita mensagem redundante.
- Nenhum item é rotulado com praça errada; a praça real do item nunca muda; motor/seed/decisão
  intocados.

## Mapa de Ambientes no estado Ambiente (docs/Mapa_Ambientes_V1.md)

O estado **Ambiente** mostra os 6 ambientes reais da operação (Caixa, Sushi, Quentes, Cozinha,
Conferência, Motoboy) — só quando `mode === "ambiente"`. Cada cartão tem nome, estado e motivo
curto; a **cor é o significado** (verde = tudo fluindo, amarelo = atenção, vermelho = virando foco,
neutro = em validação). Mobile: uma coluna. Desktop: grade 3×2. Não é dashboard: 6 cartões, pouco
texto, sem número, sem gráfico, sem tabela.

Cada cor vem **só de dado que o motor já produz** (nada inventado):
- **Sushi** = severidade das praças combinados + duplas + enrolados.
- **Quentes** = severidade da praça enrolados quentes (Hot Roll etc.), ancorada nas próprias
  palavras do César ("Hot Roll, enrolados quentes").
- **Conferência** = há pedido pedindo conferência reforçada (sinal por pedido, não fila de estação).
- **Motoboy** = saída travada (prontos parados na expedição, sinal `saida`).
- **Vermelho** só aparece em severidade 3 (praça a 2× do baseline) — nunca decorativo.

**Honestidade obrigatória — Caixa e Cozinha ficam "Em validação":**
- **Caixa** não é modelada pelo motor (não há dado de fila de comanda) → "Fonte atual ainda não mede
  esta fila".
- **Cozinha** carrega a colisão de nome documentada no Mapa de Ambientes: o motor rotula a praça
  `cozinha_quentes` como "Quentes", e a separação fina Quentes × Cozinha não foi validada pelo
  César → "Separação fina ainda depende do mapa operacional". Não inventamos essa separação.
- **Calmo continua simples** (só o pulso "Em fluxo"); **Foco continua soberano** (cartão + pílula).
  O mapa pertence só ao Ambiente. Motor, seed e decisão intocados.

## Barra de pressão por ambiente

Cada cartão do Mapa de Ambientes ganhou uma barra fina. **É leitura visual de carga operacional, não
uma nova decisão** — nunca recalcula o Foco, nunca substitui `sess.active.sit`.

- **Sushi e Quentes** (têm baseline real no motor): pressão = `load/baseline` mapeado linearmente
  (baseline = 50%, limiar de severidade 3 "virando foco" = 100%). Cresce de forma contínua antes
  mesmo da cor mudar — mostra "quão perto" de virar Foco, não só o estado discreto atual.
- **Conferência e Motoboy** (só severidade, sem baseline próprio): escala conservadora por
  severidade (sem situação 15%, severidade 1 → 35%, severidade 2 → 60%, severidade 3 → 90%).
- **Caixa e Cozinha** (em validação): barra sem preenchimento e sem número, com textura neutra —
  nunca finge uma medida que não existe.
- A cor da barra é sempre a mesma cor do cartão (verde/amarelo/vermelho) — nunca uma cor própria que
  possa contradizer o texto do cartão.

## Sinais de Fluxo no Calmo (docs/Logica_Embalagens_DeliveryOS_V0.md)

O Calmo ganhou uma área discreta abaixo do pulso, **só quando há algo acionável** (se não houver
nenhum sinal, o bloco inteiro não aparece — nunca mostra área vazia). Objetivo: "está tudo sob
controle, mas você já pode adiantar isso." Nunca compete com o "Em fluxo"; nunca aparece no Ambiente
ou no Foco.

- **Duas sacolas**: critérios fortes da lógica de embalagens — quente de cozinha + frio no mesmo
  pedido (usa `I.temQuente`/`I.temFrio`, dado real do motor), bebida grande (720 ml/vinho/saquê por
  nome) ou 6+ latas. Critérios de volume/estabilidade da caixa **não foram automatizados** (exigiriam
  simular a matriz de caixas inteira — fora do escopo desta V0; ver Pendências).
- **Só quente**: leitura direta de `I.soQuentes` (`temQuente && !temFrio`), já calculado pelo motor —
  nenhuma classificação nova, só apresentação.
- **Só sobremesa**: todos os itens do pedido são da praça sobremesa (inclui mochi).
- **Itens puxando o fluxo**: itens dos pedidos em produção agora, agrupados por categoria (Dyo,
  Temaki, Uramaki, Hosomaki, Hot Roll, Sashimi, Battera etc. — nomes padronizados do documento de
  embalagens), contados por quantidade. Combinados contam pelo próprio nome (produto fechado, não
  decomposto em categoria genérica).
- **Classificação V0 é só visual** (`classificarCategoriaOperacionalV0` e as funções `detectarXV0`
  em `app-v1/app.js`) — não é motor definitivo de embalagem, não altera pedido, não persiste nada.
  Onde o nome não bate com nenhuma categoria conhecida, o item simplesmente não entra na contagem
  (nunca inventa categoria).
- **Comanda ainda não é fonte digital** (ver Auditoria de Praça/Comanda) — todo sinal usa o **ID
  curto real do iFood** como identificador ("Pedido #1234"), nunca comanda inferida.
- Limite rígido: no máximo 5 pedidos por sinal (resto vira frase resumida), no máximo 6 categorias em
  "itens puxando o fluxo" no desktop (3 num resumo compacto no mobile). Qualquer incerteza na
  classificação faz o item **não aparecer** no sinal, nunca aparecer como se fosse certeza.

## Limitações declaradas

- Replay de janela histórica — não é operação ao vivo (não existe fonte contínua do iFood ainda).
- **Comanda não existe na origem:** nenhum export do iFood (pedidos ou logística) traz o número da
  comanda; a coluna `ID DO PEDIDO NA INTEGRADORA` vem vazia. A interface mostra "Comanda não
  informada" — nunca inventa. Quando houver fonte com comanda (impressora/integradora), o gerador
  ganha o campo e a interface passa a exibir os 3 finais.
- O protótipo antigo (`prototipos/parados-agora/`) contém lógica anterior à correção Motor × Decisão
  e **não** deve ser usado como demo da V1.
