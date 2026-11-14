# Delivery OS Itaim — L8: segurança de origem e frames da ponte Android

**Data:** 08/11/2026. **PR:** #137, branch `feat/gestor-shadow-observer-20261103`, **DRAFT/HOLD**. Base funcional da correção: `ee7217bbac21b2f8e637eb5a43e6590c4d4fa974`. Ajustes posteriores `d96371f`, `abc9e93` e `ae82ef3` alteraram somente os gatilhos de CI para tornar regressões de segurança obrigatórias em edições futuras.

## Falha investigada

O app originalmente registrava `EntregasJsBridge` como `window.EntregasNative` usando `WebView.addJavascriptInterface` e validava a origem apenas na navegação do WebView. **O próprio Android expõe interfaces JavaScript anotadas a TODOS os frames**, sem transmitir ao método Java qual frame fez a chamada. Por isso o bloqueio por host/protocolo/porta da navegação principal não bastava para impedir que uma página incorporada invocasse métodos nativos.

Fonte técnica: https://developer.android.com/reference/androidx/webkit/WebViewCompat — `addDocumentStartJavaScript` aceita regras de origem e executa no início do documento. Seu código é distribuído para frames elegíveis; a proteção também verifica explicitamente `window === window.top`.

Não há prova de exploração real no restaurante; a falha era estrutural, anterior ao deploy da candidata.

## Alteração isolada na branch

- `android/gradle/libs.versions.toml` e `android/app/build.gradle.kts`: dependência `androidx.webkit:webkit:1.14.0`.
- `OriginBoundNativeBridge.kt`: gera capacidade aleatória **256 bits** por instância de Activity; calcula origem exata por protocolo, host e porta; registra `WebViewCompat.addDocumentStartJavaScript` somente quando o WebView suporta `DOCUMENT_START_SCRIPT`. O script expõe o mesmo contrato público `EntregasNative` apenas ao **documento top-level** em `/rider-mobile/` da origem confiável. A capacidade fica em variável local do script, não em `window`, atributo do DOM nem URL.
- `EntregasBridge.kt`: `addJavascriptInterface` passa a registrar **`EntregasNativeRaw`**, não a API pública. **Todos os 13 métodos `@JavascriptInterface`** requerem primeiro uma capacidade temporária válida, comparada com `MessageDigest.isEqual`. Com prova ausente ou incorreta, comandos, permissões, sincronização, leitura da outbox, política, termo e GPS não produzem efeito e dados não são retornados.
- `MainActivity.kt`: instala o transporte Java bruto com guarda e o documento inicial antes da navegação. O formato das chamadas `window.EntregasNative.*` da UI segue compatível.
- `compat-modern-probe.js`: se uma instalação Android apresenta o transporte bruto, mas não conseguiu instalar a fachada segura, **não** simula um navegador comum. Mantém a tela de incompatibilidade bloqueada.
- `RiderWebViewBridgeInstrumentedTest.kt`: em WebView legado sem injeção document-start, uma tentativa com capacidade falsa é recusada e não cria evento Room.
- `RiderRealScreenInstrumentedTest.kt`: em WebView moderno, acrescenta um `iframe sandbox="allow-scripts"` de origem opaca, cuja página tenta chamar `EntregasNativeRaw.recordOperationalEvent` com credencial falsa. Exige que o iframe enxergue o transporte bruto, mas **não** a API pública, não consiga ler `window.top.EntregasNative`, receba `native_origin_denied` e **não** crie evento falso no Room.
- `OriginBoundNativeBridgeTest.kt`: quatro novos casos Robolectric confirmam 256 bits aleatórios, origem exata, guarda em todos os 13 métodos, e construção de uma fachada top-frame restrita à rota.

**Não há fallback inseguro.** Em motor incompatível, a UI fica indisponível; não há concessão automática de GPS, sincronização ou publicação.

## Provas de código e emulador

**Código funcional no commit `ee7217b`:**
- [Android Room Recovery #42549433724](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42549433724): `COMPLETED/SUCCESS`; **30 suítes, 298/298 testes, 0 falhas/erros**.
- [Android WebView emulator lab #42549433691](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42549433691): `COMPLETED/SUCCESS`; **2/2 testes no Android 10 e 2/2 no Android 14**, 0 falhas/erros. Inclui o ataque do iframe em Android 14 e a tela segura de incompatibilidade no Android 10.
- [Strict HTTPS Android #42549433804](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42549433804): `COMPLETED/SUCCESS`; **1/1 teste instrumental Android 14** do app real: UI → WorkManager → Worker real → dois destinos HTTPS fictícios → 422 sem ACK → reenvio idempotente → recibo individual → Room `sent` → confirmação visual.
- [Delivery OS silent fixture #42549433893](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42549433893): `COMPLETED/SUCCESS`, incluindo execução Windows silenciosa na bancada.

**Erro anterior:** a primeira suíte de testes Robolectric falhou numa asserção de texto do script porque `JSONObject.quote` pode escapar a barra de URL. A asserção foi ajustada para verificar origem e rota independentemente dessa representação. **Nenhuma validação foi omitida ou marcada como aprovada antes da CI green.**

## Prova final de gatilhos automáticos — edição sem mudança funcional

As três workflows agora escutam alterações da nova classe de segurança, dos testes de guarda e, quando relevante, do catálogo WebKit:
- WebView `.github/workflows/deliveryos-android-webview-emulator-lab.yml`.
- Android Room `.github/workflows/deliveryos-android-room-recovery.yml`.
- HTTPS `.github/workflows/deliveryos-android-https-end-to-end-lab.yml`.

Rodada do commit `ae82ef3735ad149ee2fb8a9f1d9bad03c99f0a49`:
- [WebView #42550097101](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42550097101).
- [Android Room #42550097070](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42550097070).
- [HTTPS #42550097012](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42550097012).
- [Silent fixture #42550097025](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42550097025).

**Status nesta escrita:** Silent fixture e Android Room SUCCESS; WebView e HTTPS aguardam resultado final da CI. Não atribuir sucesso às duas últimas sem consulta à conclusão.

## Limites e próximo gate

Esta é **prova de isolamento contra um iframe de origem opaca**, não demonstra proteção universal contra XSS ou JavaScript malicioso rodando na **própria origem confiável**. Código executado no documento autorizado ainda consegue chamar a fachada; isso requer CSP e gestão de dependências, controle de conteúdo, autenticação e autorização do servidor e teste de exploração adversarial específico. Subframes de mesma origem não devem ser tratados automaticamente como conteúdo não confiável sem controle adicional, pois a política de mesma origem permite acesso ao documento superior.

**Faltam**: Xiaomi físico com WebView real, bateria/Doze, GPS consentido, rede móvel, produção autorizada, prova de comandas completas L1, Home operacional L4, jornada L7 e segurança/cutover L8. **V1: 0/8 etapas integralmente homologadas em campo.** A PR continua em DRAFT/HOLD.

**Efeitos operacionais:** 0. Nenhum acesso ao CAIXA_MOOCA, Foxxy, SQL/Reader, impressão, GPS, serviço real, merge, instalação de APK, deploy ou compra.
