# D4A — Conexão do Simulador à Interface por Feature Flag — V0

> Branch `feature/d4a-simulador-interface`, base `e872f01` (recertificação Grok `f7d9e1b`).
> Conecta a fonte simulada CERTIFICADA (3A/3B) à interface V1 atual por feature flag,
> preservando motor, decisão, contratos do núcleo, determinismo, replay, dedup,
> qualidade, freshness, privacidade e os estados Calmo/Ambiente/Foco.
>
> **NÃO é redesign, NÃO é Sprint Visual V2, NÃO conecta fonte real.** Regra soberana:
> **motor decide → projeção expõe → adaptador transporta → interface apresenta.**
> A interface nunca recalcula, nunca inventa estado, nunca altera decisão.

---

## 1. Arquitetura

```
  DELIVERYOS_LIVE_SOURCE (env)
        │
        ▼
  src/live/interface/fonte.js  ── current ──►  app-v1 lê data/generated (fonte atual, byte-idêntico)
   (feature flag)              └─ simulator ─►  ┌───────────────────────────────────────┐
                                                │ tools/live/simulator (3A) executa um   │
                                                │ cenário certificado → snapshot         │
                                                └───────────────┬───────────────────────┘
                                                                ▼
                                          src/live/interface/adaptador.js
                                          (projeção → janela NIGHT/rows + estado da fonte)
                                                                ▼
                                          app-v1 (motor.js + decisao.js INTOCADOS)
                                          MOTOR.step / DECISAO.decidir → Calmo/Ambiente/Foco
```

Peças novas (todas aditivas): `src/live/interface/fonte.js` (flag), `src/live/interface/
adaptador.js` (transporte), `tools/live/interface/servir_d4a.js` (servidor irmão do
`servir_v1.js`, que segue intocado). `app-v1/app.js` recebeu só o mínimo: uma sonda de
`/api/config` que escolhe o caminho de dados e um render de estado técnico da fonte.

## 2. Feature flag `DELIVERYOS_LIVE_SOURCE`

Valores: `current` | `simulator`. **Segura por padrão:**

| Valor da env | Fonte usada | degraded_state | fallback registrado |
|---|---|---|---|
| ausente / vazia | `current` | — | `flag_ausente_usando_fonte_atual` |
| `current` / `simulator` (case-insensitive) | conforme valor | — | — |
| qualquer outro | `current` | `flag_invalida` | `valor_desconhecido_usando_fonte_atual` |

O simulador **nunca liga silenciosamente**: valor inválido ou ausente cai na fonte
atual, com o motivo registrado (auditável). Rollback = remover/trocar a env, sem
rebuild. Se a sonda `/api/config` falhar (ex.: servido pelo `servir_v1` antigo), o
`app-v1` segue no caminho atual — comportamento seguro por padrão.

## 3. Contrato do adaptador (responsabilidades)

**Permitido:** transportar, serializar, normalizar formato (projeção → shape
`NIGHT`/`rows` que o cérebro já consome), declarar ausência, declarar erro, declarar
freshness, preservar confiança/IDs/razões/evidências.

**Proibido (e testado):** decidir Calmo/Ambiente/Foco, recalcular score, criar
prioridade, inferir praça, alterar confiança, unir pedidos, esconder desconhecidos,
completar campo ausente, transformar `suspect` em `complete`, transformar `unmatched`
em `matched`. O teste "soberania" varre a janela produzida e falha se aparecer
`calmo`/`ambiente`/`foco`/`score`/`prioridade`/`confianca`.

**O que entra na janela apta** (`NIGHT` + `rows`): só pedidos `matched` + `complete`,
não cancelados (`apto_para_decisao === true`), mais cancelados com tempo (semântica
histórica `c`). **Fora da janela** (declarado em `pedidos_excluidos`/`unknowns`):
`conflict` (Addendum §7), parciais/`unmatched` (Addendum §10), `suspect` — inclusive
`comanda_sem_itens` (F2-08). Campos não observados pela fonte simulada (`s` saiu, `e`
entregue) ficam `null` — nunca inventados.

## 4. Contrato do payload (`/api/fonte`)

`versao_payload · gerado_em · origem · source_status · source_motivo · degraded_state ·
replay_status · operational_day_key · janela{meta,T0,T1,NIGHT,rows} | null ·
pedidos_excluidos[] · unknowns{conflitos,parciais,suspeitos,quarentena,
ultima_atualizacao_confiavel} · freshness{por fonte: state/age/last_trusted/ultimo_evento}
· gate_staleness (do núcleo, nunca recalculado) · ultimo_confiavel{dia_local,gerado_em,
pedidos,aviso} | null`. Nenhum campo interno desnecessário do motor é exposto; o payload
**não tem** conceito de Calmo/Ambiente/Foco (esses só nascem do motor sobre a janela).

## 5. Estados da fonte

Oito estados: `initializing · ready · replaying · stale · disconnected · degraded ·
failed · stopped`. Derivação (prioridade falha > ciclo de vida > freshness da fonte de
STATUS):

| Estado | A interface recebe | Apresenta | Bloqueia | Janela |
|---|---|---|---|---|
| initializing | sem snapshot | "iniciando" | tudo | não |
| ready | janela + freshness + gate | Calmo/Ambiente/Foco do motor | — | **sim** |
| replaying | snapshot parcial + replay_status | aviso de replay | ação sobre estado consolidado | não |
| stale | último confiável datado | idade + aviso | estado atual | não |
| disconnected | último confiável datado | desconexão + idade | estado atual | não |
| degraded | último confiável + motivo | modo degradado | estado atual | não |
| failed | erro preservado | mensagem de erro | tudo | não |
| stopped | — | "fonte parada" | tudo | não |

**Decisão de design documentada:** o rótulo `stale`/`disconnected` deriva da **fonte de
STATUS** (papel `status` — tempo/estado, que muda e envelhece de forma perigosa). A
fonte de **composição** (comanda) envelhece por natureza (impressa uma vez, não muda);
sua idade aparece em `freshness`, mas não torna a fonte `stale` sozinha — senão todo
pedido cuja comanda foi impressa há mais de um limiar ficaria "antigo". O `gate_staleness`
do núcleo continua soberano sobre aptidão; o adaptador não recalcula nada disso.

**A janela só existe em `ready`.** Fora de `ready`, a interface recebe o último estado
confiável **apenas como referência datada** (`ultimo_confiavel`, com aviso "dado antigo;
nao representa o estado atual") — nunca como janela corrente. Dado velho jamais aparece
como atual.

## 6. Calmo, Ambiente e Foco (verificados na interface real)

- **Calmo** só nasce do motor sobre a janela real (`MOTOR.step` → `mode: calmo`).
  **Ausência de informação NÃO é Calmo:** sem janela pronta (initializing/replaying/
  stale/disconnected/degraded/failed/stopped), a tela mostra o estado técnico da fonte e
  os desconhecidos declarados — nunca "Em fluxo". Verificado no navegador: no estado
  `disconnected` a tela diz "Fonte simulada desconectada" + último confiável datado, e
  **não** "Operação fluindo".
- **Ambiente** e **Foco** vêm de `MOTOR.step`/`DECISAO.decidir` exatamente como na V1
  histórica (mesmo pipeline `precomputar`), sobre a janela que o adaptador transportou. A
  interface não escolhe pedido, não reordena, não cria foco alternativo. As 6 áreas
  (Caixa/Sushi/Quentes/Cozinha/Conferência/Motoboy) e o cálculo são os do motor — não
  alterados.

## 7. F2-08 na interface

Comanda vazia casada com status é `matched` no núcleo, mas `suspect`
(`comanda_sem_itens`) e **não apta** — logo **não entra na janela**; aparece em
`pedidos_excluidos` com o motivo inspecionável. Composição válida posterior
(`pedido_alterado` com item) recupera aptidão e **entra na janela**; revogação
válida→vazia remove a aptidão e **sai da janela**; replay não reabre. Tudo testado em
`tests/live/interface-adaptador.test.js`. **R2 e R3 não foram corrigidos** (backlog):
- **R2:** lista mista (item válido + inválido) sem warning sobre os inválidos descartados.
- **R3:** `fields_missing: itens` é usado tanto para composição ausente quanto para
  composição vazia, distinguidos só pelo motivo `comanda_sem_itens`.

## 8. Replay, erro e degradação

- **Replay:** `replay_status.em_andamento` informa a interface; a janela fica protegida
  (não publica estado parcial como final); ao terminar, publica a projeção final. Reinício
  produz projeção reconstruível equivalente (Contrato §17).
- **Erro/degradação:** simulador não inicia → `failed` com motivo; payload inválido/
  adaptador falha → `failed` (erro nunca se perde: vira payload 500 com estado failed);
  conexão cai → `disconnected`; stale → `stale`; flag desconhecida → `current` +
  `flag_invalida`. Nunca inventa Calmo, nunca mantém Foco indefinidamente, sempre mostra
  desconhecido, preserva o último confiável só com timestamp e aviso, permite rollback.

## 9. Testes

`tests/live/interface-fonte.test.js` (flag, estados da fonte, janela só em ready) +
`tests/live/interface-adaptador.test.js` (20 cenários obrigatórios, soberania, F2-08,
unknowns, ausência total). **173/173 verdes** (151 anteriores + 22 novos), zero removido
ou enfraquecido. Campanha de 30 dias reexecutada: **hash idêntico** ao pós-F2-08
(`f5c27b8…`) — o núcleo não foi tocado, a D4A é puramente aditiva.

## 10. Rollback

- **Desligar a fonte simulada:** remover a env `DELIVERYOS_LIVE_SOURCE` (ou defini-la
  como `current`) e servir com `servir_v1.js` (fonte atual) ou `servir_d4a.js` (que
  então recusa `/api/fonte` com 409 e a interface segue no caminho atual).
- **Voltar à fonte atual:** é o padrão — nenhuma ação além de não ligar a flag.
- **Arquivos da D4A:** `src/live/interface/*`, `tools/live/interface/*`, os dois testes
  `interface-*.test.js`, este documento, e o bloco de boot em `app-v1/app.js`.
- **Verificar isolamento:** `git diff e872f01 -- src/perfil-delivery src/live/nucleo.js
  src/live/qualidade.js data package.json` deve ser vazio.
- **Detectar regressão:** `node --test tests/live/*.test.js tests/live/simulator/*.test.js`
  (173 verdes) + hash da campanha `f5c27b8…`.
- **Reverter o commit:** `git revert <hash>` na branch `feature/d4a-simulador-interface`;
  `main` nunca recebeu a D4A.

## 11. Alterações visuais (mínimas)

Nenhum redesign. O único acréscimo visual reusa componentes existentes (a seção
`.estado.carregando` e o `.sussurro` da V1) para representar: carregando, replay, stale,
desconectado, degradado, desconhecido, erro da fonte. Direção estética, tipografia,
navegação, layout, identidade e linguagem visual — intocados.

## 12. Limitações e riscos não bloqueantes

1. R2/R3 (F2-08) em backlog, não corrigidos nesta missão (§7).
2. F2-07 (índice de dedup linear, sem rotação) segue registrado; fora do escopo D4A.
3. `last_trusted_at` conservador pós-reinício (Contrato §17) — inalterado.
4. O modo `current` depende de `data/generated/v1_janela_real.json` (gerado por
   `gerar_janela_v1.js`, que exige `xlsx`) — quando ausente, a interface mostra erro
   amigável; não é regressão da D4A.
5. Sintético prova encanamento e apresentação honesta, **não** qualidade operacional do
   motor.
6. A fonte simulada não observa `s`/`e` (saiu/entregue) — esses tempos ficam `null` na
   janela; o motor lida com null como "não observado", mas a superfície de saída/entrega
   fica reduzida no modo simulado (honesto, não inventado).
