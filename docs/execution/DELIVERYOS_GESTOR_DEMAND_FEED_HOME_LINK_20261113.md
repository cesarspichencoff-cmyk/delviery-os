# Delivery OS Itaim — o elo sensor do Gestor → motor existente → Home V3.3 (13/11/2026)

**Escopo:** código, testes e bancada no Foxxy, sobre `c5e85542` (HEAD da PR #137, revalidado no GitHub em 13/11).
**Nada foi instalado, executado ou lido no CAIXA_MOOCA.** Nenhum pedido real passou por este código.
Sem push, merge, deploy, SQL, impressão ou ação no Gestor.

## 1. O que faltava — medido, não presumido

| Peça | Estado em `c5e85542` |
|---|---|
| Sensor `scanMountedOrderProps` | existia, puro, 16/16 sintético — **ninguém o executava** |
| Diferencial de janela | existia, 18/18 — só contagens, sem saída por pedido |
| Reconciliadores (`compare`, `reconcile`) | existiam, puros, offline |
| Catálogo, projetor, política temporal, `homeVM` | existiam e testados |
| Executor que liga o DevTools do Edge ao sensor | **não existia** — só o supervisor tocava `/json/list`, para um booleano |
| Caminho do resultado do sensor até a Home | **não existia** — o resultado nunca saía da página |
| `/api/home` | montava sempre zero pedido (`homeSemPedidosQualificados`) |

O menor elo que faltava era este: **um executor que escreva o que o sensor vê, e um leitor que passe isso
pelo motor que já existe.** Não faltava outro sensor, outro join nem outro motor.

## 2. O que foi feito

```
Edge dedicado (página de expedição JÁ aberta)
   │  DevTools em loopback · um único método: Runtime.evaluate
   ▼
runtime/reporting/gestor_mounted_demand_feed_v1.cjs      ← NOVO (executor)
   │  usa o sensor existente e o diferencial existente
   ▼
gestor-demand-feed-v1.json + journal-AAAAMMDD.jsonl       (arquivos locais, escrita atômica)
   ▼
src/platform/leitura/demanda-do-gestor.ts                 ← NOVO (leitor estrito)
   ▼
src/product/eventos/demanda-gestor.ts                     ← NOVO (produtor)
   │  pedido_ciclo_observado@1 + source_health_changed@1 → validarEvento → projetarLeitura
   ▼
elegerModo → homeVM → GET /api/home → Home V3.3
```

- **Executor.** Um processo Node, sem dependência e sem processo filho. Lê a porta em `DevToolsActivePort`,
  acha a aba cuja URL é **exatamente** a de expedição, avalia o sensor dentro dela e fecha a conexão.
  A cada 10 s escreve o feed; a cada mudança, uma linha de diário (`seen`, `revised`, `left_view`,
  `back_in_view`, `hold`, `resume`, `start`). O diário não guarda conteúdo de pedido.
- **Leitor.** Arquivo regular, sem link simbólico, com teto de tamanho, cada campo validado. Devolve um
  estado nomeado: `nao_configurada`, `indisponivel`, `parada`, `retida` ou `observada`.
- **Produtor.** Um fato por pedido, com chave `pedido:revisão`; saúde da fonte pelo `observarSaude` existente.
- **Servidor.** `DELIVERYOS_GESTOR_DEMAND_DIR` (caminho absoluto) liga a leitura. Sem a variável, a Home
  continua exatamente como estava.
- **Home.** Estado de apresentação "Leitura parcial" e um índice do que cada pedido leva — quantidade,
  produto, opções e a observação sob o item a que pertence.

## 3. Os três níveis — só o primeiro foi entregue

| Nível | O que afirma | Estado |
|---|---|---|
| 1. Demanda observada | o pedido estava montado na tela de expedição do Gestor | **código pronto, provado em bancada** |
| 2. Pedido conciliado | o Reader da Teknisa confirma o mesmo pedido | não ligado — `estado_do_join: NAO_QUALIFICADO` |
| 3. Estado físico | preparo, pronto, saída observados na praça | sem fonte |

O que a Home **não** afirma neste nível: total de pedidos da casa (o pulso continua ausente), carga por
praça (`praca` e `categoria` ficam ausentes — nada é classificado por nome), pronto, despacho ou
cancelamento. Sair da tela é `left_view`. O status de cabeçalho do iFood segue opaco; a única leitura
feita dele é a segura: se fala em cancelamento, o pedido não aparece como demanda e a retirada é contada.

## 4. Prova

| Verificador | Resultado | Fronteira |
|---|---|---|
| `npm run test:gestor:demand-feed` | **16/16** | sintético — sensor real, página falsa |
| `npm run test:gestor:demand-home` | **10/10** | sintético — inclui `/api/home` por HTTP |
| `npm run test:gestor:demand:mutacoes` | **26/26 mortas, 0 cegas** | cada garantia removida derruba a suíte |
| `npm run lab:gestor:demand` | **7/7** | **Edge real, DevTools real, executor e servidor como processos** — página e pedidos sintéticos |
| Regressão (20 suítes) | **17 PASS · 3 FAIL_PREEXISTENTE · 0 FAIL_NOVO** | comparada com a base medida antes da mudança |

A bancada mede, com o navegador de verdade: leitura dos cartões; a Home devolvendo os mesmos itens,
opções e observações; pedido novo, quantidade alterada e cartão que some; executor morto e religado
sem repetir pedido; **página intocada** (zero mutação alheia, zero evento de entrada, zero global novo,
com controle positivo provando que a sonda enxerga); Edge fechado → retido com motivo; executor parado →
em menos de um minuto a Home deixa de exibir pedidos e diz que a leitura parou.

As três falhas pré-existentes, idênticas antes e depois: `home` H35 (`400 !== 200`), `governanca`
(datas de lifecycle), `r5d1` PF3. **O PF3 merece decisão:** ele afirma que o projetor não tem chamador de
runtime; já acusava três, e este elo acrescenta o quarto de propósito (ver `DECISIONS.md` D97).

Um controle não foi exercitado: o de link simbólico no lugar do feed — este host não tem privilégio
para criar o link. O código recusa; o teste declara que não mediu.

## 5. O que NÃO está provado

- **A página real do Gestor.** O sensor foi qualificado sobre a página real em 12/11 por outra sessão;
  este executor nunca a viu. Estrutura do React, virtualização da lista e o vocabulário de
  `currentStatus` seguem sem medição por este código.
- **Execução no caixa.** Nenhuma medição de janela, foco ou latência no CAIXA_MOOCA.
- **Atualização da página com o Edge minimizado** por horas, sob limitação de timers do Chromium.
- **Cobertura.** Cartões montados não são o total. Não há testemunha de cobertura.
- **Conciliação com o Reader, CI no HEAD, implantação, uso real, aceite humano.**

## 6. Instalação no caixa — preparada, **não executada**

Pré-requisitos a conferir por leitura: Node ≥ 22 em `C:\Program Files\nodejs\node.exe` (documentado
24.21.0); `DedicatedEdgeProfile\DevToolsActivePort` presente; uma única aba de expedição.

Três arquivos em `C:\ProgramData\DeliveryOS-Itaim-Observer\`, exportados do commit por `git archive`
(bytes do blob, não cópia do checkout):

| Arquivo | Blob Git |
|---|---|
| `gestor_mounted_demand_feed_v1.cjs` | `cecf0b8352f82cb637dcf69c8637ef7476e519f7` |
| `gestor_mounted_window_differential_v1.cjs` | `75e5275513d53ccc35d0b29fcb9873075fdc8464` |
| `gestor_v3_visible_sensor.js` | `106e9a77e7e34ebb5f0f5fff9f54069110fdcb87` |

Tarefa: `docs/operations/DeliveryOS-Itaim-Gestor-Demand-Feed.xml` — **`Enabled=false`**, SYSTEM
(`ServiceAccount`), Node direto, sem shell, `IgnoreNew`. O executor recusa rodar fora de
`CAIXA_MOOCA` + conta SYSTEM (código 30) e não aceita caminho por argumento no modo de campo.

Verificação depois de habilitar: em até 10 s existe
`gestor-demand-v1\gestor-demand-feed-v1.json` com `source_mode: "real"` e `scan.state`; o número de
pedidos bate com os cartões na tela; nenhuma janela apareceu.

Reversão: desabilitar e encerrar a tarefa; apagar a pasta `gestor-demand-v1`. Nada mais muda no caixa —
o executor não instala nada, não altera o Edge e não escreve fora dessa pasta.

**A Home precisa rodar na mesma máquina do feed** (mesmo relógio), com
`DELIVERYOS_GESTOR_DEMAND_DIR` apontando para a pasta. Hoje o servidor da Home não está no caixa e só
escuta em loopback: onde a equipe vai olhar a Home é decisão em aberto.

## 7. Achados colaterais

- **Supervisor do receptor (`c5e8554`), risco não verificado.** `main()` exige
  `process.env.USERNAME === "SYSTEM"`. Sob LocalSystem essa variável costuma ser `<MÁQUINA>$`; se for
  assim no caixa, o supervisor sai com código 30 e nunca roda. O executor novo usa
  `os.userInfo().username`. O arquivo do supervisor não foi tocado.
- **Bancada.** No Windows, `kill()` no processo lançado não fecha a árvore do Edge: duas execuções
  deixaram processos órfãos. A bancada passou a fechar o navegador pelo próprio DevTools e ganhou um
  vigia para o modo `--serve`.

## 8. Trilha Entregas — o que foi medido nesta sessão (pouco, e declarado)

Fatos, por leitura e por comando, no Foxxy em 13/11:

- `adb devices -l` **vazio**: o Xiaomi não estava conectado. SDK Android, `adb` 1.0.41, Java 17.0.19 e os
  AVDs `deliveryos_api34` e `deliveryos_connected_20261102` presentes. Nenhum teste Android foi rodado.
- **Não existe `onRenderProcessGone` em `android/`** — nem no `OriginLockedClient` de produção
  (`android/app/src/main/java/br/com/tata/entregas/ui/MainActivity.kt:326`) nem nos `WebViewClient`
  dos testes instrumentados (`RiderHttpsWorkerEndToEndInstrumentedTest.kt:43`).
- A CI sobe o emulador com `-gpu swiftshader_indirect`, sem `ram-size` nem `heap-size`
  (`.github/workflows/deliveryos-android-https-end-to-end-lab.yml:45-49`).

**Hipótese, não prova.** No Android, quando o processo renderizador do WebView morre e nenhum cliente
trata `onRenderProcessGone`, o sistema encerra o processo do aplicativo — sem exceção Java. É o mesmo
sintoma do run 43221183916 (`Process crashed`, zero frame Java). Um runner de CI com GPU por software e
memória padrão é o lugar típico para o renderizador cair; a bancada passou porque ele não caiu.

Se for isso, **não é só defeito de CI**: no aparelho de rua, com o sistema matando o renderizador sob
pressão de memória, o aplicativo inteiro cairia — e com ele o serviço de captura da viagem, que vive no
mesmo processo.

**Teste que decide, ainda não executado:** no emulador, carregar `chrome://crash` no WebView da
`MainActivity` real. Esperado hoje: o processo cai e a instrumentação reporta `Process crashed`. Com
`onRenderProcessGone` tratado (recriar o WebView e recarregar a origem), o processo sobrevive.

## 9. Decisões que são do César

1. Autorizar o ensaio supervisionado no caixa, e por qual canal.
2. Onde a Home roda e em qual tela a equipe a vê.
3. Aprovar ou redirecionar a apresentação: o cânone V3.3 não tem prancha de pedido com itens; o índice
   proposto está em `labs/gestor-demand-feed/capturas/` (pedidos sintéticos, não versionadas).
4. Reescrever o PF3 do `r5d1` para o projetor com chamador de runtime nomeado.
