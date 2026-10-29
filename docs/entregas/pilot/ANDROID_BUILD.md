# Android — compilação e preparação do teste

Atualizado em 26/10/2026. O [gate de campo](GATE_CAMPO_ANDROID_COPILOTO_2026-10-20.md) governa instalação e ensaio físico. O app exige API 26 (Android 8.0) ou superior. O Xiaomi está disponível; modelo, versão e comportamento físico ainda não foram observados.

## Bancada e campo

| Variante | Finalidade | Limite |
|---|---|---|
| `debug` | Bancada de emulador, com assinatura de desenvolvimento e endereços do emulador | Não distribuir a motoboys nem usar como variante de campo |
| `pilot` | Ensaio físico autorizado, pacote `br.com.tata.entregas.pilot` e TLS estrito | Exige URLs HTTPS e assinatura sob custódia aprovada |
| `release` | Publicação futura | Fora desta preparação |

A recomendação antiga de usar `assembleDebug` como APK de piloto foi retirada. Debug aceita CA de usuário e depuração WebView; o gate atual exige `pilot` para o campo.

## Pacote de bancada automatizado

O workflow **DeliveryOS Android event receipt** executa JVM/Room e exige JUnit existente, contagem positiva e zero falhas/erros. Depois compila `assembleDebug` e `assembleDebugAndroidTest`, sem instalar em aparelho.

O empacotador usa `aapt` e `apksigner verify` reais para conferir pacote, SDK e assinatura, exige assinantes iguais, confere endereços de emulador no DEX e calcula SHA-256. Publica o artefato **android-bancada-nao-instalar-em-campo**, com retenção de 14 dias.

O pacote contém dois APKs, `manifest.json` e `LEIA-ME.txt`. Não inclui chave privada, credencial de loja ou configuração operacional. O manifesto declara `field_ready=false` e `physical_device_tested=false`. Compilar testes instrumentados não significa executá-los.

## Reproduzir a bancada

Usar JDK 17, SDK compatível com compileSdk 34 e o wrapper versionado. O estado de SDK/ADB de outra máquina não deve ser tratado como fato desta máquina.

```bash
cd android
bash ./gradlew --no-daemon --console=plain :app:testDebugUnitTest
bash ./gradlew --no-daemon --console=plain :app:assembleDebug :app:assembleDebugAndroidTest
```

O wrapper está sem bit de execução; usar `bash ./gradlew`. A distribuição tem SHA fixado. O download do Gradle falhou no ambiente local desta sessão; o CI fornece a prova de compilação remota.

## Preparar a variante de campo

Registrar antes da geração:

- Duas URLs HTTPS verificadas: piloto e plataforma, alcançáveis pelo aparelho, com certificados confiáveis.
- Ambiente isolado do Itaim e modo de ensaio declarado, sem reclassificar fatos como operação real.
- Custódia da assinatura e responsável por assinar, com chave e senha fora do Git.
- Termo vigente, responsável, contato, retenção e aprovação definidos por César.
- Modelo/Android do Xiaomi, participante autorizado, vínculo do aparelho e parada do ensaio.

Com as URLs verificadas, gerar o APK ainda sem assinatura:

```bash
cd android
bash ./gradlew :app:assemblePilot \
  -Pentregas.baseUrl="${PILOT_HTTPS_URL:?defina a URL HTTPS do piloto}" \
  -Pentregas.platformUrl="${PLATFORM_HTTPS_URL:?defina a URL HTTPS da plataforma}"
```

Assinar sob a custódia aprovada, conferir identidade/assinante/SHA e aplicar o gate de instalação. Não usar URLs de exemplo para apresentar um APK como pronto para campo.

## Fronteira de prova

CI aprovado comprova os comandos e artefatos daquela revisão. Não comprova servidor publicado, instalação no Xiaomi, recibo remoto do termo, GPS em segundo plano, fila offline física, bateria ou aceitação da equipe. Nenhum comando desta página instala aplicativo, cria identidade operacional ou liga coleta.

## Validação dos endereços de campo

A geração de `pilot`/`release` analisa a URI completa: exige HTTPS e host válido; recusa credenciais, query, fragmento, porta inválida, loopback e endereço do emulador. A mesma guarda cobre a geração direta do BuildConfig e o empacotamento. Os erros não reproduzem o endereço informado, para não revelar credenciais de uma configuração incorreta.

O CI executa `:app:verifyFieldEndpointPolicy`: 19 casos recusados e três formatos aceitos, usando o mesmo validador da compilação. Esses testes não consultam DNS nem comprovam certificado TLS, alcance pelo Xiaomi ou aprovação do ambiente. IP privado com HTTPS continua sendo formato permitido, pois pode representar servidor da unidade; a confiança do certificado precisa de verificação real.
