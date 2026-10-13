# DeliveryOS — Prova Android no emulador API 34 (2026-10-13)

**Escopo:** bancada isolada no Foxxy. **Não é ensaio em aparelho físico, nem viagem ponta a ponta, nem autorização de produção.**

## Código e execução

- Código: `9121c252d864a8b74ef33e8c9e5c0d81d687ffa3` (candidato da PR #108; funcionalidade de #106 preservada; Q-019 já registrada em branch separada).
- AVD existente: `deliveryos_api34`, identificado por ADB como `emulator-5554`, Android API 34. Não havia celular físico ADB conectado.
- Iniciado com `-no-window -no-audio -no-boot-anim -no-snapshot-load -no-snapshot-save`.
- Android SDK e build-tools 34 existentes; JDK 17. Comando `android/gradlew.bat --offline --no-daemon assembleDebug`: **BUILD SUCCESSFUL**, exit 0, 37 tarefas (20 executadas, 17 em cache), aproximadamente 1m12s.
- APK `android/app/build/outputs/apk/debug/app-debug.apk`; SHA-256 `4FCF6CCB74C68FC20E91A685D6F5124A4464B796088959886B6DFFBA428EE4B0`.
- `adb install -r`: **Success**. `am start` da `br.com.tata.entregas.debug/br.com.tata.entregas.ui.MainActivity`: exit 0, processo Android observado ativo. Nenhum erro fatal encontrado no recorte de logcat verificado.
- `adb shell cmd location set-location-enabled false`; `settings get secure location_mode` retornou `0` no início e depois dos testes. Não se concedeu permissão de GPS nem se acionou captura.

## Teste instrumentado real no Android emulado

Comando: `android/gradlew.bat --offline --no-daemon connectedDebugAndroidTest`.

**BUILD SUCCESSFUL**, exit 0; `19 tests` em `deliveryos_api34(AVD) - 14`. O XML `app/build/outputs/androidTest-results/connected/debug/TEST-deliveryos_api34(AVD) - 14-_app-.xml` reportou **19 testes, 0 falhas, 0 erros, 0 pulados**. Cobrem a suíte já existente de persistência e credenciais instrumentadas; não provam integração com o servidor de pedidos.

## Resultado de inicialização da interface

Ao abrir o APK de debug, o `WebView` tentou carregar `https://10.0.2.2:5193/rider-mobile/` (origem local por padrão de debug). Captura: [tela da primeira inicialização](evidencias/visual-preflight-2026-10-13/android-emulador-sem-servidor-https.png).

**Resultado visível:** `net::ERR_CONNECTION_REFUSED` — servidor HTTPS local não iniciado. Logo, **a tela rider-mobile NÃO foi carregada**, não houve Trip criado, offline/retry/retorno, nem checagem de evento comum a Entregas e Copiloto. Não declarar APP E2E PASS.

## Limites e próximo passo

1. Subir um servidor **HTTPS local e sintético** na porta e origem corretas; manter TLS estrito do app (não permitir cleartext nem desativar validação de certificado), com certificado de laboratório reconhecido apenas no emulador.
2. Preservar `source_mode=simulated`, GPS desligado, nenhum pedido ou credencial real, nem PostgreSQL produtivo.
3. Exercitar no emulador o fluxo sintético de Trip, offline e reconexão, saída/entrega/retorno e leitura do mesmo evento por Entregas e Copiloto; capturar IDs e estados, não apenas telas.
4. Depois, homologação visual humana e Android físico supervisionado. **Sem merge ou deploy**.

Não reexecutar a suíte adversarial Q-018 que anteriormente travou sem isolamento/rollback melhores. O checkout do candidato foi verificado limpo após a compilação e os testes.


## Atualização posterior em 13/10/2026 — HTTPS local resolvido no emulador

O erro de conexão HTTP(S) registrado acima foi **resolvido no laboratório**, sem mudança no código aprovado: um APK de debug temporário com CA própria acessou, por TLS validado, um proxy HTTPS local para a UI de DEMONSTRAÇÃO em memória. Saída, chegada e entrega foram acionadas no emulador; retorno/encerramento foram concluídos via API do mesmo DEMO. Prova e limites: [DELIVERYOS_ANDROID_HTTPS_FLUXO_SINTETICO_2026-10-13.md](DELIVERYOS_ANDROID_HTTPS_FLUXO_SINTETICO_2026-10-13.md). **Persistência offline de dispositivo e compartilhamento do mesmo evento com Copiloto continuam não comprovados**.
