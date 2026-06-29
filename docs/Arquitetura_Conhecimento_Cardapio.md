# Arquitetura do Conhecimento do Cardápio — DeliveryOS

> A camada de **conhecimento operacional** que fica entre o núcleo e as projeções (como no seu desenho).
> É o que permite o sistema entender **praça, embalagem, kit, consumo, sacola, tempo, pausa e risco** —
> e assim entregar a investigação pronta (o Mapa de Sinais).
>
> **Lei inegociável:** isto é **referência estrutural, set-once** — não preenchimento por pedido.
> Cadastra-se uma vez (e ajusta-se raramente), no escritório, na calma. **Nunca** no chão, no pico.
> O consumo, a praça e o estado são sempre **derivados** (projeção), jamais digitados por evento.
> (Leis 1, 7, 8, 9, 10 — é assim que tem cardápio completo **sem** virar ERP.)

## Onde encaixa

```
Fontes → Adaptadores → NÚCLEO (História append-only)
                              │
                   CONHECIMENTO OPERACIONAL   ← este documento (cadastro de referência)
                   (cardápio · praça · ficha · embalagem · kit · tempos · regras de fechamento)
                              │
                   PROJEÇÕES (Parados, sobrecarga por praça, fecháveis, risco de item, erro…)
                              │
                   ATENÇÃO (calmo / ambiente / foco)
```

O conhecimento do cardápio **não inventa eventos** — ele dá *significado* aos eventos que já chegam (um pedido vira "1 hot + 1 kit p/2 → praça quentes + montagem, 2 sacolas, consome X").

## Princípio de armazenamento (event-sourced, point-in-time)

O cadastro também vive como **asserções na História** (Red-Team, Lei 2): cada `item.cadastrado` / `item.alterado` é um fato datado. "Cardápio vigente em T" é uma **projeção** — assim o custo/consumo de um pedido antigo usa a ficha **da época**, não a de hoje. Sem tabela-verdade mutável paralela.

## O modelo (perfil-delivery, não núcleo)

Vocabulário do delivery vive no **Perfil** (Red-Team Lei 4), nunca no núcleo neutro.

```ts
// perfil-delivery/cardapio.ts  — CADASTRO de referência (set-once). NUNCA por pedido.

type Praca = "sushi" | "enrolados" | "quentes" | "combinados" | "frios" | "bar" | "sobremesa" | "montagem";
type Categoria = "sushi" | "enrolado" | "combinado" | "quente" | "frio" | "bebida" | "sobremesa" | "kit";

interface ItemCardapio {
  id: string;
  nome: string;
  categoria: Categoria;
  pracas: Praca[];              // praça(s) que produzem  → S4,S5,S7,S9 (saber a praça)
  tempo_padrao_min: number;     // tempo típico de produção → "acima do normal" (S4,S5)
  ingredientes_chave: string[]; // p/ risco de falta e cruzamento com pausa → S16,S17
  embalagens: string[];         // embalagens consumidas → disponibilidade/consumo
  kit?: string;                 // kit associado (kids|p1|p2|combo) → S21 (não esquecer)
  sacolas_esperadas: number;    // p/ "mais de uma sacola" → S14
  temperatura: "quente" | "frio" | "ambiente"; // p/ "só quentes" / fechamento → S12
  produz_sozinho: boolean;      // pode adiantar sem depender de outra praça → S8
  depende_de: Praca[];          // praças necessárias p/ ficar pronto → S7
  trava_fechamento: boolean;    // costuma ser o último a ficar pronto → S7,S13
  substituivel: boolean;        // há substituto aceitável → S15,S16
  pausavel: boolean;            // pode ser pausado no app → S15,S17
}

interface FichaTecnica {        // BOM — consumo por item (deriva consumo do pedido, sem digitar)
  item_id: string;
  consumo: { insumo: string; qtd: number; unidade: string }[];
}

interface MapaPraca {           // capacidade/baseline por praça (p/ "sobrecarga")
  praca: Praca;
  baseline_pedidos_simultaneos: number;  // normal da praça → S5,S6
  tempo_padrao_min: number;
}

interface RegraFechamento {     // quando um pedido é "fechável"
  // pedido fechável = todas as praças dos seus itens reportaram "pronto"
  // (e, se houver, itens de temperatura "quente" não podem estar pendentes)
  exige_todas_pracas_prontas: true;
}
```

### Cada campo serve a um sinal (rastreável)
| Campo | Sinais que destrava |
|---|---|
| `pracas`, `tempo_padrao_min` | S4 produção travada · S5 praça sobrecarregada · S6 surto de praça |
| `depende_de`, `trava_fechamento`, `produz_sozinho` | S7 trava-fila · S8 adiantáveis · S13 fechável |
| `temperatura`, `categoria` | S12 "só quentes" · S21 bebida/sobremesa/kit |
| `sacolas_esperadas` | S14 pedido grande / 2 sacolas |
| `kit` | S21 não esquecer o kit |
| `ingredientes_chave` + `FichaTecnica` | S16 item pausado · S17 risco de ruptura · consumo/custo |
| `pausavel`, `substituivel` | S15 item deveria estar pausado · S16 substituição |
| `embalagens` + `FichaTecnica` | consumo teórico, baixa de estoque, sugestão de compra |

## Como as projeções usam (derivado, nunca digitado)

Um pedido do iFood chega como itens. O sistema **resolve** cada item pelo cardápio e cruza com a História:

- **Praça sobrecarregada (S5):** agrupa pedidos vivos por `pracas` → conta os acima de `tempo_padrao_min` → compara com `baseline` do MapaPraca.
- **Fechável (S12/S13):** todas as `pracas` dos itens do pedido em "pronto" (sinal da impressora/KDS) → fechável; se todos `temperatura==="quente"` e nada frio pendente → "só quentes".
- **Trava-fila (S7):** o pedido espera só um item com `trava_fechamento` numa praça lenta.
- **2 sacolas (S14):** soma `sacolas_esperadas` dos itens.
- **Item deveria estar pausado (S15):** item com evento de pausa **e** `pausavel` aparece em pedidos novos.
- **Risco de ruptura (S17):** `FichaTecnica` × pedidos aceitos = consumo teórico; cruza com ritmo e pausa.

Tudo isso é **projeção sobre História × Cadastro**. O operador não preenche nada disso durante o serviço.

## Como o cadastro é alimentado (sem virar ERP)

1. **Uma vez, na calma:** uma tela de cadastro (escritório) — ou import de uma planilha do cardápio que já existe. Os itens mais vendidos primeiro (20 itens cobrem ~80% dos pedidos).
2. **Ajuste raro:** quando muda o cardápio (novo prato, troca de kit — ex.: o kit padronizado em 25/09/2023 seria 1 evento de `item.alterado`).
3. **Nunca no pico, nunca por pedido.** Se algum dia o sistema pedir "preencha a praça deste pedido", está errado.
4. **Degrada com elegância:** sem cardápio, os sinais [A] (iFood puro) seguem funcionando; o cardápio só **enriquece**.

## Guarda anti-ERP (checagem final)
- O dado existe porque é **referência** (set-once) ou porque é **exalado** pelo trabalho (eventos)? Sim. "Só-porque-pedimos por pedido" = proibido.
- Consumo, praça, fechável, risco = **derivados**, nunca eventos no log (Red-Team Lei 3).
- Vocabulário do cardápio vive no **perfil-delivery**; o núcleo continua neutro (vira HospitalOS trocando o perfil).
- Contagem física e entrada de compra continuam sendo os **únicos** inputs manuais legítimos (e calibração, não log por evento).

## Ordem de construção sugerida
1. `ItemCardapio` mínimo (id, nome, categoria, **pracas**, **temperatura**, **sacolas_esperadas**) → já destrava S5, S12, S14.
2. `MapaPraca` (baseline por praça) → S5/S6 com precisão.
3. `depende_de` / `trava_fechamento` / `produz_sozinho` → S7/S8/S13.
4. `FichaTecnica` (BOM) → consumo, S17, custo, estoque.
5. Regras de fechamento + pausa → S12/S13/S15.

> O cardápio é a **chave** que transforma os sinais [A] do iFood na investigação rica do Mapa.
> Com ele, o foco deixa de dizer só "pedido parado" e passa a dizer **onde, qual praça, por quê, e o próximo movimento.**
