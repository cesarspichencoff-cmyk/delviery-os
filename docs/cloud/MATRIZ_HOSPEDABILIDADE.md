# Matriz de hospedabilidade — DeliveryOS Cloud Pilot V1

Auditoria do que impede (ou não) rodar em Linux, em container, com volume.
Levantada sobre `feature/entregas-android-field-v1` @ `81dae23`.

## Matriz por componente

| Componente | Linux | Container | Persistência | Configuração | Bloqueador |
|---|---|---|---|---|---|
| Entregas API (`entregas_pilot_server`) | ✅ | ✅ | ✅ volume | ✅ env | — (P0 corrigido) |
| Event log / outbox (`FileUnitOfWork`) | ✅ | ✅ | ✅ rename atômico | ✅ herda dataDir | — |
| Console (estático) | ✅ | ✅ | n/a | n/a | — |
| Rider mobile (estático) | ✅ | ✅ | n/a | n/a | — |
| Timeline / projeções | ✅ | ✅ | derivado do log | n/a | — |
| Autenticação | ✅ | ✅ | n/a | ✅ env | — (P1 corrigido) |
| Backup / restore | ✅ | ✅ | ✅ volume | ✅ env | — |
| Termo + aceites | ✅ | ✅ | ✅ JSONL no volume | ✅ arquivo montado | preenchimento do César |
| Unidade ITAIM | ✅ | ✅ | ✅ arquivo montado | ✅ env | coordenada não calibrada |
| HTTPS | ✅ | ✅ (proxy) | n/a | ✅ env | certificado/domínio |
| Worker | — | — | — | — | **não existe** — ver abaixo |
| Android / APK | n/a | ❌ nunca | n/a | ✅ Gradle | fora do container |

## Achados

### P0 — dados da viagem fora do volume · **CORRIGIDO**

O servidor resolvia `dataDir` a partir de `ENTREGAS_DATA_DIR` e usava para
log, backups, aceites e auditoria — mas entregava a config **crua** à
`PilotApplicationFacade`, que resolve o próprio caminho de `cfg.data_dir`.

Os dois gravavam em lugares diferentes. Num container: o volume ficaria com
os backups e **sem a viagem**; o `store.json` iria para a camada efêmera e
sumiria no primeiro restart.

Localmente os caminhos coincidiam por acaso (mesmo `cwd`), então o defeito era
invisível até existir volume. Pego pelo teste de recriação, não por leitura.

**Correção:** a config entregue à facade carrega o diretório já resolvido.
**Prova:** 15 testes de recriação, incluindo restore em volume limpo.

### P1 — CORS aberto com Authorization liberado · **CORRIGIDO**

`Access-Control-Allow-Origin: *` junto de `Access-Control-Allow-Headers:
Authorization`. Em `localhost` é irrelevante; exposto, qualquer página da
internet poderia falar com a API a partir do navegador de quem estivesse
logado.

**Correção:** origem allowlist em modo remoto; cabeçalho **omitido** quando a
origem não está na lista; preflight sem origem permitida responde 403. Em modo
local, `*` continua — nada regride.

### P1 — credencial em arquivo, `CHANGE_ME` só avisava · **CORRIGIDO**

`loadPilotConfig` emitia `console.warn` e o servidor subia. Numa máquina
remota ninguém lê o terminal: o sistema ficaria no ar com credencial de
exemplo.

**Correção:** `ENTREGAS_USERS` por ambiente, com precedência sobre o arquivo.
Em modo remoto, derruba o boot: token de exemplo, token com menos de 24
caracteres, token repetido entre usuários, `actor_id` repetido.

### P2 — `/api/backups` sem sessão · **CORRIGIDO** (missão anterior)

Listava os backups sem exigir autenticação.

### P3 — banner de boot imprimia `127.0.0.1` · **CORRIGIDO**

Cosmético, mas em nuvem quem lê o log precisa do endereço real.

### P3 — sem `fsync` após `rename`

`FileUnitOfWork` faz `writeFileSync(tmp)` + `renameSync`. O rename é atômico
em POSIX, o que basta contra escrita parcial. Não há `fsync`, então uma queda
de energia da máquina hospedeira pode perder a última escrita.

Não corrigido nesta missão: em nuvem, o disco é gerenciado e a perda exigiria
falha da infraestrutura, não do processo. Fica registrado.

## Não encontrado (auditado e limpo)

- **Zero** caminhos absolutos de Windows (`C:\`) no código de runtime.
- **Zero** segredos versionados.
- **Zero** IPs privados fixos no runtime — as ocorrências de `127.0.0.1` são
  testes e a própria lista de segurança de loopback.
- Portas: todas configuráveis por ambiente.
- Timestamps: ISO/UTC em todo o domínio.
- Sem dependência de Windows, de terminal interativo ou de estado só em
  memória para dado operacional.

## O worker

O escopo previa "worker do Entregas, **se realmente necessário**". Ele **não é
necessário** e portanto **não existe** nesta composição.

A sincronização em lote é responsabilidade do **aparelho** (WorkManager no
Android), não do servidor. O servidor só recebe. O único trabalho periódico é
o backup, que roda como serviço próprio no compose — assim uma falha de
backup nunca derruba o Entregas.

Criar um worker aqui seria acrescentar um processo, um ponto de falha e um
custo mensal para não fazer nada.

## O Copiloto

**Fora do piloto V1.** Não está na base escolhida (`81dae23` não contém
`fix/copiloto-secure-dev-server-bind-v1`), e trazê-lo exigiria merge — que
esta missão proíbe.

Isso é um resultado bom, não uma limitação: menos superfície exposta no
primeiro piloto online.
