# Runbook — DeliveryOS Cloud Pilot V1

> Composição: **Core + TATÁ Entregas**. Não é o DeliveryOS completo.
> O Docker não está disponível no Foxxy. A composição, porém, já foi renderizada e o sidecar de backup foi executado em container real no CI; isso não equivale a deploy do piloto.

## O que falta antes de qualquer coisa

| Trava | Quem resolve |
|---|---|
| Docker Desktop ou Docker Engine instalado | César (licença comercial) |
| Termo preenchido e aprovado | César |
| Coordenada do ITAIM calibrada | operador, no local |
| Domínio + DNS | César |
| Tokens gerados | César |

Sem Docker, nada abaixo roda. Com Docker e sem os outros itens, o serviço
**sobe mas recusa operar** — que é o comportamento correto.

## 1. Subir localmente

```bash
cd deploy && cp .env.pilot.example .env
```

Gere um token por pessoa:

```bash
openssl rand -hex 24
```

Preencha `ENTREGAS_USERS`, `ENTREGAS_ALLOWED_ORIGINS` e `ENTREGAS_PUBLIC_URL`.

```bash
cd deploy && docker compose config
```

```bash
cd deploy && docker compose build
```

```bash
cd deploy && docker compose up -d && docker compose ps
```

Se faltar variável obrigatória, o container da API **sai com código 1** e o
log diz qual. É deliberado.

## 2. Conferir que subiu certo

```bash
docker compose logs deliveryos-api | head -30
```

O boot imprime o resumo da configuração — **sem token**. Confira
`remote: true`, `allowed_origins` com o seu domínio, e `data_dir: /dados`.

```bash
curl -k https://localhost/api/health
```

## 3. Verificar o que mais importa

| Verificar | Como | Esperado |
|---|---|---|
| Porta interna não está exposta | `curl http://localhost:5193/api/health` | falha |
| Sem token não passa | `curl -k https://localhost/api/snapshot` | 401 |
| Origem estranha é barrada | `curl -k -H "Origin: https://outro" https://localhost/api/snapshot` | sem cabeçalho CORS |
| Papel insuficiente | motoboy em `/api/trip/route` | 403 |
| Dados no volume | `docker compose exec deliveryos-api ls -la /dados` | `store.json` presente |

## 4. Provar que o dado sobrevive

Este é o teste que separa "tem volume no YAML" de "os dados sobrevivem":

```bash
cd deploy && docker compose down && docker compose up -d
```

A viagem precisa continuar lá. Para uma prova mais dura, **remova o
container** (não só pare) e suba de novo — o volume é nomeado e não vai junto:

```bash
docker compose rm -sf deliveryos-api && docker compose up -d deliveryos-api
```

O equivalente disso já roda hoje, sem Docker:

```bash
npm run test:entregas:persistence-recreate
```

## 5. Backup e restore

O backup precisa acompanhar o backend operacional declarado:

- `ENTREGAS_STORAGE_BACKEND=file`: o sidecar arquiva `/dados` em
  `entregas-file-*.tar.gz`;
- `ENTREGAS_STORAGE_BACKEND=postgres`: o sidecar exige
  `DELIVERYOS_DATABASE_URL` e gera `entregas-pg-*.dump` com
  `pg_dump --format=custom`;
- backend inválido ou URL ausente faz o sidecar falhar alto — nunca produz
  um arquivo que pareça backup do banco sem ser.

```bash
docker compose exec deliveryos-backup ls -la /backups
```

### Restore no backend arquivo

Continua sendo o fluxo do console/API sobre o arquivo de backup do piloto.

### Restore no backend PostgreSQL

Não use a API de restore de arquivo. O restore PostgreSQL fica no profile
`maintenance` e exige um **banco alvo diferente e vazio**:

```bash
ENTREGAS_RESTORE_DATABASE_URL='postgres://.../deliveryos_restore' \
ENTREGAS_RESTORE_SNAPSHOT='entregas-pg-AAAAMMDDTHHMMSSZ.dump' \
ENTREGAS_RESTORE_CONFIRM=YES \
docker compose --profile maintenance run --rm deliveryos-postgres-restore
```

O serviço recusa alvo igual ao operacional, banco alvo com relações existentes,
snapshot ausente ou confirmação diferente de `YES`.

**Um backup que nunca foi restaurado não é um backup.** O caminho PostgreSQL
já foi provado em banco isolado: dump custom → banco vazio → restore → mesmo
fingerprint operacional → continuidade de versão.

### Perda da máquina

O volume `entregas_backups` continua no mesmo host. Ele protege contra perda
lógica do banco/container, **não contra perda do servidor físico**. Antes de
qualquer cutover operacional para PostgreSQL, é obrigatório definir uma cópia
off-host (ou mecanismo externo equivalente), produzir uma cópia e restaurá-la
em ensaio. O provedor/destino ainda não foi escolhido; não presuma Neon,
Google Drive ou qualquer outro.

## 6. Rollback

| Situação | Ação |
|---|---|
| Versão nova com problema | `docker compose down && git checkout <commit anterior> && docker compose up -d --build` |
| Dado corrompido | restore do backup mais recente pelo console |
| GPS atrapalhando | `gps_capture_enabled: false` na config da unidade |
| Parar tudo | `docker compose down` — o volume **permanece** |
| Apagar tudo | `docker compose down -v` — **destrói o volume**, sem volta |

O volume é nomeado (`deliveryos-pilot-dados`), então `down` sem `-v` nunca
apaga dado. `down -v` apaga; use só quando tiver certeza.

## 7. O que este piloto NÃO faz

Não tem Copiloto, CRM, Conference Brain, Capacidade Viva, Seleção, Suprimentos
nem Caixa. Não escreve no iFood, não usa credencial do iFood, não faz
automação de interface. Não rastreia fora de viagem, não gera ranking e não
aplica punição automática.
