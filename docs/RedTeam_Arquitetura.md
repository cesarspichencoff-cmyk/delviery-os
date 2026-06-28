# Red Team da Arquitetura DeliveryOS

> Postura: **atacar, não defender.** Objetivo: achar o que está errado agora, antes de codar.
> Veredito geral: **a arquitetura sobrevive — mas com 5 correções.** Três delas eram erros meus
> (núcleo inchado, cadastro como verdade paralela, vocabulário do delivery dentro do núcleo).
> Depois das correções, a fundação está encerrada.

---

## Respostas às 9 perguntas (com veredito)

### Q1 — Existe camada desnecessária?
**Sim.** O "Núcleo" que desenhei tinha 4 caixas (História · Cadastros · Motor de Projeção · Motor de Consumo). Três não são núcleo:
- **Motor de Projeção** não é uma coisa — é o *mecanismo* de toda projeção (o "fold"). Não merece caixa própria.
- **Motor de Consumo** é uma projeção especializada (ver Q5).
- **Cadastros** como caixa à parte esconde uma segunda verdade (ver Q7).

→ O núcleo real é **menor** do que desenhei.

### Q2 — Responsabilidade mal posicionada?
**Sim, duas:**
- **Motor de Consumo** está no núcleo, mas é derivação (projeção).
- **Cadastros** estão como *store mutável*. Isso é uma responsabilidade mal posta: dado de referência que muda no tempo (preço, ficha técnica) tratado como tabela editável gera **incorreção temporal** — recalcular o custo de um pedido antigo usaria o preço de *hoje*, não o da época. Correção em Q7/Correção 2.

### Q3 — Algum módulo deveria estar no núcleo?
**Não.** Nenhum módulo sobe. O movimento correto é o inverso: coisas **saem** do núcleo (Consumo, Maestro). A única coisa que é núcleo de verdade é a **ontologia + a História**. Identidade da unidade (pedido/insumo/pessoa) já é núcleo via a ontologia.

### Q4 — Alguma projeção deveria ser dividida?
**Sim, duas:**
- **Estoque** não é uma projeção — são três: *estoque teórico* (derivado contínuo), *estoque físico* (da contagem) e *variância/perdas* (físico − teórico). Tratar como uma só esconde justamente o sinal mais valioso (a variância).
- **Maestro** não é uma projeção — é uma composição de várias (ver Q6). Deve se dissolver em vistas específicas (estado consolidado, alertas, parados), não num módulo monolítico.

### Q5 — Motor de Consumo: núcleo ou projeção especializada?
**Projeção especializada.** Ele é `História (eventos de pedido) × Cadastro (ficha técnica) → consumo teórico`. Não é primitivo; é um *fold* especializado. **Sai do núcleo.**
- Subregra crítica que isso revela: o consumo teórico é **derivado** → **nunca vira evento na História**. Só fatos *observados/asseridos* entram no log (pedido, contagem, entrada). Derivado é sempre recomputado. (Ver Correção 3.)

### Q6 — Maestro: camada separada ou nasce das projeções?
**Nasce das projeções.** "Ler o gargalo / mostrar o estado / alertar" são projeções de ordem superior (projeções compostas de projeções). Não há *motor* maestro — há **vistas** que um humano (o papel maestro) consome. A "Inteligência/IA" futura é o mesmo: projeção estatística sobre o log. **O Maestro deixa de ser camada.**

### Q7 — Acoplamento escondido que viraria ERP?
**Sim — três, e o primeiro é grave:**
1. **Cadastro como verdade paralela** (o erro grave). Se o cadastro é um store mutável separado, você tem *duas* fontes de verdade → exatamente a doença do ERP. **Correção:** o cadastro também é **event-sourced** — alterar um preço/ficha é uma *Asserção* na própria História. "A ficha técnica vigente em T" passa a ser uma projeção. Isso unifica tudo num log só **e** dá custo correto no tempo (point-in-time).
2. **Escrever derivado no log.** Se estoque/consumo/custo forem gravados como eventos, viram segunda verdade que diverge. **Correção:** derivado = projeção, nunca evento.
3. **Projeção lendo projeção.** Se o módulo A lê o read-model do B (em vez da História), recriamos a espaguete de integração. **Correção:** projeções derivam da **História** (e de projeções de cadastro), não do estado mutável umas das outras.

(Já guardados antes, mantidos: fonte é só metadado; identidade é do núcleo, não do iFood — o bug do "ID curto que se repete" provou isso.)

### Q8 — Hospital / Centro de Distribuição: continua de pé?
**Continua — mas só se aplicarmos a Correção 4.** Teste da ontologia:
- *Unidade*: pedido → paciente / pallet / lote. ✔
- *Transição*: triagem→exame→internado→alta / recebido→armazenado→picking→expedido. ✔
- *Asserção*: contagem de inventário / medição clínica. ✔
- *Consumo (BOM)*: cirurgia consome materiais (ficha = lista do procedimento); pedido de CD consome SKUs. ✔ (a explosão BOM é universal)
- *Parados Agora*: "pacientes parados há X" / "pallets parados". O search-tax ("cadê?") é universal. ✔

**O que quebra:** `EstadoFluxo (recebido→entregue)`, o `normalizador` (salmão/hot/kit) e as regras de *motivo* são **específicos do delivery** — e hoje moram no núcleo (`dominio.ts`). Num hospital, isso quebra. → **Correção 4:** o vocabulário do vertical é um **Perfil** (dado/config), não código do núcleo. Os 4 primitivos são neutros; "delivery" é um perfil.

### Q9 — Forma ainda mais simples?
**Sim — drasticamente.** A arquitetura inteira cabe em:

> **Um log de fatos observados (a História, tipada pela ontologia mínima).
> Dois verbos: `append` (adaptadores/emissores escrevem fatos) e `fold` (projeções leem).
> Tudo o mais — cadastro, consumo, estoque, custo, maestro, módulos — é projeção da História. Nada deriva de nada além da História.
> O vertical (delivery/hospital/CD) é um Perfil: dado, não código.**

Não há núcleo "rico". Há um log e folds. Essa é a forma mínima.

---

## As 5 correções (acionáveis)

1. **Encolher o núcleo.** Núcleo = *Ontologia + História*. **Motor de Consumo e Maestro saem** (viram projeções/vistas). O "Motor de Projeção" é só o mecanismo de fold, não uma caixa.
2. **Cadastro event-sourced.** Produtos, fichas, preços, fornecedores: cada mudança é uma *Asserção* na História. "Cadastro vigente em T" = projeção. Mata a verdade paralela e dá custo point-in-time.
3. **Lei do log puro.** Só fatos **observados/asseridos** entram (pedido, contagem física, entrada de compra, edição de cadastro). **Derivado nunca** (consumo, estoque teórico, custo, parados = sempre recomputado).
4. **Perfil de vertical.** Tirar do núcleo o vocabulário do delivery (estados recebido→entregue, normalizador, motivos) para um `perfil-delivery` (dado/config). Núcleo só conhece os 4 primitivos. *(Implicação no código: separar `core/ontologia.ts` de `perfil-delivery/`.)*
5. **Unidade operacional (loja/tenant) como atributo de 1ª classe em todo fato — desde já**, mesmo em n=1. Multiunidade e o corpus-de-rede (o moat) ficam de graça depois; retrofitar tenant é caro.

**Nota de implementação (não é falha de arquitetura):** projeções são **read-models materializados/cacheados**, reconstruíveis do log (snapshots). Não se faz fold de milhões de eventos a cada leitura — isso é CQRS padrão, fica registrado para não cair na ingenuidade de "fold on read".

---

## Arquitetura revisada (a forma final)

```
FONTES → ADAPTADORES → [ HISTÓRIA : log append-only de FATOS, tipado pela ontologia
                          (Unidade·Dimensão·Transição·Asserção) + tenant ]
                                   │  (fold — recomputa, nunca grava derivado)
                                   ▼
   PROJEÇÕES (todas leem só a História):
     cadastro-vigente · consumo (BOM) · estado/parados · estoque teórico ·
     estoque físico · variância/perdas · custo/margem · erros · SAC ·
     equipe · vistas-maestro (estado consolidado, alertas)

   EMISSORES (escrevem FATOS na História): adaptadores · contagem física ·
     entrada de compra · edição de cadastro

   PERFIL (dado, não código): vocabulário de estados, normalização, motivos — por vertical.
```

Comparado ao desenho anterior: o núcleo perdeu 2 caixas (Consumo, Maestro), o Cadastro entrou na História (não é mais store), e o vertical virou Perfil. Mais simples **e** mais durável.

---

## Verdito de 10 anos

| Pressão futura | Aguenta? | Por quê |
|---|---|---|
| Estoque/Compras/Financeiro completos | ✔ | são projeções (consumo/variância/custo) sobre o mesmo log |
| SAC/Equipe/Produção/Treinamento | ✔ | projeções de desfecho/atribuição/padrão |
| Maestro/Inteligência | ✔ | vistas/projeções estatísticas; não é camada nova |
| Multiunidades | ✔ *(com Correção 5)* | tenant em todo fato desde já |
| Outros segmentos (hospital/CD) | ✔ *(com Correção 4)* | ontologia neutra; vertical é Perfil |
| Escala (milhões de eventos) | ✔ | read-models materializados (snapshots) |

**Fundação encerrada** — após aplicar as 5 correções no núcleo. Só então: desenvolvimento.
