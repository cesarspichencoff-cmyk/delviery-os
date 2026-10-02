---
lifecycle:
  artefato: docs/etapa-4-8/field-gate/2026-10-02-platform-compose-final-ci.md
  status: ACTIVE
  authority_scope: platform_compose_final_ci_evidence
  superseded_by: null
  atualizado_em: "2026-10-02"
  state_basis: 5e5e0f7
---

# Composição oficial final — Docker Compose real

Data: 2026-10-02
Produto equivalente provado: `5e5e0f7`
Commit temporário executado: `b317a8af50265eb221fc1b8bbabde6b38d1e2acf`
GitHub Actions run: **36969232567**
Job: **110719516694**
Resultado: **SUCCESS**

## Equivalência do produto

A prova rodou numa branch temporária para que o workflow não virasse
infraestrutura permanente do produto. Depois de promover para a branch
principal a única correção real descoberta durante a certificação
(`tools/papeis_compose_real.sh`), foi comparado:

```
git diff --name-status 5e5e0f7 b317a8a
```

Resultado: **somente**
`.github/workflows/platform-compose-final-proof.yml`.

Nenhum Dockerfile, Compose, runtime, migration, papel SQL, contrato ou arquivo
de produto divergia entre o HEAD principal e o commit efetivamente testado.

## O gate final

O runner público `ubuntu-latest`:

1. confirmou ambiente Docker/Compose limpo;
2. construiu a imagem final `deliveryos-platform:v1` sem override;
3. preparou o build local apenas para comparar identidade/hash da imagem;
4. executou `tools/papeis_compose_real.sh` sobre
   `deploy/compose.platform.yaml`;
5. conferiu cleanup;
6. rodou deploy-audit, governança e `git diff --check`.

## 45 medidas da composição real

O certificador terminou com:

```
45 medidas · PAPEIS_COMPOSE_REAL_GREEN
```

Entre as medidas observadas:

### Fail-closed antes de subir

Sem a senha do papel crítico:

- Compose recusou subir;
- motivo esperado presente;
- **zero containers criados**.

### Subida e ordem real

Com credenciais efêmeras:

- crítico: **healthy**;
- migration: **exited 0**;
- aplicação dos papéis: **exited 0**;
- assíncrono: **running**.

### Papéis mínimos no PostgreSQL

`deliveryos_critical` e `deliveryos_async`:

- não são superuser;
- não têm `CREATEROLE`;
- não têm `CREATEDB`;
- não têm `BYPASSRLS`;
- são login roles;
- não possuem objetos do runtime;
- não herdam de outros papéis.

O dono do `platform.event_log` continuou `deliveryos`.

As conexões reais dos containers confirmaram:

- crítico → `deliveryos_critical`;
- assíncrono → `deliveryos_async`.

### Cadeia de campo dentro da composição

Com dispositivo pré-vinculado:

- sessão HTTP: **200**;
- `vinculado=false` — o runtime não refez o vínculo humano;
- GPS HTTP: **200 / aceito**;
- `secret_hash + secret_bound_at` preservados;
- auditoria da sessão: **1**;
- fato no event log: **1 control**;
- outbox pendente: **0**;
- após reiniciar o assíncrono: replay **completo, aplicados=1**;
- assíncrono reconectou novamente como `deliveryos_async`.

### Sabotagem recusada pela própria credencial runtime

Com o papel crítico, foram recusados pelo PostgreSQL:

- desligar trigger;
- remover trigger;
- usar modo replica;
- apagar fato;
- truncar log;
- revogar aparelho;
- regravar vínculo;
- cadastrar aparelho;
- criar tabela;
- virar superusuário.

Com o papel assíncrono, foram recusidos:

- desligar trigger;
- gravar fato;
- ler aparelho.

Controles positivos continuaram conseguindo ler o log. A trava permaneceu
intacta e o fato continuou presente.

### Segredos

- senha administrativa existe apenas onde necessária para migration;
- não aparece no crítico;
- não aparece no assíncrono;
- não aparece no processo crítico;
- **zero senhas encontradas nos logs**.

O segredo do dispositivo usado pelo certificador ficou em arquivo temporário
`0600` no host e entrou no container **somente por stdin** do `docker exec`.
Não foi copiado para o rootfs read-only e não entrou em argumento/env/log.

### Idempotência operacional

Uma nova subida reaplicou os papéis sem erro:

- job de papéis rodou novamente;
- saiu **0**;
- os dois papéis continuaram exatamente dois.

## Gates após a composição

No mesmo job:

- `test:platform:deploy`: **30/30 OK**;
- governança: **GREEN**;
- `git diff --check`: PASS;
- marcador final: **PLATFORM_COMPOSE_FINAL_PROOF_GREEN**.

O workflow também verificou que não restaram containers/volumes do DeliveryOS
depois da certificação.

## Falhas anteriores — não contam como prova

Run `36968927162`:
- imagem construiu;
- o harness falhou antes de `compose up` porque não havia `dist/` local
  para comparar o hash da imagem.

Run `36969022188`:
- composição subiu, crítico ficou healthy, migrations/papéis passaram e as
  conexões mínimas estavam corretas;
- o harness tentou `docker cp` para um runtime deliberadamente
  `read_only`, portanto falhou antes da cadeia de campo.

A correção foi no **certificador**, não no produto: segredo via stdin.
A terceira execução refez tudo do zero e ficou verde.

## Fronteira

**PROVEN agora:**

- imagem runtime final;
- `docker compose up` da composição oficial;
- ordem PostgreSQL → migrations → papéis → runtimes;
- health real;
- papéis mínimos efetivamente usados;
- sessão + GPS + event log + outbox + replay;
- restart do assíncrono;
- fail-closed de credencial ausente;
- isolamento de senha administrativa;
- cleanup.

**Não autorizado/não provado por esta execução:**

- deploy em ambiente operacional;
- credenciais operacionais reais;
- migrations/cutover no banco operacional;
- aparelho Android físico;
- backup off-host.

Nenhum efeito de produção, registry ou infraestrutura externa operacional foi
executado.
