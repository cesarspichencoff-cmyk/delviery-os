# Device ID visível no app antes do login

Data: 2026-10-01
Host: Foxxy
Base Git: `fb8d235379815dcf0ce5d124bc89be8ad6bebcb2`
Resultado: **CODE_READY + TEST_PASS em browser/ponte nativa simulada**

## Gap

O build `pilot` não é depurável. Antes desta mudança, o `device_id` existia no
Room e em `EntregasNative.capabilities()`, mas não aparecia na interface.
Isso obrigava o primeiro field gate a usar build debug/ADB apenas para descobrir
o identificador necessário à autorização humana em `identity.device`.

## Correção

A rider-mobile mostra uma linha compacta `ID deste aparelho dev-…` quando existe
ponte Android. O valor vem diretamente de `capabilities().device_id`.

- a inicialização nativa começa antes da sessão humana do piloto;
- o ID continua visível mesmo sem token humano;
- navegador comum mantém a linha escondida e não inventa identidade;
- a linha não contém token, segredo, Bearer, IMEI, telefone ou coordenada;
- o valor é texto selecionável, sem criar nova credencial nem nova autoridade.

## Provas

- rider-bridge: **30/30 PASS**;
- cenário explícito sem `entregas_pilot_token`: ID nativo visível;
- navegador sem ponte: ID oculto/vazio;
- rider-capture: **38/38 PASS**;
- Android structural/project: **43/43 PASS**.

## Fronteira

Isto elimina apenas a descoberta do pseudônimo no build pilot.
A autorização do aparelho continua ato humano com plano + fingerprint.
A assinatura do APK pilot, configuração operacional e aparelho físico continuam `NOT_RUN`.
