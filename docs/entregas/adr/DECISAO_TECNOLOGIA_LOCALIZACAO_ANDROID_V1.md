# ADR — Tecnologia de localização, Android V1

**Estado:** aceito · **Data:** 2026-07-25 · **Unidade piloto:** ITAIM
**Decisor:** responsável pelo produto · **Escopo:** TATÁ Entregas V1

## Problema

O GPS do piloto foi construído sobre `navigator.geolocation`. Ele funciona,
está testado e provou o motor — mas tem um teto que nenhuma quantidade de
código nosso remove: **com o aplicativo minimizado ou a tela bloqueada, o
navegador pode parar de entregar posição**, sem aviso e sem erro.

Numa entrega real, o motoboy guarda o celular no bolso. Ou seja: o modo normal
de trabalho é justamente o modo em que a captura falha. O sintoma não é
"algumas amostras a menos" — é a viagem inteira sem rastro entre a saída e a
volta, com o console mostrando uma última posição velha.

Também não temos, no navegador: notificação persistente exigível pelo sistema,
geofencing nativo, controle real de precisão por situação, sinalização de
localização simulada, nem relógio monotônico para separar movimento de ajuste
de hora.

## Alternativas consideradas

**A. Continuar só com `navigator.geolocation`.**
Custo zero, e já está pronto. Mas mantém o teto acima. Rejeitada como
arquitetura final — mantida como fallback, que é papel legítimo.

**B. PWA + Background Sync / Periodic Background Sync.**
Melhora o envio, não a captura. O problema não é subir o ponto: é obter o
ponto. Rejeitada como solução do problema real.

**C. Aplicativo nativo completo, reescrito em Kotlin.**
Resolve tudo e joga fora a interface, a máquina de estados, a fila offline e
os 299 testes. Rejeitada por desproporção: o problema é a captura, não o
produto.

**D. Framework multiplataforma (React Native / Flutter / Capacitor).**
Traz um ecossistema inteiro para resolver um item. Introduz build, cadeia de
dependências e uma segunda forma de fazer tudo. O adendo pede para não
introduzir framework sem demonstrar necessidade — e a necessidade aqui é uma
ponte, não uma plataforma. Rejeitada.

**E. GNSS bruto / RTK.**
Precisão de centímetros que não muda nada operacionalmente: nossa decisão de
retorno tolera dezenas de metros e já é cumulativa. Consumiria bateria e
complexidade para parecer sofisticado. Rejeitada explicitamente.

**F. Container Android mínimo + `FusedLocationProviderClient` + Foreground
Service, com a interface web preservada.** ← **escolhida**

## Decisão

1. **Android é a plataforma prioritária do V1.** É o que os motoboys usam.
2. **`FusedLocationProviderClient` passa a ser o provider operacional**, dentro
   de um **Foreground Service do tipo `location`**, amarrado a **uma viagem**.
3. **A interface web/PWA é preservada.** O container Android a hospeda; nada da
   tela é reescrito.
4. **`navigator.geolocation` continua**, como fallback, modo de desenvolvimento
   e compatibilidade com navegador.
5. **O domínio não muda.** `GPSPoint`, event log, fila offline, outbox,
   máquinas de estado, motor de chegada, motor de retorno, projeções e
   contratos públicos ficam como estão.
6. **Captura adaptativa** por situação, em política versionada.
7. **Map matching** fica preparado e desligado, atrás de porta versionada.
8. **O ponto bruto continua sendo a fonte histórica.** Tudo o mais é camada
   derivada e rotulada.
9. **iOS / Core Location** fica como extensão futura. A porta já é a mesma;
   seria mais um adapter.

## Como fica o fluxo

```
FusedLocationProviderClient  (Kotlin, Foreground Service)
        ↓  ponte
AndroidBridgeProvider        (adapter — único ponto que conhece Android)
        ↓
ProviderSample → validateSample → GPSPoint canônico
        ↓
fila offline → event log → projeções → central de despacho
```

O domínio **não importa nada de Android**. A porta `GeolocationProvider` já
existia; o adapter novo a implementa igual ao de navegador. O tracker não sabe
qual dos dois está rodando.

## O que já está implementado e provado

Contrato da ponte, tradução Android → canônico pela cadeia real, trava de
`supportsBackground` (só verdadeiro se o runtime nativo declarar serviço),
amarração serviço↔viagem, regra da notificação, rejeição de localização
simulada, detecção de salto de relógio pelo monotônico, captura adaptativa,
projeção derivada, porta de map matching, configuração ITAIM e o termo de
ciência inteiro. **299 testes verdes.**

## O que NÃO está implementado

**O lado Kotlin não existe neste repositório.** Não há projeto Android, não há
Gradle, nada foi compilado e nada rodou em aparelho. O que está provado é o
contrato e as travas — não o serviço nativo.

Isso é limitação declarada, não pendência escondida: enquanto o container não
existir e não rodar em aparelho, o piloto usa o fallback de navegador, em
primeiro plano, com a limitação avisada na tela do motoboy.

## Impacto

| Área | Efeito |
|---|---|
| Domínio | nenhum |
| Testes existentes | nenhum alterado |
| Interface | preservada; ganha tela de termo |
| Contrato público | `1.0.0 → 1.1.0`, aditivo |
| Build | inalterado enquanto o container não existir |
| Bateria | maior consumo que hoje — mitigado pela captura adaptativa |

## Riscos

- **Bateria.** Serviço em primeiro plano com GPS gasta. Mitigação: cadência
  adaptativa, com degradação **visível** em bateria crítica. O primeiro turno
  mede o consumo real; hoje é estimativa.
- **Fabricante matando o serviço.** Xiaomi, Samsung e outros são agressivos.
  Mitigação: `recovered_after_restart` reportado pela ponte — a lacuna aparece
  em vez de virar silêncio.
- **Falso senso de cobertura.** Ter o adapter pronto pode parecer que o
  background funciona. Mitigação: `supportsBackground` deriva da capacidade
  declarada pelo runtime; sem container, é `false`.
- **Permissão de background.** Android trata como pedido separado e o usuário
  pode negar. Estado registrado à parte; o piloto não depende dela.
- **Prazo.** O container é trabalho novo, fora deste repositório.

## Compatibilidade

Nenhuma quebra. O adapter de navegador continua funcionando; a escolha é de
configuração. O envelope de eventos permanece `1.0.0` — consumidor antigo
ignora `event_type` que não conhece.

## Rollback

Três níveis, do mais brando ao mais forte:

1. Trocar o provider de volta para o de navegador — configuração, sem código.
2. `gps_capture_enabled: false` — para a captura na hora; a operação segue com
   encerramento manual.
3. Abandonar a branch — nada foi para produção.

Nenhum nível perde dado de viagem: o bruto é imutável e a fila é persistente.

## Decisões que este ADR NÃO toma

Não trata de assunto jurídico. Não define prazo de retenção — isso é decisão do
responsável e está marcada como pendente no termo. Não autoriza provedor
externo de map matching. Não autoriza rastreamento fora de viagem, ranking ou
punição automática.
