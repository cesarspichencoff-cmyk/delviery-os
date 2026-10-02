# Checklist de ativação — TATÁ Entregas, unidade ITAIM

> Tudo aqui é **fail-closed**: enquanto um item estiver em branco, o sistema
> recusa em vez de assumir. Nada foi preenchido com dado inventado.
>
> Nenhum destes itens impede compilar, gerar APK, rodar testes ou usar o
> emulador. Todos impedem **operar de verdade**.

## Como conferir onde estamos

```bash
curl -s http://127.0.0.1:5193/api/health
```

O boot também imprime o essencial:

```
sessão de aparelho: autoridade na plataforma
unidade configurada: NAO (retorno automatico desligado)
termo publicavel: NAO (GPS bloqueado)
```

---

## A. Termo de localização — trava o GPS

`config/entregas-term.json` (fora do Git). Sem isto, `term_publishable: false`
e o portão de captura bloqueia com `term_not_publishable`.

| Campo | Quem decide | Estado |
|---|---|---|
| `controller.legal_name` — razão social | César | ⬜ |
| `controller.cnpj` | César | ⬜ |
| `controller.contact_channel` — canal de dúvidas e denúncia | César | ⬜ |
| `controller.contact_owner` — papel responsável pelo canal | César | ⬜ |
| `effective_date` — vigência | César | ⬜ |
| `retention.operational_event_days` | César | ⬜ |
| `retention.detailed_point_days` | César | ⬜ |
| `approved: true` | César | ⬜ |

Sobre os dois prazos de retenção: não inventei número. Os valores no modelo
existem só para dar forma ao objeto, e `approved: false` impede que virem
política por omissão. Eles precisam de uma decisão sua — inclusive porque o
motoboy vai ler esses prazos na tela. Desde 2026-10-01, o Android também falha
preservando: sem termo publicável + hash vigente + aceite no mesmo aparelho,
nenhum expurgo local é autorizado. Isso **não preenche** os campos acima.

## B. Unidade ITAIM — trava o retorno automático

`config/entregas-unit-itaim.json` (fora do Git). Sem isto o GPS funciona, o
console mostra a posição, e o **retorno automático fica desligado** — que é o
comportamento correto, não um defeito.

| Item | Como | Estado |
|---|---|---|
| Coordenada calibrada em campo | 5+ amostras na porta da loja, dispersão até 25 m | ⬜ |
| `confirmed_by` — papel que confirmou | operador autorizado, no local | ⬜ |
| Raios de retorno e chegada | revisar depois do primeiro turno | ⬜ |
| `active: true` | depois de conferir no mapa | ⬜ |

**Não** derive a coordenada do endereço. O erro típico de geocodificação em
quadra urbana é maior que o raio da cerca.

## C. Aparelhos autorizados

A autoridade é **exclusivamente a plataforma**, em `identity.device`.
`config/entregas-devices.json` é legado e não é mais lido pelo piloto.

Use `npm run admin:entregas:device`: primeiro gere o plano sem escrita;
a aplicação exige `--apply=YES --expect <fingerprint>`.

| Item | Estado |
|---|---|
| `device_id` de cada celular (o app gera na 1ª execução) | ⬜ |
| unidade e ator ativos; ator com papel `motoboy_interno` | ⬜ |
| plano revisado sem `conflicts` | ⬜ |
| autorização aplicada e conferida por `status` | ⬜ |

## D. Usuários e papéis

`config/entregas-pilot.json` (fora do Git).

| Item | Estado |
|---|---|
| Token do operador de despacho | ⬜ |
| Token do líder/gerente | ⬜ |
| Token de cada motoboy | ⬜ |
| Nenhum token com `CHANGE_ME` | ⬜ |

Papéis já validados por teste: só `gerente` restaura; `gerente` e
`lider_delivery` fazem backup; motoboy não vê rota; `operador_expedicao` não
confirma saída (quem confirma é o motoboy).

## E. Certificado HTTPS — trava o GPS no celular

| Item | Como | Estado |
|---|---|---|
| Certificado e chave gerados | `./tools/entregas_cert_local.sh` | ⬜ |
| `ENTREGAS_TLS_CERT` e `ENTREGAS_TLS_KEY` apontados | fora do repositório | ⬜ |
| CA instalada no Android | Configurações → Segurança → Credenciais | ⬜ |

Se o HTTPS for pedido e o certificado faltar, o servidor **recusa subir** — de
propósito. Cair para HTTP em silêncio faria o GPS falhar no celular sem
explicação.

## F. Antes de expor na rede local

| Item | Estado |
|---|---|
| Sessão isolada por requisição | ✅ corrigido e provado (18 testes) |
| Tokens reais, sem `CHANGE_ME` | ⬜ |
| HTTPS ligado | ⬜ |
| `ENTREGAS_BIND=0.0.0.0` só na hora do teste | ⬜ |

O bind padrão é loopback. LAN é opt-in explícito.

## G. Flags do primeiro turno

```json
"gps_capture_enabled": true,
"gps_return_detection_enabled": true,
"gps_background_enabled": false,
"offline_queue_enabled": true,
"persistent_outbox_enabled": true
```

Retorno em **modo sombra** na primeira viagem: calcula e não encerra.

## H. Parar tudo

```
gps_capture_enabled: false
```

Captura para na hora. A operação segue com encerramento manual. Nenhum dado de
viagem é perdido.

## I. Cutover para PostgreSQL — trava o modo multi-instância

O backend `file` continua sendo o default. Não mude para `postgres` enquanto
qualquer item abaixo estiver em branco.

| Item | Estado |
|---|---|
| Destino PostgreSQL operacional escolhido explicitamente | ⬜ |
| Migrations 0006–0008 aplicadas pelo papel administrativo | ⬜ |
| Papel `deliveryos_entregas_pilot` criado com credencial própria, fora do Git | ⬜ |
| `ENTREGAS_STORAGE_BACKEND=postgres` + URL/TLS configurados no ambiente | ⬜ |
| `cutover:entregas:plan` rodado com origem parada e fingerprint conferido | ⬜ |
| Dump PostgreSQL pré-cutover gerado | ⬜ |
| Restore desse dump em banco separado/vazio conferido | ⬜ |
| Cópia do backup fora do host produzida e restore off-host ensaiado | ⬜ |
| `cutover:entregas:apply` autorizado explicitamente por César | ⬜ |
| Pós-cutover: duas instâncias/snapshot/ready-order conferidos no ambiente implantado | ⬜ |
| Rollback documentado e executável antes de liberar operação | ⬜ |

O código já provou em ambiente isolado: PostgreSQL multi-instância, cutover
transacional, backup/restore, preservação de versões e triggers. Isso não
substitui os itens acima no ambiente real. Em especial, o volume local de
backups não protege contra perda da máquina.

**Pesquisa de 2026-10-02:** `docs/cloud/OFF_HOST_ZERO_COST_CANDIDATES_2026-10-02.md`
identificou Backblaze B2 como candidato de menor complexidade para o contrato
atual porque `writeFiles` e `deleteFiles` são capacidades separadas e há
Object Lock. Isso **não marca** o item off-host: nenhum provedor foi escolhido,
nenhum bucket/credencial foi criado e nenhum dado saiu do host.

