# Compilar e instalar o aplicativo Android

> **O projeto ainda não foi compilado.** Este ambiente não tem JDK, Gradle nem
> Android SDK. O que está abaixo é o caminho exato — não uma estimativa.

## 1. O que falta na máquina

Verificado nesta máquina, componente por componente:

| Componente | Estado | Comando de verificação |
|---|---|---|
| JDK 17 | **ausente** | `java -version` |
| Gradle | vem pelo wrapper | — |
| Android SDK (platform 34, build-tools) | **ausente** | `sdkmanager --list` |
| `adb` | **ausente** | `adb version` |
| Emulador | **ausente** | `emulator -list-avds` |

Nenhum deles é opcional para gerar APK.

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

## 3. Gerar o wrapper do Gradle

O repositório versiona `gradle-wrapper.properties`, mas **não** o `.jar` do
wrapper — binário não entra no Git. Gere-o uma vez:

```bash
cd android && gradle wrapper --gradle-version 8.9
```

Se você não tem `gradle` no PATH, o Android Studio faz isso ao abrir a pasta
`android/`.

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
