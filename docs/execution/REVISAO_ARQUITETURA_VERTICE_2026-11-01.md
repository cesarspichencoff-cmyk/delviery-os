# Revisão de arquitetura e produto — as cinco capacidades (01/11/2026)

Branch local `claude/deliveryos-arquitetura-vertice-20261101`, criada sobre `de889456` (ponta da branch
local do Toqan, que segue intacta). **Nenhum código de produto foi alterado nesta revisão.** Sem mudança
operacional, instalação, gasto, deploy, merge ou push. Esta nota não declara 10/10 para nada.

## 0. Método e limites

- **VÉRTICE 2.2** não tem texto canônico em nenhum repositório: busquei na árvore e no histórico de
  `delviery-os`, `vertice-runtime.` e `tata-academia`. O nome aparece só como referência de autorização
  (`PERGUNTAS.jsonl` Q-020 e Q-023: "conversa VERTICE 2.2, 2026-10-20") e como autoria
  (`DELIVERYOS_V1_FAST_LANE_CANDIDATE_2026-10-20.md`). Apliquei o método como ele é praticado aqui:
  reproduzir antes de afirmar, eliminar a solução convencional e entregar uma única direção.
- **SPORE não foi encontrado em lugar nenhum.** As quatro ocorrências em `tata-academia` são falso
  positivo ("prova**sPorE**dicao"). Não inventei uma definição e **não apliquei SPORE**. A pergunta
  virou `Q-027` (`PAUSE`).
- **Referências externas.** A política de rede desta sessão bloqueou os sites oficiais (fresh.technology,
  developers.google.com, nightlies.apache.org, precitaste.com, developers.deliverect.com, arxiv.org).
  Só três páginas foram lidas por inteiro, todas no GitHub: Flink "time", Flink "generating watermarks"
  e a API do VROOM. Elas estão marcadas **O** (aberta). O resto é trecho de resultado de busca, marcado
  **S**. Material de fornecedor descreve o produto; não prova eficácia.

## 1. Inventário: o que existe, com prova

Classes usadas:

- **REAL**: roda hoje com fonte real.
- **SÓ SINTÉTICO**: código testado que nenhuma fonte real alimenta ao vivo.
- **AUSENTE**: não existe.

Baseline executada no commit exato `de889456`:

| Suíte | Resultado |
|---|---|
| `test:platform:copiloto` | 41 OK |
| `test:platform:q003` · `q003:identidade` · `q003:e2e` | 11/11 · 10/10 · 9/9 |
| `test:platform:r5a` · `test:platform:home` | GREEN · GREEN |
| `test:platform:spine` · `topology` · `bridge` | 29/0 · OK · 45 OK |
| `test:platform:conference` (4b1–4b5 + sombra) | 23 · 25 · 26 · 41 · 37 · 41 OK |
| `test:copiloto:tata-orders` · `tata-reader-adapter` · `run-file-feed-tests` | 9 · 15 · 19 |
| `test:sources:toqan` | GREEN (13/13) |
| `tools/autoteste_8pracas.js` | **NÃO RODOU.** Exige o export real do iFood em `data/raw/`, que por política não está no repositório |

### 1.1 Trajetória dos pedidos

| Peça | Classe | Prova / onde |
|---|---|---|
| Viagem ponta a ponta: Entregas → `platform.event_log` → Operação Viva (replay Q-016) | REAL quando o piloto roda (hoje só ensaio) | q016 (PostgreSQL), `real-trip-ui` 13/13 |
| Pedido antes da viagem (Comandas/Teknisa): abertura, itens, ciclo do KDS | SÓ SINTÉTICO (leitor não instalado) | `runtime/reporting/copiloto_tata_orders_v1.cjs`; 9 + 15 + 19 testes |
| Relógio do pedido na conferência (Conference Brain) | SÓ SINTÉTICO | `browser-adapter.js` não existe no repositório; o adaptador da Operação Viva emite `orders=[]` |
| Ligação pedido ↔ viagem ↔ pedido iFood | AUSENTE | `order_state_changed` está no catálogo da plataforma mas não é roteável (sem contrato nem consumidor); a projeção TATÁ traz `trip_id: null` |

**Achado medido: a hora do "pronto" se perde.** Rodei uma reprodução no piloto real, modo arquivo, em
diretório temporário:

1. A expedição registra `P-1` como pronto às `07:26:10.881Z`.
2. `CreateTrip` e `ConfirmTripDeparture` dão OK.
3. Busquei o carimbo exato nos 4 arquivos que o piloto escreveu (`ops.log.jsonl`, `ready_orders.json`,
   `store.json`, `store.json.bak`): **0 ocorrências**. Na busca ampliada pelo segundo, as 2 ocorrências
   são da linha `session_login` do operador, não do registro de pronto.
4. A fila ficou com 18 bytes, sem `P-1`.

Conclusão: o trecho pronto → saída não pode ser reconstruído depois que a viagem nasce. Em PostgreSQL, o
trigger da migration 0008 apaga a linha da fila na mesma transação da entrega; isso foi lido no código,
não executado. O catálogo público de Entregas já tem `delivery_ready` e um construtor
(`buildSignalEvent`), mas **nenhum código fora de teste o chama**. O catálogo da plataforma não tem esse
tipo.

### 1.2 Previsão de risco

| Peça | Classe | Prova / onde |
|---|---|---|
| Risco por regra sobre o estado atual (motor: pisos fixos para pedido preso e saída travada) | SÓ SINTÉTICO ao vivo | `src/perfil-delivery/motor.js` |
| Políticas do Copiloto em sombra (sinal velho, capacidade, ocorrências) | só em teste | `shadow.ts`. `POLITICA_CAPACIDADE` nunca dispara: `capacidade_maxima` só é passado em teste. A espinha só liga em ambiente local (`platform-config.ts:143-151`) |
| "Atrasados segundo o iFood" (Toqan, agregado) | sombra local | `src/sources/toqan/` |
| Previsão de verdade (ETA, probabilidade de atraso, tempo de preparo previsto) | **AUSENTE** | `decisao.js` declara "Não prevê" |

### 1.3 Identificação de gargalos

| Peça | Classe | Prova / onde |
|---|---|---|
| Motor 8 praças (sobrecarga de praça, saída travada, preso, fechamento, conferência) + atenção Q-003 + política temporal R5-A | SÓ SINTÉTICO ao vivo; **validado em replay real histórico** | `docs/Relatorio_Replays_Reais_Jun20-30.md`: 3.215 pedidos com composição real. Com composição sintética a decisão mudava (no sábado 20/06, focos de fechamento 9 sintéticos contra 1 real; focos de praça cerca de 2× com dado real) |
| Carga por praça ao vivo | bloqueada por D81 / R5-D2 | A comanda do Odhen/Teknisa é única, sem praça. A praça só seria **inferida** do item, e isso foi recusado para `trabalho_praca_observado`. O caminho decidido é o registro explícito pela bancada: o produtor existe e ninguém o usa |
| Item da Comandas → praça | AUSENTE | A projeção traz só `product_code` (descarta `route_code`). O cardápio-conhecimento (199 itens) não tem código Teknisa |

Os documentos do motor divergem entre si: `Motor_8Pracas.md` diz 7,1/10 e precisão de 42%;
`AutoTeste_Operacional_8pracas.md` diz precisão de 70% (373/536). Nenhum dos dois números foi usado como
prova aqui.

### 1.4 Coerência entre fontes

| Peça | Classe |
|---|---|
| Dentro de cada fonte: conflito na Comandas; reconciliação por campo no Conference Brain; o Toqan recusa total ou etapa inconsistente; o projetor R5-D transforma regressão em conflito auditável; `source_mode` obrigatório (Q-017); frescor e UNKNOWN da fonte TATÁ | REAL (regras testadas) |
| Entre fontes (Comandas × Entregas × iFood × Toqan) | **AUSENTE** (Neemo ↔ Teknisa existe, mas só sintético) |

Toqan (iFood) e Entregas (frota própria) cobrem universos diferentes. A comparação que faz sentido é
**Toqan × Comandas**, porque as duas fontes cobrem os pedidos iFood que estão dentro do Teknisa.

### 1.5 Aprendizagem sobre intervenções

| Peça | Classe |
|---|---|
| Registro da decisão humana sobre uma recomendação (`dismiss` / `accept_for_future`, `human-action-gate` 13/13, retenção de 90 dias pela Q-015) | só em sombra; não há rota no produto |
| Medição do efeito (antes e depois, braço de controle, promoção de regra) | **AUSENTE**. Existe só na Constituição §114 |

**Síntese do inventário.** A inteligência existe e está testada, mas roda inteira sobre fixture, síntese
ou teste. A Home é demonstração (`tools/product_system_server.ts:52,219`), e o único produtor de
`LeituraOperacional` é a fixture. O que falta é o mesmo para as cinco capacidades: **fatos do ciclo do
pedido, com hora de evento, vindos de uma fonte real.**

## 2. Difference Check contra as referências

| Referência | Mecanismo | Cap. | DeliveryOS hoje | Decisão | Fonte |
|---|---|---|---|---|---|
| Apache Flink | Tempo do evento ≠ tempo de processamento. Watermark = "o tempo de evento chegou a t". Fonte ociosa não segura o relógio (`withIdleness`) | 4 | Parcial: `occurred_at`/`recorded_at`/`clock_trust` no GPS; fonte stale = UNKNOWN | **Adotar como regra, nunca como motor** (sem cluster) | O: `github.com/apache/flink/.../concepts/time.md`, `.../generating_watermarks.md` |
| Apache Flink | Atraso tolerado recalcula e emite revisão; atraso além disso vai para um lado e é contado. CEP `within()` transforma sequência parcial vencida em evento | 1, 2, 4 | `AVANCO_PEDIDO` não regride e registra conflito; o motor usa pisos fixos | Adotar a ideia "preso na etapa X" na projeção futura | S |
| Fresh KDS (fornecedor) | Cabeçalho verde/amarelo/vermelho por tempo na etapa, com limiar por tipo de pedido; metas valem só a partir do próximo pedido; tempo por item para o pedido terminar junto | 2, 3, 5 | Pisos fixos, não calibrados; sem tempo por item | Adotar "idade na etapa × limiar por tipo, mudança só daqui para frente". Tempo por item aprendido é hipótese: o próprio fornecedor lista como "em breve" | S |
| Deliverect (fornecedor) | Status numerados que só sobem; Finalized ≠ entregue; busy mode manual; snooze com a lista completa | 1, 4, 5 | "Só sobe" já existe (`AVANCO_PEDIDO`); "concluído ≠ saiu" já é regra do Conference Brain | Já coberto. Não adotar hub de integração; iFood pela API oficial, se houver credencial | S |
| PreciTaste (fornecedor) | Previsão de demanda → plano de preparo; câmeras; aderência ao plano | 2, 3, 5 | Nada | Não agora: exige histórico limpo e/ou câmeras. Aderência ao plano não é efeito | S |
| Google OR-Tools | VRP com janelas de tempo; coleta e entrega no mesmo veículo | 2, 3 | Nada | Não agora: um ponto de coleta, poucos motoboys, despacho humano, endereço fora da viagem (LGPD pendente), sem matriz de tempos | F (falhou) / S |
| VROOM | Tarefas com janela, habilidade e capacidade. **Modo plan**: mantém a ordem escolhida e calcula ETA e atraso | 2 | Nada | Único pedaço útil mais tarde: pontuar a rota que o humano escolheu. Exige motor de rotas (infraestrutura): não agora | O: `github.com/VROOM-Project/vroom/blob/master/docs/API.md` |
| Wang, Zhang & Yi 2020; Ulmer et al. 2021; Neria et al. 2024 | Cozinha e entrega planejadas juntas; atrasar a atribuição com folga dimensionada pela variação do tempo de pronto | 2, 3 | Nada | Adotar só a regra: medir a variação de pronto → saída antes de qualquer otimização. **Essa medida exige exatamente o fato que hoje se perde** | S |

**A diferença que não pode se perder.** Nenhuma referência separa FACT ≠ INFERENCE ≠ SIMULATION ≠
UNKNOWN em cada número, trata ausência como estado (nunca zero), tem uma autoridade única de atenção
(Calmo/Ambiente/Foco) ou deixa a decisão final com o humano. As referências são painel ou automação; o
DeliveryOS é sistema nervoso. Adotamos mecanismos, não a forma. A pesquisa também não achou referência
que documente o efeito de uma intervenção: a capacidade 5 terá de ser construída e validada aqui.

## 3. Arquitetura recomendada (uma)

**Fato na origem, uma porta, consumidores que já existem.**

```
fontes que testemunham          fatos do ciclo do pedido            consumidores que JÁ existem
───────────────────────         ──────────────────────────          ───────────────────────────
Entregas (pronto, saiu,   ──►   hora do evento + hora do      ──►   atenção (motor / Q-003, R5-A)
  entregue, cancelado)          registro + source_mode +            Home / Copiloto (LeituraOperacional)
Comandas (aberto, itens,        chave idempotente + origem          Copiloto em sombra
  ciclo do KDS)                        │                             Conference Brain
Gestor iFood (observação)              ▼
                                platform.event_log (append-only, contrato por tipo)
Toqan (agregado) ──────────────────────┐
                                       ▼
                                UMA projeção do pedido (R5-D, existe, congelada), junção só por chave provada
                                       │
                                coerência: contagem por etapa × Toqan, mesmo universo, sem ação
```

Regras de Flink, implementadas no código que já existe (sem motor novo):

- Tempo do evento ≠ tempo de registro.
- Fonte calada = UNKNOWN, nunca "sem pedidos".
- Fato atrasado gera revisão marcada; fato além do limite fica de lado e é contado.
- Estado só avança; o que tentar voltar vira conflito.

Como cada capacidade entra:

| Capacidade | Onde | Quando |
|---|---|---|
| 1. Trajetória | A projeção: marcos com origem e carimbo; lacuna = UNKNOWN | A partir da entrega mínima, só para a frota própria |
| 2. Risco | Idade na etapa × limiar por tipo de pedido, tirado dos próprios dados (P80/P90) e aplicado só daqui para frente | Depois de semanas de fatos reais e de decisão de calibração do César. Antes disso, UNKNOWN |
| 3. Gargalos | Motor e sinais existentes alimentados pela projeção. Saída primeiro (fato próprio). Praça só com registro da bancada (D81) ou com decisão sobre inferência rotulada | A saída logo depois; a praça depende de decisão |
| 4. Coerência | Regras entre fontes sobre a mesma projeção, no mesmo universo (Toqan × Comandas). O resultado é estado ("fontes divergem"), nunca orientação (Q-001) | Depois do plano de observação do Toqan e do leitor instalado |
| 5. Aprendizagem | Decisão registrada (já existe) + duração das etapas na janela seguinte, por tipo de situação, **nunca por pessoa** (decisão 12, Lei 4). Só descritivo | Por último |

Fora da arquitetura: motor, barramento, banco ou fila novos; cluster Flink; ML; solver de rotas; câmeras;
Toqan no view model do Copiloto.

## 4. Menor conjunto de alterações — próxima entrega: "o pronto vira fato"

Por que esta entrega:

1. É o único fato do ciclo que o DeliveryOS testemunha e joga fora (medido, §1.1).
2. O contrato já existe (`delivery_ready` + `buildSignalEvent`); falta o produtor.
3. Não toca caminho congelado. Medido com a regra do próprio guarda M1: 15 pathspecs congelados, entre
   eles `projetar-leitura.ts`, `catalogo-operacional.ts`, `src/product/viewmodels/`, `src/perfil-delivery/`
   e `src/platform/copiloto/`. Nada disso é tocado.
4. É pré-condição das cinco capacidades: variação de pronto → saída (Ulmer), idade na etapa (Fresh),
   coerência e aprendizagem.
5. Não exige instalação, gasto nem dado real.

Alterações (Entregas, aditivas):

| Arquivo | Mudança |
|---|---|
| `src/entregas/pilot/pilot-facade.ts` | Quando `registerReadyOrder` dá certo, gravar `delivery_ready` na mesma unidade de trabalho do registro: mesma transação em PostgreSQL, mesma escrita atômica em arquivo. Carimbo = hora do servidor no registro (não a do navegador). Semântica: "registrado pela expedição", não "ficou pronto". Payload só `{ready_id, order_ref, channel}`. **Nunca `label`**, que pode conter endereço. `source_mode` vem da configuração, sem padrão |
| `src/entregas/pilot/trip-timeline.ts` | Linha "Pronto registrado pela expedição" (autor: operação) antes da saída, ligada pelo `ready_id`/`order_ref` das entregas da viagem |
| Nada em plataforma, Copiloto, Home ou M1 | — |

Ganho verificável: hoje 0% dos pedidos da frota própria têm o trecho pronto → saída depois que a viagem
nasce. Depois da entrega, 100% dos pedidos registrados pela interface real o têm, na linha do tempo que o
console já mostra.

## 5. Provas e testes necessários

Cada prova nasce vermelha antes de qualquer correção.

| ID | Prova |
|---|---|
| T1 | Registrar `P-1` em T0, montar a viagem e confirmar a saída em T2. Existe exatamente um `delivery_ready` com `occurred_at` = T0 (relógio do servidor), e a linha do tempo mostra T0 antes de T2. A reprodução do §1.1 é o vermelho |
| T2 | Registrar de novo um pedido que já está na fila não cria segundo fato. O mesmo `order_ref` reutilizado depois de sair cria `ready_id` novo |
| T3 | `source_mode` `simulated` chega `simulated`; ausente é recusado; nunca vira `real` (L9) |
| T4 | Mesmo T1 em PostgreSQL descartável (o trigger 0008 continua apagando a fila; o fato fica) e em dois pilotos sobre o mesmo banco |
| T5 | Reinício do piloto: o fato persiste e não duplica |
| T6 | Privacidade: o payload não carrega rótulo, endereço nem cliente |
| T7 | Falha injetada entre fila e fato: nunca fica fila sem fato nem fato sem fila |
| T8 | Navegador: o console real registra pelo botão, monta a viagem, o motoboy sai, e a linha do tempo mostra o pronto (R14 em `run-real-trip-ui-tests.ts`) |
| Mutações | Sem emissão → T1; hora do navegador → T1; `label` no payload → T6; `source_mode` com padrão `real` → T3; duplicata no re-registro → T2; fila e fato fora da mesma escrita → T7. Zero cegas |
| Regressão | `test:entregas` (242 linhas), `real-trip-ui` 13/13, `rider-offline` 10/10, `rider-bridge` 31/31, governança, `run-sem-fail-novo` (m1-bridge C6 sem caminho congelado alterado), `build`, `typecheck`, CI no HEAD exato |

O que a entrega **não** prova: aparelho físico; que a expedição registre na hora certa (atraso do registro
é viés declarado); qual número a expedição digita como `order_ref` (precisa conferência em campo); entrada
do fato na plataforma (próximo passo).

## 6. Bloqueios

| Tipo | Bloqueio |
|---|---|
| Autorização | Push de qualquer branch local (Toqan `de889456` e esta), só com autorização específica |
| Autorização | Alterar Entregas (Preservation Set), mesmo de forma aditiva: OK do César para a entrega mínima |
| Autorização | Exceção para os caminhos congelados R5-D e `viewmodels/`, necessária para a Home real |
| Autorização | Decisões 1 (home), 7 (dois motores), 11 (ações recomendadas) e 12 (vigilância) |
| Autorização | Q-001, Q-009, Q-024 e Q-026 abertas |
| Autorização | Instalação do leitor Comandas no caixa; coleta recorrente do Toqan; credencial oficial do iFood |
| Custo | Nenhum para a entrega mínima (código local; CI gratuito em repositório público). API oficial do iFood: custo e credencial desconhecidos. Motor de rotas (OSRM ou similar): infraestrutura nova, não recomendado |
| Operação | Registro de pronto consistente pela expedição; convenção do `order_ref`; semântica do bump do KDS Teknisa; aceite em campo da V1 (`LIBERACAO_V1` §4) ainda pendente; exports reais ausentes aqui (o autoteste não pode ser reexecutado neste contêiner) |

## 7. Depois da entrega mínima (cada passo com decisão própria)

1. Contrato da plataforma para `delivery_ready` (`docs/contracts/eventos.schema.json` + catálogo +
   consumidor na Operação Viva): trecho pronto → saída na projeção.
2. Produtor da Comandas (quando a instalação for autorizada): `aceito`/`em_producao` com
   `source_observed_at`. Conferir numa amostra se o `order_ref` digitado bate com `nr_comanda`.
3. Exceção do César nos caminhos congelados: idade por etapa na projeção → `LeituraOperacional` real em
   sombra. A ativação na Home é decisão dele.
4. Limiares tirados dos dados (P80/P90 por etapa), aplicados só daqui para frente, com decisão de
   calibração.
5. Coerência Toqan × Comandas, depois do plano de observação do Toqan.
6. Aprendizagem: janela de efeito por decisão, agregada por tipo de situação.

## 8. O que não fazer agora

- Não ligar o Toqan no Copiloto e não fazer coleta recorrente.
- Não montar Flink, Kafka, banco, fila ou motor novos.
- Não fazer ML nem previsão antes de semanas de fatos reais.
- Não usar OR-Tools nem VROOM.
- Não editar caminho congelado por conveniência.
- Não tratar a praça inferida do item como fato.
- Não medir pessoas.
- Não declarar 10/10.
