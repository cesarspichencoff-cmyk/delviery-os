# Brief de experiência — Operação Viva V4

> Direção da rota experimental `/lab/operacao-viva-v4`, escrita depois de ela existir e ser olhada
> no navegador. **Não é autoridade visual.** A autoridade continua sendo
> `docs/design/VISUAL_REFERENCE_HIERARCHY.md`: Sprint Visual DeliveryOS V2 → Organismo Operacional
> V3.3 → handoffs → Design System atual → `app-v1` (histórico, nunca direção).
>
> Missão `REVOLUTION 0-A`, 2026-08-04/05. Nenhuma fonte foi escolhida, baixada ou commitada.

---

## 1. O que a rota precisa responder, e em que ordem

A ordem de leitura é a do próprio produto, e ela decide o layout inteiro:

1. **como está a operação** — modo, título, pulso;
2. **o que falta para dizer isso** — o bloco de rebaixamento, quando existe;
3. **o que merece atenção agora** — o Foco, com uma orientação só;
4. **de onde veio** — evidência, fontes e saúde, dentro do próprio Foco;
5. **o caminho do pedido** — o organismo, com as seis unidades;
6. **o que segue ativo** — Ambiente, nunca escondido pelo Foco;
7. **o que a operação devolve** — o Modo de Validação;
8. **aprofundamento** — fontes em detalhe, ausências conhecidas, consolidação, limitações.

Os itens 1–7 ficam **sempre abertos**. O item 8 recolhe em `<details>` inline, com a manchete e a
contagem no `summary`. Isso **não** é "esconder em modal" — é aprofundamento em linha, no fluxo da
página, alcançável por teclado e presente no DOM.

**Por que o recolhimento existe:** a primeira versão tinha **8346 px de altura** no desktop. Dez telas
de rolagem para uma leitura só é densidade sem hierarquia, que a missão proíbe em letra própria.
Depois do recorte: **4184 px**. A saúde das fontes ganhou uma **tira compacta sempre visível**, porque
recolher o detalhe não pode virar esconder a ausência.

---

## 2. As quatro referências tipográficas — o que elas realmente dizem

Salvas pelo César em `docs/design/references/typography/`. Foram **abertas e olhadas** nesta missão.

| Referência | Superfície fotografada | Luz |
|---|---|---|
| `superior-serif-reference.jpeg` | lã oliva sobre ombro, macro | lateral, rasante |
| `nyght-reference.jpeg` | nogueira polida, curva de móvel | quente, âmbar, refletida |
| `remark-reference.jpeg` | campo de capim verde-profundo em movimento | difusa, de cima |
| `redaction-reference.jpeg` | bouclé creme, macro, fundo preto | rasante, contraluz |

**O que as quatro têm em comum, e é isso que orienta:**

- **serifa editorial de alto contraste**, larga e opticamente generosa — não é serifa decorativa de
  display, e não é serifa de corpo de texto. É título;
- texto em **creme puro**, sempre sobre **material natural fotografado**, nunca sobre cor chapada;
- **profundidade por foco raso e queda suave de luz** — não por sombra desenhada nem por gradiente;
- **vazio generoso** acima e abaixo do bloco de texto; o assunto respira;
- nenhuma delas tem borda, contorno, cartão ou moldura.

**O achado que vale registrar:** a paleta das quatro referências é, item por item, a paleta do
Organismo Operacional V3.3 — verde profundo, verde vivo/oliva, âmbar de nogueira, creme. As
referências que o César escolheu por instinto e o cânone visual que já estava no repositório
**concordam**. Isso não é coincidência a explorar: é confirmação de que a direção não precisa mudar.

### O que isto vira na tela, sem escolher fonte

- o **título do modo** e o **nome de cada unidade** usam a família serifada já declarada em
  `--org-serifa`; a superfície V4 não introduz família nenhuma;
- o **creme sobre verde profundo** é a relação de leitura principal, e o âmbar só entra quando há
  tensão;
- a **profundidade** vem de gradiente sutil de painel e de escala por degrau, nunca de sombra
  decorativa nem de vidro;
- o **vazio** é o que separa Foco, organismo e Ambiente — não linhas.

### O que a missão proíbe, e foi respeitado

**Identidade não confirmada:** os nomes escritos nas imagens **não identificam as famílias**.
`Superior Serif` e `Remark` seguem sem origem confirmada; `Redaction` (MCKL) e `Nyght Serif` (TDC)
têm origem conhecida. **Nenhuma fonte foi escolhida, baixada, instalada ou commitada.** Typography Lab
é missão separada.

---

## 3. Como a pressão se apresenta

Herdado do V3.3 sem reinterpretação:

- **degrau, nunca porcentagem no tamanho.** `data-degrau` 0–3 decide escala, brilho e palavra. A
  porcentagem aparece como texto, ao lado da carga, e não como o tamanho da coisa;
- **não existe vermelho na paleta.** O topo da pressão é âmbar mais escala. `cor: "vermelho"` é nome
  de degrau no view model, e vira o âmbar mais forte na superfície;
- **cor nunca é o único sinal.** Cada degrau muda também o tamanho, o brilho do ponto e o texto de
  estado — quem não distingue cor continua lendo;
- **ausência tem duas línguas, e elas não se misturam.** Falta de integração fala em **neutro
  tracejado** (forma, não só cor); falha de leitura fala em **cinza-ardósia**, que nunca se confunde
  com pressão.

---

## 4. Movimento

Deriva de `docs/figma/MOTION_SYSTEM.md` e `MOTION_TOKENS.json`, por token — o Lab não declara duração
própria. **Nenhuma biblioteca instalada.**

O que se move, e só isso:

| Movimento | Comunica |
|---|---|
| pulso do ponto da unidade saudável | a fonte está viva |
| chegada do bloco de estado na troca de cena | informação nova entrou |
| transição de borda e escala da unidade | o degrau mudou |
| transição do selo de validação | um veredito foi registrado |

`prefers-reduced-motion: reduce` zera animação **e** transição. Medido, não inferido: com
`reducedMotion: "reduce"` o gate conta **0 animações** e a **contagem de caracteres fica idêntica** —
nenhuma informação vive só no movimento.

---

## 5. O que foi deliberadamente evitado

Da lista da missão §11, e cada um com o que entrou no lugar:

| Evitado | O que entrou no lugar |
|---|---|
| dezenas de cards iguais | seis unidades com peso diferente, num caminho, não numa grade |
| gradiente automático roxo/azul | gradiente de painel em verde profundo, dois passos, dos tokens |
| glassmorphism gratuito | nenhum desfoque; profundidade por luz e escala |
| três colunas idênticas | fileiras na ordem do pedido: entrada, produção, fechamento, saída |
| sidebar por reflexo | nenhuma navegação lateral; a rota é uma leitura só |
| animação de entrada em tudo | quatro movimentos, todos com função declarada |
| informação crítica em modal | zero modais; aprofundamento em `<details>` inline |
| densidade sem hierarquia | revelação progressiva, e a altura caiu 50% |
| falsa sensação de precisão | `Confiança: não estimada`, escrito, sem percentual nem cor |

---

## 6. Acessibilidade

- **teclado:** link de pular conteúdo, seletor de cena, todos os campos de validação e os botões são
  alcançáveis; `:focus-visible` com contorno em verde vivo, medido no gate;
- **sem cor:** todo estado carrega rótulo em texto além da cor; ausência carrega também **forma**
  (traço) e o `summary` de cada bloco recolhido carrega contagem;
- **leitor de tela:** a região da leitura é `aria-live="polite"` — nunca `assertive`, porque nada aqui
  interrompe quem está lendo outra coisa;
- **responsividade:** três viewports medidos, e nenhum deles rola na horizontal.

---

## 7. Pontos de extensão preservados para 0-B

Sem bloquear nada em 0-A:

- `--org-serifa`, `--org-interface` e `--org-mono` são os únicos lugares onde uma família é nomeada:
  trocar a fonte em 0-B é trocar três tokens, servidos do produto;
- `ValidationRepository` é interface: a persistência sai de IndexedDB sem reescrever o Modo de
  Validação;
- os oito estados de fonte já têm significado, consequência, confiança permitida e ação — só falta
  fonte real;
- o organismo é montado de `CAMINHO_DO_PEDIDO_V4`, então uma unidade nova entra por dados.

## 8. O que este brief não decide

Não escolhe fonte · não altera `docs/figma/` · não altera a home oficial · não promove o Lab a
produto · não substitui a validação do César. A promoção do Lab é **missão separada**.
