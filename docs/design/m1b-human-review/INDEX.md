# M1B-R2 — o que o César precisa olhar

> Sem cabeçalho `lifecycle:` de propósito. Este arquivo **não é autoridade** —
> é um guia de leitura de um pacote de capturas. Quem responde pelo escopo
> `evidence` é `docs/execution/EVIDENCE.jsonl`, e um escopo tem um dono só
> (guarda `G5`). Capturado em `0d34287`, 2026-08-13.

Dez itens. O material técnico completo (24 combinações de cena × largura, com
medições) fica fora deste pacote, em `docs/design/m1b-evidencia/`.

**Procedência de tudo aqui:** capturas de uma build de **DEMONSTRAÇÃO**, servida
pelo próprio produto no worktree M1 (`0d34287`, porta 5292, procedência de
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

- **Primeira tela no celular.** Em 375 a dobra entrega estado, pulso e as
  relações ativas — não entrega onde está a pressão nem o que está ausente. Parte
  do que come a dobra é chrome de **fixture** (a faixa de demonstração e as
  quatro cenas) que **não existe numa build real**; a outra parte é o shell.
  Medido, não estimado, e não vou chamar isso de aprovado.
- **A lateral do shell** continua dominando o desktop. Ela é Nível 4 e está fora
  do que esta missão foi autorizada a redesenhar.
- **Repetição de frase.** A mesma sentença aparece na massa e na lista completa
  de sinais atrás da dobra. Isso é o "recuar nunca é sumir" funcionando, mas vale
  sua opinião se incomoda.
