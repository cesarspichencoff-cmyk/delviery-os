# M1B-R2 — o que o César precisa olhar

> Sem cabeçalho `lifecycle:` de propósito. Este arquivo **não é autoridade** —
> é um guia de leitura de um pacote de capturas. Quem responde pelo escopo
> `evidence` é `docs/execution/EVIDENCE.jsonl`, e um escopo tem um dono só
> (guarda `G5`). Capturado em `3e19f56`, 2026-08-20.

Dez itens. O material técnico completo (24 combinações de cena × largura, com
medições) fica fora deste pacote, em `docs/design/m1b-evidencia/`.

**Procedência de tudo aqui:** capturas de uma build de **DEMONSTRAÇÃO**, servida
pelo próprio produto no worktree M1 (`3e19f56`, porta 5292, procedência de
servidor provada antes de qualquer captura). Pedidos, tempos e cargas são
fixture; regras, cardápio e limiares são reais. **Nada aqui é operação real.**

**O que este pacote NÃO é:** aprovação. Eu sou o construtor. A régua de 10/10 é
sua, e nenhuma destas imagens vale como “passou”.

---

| # | Arquivo | O que olhar — uma coisa por item |
|---|---|---|
| 01 | `01_DESKTOP_CALMO.png` | Calmo tem **presença** ou virou tela vazia? Silêncio deveria parecer saúde, não ausência de conteúdo. |
| 02 | `02_DESKTOP_AMBIENTE.png` | A operação parece **território** ou ainda um diagrama numa caixa? A moldura do cartão saiu; o chão agora é contínuo. |
| 03 | `03_DESKTOP_FOCO.png` | Compare com o 02: o Foco **reorganiza o espaço** ou só acrescentou um bloco? A decisão desceu para a coluna da leitura, a fileira do Foco ficou inteira e as outras recuaram. Antes o Foco era uma coluna à direita e a operação perdia 56% do território para ele. |
| 04 | `04_TABLET_768.png` | Uma coluna, largura inteira. A operação continua legível sem virar resumo? |
| 05 | `05_MOBILE_414_primeira_tela.png` | **Primeira tela, sem rolagem.** Dá para dizer qual é o estado e qual relação importa? |
| 06 | `06_MOBILE_375_primeira_tela.png` | Idem em 375. |
| 07 | `07_MOBILE_320_primeira_tela.png` | Idem em 320 — a largura onde a operação tinha **zero pixel** de território antes desta missão. |
| 08 | `08_DEGRADADO.png` | Falha técnica cinza. Ela se confunde em algum momento com **pressão** operacional? Se confundir, é defeito grave. |
| 09 | `09_REDUCED_MOTION_FOCO.png` | Mesma cena do 03 com movimento reduzido. Falta alguma **informação**? Deveria faltar só movimento. |
| 10 | `10_ANTES_ambiente_1440.png` × `10_DEPOIS_ambiente_1440.png` | Mesma cena, mesma largura, página inteira dos dois lados, sem corte. |

---

## Sobre o item 10 (comparação justa)

Mesma cena (`ambiente`), mesma largura (1440), **página inteira** nos dois — sem
recorte escolhido, sem pegar o pior estado antigo contra o melhor novo. O “antes”
é a captura que a rodada anterior já tinha commitado em
`docs/design/m1b-evidencia/antes/`.

A altura do documento caiu de ~10.308px (antes do M1B) para 2.005px. **Isso não é
prova de qualidade** — prova que havia excesso vertical e que ele saiu. Presença,
hierarquia e identidade são o que você tem que julgar olhando, e é para isso que
os itens 01–09 existem.

## O que eu sei que ainda não está resolvido

- **Sete reprovações de contraste WCAG AA**, todas do **mesmo** token canônico
  `--org-verde-texto-5` (#5f7a62), em texto recuado: 3,85 e 4,01 contra um piso
  de 4,5. O mínimo que passa preservando matiz e saturação é `#68866c` (4,52 e
  4,70). **Não apliquei**: valor canônico de marca não se muda em silêncio.
  Está em `docs/execution/PERGUNTAS.jsonl` como **Q-014**, com
  `default_behavior: PAUSE`. Todo o resto do vazamento de contraste — de 21 para
  7 — já foi corrigido por escopo local, sem tocar em nenhum valor de marca.

- **Leitor de tela real: NÃO TESTADO.** Foram medidos landmarks, estrutura de
  cabeçalhos, nomes acessíveis, foco visível, ordem de tabulação, alvo de toque
  e contraste. Nada disso substitui NVDA ou VoiceOver com uma pessoa usando.
  Onde eu não medi, está escrito que não medi.

- **Primeira tela no celular.** Em 375 a dobra entrega estado, pulso e as
  relações ativas — não entrega onde está a pressão nem o que está ausente.
  Parte do que come a dobra é chrome de **fixture** (faixa de demonstração e as
  quatro cenas) que **não existe numa build real**; a outra parte é o shell.

- **A lateral do shell** continua dominando o desktop. Ela é Nível 4 e está fora
  do que esta missão foi autorizada a redesenhar.

- **A marca "DeliveryOS" trunca em 320px** (81px de texto em 48px de espaço,
  com reticências). É nome de marca, não informação operacional, e a faixa
  acima diz "DELIVERYOS PRODUCT SYSTEM" inteiro. Medido: nenhum texto do
  organismo vaza ou é recortado em 320, 375 ou 414.

- **Cabeçalhos**: o `h1` agora existe e é o estado da operação. Os `h2` dos
  grupos da navegação vêm **antes** dele no DOM — artefato de ordenação do
  shell, dentro de um landmark `<nav>`. Não é falha de WCAG, mas não é o ideal.

- **Repetição de frase.** A mesma sentença aparece na massa e na lista completa
  de sinais atrás da dobra. É o "recuar nunca é sumir" funcionando, mas vale sua
  opinião se incomoda.

## O que passou a ser testado contra si mesmo

Onze mutações semânticas e temporais, cinco perceptivas medidas em geometria
real, e as nove do Lab que **durante meses nunca chegaram a ser aplicadas**.
Cada uma prova que foi aplicada (hash antes → depois, conferido no disco),
que alguma guarda a acusou, e que o arquivo voltou byte a byte.

Três instrumentos meus estavam errados e foram corrigidos — dois deles
**escondiam** defeito, e um **inventava**. Está tudo escrito nos commits.
