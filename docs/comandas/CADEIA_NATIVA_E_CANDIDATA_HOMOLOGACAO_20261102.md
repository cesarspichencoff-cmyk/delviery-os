# TATÁ Comandas — cadeia nativa completa e candidata de homologação (02/11/2026)

> **Atualizado pela rodada 2 (mesmo dia, HEAD `1390b56`):** o 9092 das 23:02 agora está no jantar
> (decisão do César); `9.15.00.030.00` foi resolvido por equivalência de catálogo e o 9092 segura **só**
> na regra de kit `combinado 2p + 3 temakis`; a sequência TATÁ ganhou os níveis PREVIEW /
> CANDIDATE_PERSISTED_IN_LAB / LIVE_ATTESTED; observação de item deixou de travar a cadeia; as três vias
> foram medidas contra o Figma (`VIAS_VS_FIGMA_MEDICAO_20261102.md`). A candidata tem agora 23 + 6
> arquivos. As linhas abaixo sobre janela das 23h, alias e revisão visual descrevem o estado anterior.

**Base:** `b9026ac` (PR #131, intocada). **Branch:** `audit/comandas-native-chain-20261102`. **Estado:** DRAFT · HOLD · nenhum efeito físico.
**Missão:** revisão adversarial PR #131 comentário 6570127632 (rota P0–P4) sobre o checkpoint da issue #102.
**Host:** `CAIXA_MOOCA` = computador físico do caixa Itaim (César, 22/10). Sem acesso a ele nesta sessão; nada foi lido ou alterado lá.

## 1. Resultado

**Uma revisão real atravessou a cadeia inteira e saiu em três vias virtuais coerentes**, recusando só o que não está provado:

`par nativo (watcher + consumidor V2 V7.14) → janela pela hora nativa → casamento nativo no mesmo snapshot → ingresso V6.6 → motor Academia pinado (V6.3) → vias V4.5 → render V4.6`

Revisão real **9627** (IDs, itens, quantidades e estados nativos `X`/`4` já commitados em `data/`), catálogo real da Academia (`app-data.json` blob `d4cc9ba9`) e motor real (`packaging-current.js` blob `3167c309`):

| Camada | Estado | Motivo |
|---|---|---|
| L1 origem/revisão | `NATIVE_REVISION_CONSISTENT` | chave de 4 partes, snapshot e fingerprint conferidos; `X`/`4` aceitos só como revisão |
| L2 turno | `NATIVE_ORDER_TIME_WINDOW` = jantar | abertura nativa 22:58; o arquivo de turno de 14/10 vira diagnóstico |
| L3 conteúdo | `NATIVE_CONTENT_PROVEN` | 4/4 classificados por nome exato da Academia; caixas e kits `FACT` |
| L4 vias | `THREE_VIEWS_VIRTUAL` | Produção COZINHA (Edamame, Nasu no Misso · 2×650) · Produção DELIVERY SUSHI 1 (3× Combinado Kids 750, Sushi de Unagui 240) · Conferência (6 caixas com `Op. ____`, 1 sacola G, 3 Kit Kids, 1 Kit Quente) |
| L5 sequência | `HOLD` | sem vínculo persistido e atestado: nenhum número, **0 bytes ESC/POS** |

A conferência fica em `HOLD` só pelo cruzamento iFood independente (`INDEPENDENT_IFOOD_CROSSCHECK_NOT_AVAILABLE`); as produções não esperam por ele.

Revisão real **9092**: L1 e L2 passam; **L3 segura certo** — `9.15.00.030.00` sem classificação, então sem caixa nem kit. E ela foi aberta às **23:02:07**, fora da janela documentada (jantar até 23:00).

Fonte: `ACADEMIA_ROOT=<checkout> node tools/comandas_replay_real_privado_p0.cjs` (local; sem o checkout, sai `SKIPPED`). Hashes do texto das vias do 9627: `3a85dbf2…` (Cozinha), `e6e9613b…` (Delivery Sushi 1), `3658f76e…` (Conferência).

## 2. Causas eliminadas (não sintomas)

| Causa provada no código | Efeito | Correção |
|---|---|---|
| `tools/tata_reader_continuous_watch_candidate_v1.ps1:277–279`: `ready_for_downstream_shadow` = "turno sem bloqueio" | com o arquivo de turno de 14/10 vencido, **todo** evento sai não pronto e o V2 bloqueia o conteúdo | o turno vira diagnóstico; a janela sai da **hora nativa do pedido** pela regra registrada (almoço Balcão, jantar Delivery), sem aprovador diário |
| `src/production/deliveryProductionJoin.ts:116`: produção só casa com entrega por `COMANDA.: DLV_<N>` **impresso** | o papel de 30/09 não traz esse texto → a V6.8 nunca projeta um pedido real | `joinNativeReaderSnapshotV1`: entrega e produção do **mesmo snapshot nativo**, chave de 4 partes, sem texto impresso |
| consumidor/planejador recusam os dois membros do par `00009/00003` e `00006/00004` | itens de sushi sem destino | seletor existente por janela + regra de praça; no almoço nada vai para DELIVERY SUSHI 1/2 (teste) |
| planejador exige número TATÁ | sem vínculo, nenhuma via virtual | marcador explícito não numérico; o renderizador continua exigindo `^\d{3}$` → **0 bytes**; número só com vínculo persistido e atestado |

Não mudou: watcher instalado, consumidor V7.14 (blob `8e75fea8…`, igual ao pin), motor, renderizador aprovado no Figma, planejador, filas, serviço.

## 3. Tabela única dos 6 gates

| Gate | Estado atual | Evidência (arquivo · SHA · teste · ambiente) | Bloqueio material | Correção executada | Prova de regressão | Próximo ato |
|---|---|---|---|---|---|---|
| **1 Origem/identidade/revisão** | revisão real consistente; fonte **não** atestada independentemente | `assessNativeReaderV2` sobre 9627 e 9092 reais · teste `verificar_comandas_cadeia_nativa_v1` casos 1, 8, 9 · Linux local + CI | revisão **atual** do host não relida (sem acesso); autoconsistência ≠ atestação | nenhuma (já correto) | cancelamento `4`/item `6`, item alterado e decisão velha param em L1 | 1 replay read-only de revisão recente no host, autorizado |
| **2 Watcher/estado real** | turno legado deixou de travar conteúdo | watcher `:277–279` · consumidor V7.14 · casos 2, 3, 6, 7 | pedidos depois das 23:00 (9092 às 23:02) ficam fora da regra | janela pela hora nativa; turno = diagnóstico | almoço → BALCAOSUSHI1, nunca DELIVERY; fora do horário → só destino em HOLD, conteúdo preservado | **decisão de César**: janela para pedidos depois das 23:00 |
| **3 Itens/observações/motor** | 9627 provado; 9092 com 1 produto sem classificação | catálogo `d4cc9ba9`, motor `3167c309` / sha256 `1e4cf247…` · casos 1, 10, 14 | `9.15.00.030.00` "COMB SUSHI + SASHIMI ESPECIAL 2 P" tem **dois** candidatos na Academia ("…Sushi + Sashimi 2 pessoas" e "…Sashimi + Sushi 2 pessoas") | nenhuma inferência por semelhança; `A DEFINIR` | nova revisão (2 Kids) re-avaliada: kits não provados → HOLD, nunca reaproveita os 3 Kit Kids | **decisão de César**: qual entrada da Academia (alias revisado) |
| **4 Duas produções + conferência** | três vias virtuais no mesmo snapshot | V4.5/V4.6 existentes · caso 4 · hashes no §1 | conferência sem cruzamento iFood independente; papel não visto; paridade pixel com Figma 30:2 / 20:2 **não medida nesta rodada** | casamento nativo no mesmo snapshot | 6 `Op. ____`, sacola/kits exatos, destinos por janela | revisão visual das três vias com César contra Figma V4.4/V4.3 |
| **5 Sequência/anti-duplicação** | nenhum número; nenhuma escrita | caso 13 · journal (PR #130) · último estado legível 26/10: `bindings=0`, `next_value=1`; leitura de 02/11 = ACCESS DENIED | vínculo persistido/atestado não existe; ACL negou leitura | gate explícito: só vínculo persistido, atestado e da mesma revisão mostra número | vínculo não atestado, de outra revisão ou `000` → nada | definir protocolo de atestação do vínculo (autorização separada) |
| **6 Pacote Windows/rollback/papel** | candidata medida e pinada; nada instalado | `docs/comandas/CANDIDATA_HOMOLOGACAO_CADEIA_NATIVA_V1.manifest.json` (22 código + 5 dados) · teste de deriva · CI Linux+Windows | instalação, serviço, papel Epson e aceite = não autorizados | fecho de dependências **medido**, sem `child_process`, rede ou impressão | deriva do manifesto falha a CI | autorização para piloto em sombra (§5) |

**Vermelho → verde por HEAD** (cópias limpas): em `59d0b70` (só testes) a cadeia nativa e a candidata não existem e os dois verificadores falham; em `5f5e632` passam **15/15** e **4/4**.

**Regressão local, todos os passos `run:` do job Linux, isolados:**

| Árvore | Executados | Passaram | Falharam (ambiente) |
|---|---:|---:|---:|
| base `b9026ac` | 135 | 133 | 2 |
| `5f5e632` | 138 | 136 | 2 |

Mesmas 2 falhas nas duas árvores (sem `pwsh`; V8.37 só em runner hospedado). Diferença de status: **zero**. Testes principais do `CLAUDE.md` (`build`, `typecheck`, `demo`, `teste_fonte_real`, `verificar_dados_primarios`): saída 0. Windows: na CI desta PR.

## 4. O que efetivamente impede a instalação — ordem mínima

1. **César decide 2 regras de produto vistas em pedido real:** (a) alias de `9.15.00.030.00`; (b) janela para pedidos abertos depois das 23:00.
2. **Revisão visual** das três vias virtuais contra Figma V4.4 (nó 30:2) e V4.3 (nó 20:2).
3. **Autorização do piloto em sombra (§5)**: um replay read-only de revisões recentes no host, com a candidata pinada, sem tocar no serviço.
4. **Protocolo do vínculo de sequência** persistido e atestado (gate 5) — sem ele, nenhuma via sai em papel.
5. **Papel Epson supervisionado** e aceite de César.

Não é bloqueio desta fase: novo censo de `IMP`/spool, investigação de emissor, DeliveryOS/Copiloto.

## 5. Roteiro de piloto em sombra — NÃO executado, exige autorização específica

1. Copiar **só** os 27 arquivos do manifesto (blobs conferidos) para uma pasta nova `C:\ProgramData\TataComandaReader\shadow-native-v1\` — não substitui nada do serviço instalado.
2. Rodar **manualmente** o consumidor V7.14 + `runNativeChainV1` sobre eventos já gravados pelo watcher, só leitura; saída: estados por camada e hashes, para uma pasta de evidência local.
3. Não iniciar/reiniciar serviço, não ler SQL novo, não tocar fila/spooler/impressora, não escrever sequência.
4. **Rollback:** apagar a pasta. **Coexistência:** o loop V1 instalado segue igual. **Exclusividade:** a candidata não tem emissor (teste de capacidade).
5. Dado sensível fica no host; ao GitHub só estados, contagens e hashes.

## 6. Segurança

Efeitos `false`: impressão, spooler, fila, porta, serviço, instalação, caixa, Retail, SQL, sequência, fiscal, credencial, merge, deploy, Teknisa. `PAPER=UNKNOWN` · `TATA_SEQUENCE_LIVE=UNKNOWN` · `INSTALLED=false` · `10/10=NOT_PROVEN`.
