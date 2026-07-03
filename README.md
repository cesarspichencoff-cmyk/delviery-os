# DeliveryOS

**Sistema nervoso de operações de delivery em tempo real.** A tese: memória que depende de um ato separado morre; só sobrevive a memória que é **subproduto do trabalho**. O DeliveryOS escuta o que a operação já emite (iFood, SAC, produção), transforma em memória append-only e devolve **investigação pronta** — situação, causa provável, próxima ação, impacto — sem pedir que ninguém preencha nada no pico.

Laboratório n=1: **TATÁ sushi** (4 anos de operação real — 171 mil mensagens de WhatsApp estudadas, 30 dias de relatório iFood, cardápio real de 199 itens).

## O fluxo oficial

```
cardápio real (seed) → adapter → resolver → sinais/diagnósticos → gerente de atenção → interface
```

Uma verdade, um cérebro: o mesmo `motor.js` roda no Node (backtest) e no browser (protótipo). A fonte de itens por pedido é um **seam único** (`FONTE_ITENS`) — trocar sintético→real (CSV/JSON/API/KDS) não muda nenhuma regra de decisão.

## Três motores, honestamente separados

| Motor | Estado | Fonte |
|---|---|---|
| (A) tempo / estado do pedido | **REAL** | relatório iFood (recebido/pronto/saiu/cancelado) |
| (B) praça (carga por bancada) | **SINTÉTICO** | composição fabricada — vira real via [modo ponte](docs/Formato_Importacao_Itens_Reais.md) |
| (C) conhecimento do cardápio | **REAL** | [`data/cardapio_knowledge_seed.json`](data/cardapio_knowledge_seed.json) (199 itens, 8 praças) |

As 8 praças: `combinados · duplas · enrolados · enrolados_quentes · cozinha_quentes · sobremesa · bar_bebidas · montagem_outros`.

## Estrutura

```
src/core/                  # Camada 0 canônica (TS): Transição, log append-only, projeções — sem vocabulário de vertical
src/perfil-delivery/       # motor.js — o cérebro (adapter, resolver 8 praças, diagnósticos, atenção)
data/                      # cardápio-conhecimento (199 itens, versionado) + formato ponte de itens reais
data/raw/                  # dado bruto local (relatórios iFood etc.) — gitignorado, ver docs/Politica_Dados.md
data/canonico/             # dado derivado/estruturado local — gitignorado, reservado p/ Mapa_Canonico_Dados.md
prototipos/parados-agora/  # Campo Vivo: calmo/ambiente/foco (index.html gerado — editar app.js/motor.js)
tools/                     # builds, auto teste 30 dias, prova de fonte real, servidor de preview
docs/                      # Constituição, Leis, Manifesto, Mapa de Sinais, arquitetura, auditorias, planos
```

## Rodar

```
npm run demo                        # Camada 0 ponta a ponta (dado sintético, roda em qualquer clone)
node tools/teste_fonte_real.js      # prova: itens reais (CSV) → mesmo motor, zero regra alterada
node tools/build_prototipo.js       # regenera prototipos/parados-agora/index.html
node tools/serve_prototipo.js       # preview em http://localhost:5178
```

Os dois comandos abaixo precisam do relatório real de pedidos do iFood — ver "Configurar dados locais".

```
npm run ingest                          # gera/regenera data/ifood_real.jsonl (Camada 0)
node tools/autoteste_8pracas.js         # backtest 30 dias reais (motor de 8 praças)
```

## Configurar dados locais (nenhum caminho fixo de máquina)

Nenhum script deste repositório depende de uma máquina específica. Todo caminho de dado tem um padrão
relativo ao próprio repo, sobrepujável por argumento de linha de comando ou variável de ambiente — ver
`.env.example` e [`docs/Politica_Dados.md`](docs/Politica_Dados.md).

1. Copie o export de pedidos do iFood (`.xlsx` ou `.xlsx.zip`, tanto faz) para
   `data/raw/relatorio_pedidos_ifood.xlsx` (pasta já existe, é gitignorada — nunca vai pro GitHub).
   Sem esse arquivo, `npm run ingest` e `node tools/autoteste_8pracas.js` param com uma mensagem de erro
   clara explicando onde colocá-lo.
2. Rode `npm run ingest` — ele lê o relatório, reconstrói a História (Camada 0, replay-safe) e escreve
   `data/ifood_real.jsonl`.

**`data/ifood_real.jsonl` — o que esperar:**

| | |
|---|---|
| **Entrada** | `data/raw/relatorio_pedidos_ifood.xlsx` (relatório de pedidos do iFood, uma aba, colunas oficiais do export) |
| **Comando** | `npm run ingest` (sem argumento) — ou `npm run ingest -- "<caminho>"` para apontar outro arquivo |
| **Saída** | `data/ifood_real.jsonl` — um `Transicao` por linha (log append-only da Camada 0) |
| **Validação embutida** | o próprio comando imprime: linhas lidas, pedidos válidos, transições no log, estado final por pedido, erros/atritos derivados, e um teste de replay (reprocessa tudo e confirma que nada duplicou) |
| **Total esperado** (com o relatório de 27/05–25/06/2026) | 8.305 pedidos válidos → 41.206 transições |
| **Quando regenerar** | sempre que o relatório de origem mudar (novo export, período diferente), ou se `src/ingest/ifoodRelatorio.ts` for corrigido |
| **Por que não é versionado** | é 100% derivado — regenerar é determinístico e leva segundos; versionar criaria uma segunda verdade que pode divergir do relatório de origem (ver `docs/Politica_Dados.md`) |
| **Backup do `.xlsx` bruto** | continua sendo responsabilidade de quem exporta — hoje vive só em `Downloads`, sem backup confirmado fora da máquina (risco registrado em `docs/Auditoria_Nivel2_Validacao_Base.md`) |

## Princípios inegociáveis

- **Nunca vira ERP**: cadastro é referência set-once; ninguém preenche nada por pedido, nunca no pico.
- **Nunca vira dashboard**: a tela some quando está calmo; foco é raro e só aparece quando vale agir agora.
- **Honestidade estrutural**: o que é sintético é rotulado sintético; estados não-observáveis nunca são preenchidos falsos; item que não casa com o cardápio é reportado, não inventado.
- **Diagnóstico, não alarme**: "esta praça trava estes pedidos, por esta causa, e esta ação libera mais fluxo".

Documentos fundadores: [Constituição](docs/Constituicao.md) · [Leis Fundamentais](docs/Leis_Fundamentais.md) · [Manifesto de Produto & Design](docs/Manifesto_Produto_Design.md) · [Mapa de Sinais Operacionais](docs/Mapa_Sinais_Operacionais.md) · [Motor 8 Praças](docs/Motor_8Pracas.md) · [Plano Fonte Real de Itens](docs/Fonte_Real_Itens_Plano.md)
