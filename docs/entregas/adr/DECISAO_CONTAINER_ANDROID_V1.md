# ADR — Container Android, V1

**Estado:** aceito · **Data:** 2026-07-26 · **Unidade piloto:** ITAIM
**Complementa:** [DECISAO_TECNOLOGIA_LOCALIZACAO_ANDROID_V1.md](DECISAO_TECNOLOGIA_LOCALIZACAO_ANDROID_V1.md)

## Problema

O ADR anterior decidiu **o quê**: `FusedLocationProviderClient` dentro de um
Foreground Service. Este decide **como empacotar isso** sem jogar fora a
interface, o domínio e os testes que já existem.

## Alternativas

**A. Reescrever a interface em Compose.** Tela nativa de verdade. Mas a tela
do motoboy, a do termo e o indicador de GPS já existem em JavaScript, com 387
testes atrás. Reescrever cria uma segunda verdade sobre as mesmas regras —
que é exatamente o que o adendo proíbe. Rejeitada.

**B. Capacitor / React Native.** Resolveria a ponte, e traz um ecossistema
inteiro junto: build próprio, plugins, uma segunda forma de fazer tudo. Para
um problema que é "preciso de um serviço nativo e uma ponte", é
desproporcional. Rejeitada.

**C. Trusted Web Activity.** Elegante e leve — mas TWA não hospeda serviço em
primeiro plano ligado ao ciclo de vida do app da forma que precisamos, e o
Foreground Service é o motivo de existir deste projeto. Rejeitada.

**D. WebView + `@JavascriptInterface`, com Kotlin fazendo só o nativo.** ←
**escolhida**

## Decisão

Container Android mínimo. A `MainActivity` hospeda a interface do piloto num
WebView; o Kotlin faz **apenas** o que só o Android faz:

| Kotlin | Domínio (servidor, TypeScript) |
|---|---|
| captura de posição | Trip, Delivery, Occurrence |
| persistência local (Room) | máquinas de estado |
| sincronização (WorkManager) | validação de transição |
| permissões e ciclo de vida | chegada e retorno |
| notificação persistente | catálogo de eventos |
| registro do aceite do termo | timeline e regras |

**O Kotlin não decide nada de domínio.** Há teste que falha se
`applyArrivalDetected`, `evaluateReturn`, `closeTripAutomatic` ou
`INVALID_TRANSITION` aparecerem no código Kotlin.

O contrato da ponte já existia: `AndroidBridgePort` /
`AndroidLocationMessage`, escritos na missão anterior. O Kotlin os preenche —
não inventa outro.

## Decisões de segurança

**WebView trancado na origem.** `OriginLockedClient` manda qualquer outro
host para o navegador do sistema. Uma página injetada nunca roda com acesso à
ponte nativa.

**Superfície `@JavascriptInterface` mínima.** Nove métodos, todos ações de
aparelho. `addJavascriptInterface` é superfície de ataque; quanto menor,
melhor.

**Geolocalização do WebView desligada.** Quem captura é o serviço nativo. Duas
fontes de posição dariam dois relógios e duas verdades.

**Cleartext proibido, inclusive no debug.** O certificado local vale por
`network_security_config` com trust de usuário — nunca desativando TLS em
código. Há teste procurando `setHostnameVerifier`, `X509TrustManager` e afins.

**`ACCESS_BACKGROUND_LOCATION` não é declarada.** O Foreground Service cobre a
viagem inteira, inclusive com a tela apagada. Pedir background daria acesso
fora da viagem — o oposto do contrato.

**`allowBackup="false"` e banco excluído da transferência.** O Room guarda
coordenadas; elas não saem do aparelho por backup de nuvem.

**`device_id` é UUID gerado localmente.** Nunca ANDROID_ID, IMEI ou MAC:
identifica o aparelho para a operação sem seguir a pessoa para fora.

## Idempotência atravessa as duas linguagens

`point_id = gps:<device>:<trip>:<occurred_at>`, idêntico nos dois lados. Há
teste que extrai o template do Kotlin, aplica os mesmos argumentos na função
TypeScript e compara. Se divergirem, o servidor para de deduplicar e a fila
offline duplica ponto no reenvio — falha silenciosa, das piores.

## Limitações

- **Não compilado.** Sem JDK, Gradle ou Android SDK neste ambiente.
- WebView pesa mais que tela nativa. Aceitável: a tela é simples.
- Sem suporte a iOS. `GeolocationProvider` já é a porta; seria outro adapter.
- Notificação sem botão de parar: parar o GPS é consequência de encerrar a
  viagem, ato que passa pelo domínio e gera evento. Um botão que desligasse a
  captura sem isso criaria parada sem registro.

## Rollback

1. Não instalar o container — o fallback de navegador continua funcionando.
2. `gps_capture_enabled: false` — para a captura.
3. Abandonar a branch.

Nenhum perde dado: o bruto é imutável e a fila é persistente.
