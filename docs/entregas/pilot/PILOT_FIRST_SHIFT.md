# Primeiro turno com GPS — o que fazer, nesta ordem

> O primeiro turno de uso **é** o teste de campo. Não execute os 22 cenários
> artificialmente antes: sete são obrigatórios antes da primeira saída, o
> resto se observa enquanto a operação acontece.

## 1. Antes da primeira saída — os 7 obrigatórios

Só saia da loja depois destes sete. Cada um leva menos de 5 minutos.

| # | Verificar | Como | Se falhar |
|---|---|---|---|
| 1 | GPS só inicia com viagem ativa | Abra o app sem viagem → indicador deve dizer `GPS DESLIGADO — SEM VIAGEM ATIVA` | **Pare.** P0 |
| 2 | GPS para ao encerrar | Encerre a viagem → indicador volta a DESLIGADO | **Pare.** P0 |
| 3 | Nenhuma captura fora da viagem | Com o app aberto e sem viagem, ande 100 m → nenhum ponto novo no console | **Pare.** P0 |
| 4 | Operador vê se o GPS está ativo | Console mostra a viagem com estado do GPS | Corrigir antes |
| 5 | Operador identifica stale/offline/impreciso | Ponha o celular em modo avião 2 min → status muda | Corrigir antes |
| 6 | Encerramento manual funciona | Encerre uma viagem de teste pelo console | **Pare.** Sem contingência não há piloto |
| 7 | Fluxo normal funciona sem GPS | Desligue `gps_capture_enabled` → viagem, entrega e encerramento continuam | **Pare.** GPS não pode ser dependência |

## 2. Configuração — o que o César precisa fazer

### 2.1 Geofence da unidade

Crie `config/entregas-geofence.json` (fora do Git):

```json
{
  "unit_id": "tata-unidade-1",
  "latitude": -00.000000,
  "longitude": -00.000000,
  "radius_m": 80,
  "max_accuracy_m": 100,
  "min_dwell_s": 60,
  "max_speed_mps": 1.5,
  "max_freshness_s": 90,
  "version": "v1",
  "active": true,
  "updated_by": "gerente"
}
```

Pegue a coordenada abrindo o mapa no celular **parado na porta da loja**.
Sem esse arquivo o GPS funciona, mas o retorno automático fica desligado —
o que é o comportamento correto, não um defeito.

### 2.2 Certificado HTTPS (obrigatório para o celular)

O GPS **não liga** no celular sem HTTPS. Gere um certificado local (ex.:
`mkcert`), guarde **fora do repositório** e aponte:

```bash
set ENTREGAS_HTTPS=1
set ENTREGAS_TLS_CERT=C:\certs\entregas.pem
set ENTREGAS_TLS_KEY=C:\certs\entregas-key.pem
set ENTREGAS_BIND=0.0.0.0
npm run ui:entregas:pilot
```

No Android: instale o certificado da autoridade local em
Configurações → Segurança → Credenciais, e acesse `https://<ip-do-pc>:5193`.

Se o servidor recusar subir, a mensagem diz o que falta — ele **não** cai
para HTTP em silêncio, de propósito.

### 2.3 Flags do primeiro turno

```json
"gps_capture_enabled": true,
"gps_return_detection_enabled": true,
"gps_background_enabled": false,
"offline_queue_enabled": true,
"persistent_outbox_enabled": true
```

Deixe o retorno em **modo shadow** na primeira viagem (ver §4).

## 3. Abrir a primeira viagem

1. Console: criar viagem → escolher motoboy → adicionar 1 ou 2 pedidos.
2. Celular do motoboy: abrir o app, confirmar saída.
3. Conferir o indicador: deve mostrar `GPS ATIVO — VIAGEM …`.
4. O motoboy mantém o app aberto durante a viagem.

## 4. Retorno em modo shadow

Na primeira viagem o retorno automático **calcula mas não encerra**. Ao
final, compare:

- em que momento o sistema teria encerrado;
- em que momento o encerramento manual aconteceu;
- a diferença (`delta_s`).

Se a diferença for aceitável em 2 ou 3 viagens, ligue
`gps_return_detection_enabled` em modo ativo. **Não ligue só porque os
testes passaram** — os testes provam a regra, não o comportamento da rua.

## 5. O que observar durante os primeiros turnos

Sem forçar. Anote quando acontecer naturalmente:

app minimizado · tela bloqueada · Wi-Fi → dados móveis · perda de internet ·
sincronização depois · sinal perdido · sinal recuperado · economia de
bateria · chegada detectada · retorno detectado · reinício do app.

**Esperado e não é defeito:** com o app minimizado ou a tela bloqueada, a
captura pode parar. É limitação do runtime, está declarada, e por isso
`gps_background_enabled` fica desligado.

## 6. Registro de problema

Anote (papel serve): módulo · viagem · horário · o que esperava · o que
aconteceu · status do GPS na hora · tinha rede? · dá para continuar?

Três respostas possíveis: **continua** · **desliga essa função** ·
**para o piloto**.

## 7. Parar tudo — rollback

```
gps_capture_enabled: false
```

Captura para na hora. A operação continua com encerramento manual. Nenhum
dado de viagem é perdido. A branch é isolada — nada foi para produção.
