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
aparelhos autorizados: 0
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
motoboy vai ler esses prazos na tela.

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

`config/entregas-devices.json` (fora do Git). Lista vazia = nenhum aparelho
entra, mesmo com token válido.

| Item | Estado |
|---|---|
| `device_id` de cada celular (o app gera na 1ª execução) | ⬜ |
| `rider_id` vinculado a cada aparelho | ⬜ |

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
