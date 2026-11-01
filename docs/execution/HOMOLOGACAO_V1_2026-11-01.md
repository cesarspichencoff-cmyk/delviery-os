# Homologação da V1 — candidato integrado e teste físico (01/11/2026)

Branch **local** `claude/deliveryos-v1-candidato-homologacao-20261101`, sobre `249b734e` (publicada, CI
`41326925117` verde no SHA exato). Sem push, merge, deploy, instalação, serviço novo ou mudança em banco
operacional. Home, Copiloto e Entregas não foram reescritos. Toqan segue isolado (fora desta linha). O
bloqueio de dados reais de 20/10 continua: o `source-ingest` não grava `real`, e nada aqui o ativa.

## 1. O candidato

Uma linha só, que já contém toda a V1 verificada (ancestralidade conferida com `git merge-base --is-ancestor`):

| Peça | Commit |
|---|---|
| PR #126 / convergência de papéis | `5a705b5c` |
| Candidato home + procedência | `ab1ccf4e` |
| Identidade de viagem da V1 | `66e9181b` |
| O pronto vira fato | `de5bed3e` |
| Leituras do pronto e fila observada (CI verde) | `249b734e` |
| **Q-028**: observador local com identidade de máquina | `f2b4bf2c` |
| **Cadeia integrada** e rota da fila na apresentação | `0ccd7ec0` |

Sobre `249b734e`, o candidato soma cerca de 150 linhas de produção:

| Arquivo | Mudança |
|---|---|
| `src/entregas/operational/auth.ts` | Papel de máquina |
| `src/entregas/pilot/cloud-config.ts` | Token de máquina com 32+ caracteres |
| `src/entregas/pilot/pilot-config.ts` | Papéis do `pilot.json` validados |
| `src/entregas/pilot/ready-queue-observation.ts` | Papéis que observam a fila |
| `tools/entregas_pilot_server.ts` | Trava na borda |
| `tools/product_system_server.ts` | Rota `GET /api/entregas/prontos` |
| `deploy/sql/papel_leitura_produto.sql` | Papel só de leitura |

O restante são testes (`run-observador-fila-tests.ts`, `run-cadeia-v1-integrada-tests.ts`,
`run-q028-mutation-tests.ts`).

## 2. Difference Check, antes de qualquer componente

Topologia do ensaio (`MOOCA_ACESSO_REMOTO_2026-10-26.md`): o computador do ensaio roda o piloto, a
plataforma (`127.0.0.1:8080`) e o PostgreSQL (`127.0.0.1:55436`). Só o piloto é exposto, pelo proxy
HTTPS do NetBird. O servidor de apresentação (Copiloto) não estava instalado.

| Mecanismo existente | Serve ao observador da fila? |
|---|---|
| Código humano (gerente, líder) | **Não**: credencial humana, com poder de comando |
| Papel `sistema` do piloto | **Não**: tem escrita no domínio |
| Delegação `pt1.` (Ed25519) | **Não**: é de **escrita** de eventos, presa a aparelho e ator, emitida pela plataforma |
| Asserção HMAC de leitura | **Não**: vai do piloto à plataforma, por viagem, em nome de um humano |
| Token de aparelho | **Não**: identidade do celular para GPS |
| Atestação Ed25519 do produtor + registro (0010) | **Sim, para os fatos**: identidade verificável do piloto na cadeia |
| Usuário e token do piloto | **Sim**, com um papel de máquina restrito na borda |
| Servidor de apresentação | **Sim, é o observador**: só GET/HEAD por construção, escuta em loopback, desenhado para a máquina do leitor TATA (a do piloto), já conectado ao banco |
| Papéis PostgreSQL | Nenhum era só de leitura: **papel novo no mesmo mecanismo**, por coluna |

## 3. Q-028 resolvida tecnicamente (laboratório)

- **Quem observa:** o servidor de apresentação, no mesmo computador do piloto.
- **De onde:** loopback até o piloto. Os fatos vêm pela conexão PostgreSQL que ele já tem. Nada entra
  pela rede da loja.
- **Com qual credencial:**
  - no piloto, o papel de máquina `observador_fila`, com token gerado de 32+ caracteres;
  - no banco, o papel `deliveryos_leitura`, com SELECT por coluna: sem `identity.device.secret_hash` e
    sem `entregas.ready_order.label`.
- **Sem escrita:**
  - a trava na borda do piloto deixa o papel chegar só a `GET /api/ready-orders/observation`, sem
    parâmetro; todo o resto responde 403 `observer_read_only`;
  - o domínio não o põe em nenhuma lista de `assertCan`;
  - o banco recusa INSERT, UPDATE e TRUNCATE por privilégio.
- **Token protegido:** o endereço do piloto precisa ser loopback ou HTTPS. Fora disso a apresentação
  nem chama o piloto (`endereco_do_piloto_sem_tls`).
- **Achado e fechado:** o `pilot.json` não validava papéis, e um papel desconhecido recebia o
  **snapshot bruto inteiro** (reproduzido no H2). Agora papel fora de `OperationalRole` recusa o boot.

## 4. Provas

| Suíte | Antes | Agora |
|---|---|---|
| `test:entregas:observador-fila` (R1–R3, H1–H3 com o piloto real) | 1/6 (H2: snapshot inteiro para papel desconhecido) | **7/7** |
| `test:platform:cadeia-v1` (I1–I9, binários de `dist/` e PostgreSQL) | — | **9/9** |
| `test:platform:q028:mutacoes` | — | **14/14, cegas 0** |

As mutações somam 2 controles, 11 defeitos e 1 restauração; as que mexem na apresentação recompilam o
`dist/` antes de medir.

**A cadeia integrada (laboratório, dados simulados).** Piloto em arquivo assinando a outbox;
`source-ingest` com atestação **exigida**; assíncrono; apresentação com o papel de leitura e o
observador local. Os quatro chegam ao banco por um proxy TCP que a prova corta e restaura.

| Prova | O que foi observado |
|---|---|
| I1 | A chave do produtor registrada pelo rito oficial (`admin:entregas:producer`: plano, fingerprint, aplicação); nenhum papel com superusuário |
| I2 | Fatos assinados e admitidos: 3 prontos, 1 retirada, a saída, todos `simulated`, zero quarentena; outbox drenada |
| I3 | Na mesma cadeia: T1 no Copiloto (`/api/copiloto`); fila B e C pelo observador; A e F saíram, D retirado; nenhum rótulo |
| I4 | O observador é barrado no piloto; o papel de leitura é barrado no banco |
| I5 | Rede do banco cortada: o piloto segue registrando e montando viagem; Copiloto e fila ficam **indisponíveis**, nunca zero; nada chega e nada se perde |
| I6 | A rede volta: o atrasado chega uma vez; B aguardando saída, fila C e G, Copiloto com T2, zero duplicata |
| I7 | Reinício do consumidor, do assíncrono, do piloto e da apresentação: nada duplica, a fila tem o mesmo conteúdo |
| I8 | Bloqueio de real: nenhum fato `real`, e o rito oficial recusa conceder `real` |
| I9 | Com o piloto num endereço HTTP fora do loopback, o token do observador não é enviado |

**Regressão no commit `0ccd7ec0`** (árvore limpa), só no que as mudanças tocam: **28 suítes, zero falha
nova**.

- Build, typecheck e `build:platform`.
- O que é novo e o que é vizinho: observador, cadeia, saída mínima, fila observada, processos, leituras,
  `ready-fact` e `test:entregas` (242 linhas OK, igual à etapa anterior).
- O que lê a configuração do piloto: throttle, ITAIM-only, device-api (50), Android (43), assinatura no
  boot, viagem pela interface, comandos offline e ponte da rider.
- O servidor de apresentação: deploy-audit (30), Product System (52), home, saúde das fontes, Copiloto
  HTTP no navegador, servidor + PostgreSQL e falha de banco.
- Governança e `SEM_FAIL_NOVO`.
- Pré-existente e idêntico: `test:platform`, a importação antiga de `pilot-delegation-issuer.ts`.

**Reaproveitado do CI, não refeito.** Run `41326925117` no SHA `249b734e`, 76 passos verdes; 71 e 72
foram pulados e **não contam como aprovados**. Inclui a cadeia real com aparelho lógico e papéis
mínimos, os laboratórios de atestação, ITAIM-only, recibos, os navegadores e a acessibilidade.

## 5. Q-026 — sem arquitetura nova

As soluções já pesquisadas ficam como estão, opcionais na apresentação: leitura incremental
(`DELIVERYOS_ENTREGAS_INCREMENTAL_RR=1`), prazo (`DELIVERYOS_ENTREGAS_RR_DEADLINE_MS`) e admissão
(`DELIVERYOS_ENTREGAS_MAX_INFLIGHT`), já provadas nos workflows `q026-*`.

Limite material medido (`FILA_OBSERVADA_2026-11-01.md` §6): os fatos do pronto custam 44 ms com 1.000
viagens e ~500 ms com 10.000. Um índice não resolve. No teste físico (uma a cinco viagens) o custo é
desprezível. A janela de leitura segue com a Q-026.

## 6. O que falta para a viagem completa (computador, tablet e Android no Itaim)

O roteiro já existe e não foi reescrito:

- portões A–G e sequência F01–F14 em `docs/entregas/pilot/GATE_CAMPO_ANDROID_COPILOTO_2026-10-20.md`;
- bateria 1–22 e cenários em `docs/etapa-4-8/FIELD-GATE-ANDROID.md`;
- aceite em 10 passos em `LIBERACAO_V1_2026-10-31.md` §4;
- itens administrativos em `docs/entregas/pilot/CHECKLIST_ATIVACAO.md`.

| Passo do gate | Provado em laboratório ou AVD | Falta |
|---|---|---|
| F01 APK, URLs, identidade | pré-vínculo por `device_id` + código (cadeia B5/C3, CI); build Foxxy/AVD | APK do teste, URLs HTTPS finais, aparelho físico |
| F02–F07 termo, permissão, saída pelo domínio, captura nativa | rider-bridge, capture-rule, AVD (19/19 instrumentados) | aparelho físico |
| F08–F09 rede caída e sincronização | comandos offline (CI), cadeia C5–C11 com aparelho lógico | aparelho físico, rota nativa exposta |
| **F10 Entregas e Copiloto no mesmo ambiente** | **cadeia integrada I3, nesta etapa** | apresentação instalada no host |
| F11 encerrar online e o serviço parar | AVD: parada remota em 13,3 s | aparelho físico |
| F12 falha e revogação | cadeia R1/E2 (CI) | aparelho físico |
| F13 fim remoto com o aparelho offline | limite declarado: a captura segue até confirmar | decisão de aceitar no ensaio |
| F14 Android 14, processo morto | AVD parcial | aparelho físico (Xiaomi: bateria e início automático) |

O lançador do host (`tools/windows-local-lab/local-control.cjs`) já sobe crítico, assíncrono e piloto
com papéis mínimos e `simulated`. Para a cadeia completa faltam dois processos, com o mesmo ambiente da
prova I1–I9:

- **`source-ingest`**:
  - `DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED=true`;
  - `DELIVERYOS_ENTREGAS_PRODUCER_ATTESTATION=required`;
  - arquivo do piloto, estado e chave de parada;
  - papel `deliveryos_source_ingest`.
- **Apresentação**:
  - `DELIVERYOS_DATABASE_URL` com `deliveryos_leitura`;
  - `DELIVERYOS_PRODUCT_READ_UNIT=ITAIM`;
  - `DELIVERYOS_FILA_PILOTO_URL=http://127.0.0.1:5193`;
  - `DELIVERYOS_FILA_PILOTO_TOKEN`.

## 7. O que exige a autorização do César para o teste físico

> **Substituída (01/11)** pela proposta única `ENSAIO_SUPERVISIONADO_V1_2026-11-01.md` §6, com 5 autorizações.
> O César vetou enfraquecer o login do proxy, e o item 6 abaixo (exceção no proxy) saiu: o celular entra como
> peer do NetBird. Sai também o item 7a (APK assinado por tag): a etapa física usa o APK de depuração. O
> item 9 (push) foi feito com a autorização de 01/11. A lista abaixo fica como registro.

1. **Instalar o candidato no computador do ensaio.** Rollback: voltar o build anterior sem restaurar dados
   por cima (`LIBERACAO_V1` §5).
2. **Modo e armazenamento do teste:**
   - `DELIVERYOS_SOURCE_MODE=simulated` e piloto em `file`, para a fila offline existir;
   - o host hoje roda o console em PostgreSQL;
   - `real` segue fechado (20/10).
3. **Segredos gerados no host, nunca no Git:**
   - token de máquina do observador (32+);
   - chave Ed25519 do produtor do piloto;
   - senha do papel de leitura.
   - Os códigos humanos já foram definidos em 01/11.
4. **Escritas no PostgreSQL do ensaio do host** (não operacional), pelos ritos com plano e fingerprint:
   - aplicar `papel_leitura_produto.sql`;
   - registrar a chave pública do produtor (`admin:entregas:producer`, só `simulated`);
   - pré-vincular o Android (`admin:entregas:device`), depois de conferir a unidade ITAIM e o ator
     `motoboy_interno`.
5. **Ligar, só na janela do teste:**
   - processos: `source-ingest` com atestação exigida e a apresentação em loopback;
   - flags: `gps_capture_enabled: true`, `offline_queue_enabled: true`, retorno em sombra;
   - parar tudo: `gps_capture_enabled: false`.
6. **Rede para o Android, sem custo novo.** No proxy NetBird existente:
   - uma rota para a plataforma (sessão e GPS);
   - exceção de autenticação do proxy **só** nas rotas nativas que a aplicação já autentica
     (`/api/device/session`, `/api/gps/batch`, `/api/device/capture-state`, `/api/events/batch`),
     provada antes com credencial inválida e revogada;
   - nunca `/api` inteiro.
   - Sem isso, o Android só funciona como tela, sem GPS nativo nem sincronização offline.
7. **APK, uma das duas opções:**
   - (a) o APK de campo assinado pelo workflow existente, que exige os segredos da chave no GitHub e o
     push de uma tag `entregas-campo-*` com as duas URLs HTTPS;
   - (b) o APK de depuração com a CA do usuário, só neste primeiro teste.
8. **Aparelho e pessoas (portão A):**
   - o Xiaomi, com modelo e versão do Android anotados;
   - data e hora automáticas;
   - otimização de bateria desligada para o app;
   - um motoboy voluntário, os responsáveis e a janela;
   - a parada de emergência pré-autorizada: retirar a permissão, modo avião ou encerrar a viagem no
     console.
9. **Push desta branch,** para o CI rodar no SHA exato antes da instalação. Recomendado; não é
   obrigatório para o teste.

O tablet não exige nada novo: o console pelo proxy, com o código dele.
