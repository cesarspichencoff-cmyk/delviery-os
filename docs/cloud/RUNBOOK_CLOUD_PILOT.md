# Runbook — DeliveryOS Cloud Pilot V1

> Composição: **Core + TATÁ Entregas**. Não é o DeliveryOS completo.
> Nada aqui foi executado com Docker: não há Docker nesta máquina.

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

Backups automáticos a cada 30 min no volume, mais um `.tar.gz` diário no
volume de backups.

```bash
docker compose exec deliveryos-backup ls -la /backups
```

**Um backup que nunca foi restaurado não é um backup.** Teste o restore antes
de precisar dele: suba uma composição separada com volume vazio, copie um
`.tar.gz` e restaure pelo console com o token de gerente.

Levar cópia **para fora da máquina** é responsabilidade do César — o volume
morre junto com o servidor.

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
