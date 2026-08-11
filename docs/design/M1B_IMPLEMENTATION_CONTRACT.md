---
lifecycle:
  artefato: docs/design/M1B_IMPLEMENTATION_CONTRACT.md
  status: ACTIVE
  authority_scope: m1b_implementation_mapping
  superseded_by: null
  atualizado_em: "2026-08-11"
  state_basis: ee4e9c6448497723f1fa6e5fa2d9a409654067dc
  missao: M1B — Copilot Experience na Home /
---

# Contrato de implementação M1B

> Escrito **antes** de editar código, sobre `ee4e9c6`, com o antes já capturado em
> `docs/design/m1b-evidencia/antes/` (36 capturas, Chromium 1228 via Playwright).
>
> Ele existe para evitar as duas falhas caras: portar o protótipo literalmente, e
> pintar por cima da estrutura obsoleta.

---

## 0. O antes, medido — não impressão

| Defeito | Medição |
|---|---|
| dashboard empilhado sob a superfície | página com **10 308 px** de altura em 1440; a operação ocupa ~12% do topo |
| tabela operacional de 25 linhas | `segundoPlano()` — antipadrão explícito |
| grade de cards iguais | `contextos()` — quatro colunas idênticas |
| microtipografia | **9,3–9,9 px em 36/36 capturas** |
| massa sem presença | organismo em coluna central estreita, sangria zero |
| Foco como painel | `.org-foco` é `<aside>` com borda, à direita |
| **unidade mentida** | `sinais.ts:446` → *"com 6 **pedidos**, 200% do normal"* |
| overflow horizontal | **0** — o único que já estava certo |
| reduced motion | **0 elementos animando** nos seis viewports — já estava certo |

---

## 1. A mentira de unidade — o achado que governa o resto

`src/product/viewmodels/sinais.ts:446` compõe a frase que o operador lê:

```ts
resumo: `${rotuloDaPraca(praca)} com ${carga} pedidos, ${Math.round(razao*100)}% do normal.`
```

`carga` é `carga_por_praca`. **D-M1A1-08 proíbe** apresentá-la como contagem de
pedidos. O produto de hoje viola a decisão de ontem.

`sinais.ts` é **FORBIDDEN_PATH** no envelope M1 ("regra de sinal — exige o
César", D84). Então M1B **não corrige na origem**.

**O que M1B faz, dentro do envelope:** a verdade estruturada já viaja junto do
sinal, em `evidencias`:

```
ev("carga_por_praca",   "Sushi Quentes=6")
ev("baseline_calibrado","Sushi Quentes=3")
```

A frase que o operador lê passa a ser composta **desses campos**, com a unidade
canônica, por função pura em `home-vm.ts` (AUTHORIZED_WITH_GATE) — sem inventar
número, sem alterar `resumo`, que continua inteiro na trilha de auditoria.

Palavra escolhida: **"trabalhos abertos"**. É o vocabulário do próprio domínio
(`trabalho_praca_observado`, `RegistroDeTrabalho`), é o que a contagem realmente
é, e não é nem "pedidos" nem "itens".

> `Sushi Quentes com 6 trabalhos abertos, 200% do ritmo normal.`

**Fica aberto para o César:** consertar na origem (`sinais.ts`) elimina a
duplicidade entre `resumo` e a frase de apresentação. É decisão dele — §21 deste
relatório.

---

## 2. Mapa lei aprovada → runtime → código

| Lei aprovada | Significado no runtime | Dono atual | Onde vai | Fonte de estado | Expressão visual | Prova |
|---|---|---|---|---|---|---|
| **massa operacional** | a operação é **uma** superfície, não peças | `superficie()` em `home.js` — fileiras + SVG | `home.js` · `home.css` | `vm.ambientes` | campo escavado sangrado nas duas bordas, câmaras como vazios na mesma pedra | captura 1440/1024; altura da primeira dobra |
| **hierarquia espacial** | quem pesa ocupa mais | `data-degrau` (0–3) | `home.css` | `a.cor` (motor) | proporção da câmara vem do degrau, nunca da % | mutação perceptual M21 |
| **topologia** | Caixa → 3 ramos → Conferência → Motoboy | `FILEIRAS` + `ligacoes*()` | mantida | `vm.ligacoes` | passagens escavadas entre câmaras; inerte não desenha | teste H-topologia existente |
| **pressão** | degrau, não porcentagem | `degrau(cor)` | `home.css` | `a.cor` | tom aprofunda e grão fecha, uniforme no território | mutação M1; captura ambiente |
| **Calmo** | silêncio com presença | `vm.modo` | `home.css` | `vm.modo` | massa inteira, respiração ampla, sem vazio morto | captura calmo |
| **Ambiente** | duas pressões, nenhuma interrompe | `vm.modo` | `home.css` | `vm.modo` | dois territórios adensam; nenhum Foco | captura ambiente |
| **Foco** | **transformação espacial**, não card | `<aside class="org-foco">` | `home.js` · `home.css` | `vm.foco` | a massa recua para a base; causa e efeito assumem corpo; laterais viram lascas | mutação M17 |
| **informação secundária** | recua sem sumir | 4 `org-bloco` empilhados | `home.js` · `home.css` | mesmos campos | condensada e acessível, fora da primeira dobra e sem cara de tabela | mutação M16 |
| **ausência** | nunca zero, nunca verde | `especieDeAusencia()` | mantida | `Campo<T>.motivo` | tracejado neutro (sem integração) × ardósia (falha) | mutação M2/M6 |
| **evidência** | inteira e estática | `org-foco__evidencias` | `home.css` | `f.evidencias` | mono, recuada, **sem transição** | mutação M9 |
| **estado técnico** | fala baixo | `faixaTecnica()` | `home.css` | `vm.degradado` | ardósia, sem crescer, sem âmbar, sem pulso | mutação M19 |
| **composição mobile** | sintaxe própria | mesmo markup | `home.css` | — | massa gira: câmaras empilham, gravidade desce para a Conferência | capturas 414/375/320 |
| **capacidade de movimento** | só com mudança real | nenhuma | `home.css` | — | `transition` declarada nas propriedades que mudariam; **zero timer** | mutação M12 |

---

## 3. O que NÃO muda

Domínio, sinais, áreas, eventos, motor, confiança, linhagem, `/copiloto`,
Entregas, CRM. Nenhum dado novo. Nenhuma fonte nova. Nenhuma dependência nova.

`vm.*` continua sendo a única origem de verdade da tela: a Home não calcula
estado, gravidade, ligação, orientação nem confiança.

---

## 4. Ordem de execução

1. verdade de unidade (§1);
2. transformação estrutural estática;
3. composição responsiva;
4. capacidade de movimento sem vida fabricada;
5. acessibilidade;
6. mutações e revisão adversarial;
7. evidência.

Cada passo com o navegador aberto. Implementar pequeno, rodar, olhar, criticar,
corrigir, rodar de novo.
