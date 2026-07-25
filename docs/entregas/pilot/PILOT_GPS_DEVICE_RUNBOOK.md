# Runbook — teste de GPS em aparelho real

> Complementa `PILOT_RUNBOOK.md`. Cobre só o que o GPS acrescenta.
> Autorização: `docs/entregas/cor-v1-0-3/ENTREGAS_V1_0_3_ADENDO_GPS_PILOTO.md`.

## 1. Estado honesto antes de começar

| Camada | Situação |
|---|---|
| Contrato `GPSPoint`, validação, flags | **Implementado, 50 testes** |
| Motor de detecção (chegada, retorno, sinal) | **Implementado, testado com trilhas sintéticas** |
| Fila offline persistente | **Implementado, 17 testes** |
| Outbox persistente | **Já existia; provado por 6 testes** |
| Captura em aparelho real | **NUNCA EXECUTADA** — é o objeto deste runbook |
| Segundo plano (app minimizado / tela bloqueada) | **NÃO SUPORTADO** pelo runtime atual — ver §5 |
| Mapa no console | **Não integrado** — POC isolado, fora do fluxo |

**Nada abaixo pode ser marcado como aprovado sem execução real.** Cenário
não executado permanece `PENDENTE`, nunca presumido.

## 2. Pré-condições

1. Servidor do piloto no ar (`npm run ui:entregas:pilot`).
2. `config/entregas-pilot.json` com tokens reais trocados.
3. Flags ligadas explicitamente:
   ```json
   "gps_capture_enabled": true,
   "gps_return_detection_enabled": true,
   "gps_background_enabled": false
   ```
   `gps_background_enabled` **precisa continuar false** — o validador
   rebaixa automaticamente e registra o motivo.
4. Geofence da loja configurado com coordenada real da unidade.
5. Aparelho do motoboy com permissão de localização concedida ao navegador.
6. **HTTPS ou localhost** — a Geolocation API não funciona em HTTP puro.

## 3. Roteiro (22 cenários)

Marque cada um como `OK` / `FALHOU` / `PENDENTE`. Registre horário e o que
apareceu na tela.

### Permissão e ciclo de vida
| # | Cenário | Esperado | Resultado |
|---|---|---|---|
| 1 | Permissão concedida | captura inicia, status "GPS ligado" | PENDENTE |
| 2 | Permissão negada | erro `permission_denied` visível, sem posição inventada | PENDENTE |
| 3 | Viagem ativa | pontos entram na fila | PENDENTE |
| 4 | Viagem encerrada | captura para | PENDENTE |
| 5 | **GPS para após encerramento** | nenhum ponto novo aceito; watcher desligado | PENDENTE |
| 22 | **Nenhum rastreamento fora da viagem** | zero pontos com o app aberto sem viagem | PENDENTE |

### Estados do aparelho
| # | Cenário | Esperado | Resultado |
|---|---|---|---|
| 6 | Tela aberta (primeiro plano) | captura contínua | PENDENTE |
| 7 | App minimizado | **captura pode parar** — limitação conhecida | PENDENTE |
| 8 | Tela bloqueada | **captura pode parar** — limitação conhecida | PENDENTE |
| 15 | Economia de bateria | pode reduzir frequência | PENDENTE |
| 13 | Reinício do aplicativo | fila recuperada, `sending` volta a `pending` | PENDENTE |
| 14 | Reinício do aparelho | fila sobrevive | PENDENTE |

### Rede
| # | Cenário | Esperado | Resultado |
|---|---|---|---|
| 9 | Wi-Fi → dados móveis | fila continua, sem duplicar | PENDENTE |
| 10 | Perda de internet | pontos acumulam na fila local | PENDENTE |
| 11 | Retorno da internet | lote sobe com `occurred_at` original | PENDENTE |
| 12 | Fila sincronizada | `pending` zera; `synced_at` preenchido | PENDENTE |

### Qualidade e detecção
| # | Cenário | Esperado | Resultado |
|---|---|---|---|
| 16 | Ponto impreciso | marcado `inaccurate`, não sustenta retorno | PENDENTE |
| 17 | Sinal perdido | `trip_signal_lost`, tela mostra "sem sinal" | PENDENTE |
| 18 | Sinal recuperado | `trip_signal_recovered` | PENDENTE |
| 19 | Chegada detectada | `arrival_detected`, parada em `chegada_detectada` | PENDENTE |
| 20 | **Entrega ainda depende de confirmação humana** | nada é confirmado sozinho | PENDENTE |
| 21 | Retorno detectado | só com as 7 condições cumulativas | PENDENTE |

## 4. Como provar o cenário 5 e o 22 (os mais importantes)

São as duas provas de privacidade que não podem falhar:

1. Encerre a viagem no app.
2. Ande ~200 m com o app aberto.
3. No console, confirme: nenhum ponto novo na viagem encerrada.
4. Verifique o arquivo de dados: nenhum `GPSPoint` com `occurred_at`
   posterior ao encerramento.

Se aparecer qualquer ponto → **P0, pare o piloto imediatamente** e desligue
`gps_capture_enabled`.

## 5. Limitação declarada — segundo plano

A Geolocation API do navegador **não garante** captura com o app
minimizado ou a tela bloqueada. O comportamento varia por sistema, versão e
modo de economia de bateria.

Por isso: `supportsBackground = false` no adapter, e a flag
`gps_background_enabled` é **rebaixada automaticamente** se alguém tentar
ligá-la.

**Modo de piloto: primeiro plano.** O motoboy precisa manter o app aberto
durante a viagem, e a tela deve avisar isso. Se os cenários 7 e 8 falharem,
o resultado é **esperado**, não é defeito — registre e siga.

Evolução futura (fora desta missão): runtime nativo ou PWA com Background
Geolocation. Troca apenas o adapter; domínio, detecção e fila continuam
iguais.

## 6. Rollback

1. `gps_capture_enabled: false` → captura para imediatamente.
2. `gps_return_detection_enabled: false` → volta ao encerramento manual.
3. Nenhum dado de viagem é destruído.
4. A branch é isolada, sem merge — reverter é trocar de branch.

## 7. Retenção

`gps_retention_days` (default 30). Expurgo por viagem encerrada. Coordenada
nunca vai para log comum — verificado por teste automatizado.

## 8. Registro da sessão

| Campo | Valor |
|---|---|
| Data / hora | |
| Unidade | |
| Aparelho (modelo / SO / navegador) | |
| Responsável | |
| Cenários OK | |
| Cenários FALHOU | |
| Cenários PENDENTE | |
| Decisão | seguir / ajustar / abortar |
