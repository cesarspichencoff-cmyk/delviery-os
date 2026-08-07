# Auditoria de experiência — REVOLUTION 0-A

> Achados, evidências, severidade, correções e riscos restantes da rota `/lab/operacao-viva-v4`.
>
> **Este documento é do construtor.** O veredito independente vive em
> `DELIVERYOS_REVOLUTION_0A_INDEPENDENT_EVALUATION.md`, escrito por um avaliador que testou **antes**
> de ler qualquer justificativa daqui — e é gravado literalmente, sem edição de achado, severidade ou
> veredito.

---

## 1. Método

Duas fontes de achado, e elas encontraram coisas diferentes:

| Fonte | O que ela pega |
|---|---|
| **Gate determinístico** (`npm run test:lab:v4`) | 46 guardas + 8 mutações dirigidas. Pega regra quebrada e guarda que não guarda |
| **Gate de navegador** (`npm run test:lab:v4:browser`) | 28 testes em 3 viewports. Pega o que só existe quando a página abre |
| **Olhar a tela** | pegou 5 dos 9 defeitos abaixo. Nenhum teste os teria acusado, porque nenhum deles é regra errada |

A terceira linha é o achado de método desta missão. **Um contrato de comportamento não reprova uma
tela que mente por composição.**

---

## 2. Achados durante a construção

Todos foram **corrigidos** e cada um tem guarda ou evidência. Nenhum foi encontrado lendo código.

| # | Achado | Severidade | Como apareceu | Correção |
|---|---|---|---|---|
| A1 | O sinal do **Foco aparecia duplicado** entre os secundários | **alta** | probe das 18 cenas | Identidade por conteúdo. `homeVM` chama `sinaisDe()` por dentro e devolve objetos diferentes: comparar por referência entre dois resultados de funções puras nunca casa. Guarda `G3`, mutação `MD6` |
| A2 | O **pulso virava `0`** sem fonte de pedido | **alta** | probe | `homeVM` afirma o pulso quando *qualquer* fonte se diz saudável, e o Cardápio é seed estático — está sempre saudável. O Lab passa a exigir a fonte que conta pedidos. Guarda `G7` |
| A3 | A **Caixa explicava o próprio estado com um sinal de chegada** ("18 pedidos na última hora") embora ninguém a meça | **média** | olhar a tela | Em unidade sem medição, a manchete é a ausência. O sinal continua inteiro em Ambiente. Guarda `G7c` |
| A4 | `carga 14 · pressão 50%` parecia dois ângulos do mesmo número | **média** | olhar a tela | 14 é a **soma** de três praças, 50% é a pressão da **mais carregada**. A linha passa a dizer quantas praças entraram |
| A5 | A **hora vinha do relógio de quem abre a página** | **média** | olhar a tela | Fuso da loja, fixo. O mesmo instante virava duas leituras, e nenhuma captura era reproduzível |
| A6 | A cena de fonte atrasada **perdia o pulso junto com os tempos** | **baixa** | probe | Lista de pedidos e tempos de etapa são faces diferentes da integração e atrasam em momentos diferentes |
| A7 | O **botão de exportar nunca baixava nada** | **alta** | `[C9]` | Dois defeitos no mesmo lugar, os dois silenciosos: âncora desanexada do documento, e blob revogado no mesmo tick do clique |
| A8 | O **guarda de PII recusava exportações limpas** | **alta** | `[C9]` | Primeiro de vez em quando (UUID parecendo CEP), depois **sempre** (`versao_fixture` = `lab-v4-fixtures@1.0.0` parecendo e-mail). Campos estruturais saem da varredura de PII; a de conteúdo executável continua em todo campo. Guardas `G11f`/`G11g`, lição **L43** |
| A9 | A tela tinha **8346 px** de altura no desktop | **média** | olhar a captura | Dez telas de rolagem para uma leitura é densidade sem hierarquia. Revelação progressiva em `<details>` inline, com manchete e contagem no `summary`, e tira de fontes sempre visível. **8346 → 4184** |

### Achados no próprio ferramental

| # | Achado | Correção |
|---|---|---|
| B1 | A mutação `MD6` saiu **cega** | Com chave constante, `find` devolvia o primeiro sinal — que, na lista ordenada por severidade, já era o eleito. Aplicada, carregada, e **imaterial**. Trocada por uma que reintroduz o defeito original. Lição **L42** |
| B2 | Ao corrigir A8 eu quebrei `acharExecutavel` | Passou a testar regex contra objeto. O próprio gate pegou: `<img onerror>` voltou a passar |
| B3 | Corrida no teste `[C10]` | O recado da recusa anterior ainda casava com `/recusada/`, e o caso seguinte era avaliado contra texto velho |
| B4 | O teste `[C9]` reaplicava a regex ingênua ao arquivo inteiro | Passou a usar a função do produto. Um teste que não conhece o recorte do produto mede outra coisa |

---

## 3. O que está provado, e como

| Afirmação | Prova |
|---|---|
| Sushi Quentes não é absorvido pelo Sushi | `G2b` com par simétrico (Sushi Quentes vermelho **e** Sushi verde). Mutação `MD3` |
| Ambiente crítico não some quando outro vira Foco | `G3b` + teste de navegador sobre a cena `ambiente-critico-persistente` |
| Exclusividade de slot sem duplicata | `G3`, mutação `MD6` |
| Calmo exige lastro, e só rebaixa | `G6`, `G6b`, **`G6c` controle positivo** (Calmo legítimo continua existindo). Mutação `MD5` |
| Ausência nunca vira zero | `G7` + teste de navegador (pulso `—`, seis unidades sem medição) |
| Caixa e Conferência nunca verdes | `G7c`, nas 18 cenas |
| Confiança não estimada é exibida sem número | `G4` + teste de navegador |
| Os 8 estados de fonte existem e aparecem | `G5`, `G5g` |
| Tradução do canônico nunca ganha saúde | `G5c`, `G5d`, `G5e`. Mutação `MD2` |
| Caixa nunca por omissão | `G8c`, `G8d`. Mutação `MD4` |
| O servidor recusa escrita | `G12` (405 + `Allow`, sem mutação de estado) e `[C8]` |
| O cliente não emite escrita | `[C7]` |
| Validação persiste, corrige e isola | `[C1]`–`[C6]` |
| Exportação sem PII, importação hostil recusada | `[C9]`, `[C10]`, `G11b`–`G11g` |
| Reduced motion sem perda de informação | 0 animações **e** contagem de caracteres idêntica |
| O congelamento aguentou | `git diff --name-only 73f2f0b -- <PF4>` vazio, e os 10 gates R5 verdes |

---

## 4. Riscos restantes — o que NÃO está provado

1. **Nada aqui prova operação.** São 18 fixtures. 74 testes verdes não provam um turno de sexta.
2. **A rota do Caixa é inalcançável fora de fixture** (PB15). `capacidade_do_caixa` não pode ser
   comprovada por medição porque nenhuma fonte mede aquela fila. Nas cenas ela é **declarada**.
3. **Sushi Quentes como unidade é experimental** (PB14). O domínio canônico não mudou, e a divergência
   com S12 está registrada e **não** corrigida.
4. **A validação não é operacional.** Local, sem autenticação, sem sincronização, sem multiusuário.
   Um segundo navegador não vê nada do primeiro — provado, e é limitação, não recurso.
5. **Confiança segue não apurada.** O Lab não a inventa, e por isso ela nunca aparece.
6. **Utilidade numa sexta de pico não foi medida**, e não pode ser por teste. Só o César.
7. **A altura ainda é grande** — 4184 px no desktop, 6653 px no celular. Metade do que era, e ainda
   não é uma tela.
8. **O Figma não acompanha** esta rota (PB11/PB13). Por decisão, não por esquecimento.

---

## 4-B. O achado do avaliador independente, e a varredura que ele obrigou

O avaliador independente encontrou, no produto, um defeito de severidade **alta** que nenhuma das
guardas acusou — porque **uma delas estava escrita para não acusar**:

| | |
|---|---|
| Achado | 5.1 — Motoboy verde em 15 de 18 cenas, sem medição da fila de despacho |
| Viola | Constituição §4.3 item 10, e o comentário do próprio `vm-v4.ts` |
| Agravante | a guarda `G7b` tinha `\|\| u.id === "motoboy"`, escrito pelo construtor |
| Correção | `0f1dd50` — declara a ausência (`FONTE_MOTOBOY`), não inventa medição |
| Lição | **L44** — exceção dentro de guarda é confissão, e sempre isenta quem viola |

### A varredura que L44 obriga

Se uma exceção passou, outras podem ter passado. Varridos **todos** os ramos de escape do gate do
Lab (`assert.ok(... || ...)`, `continue`, `return` dentro de teste). Restaram cinco, e **nenhum é
isenção** — os cinco são pré-condição de escopo, e cada um tem controle positivo em outra guarda:

| Ramo | Guarda | Por que não é isenção | Controle positivo |
|---|---|---|---|
| `if (v.foco === null) continue` | `G3` | cena sem Foco não tem duplicata para checar | `G3b` exige que uma cena TENHA Foco |
| `if (v.foco === null) continue` | `G4` | idem, para confiança | idem |
| `if (fraca === undefined) continue` | `G6` | cena sem fonte fraca está fora do escopo da regra | `G6c` — Calmo legítimo existe |
| `if (!v.eleicao.rebaixado) continue` | `G6b` | só valida quem foi rebaixado | `G6c` |
| `if (u.cor !== "verde") continue` | `G7b` | a asserção é sobre unidade verde | `G7c` e `G7d` — as três sem medição nunca ficam verdes |

**A única isenção real era a do Motoboy, e ela caiu.** Esta varredura é evidência de que a família foi
procurada, não de que ela não existe em outro lugar do repositório — `run-lab-v4-tests.ts` foi o único
arquivo varrido, porque é o único que esta missão escreveu.

---

## 5. Veredito do construtor

**PARCIAL — pronto para avaliação, não para operação.**

O que a missão pedia como software executável existe, abre no navegador, é coberto por dois gates e
foi corrigido nove vezes durante a construção. O que ela pedia como verdade também está lá: nenhuma
tela afirma mais do que a fonte sustenta, e os limites estão escritos na própria tela em vez de num
rodapé.

O que **não** está pronto: nada disto viu operação real, e nenhum teste substitui o César abrindo a
rota. O estado máximo que esta missão pode declarar é **`AWAITING_CESAR_REVIEW`**.

*O veredito que vale para fechar o ciclo é o do avaliador independente, no documento irmão.*
