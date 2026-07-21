# Próximos sprints — Cérebro da Conferência

> Este documento é planejamento, **não** autorização. Nada aqui foi implementado.
> O Sprint 1 termina no commit de documentação; o Sprint 2 exige decisão do César.

---

## O que trava tudo

A fundação está pronta e não consegue afirmar carga, porque **nenhuma fonte
atual observa o carimbo de PRONTO nem o de SAÍDA**. Sem isso não existe pedido
ativo, e sem pedido ativo as faixas 30/50/70 não têm o que medir.

Esse é o bloqueio único e real. Tudo mais é secundário.

---

## Sprint 2 — dar olhos ao cérebro

### 2.1 Fonte com carimbo de pronto e saída (bloqueador)

Sem isto, o Sprint 2 inteiro não acontece. Caminhos possíveis, em ordem de
preferência:

1. coletor autorizado que observe a mudança de estado na sessão do lojista
   (entra pelo contrato de adaptador já existente, sem tocar no pipeline);
2. marcação leve no balcão — um toque quando o pedido fica pronto;
3. inferência a partir de outro sinal observável, **rotulada como inferida**,
   com confiança rebaixada e jamais tratada como carimbo.

A limitação D4A conhecida se soma aqui: `montarJanela()` do adaptador V3.3
sempre devolve `s: null, e: null` — saída e entrega nunca são observadas.

### 2.2 Checklist da Conferência

O relógio real da etapa. Ponto de extensão previsto:
`início da finalização` · `aguardando item` · `finalizado` · `liberado`.
Cada um é um `order_status_event` novo — o schema já os comporta.

### 2.3 Equipe

Quem está na etapa e em que condição. **Contrato obrigatório: sem nome, sem
ranking, sem atribuição de culpa.** Só `prontidão da abertura` agregada — o
modificador `READINESS_REDUCED` já existe e está esperando esta fonte.

### 2.4 Cardápio, materiais e equipamentos

Presença/ausência de embalagem, insumo de montagem, equipamento parado. Entra
como `readiness.reduced` com razão declarada — nunca como score.

### Critério de aceite do Sprint 2

O estado sombra deve produzir faixas reais sobre dados reais e ser comparável
com a percepção humana da operação. Enquanto ele não for comparado com a
realidade, não ganha o direito de falar.

---

## Sprint 3 — a Conferência fala

Só depois que o Sprint 2 provar acerto contra a percepção humana.

- **Interface**: a Conferência entra no mapa de células com estado próprio,
  seguindo "Campo Vivo" — luz é informação, vazio é saúde.
- **Explicações**: `reasons[]` vira texto legível na tela. A estrutura já sai
  pronta do estado sombra; falta a superfície.
- **Flags de promoção**: primeira flag capaz de tirar o estado da sombra. Hoje
  `shadowStateMayDriveProduct()` devolve `false` hardcoded — mudar isso é uma
  decisão humana registrada, com nome e data, não uma variável de ambiente.
- **Observabilidade**: quantas vezes a sombra acertou, errou, ficou parcial.
  Sem isso não há como saber se o cérebro merece a promoção.

---

## Sprint 4 — catálogo visual e treinamento

- catálogo visual dos 199 itens do seed;
- fotos por item (reduzem erro de conferência mais que qualquer alerta);
- embalagem por item: quantos volumes, qual sacola, o que não pode ir junto;
- treinamento: os sinais de composição viram material de formação, que é o
  destino natural deles — não alerta em tempo real.

---

## Pontos de extensão já preparados (Sprint 1)

Preparados **sem poluir** a fundação: são contratos e campos opcionais que
existem, não código morto esperando uso.

| Extensão | Onde encaixa | Estado |
|---|---|---|
| previsão de onda | novo consumidor de `computeRhythm` | contrato pronto |
| relógio real da Conferência | novos `order_status_events` | schema comporta |
| início da finalização / aguardando item / finalizado / liberado | idem | schema comporta |
| volumes e sacolas | `order_items.complements` + catálogo | campo existe |
| saída real | `orders.dispatched_at` | campo existe, sem fonte |
| checklist | nova entidade + `readiness` | ponto de entrada definido |
| equipe | `readiness` agregado, sem identificação | contrato definido |
| catálogo / fotos / embalagem | `catalog_item_id`, `catalog_match` | campos existem |
| localização de bebidas, reposição | composição (contexto) | fora do estado global |
| memória de decisões | nova entidade append-only | padrão do store serve |
| análise pós-pico | consumidor de `operational_snapshots` | dados já persistidos |

---

## Regras que continuam valendo em todos os sprints

1. Faixa de carga **nunca** opera sozinha.
2. Composição **nunca** controla estado global.
3. Nenhum score opaco, nenhum ranking de pessoas, nenhuma atribuição de culpa.
4. Carimbo ausente é ausência declarada, jamais estimativa.
5. Promover a sombra a oficial exige decisão humana registrada — nunca uma flag.
6. `montagem_outros` (Gengibre, Gohan, Sunomono, Tarê, Wasabi) pode ser contexto
   de itens externos; **não** é relógio nem carga total da Conferência.
7. Percentual de atraso do iFood não é verdade operacional principal: é
   contaminado pelo tempo prometido configurado na plataforma.
