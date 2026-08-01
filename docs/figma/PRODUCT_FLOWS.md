# Fluxos do produto

> Frames no Figma, página `02 — Product Flows & Screens`. Telas em `SCREEN_INVENTORY.md`.

## 1. O fluxo que atravessa o produto inteiro

```
Operação Viva ──▶ adapter semântico ──▶ Conference Brain ──▶ Copiloto Shadow ──▶ pessoa
   projeta            nunca emite          conclui sobre        recomenda sobre      decide
   VIAGENS              pedido             a SAÚDE da fonte        a FONTE
```

Cada seta perde alguma coisa, **de propósito**, e a interface mostra o que se perdeu:

| Seta | O que atravessa | O que **não** atravessa | Onde a tela diz isso |
|---|---|---|---|
| Op. Viva → adapter | escopo, saúde, contexto rotulado, procedência | identidade de pedido | Op. Viva: "esta projeção não carrega identidade de pedido" |
| adapter → Brain | saúde da fonte, 10 campos ausentes declarados | qualquer observação de pedido | Brain: **0 observações de pedido**, ao lado do controle positivo com **1** |
| Brain → Copiloto | conclusões de `source_health` | conclusões de `order_dimension` | Copiloto: todo cartão tem `escopo = fonte`, `pedido` ausente |
| Copiloto → pessoa | proposta, evidência, validade, limitação | **ação** | Copiloto: zero botões; frase de sombra em cada cartão |

## 2. Navegação — o percurso de quem opera

**Chegada.** A rota padrão é Entregas: quem abre o Product System sob pressão quer saber o que está
na rua. A faixa de ambiente e o selo `SOMENTE DEMONSTRACAO` são a primeira coisa legível.

**Descida ao entendimento.** De Entregas para Operação Viva (mesmo grupo, "Agora"), e de lá para
Conference Brain e Copiloto (grupo "Entendimento"). O caminho é sempre do **fato** para a
**interpretação** — nunca o contrário.

**Retorno.** A trilha de contexto mostra `DeliveryOS / grupo / módulo`, e um botão "Voltar para X"
aparece quando existe rota anterior. Trocar de unidade **preserva a rota** e redesenha a mesma
superfície, com o aviso "Contexto preservado na troca de unidade".

**Módulo planejado.** Clicar num dos sete leva a uma tela que diz que ele não existe, mostra a
visão, e não desenha um único número.

## 3. Fluxos por superfície

### Entregas
`visão operacional → viagem → paradas (inspetor) → ocorrência → aparelho`
O aparelho é o fim do percurso de propósito: é onde a tela declara cinco campos como
`integracao pendente`, e é a resposta mais honesta que ela pode dar hoje.

### Operação Viva
`integridade do sinal → observado → inferido → contexto → viagens projetadas → procedência`
A ordem é a régua: o que foi **observado** vem antes do que foi **inferido**, e o grupo "Observado"
aparece mesmo vazio, dizendo que **nenhuma das nove dimensões é observação direta**.

### Conference Brain
`cadeia real → controle positivo → armazenamento`
Os dois primeiros blocos são um **par**, e a ordem importa: o leitor vê o zero, e imediatamente
embaixo vê o mesmo cano produzir um. Sem o segundo bloco, o primeiro seria indistinguível de defeito.

### Copiloto Shadow
`modo sombra → propostas ativas → fora de atividade → conclusões recusadas → procedência`
"Fora de atividade" vem **antes** de "recusadas" porque são coisas diferentes: a primeira é uma
proposta que existiu e saiu; a segunda é uma conclusão que nunca virou proposta.

## 4. Estados por fluxo

| Estado | Entregas | Op. Viva | Brain | Copiloto |
|---|---|---|---|---|
| vazio | sem viagem montada | sem dados suficientes | sem ciclo | sem proposta sustentada |
| carregando | skeleton | skeleton | skeleton | skeleton |
| offline | selo na conexão | — | — | — |
| sincronizando | selo + fila da sessão | — | — | — |
| degradado | falha de leitura | — | armazenamento com linha recusada | evidência degradada |
| stale | — | frescor por viagem | — | grau de evidência |
| evidência insuficiente | — | confiança baixa | conclusão sem evidência | recusa declarada |
| indisponível | 5 campos do aparelho | capacidade, posição, histórico | — | pedido, unidade, histórico |
| decisão humana | ocorrência que bloqueia | — | — | todo cartão |
| expiração / retirada | — | — | — | fora de atividade |

## 5. O que os fluxos não fazem

Nenhum fluxo desta unidade **move pedido, altera capacidade, dispara integração ou publica comando**.
Não há caminho de tela que chegue a uma ação — e o servidor recusa métodos de escrita antes de
olhar o caminho, para que a garantia não dependa de disciplina de quem escreve a próxima tela.
