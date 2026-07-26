# Compilar e instalar o aplicativo Android

> **O JDK e o Gradle wrapper já estão prontos.** Falta o Android SDK, que
> exige um aceite de licença — decisão sua, não minha. Depois disso, um
> comando gera o APK.

## Caminho curto

```powershell
.\android\setup-android-sdk.ps1
```

Ele prepara tudo, **para** no aceite da licença, mostra o comando, e continua
quando você rodar de novo. As seções abaixo detalham cada passo, caso prefira
fazer à mão.

## 1. Estado desta máquina

| Componente | Estado | Comando de verificação |
|---|---|---|
| JDK 17 (Temurin 17.0.19) | **instalado** | `java -version` |
| Gradle 8.9 | **wrapper pronto e provado** | `.\gradlew.bat --version` |
| Android SDK (platform 34, build-tools) | **ausente — falta aceitar a licença** | `sdkmanager --list` |
| `adb` | ausente (vem com platform-tools) | `adb version` |
| Emulador | ausente | `emulator -list-avds` |
| Virtualização | **habilitada** | — |

O wrapper valida a distribuição do Gradle pelo SHA-256 fixado em
`gradle-wrapper.properties`, então qualquer máquina reproduz o mesmo build.

## 2. Instalar

**Caminho curto:** instalar o [Android Studio](https://developer.android.com/studio).
Ele traz JDK, SDK, `adb` e emulador de uma vez, e é o que a maioria das
pessoas mantém atualizado sem esforço.

**Caminho sem IDE**, se preferir:

```bash
winget install --id EclipseAdoptium.Temurin.17.JDK
```

Depois baixe as *command line tools* do Android e aceite as licenças:

```bash
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

```bash
sdkmanager --licenses
```

Por fim, aponte o SDK para o projeto criando `android/local.properties`
(já está no `.gitignore`):

```
sdk.dir=C:\\Users\\<voce>\\AppData\\Local\\Android\\Sdk
```

## 3. Gradle wrapper

Já está pronto e versionado (`gradlew`, `gradlew.bat`, `gradle-wrapper.jar`,
`gradle-wrapper.properties`). Não precisa de Gradle instalado:

```bash
cd android && ./gradlew --version
```

Provado nesta máquina: Gradle 8.9 sobre JVM 17.0.19, distribuição validada
pelo SHA-256.

## 4. Compilar

```bash
cd android && ./gradlew assembleDebug
```

O APK sai em:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

O `.gitignore` já bloqueia `*.apk` — o artefato não entra no repositório.

## 5. Rodar os testes

```bash
cd android && ./gradlew testDebugUnitTest
```

**Sem Android SDK**, o portão de captura já pode ser verificado — ele é Kotlin
puro:

```bash
cd android/gate-verification && gradle test
```

Compila e roda o MESMO `CaptureGate.kt` do aplicativo numa JVM comum. 12
testes, todos passando nesta máquina.

Testes instrumentados (precisam de aparelho ou emulador ligado):

```bash
cd android && ./gradlew connectedDebugAndroidTest
```

## 6. Instalar no aparelho

Ative **Opções do desenvolvedor** → **Depuração USB** no celular, conecte e:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## 7. Apontar para o servidor

O endereço do servidor **não** está no código Kotlin — vem de propriedade do
Gradle. Para o aparelho físico, use o IP do computador na rede local:

```bash
cd android && ./gradlew assembleDebug -Pentregas.baseUrl=https://192.168.0.10:5193
```

Para o emulador, o padrão `https://10.0.2.2:5193` já aponta para o `localhost`
da máquina hospedeira.

Antes disso, gere e confie no certificado — sem HTTPS o GPS não liga:

```bash
./tools/entregas_cert_local.sh
```

## 8. Assinatura de release

**Nenhuma chave de assinatura está no repositório**, e o `build.gradle.kts`
não configura `signingConfigs` de propósito. Quando for gerar release, crie a
keystore fora do repositório e passe por `android/keystore.properties`
(gitignored). O piloto não precisa disso: `assembleDebug` basta.

## 9. Se der erro

| Erro | Causa | O que fazer |
|---|---|---|
| `SDK location not found` | falta `local.properties` | passo 2 |
| `Could not find gradle-wrapper.jar` | wrapper não gerado | passo 3 |
| `Failed to install the following SDK components` | licenças | `sdkmanager --licenses` |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | versão anterior assinada com outra chave | `adb uninstall br.com.tata.entregas.debug` |
| App abre em branco | servidor inacessível ou certificado não confiado | passo 7 |
| `net::ERR_CERT_AUTHORITY_INVALID` | CA local não instalada no aparelho | rode o script de certificado e instale a CA |
