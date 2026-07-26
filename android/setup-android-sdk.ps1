# Prepara o Android SDK para compilar o TATÁ Entregas.
#
# O JDK e o Gradle wrapper já estão prontos no repositório. Falta só o SDK —
# e ele exige que VOCÊ aceite a licença do Android SDK, que é um acordo entre
# você e o Google. Não aceito licença no seu nome; o script para nesse ponto,
# mostra o comando, e segue depois que você aceitar.
#
# Uso:
#   .\android\setup-android-sdk.ps1
#
# Nada é instalado dentro do repositório. O SDK vai para %LOCALAPPDATA%\Android\Sdk,
# que é o caminho padrão e o mesmo que o Android Studio usa.

$ErrorActionPreference = "Stop"

$SdkRoot   = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$RepoRoot  = Split-Path -Parent $PSScriptRoot
$AndroidDir = Join-Path $RepoRoot "android"
$CmdlineUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"

function Passo($n, $texto) { Write-Host "`n[$n] $texto" -ForegroundColor Cyan }

<#
 Executa um processo externo e devolve a saída combinada (stdout+stderr).

 Por que isto existe: java, sdkmanager e gradle escrevem linhas normais em
 stderr por convenção (a versão do java, avisos de deprecação do Gradle) —
 isso NÃO é falha. Mas com $ErrorActionPreference = "Stop", qualquer linha
 que chegue pelo stream de erro vira exceção terminante assim que passa pelo
 pipeline, mesmo que o processo termine com código 0. O critério real de
 sucesso de um processo externo é o código de saída, não o stream em que ele
 escreveu — então é isso que checamos aqui, e só aqui.
#>
function Invoke-External([string]$Exe, [string[]]$Arguments) {
    # `$Arguments`, não `$Args`: `$args` é variável automática reservada do
    # PowerShell (argumentos não vinculados), e como nomes de variável não
    # diferenciam maiúsculas de minúsculas, um parâmetro chamado `$Args`
    # colide com ela silenciosamente — o splatting `@Args` corrompeu a lista
    # de argumentos passada ao processo externo (foi assim que "-version"
    # deixou de chegar ao java como argumento de verdade).
    $anterior = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $saida = & $Exe @Arguments 2>&1 | ForEach-Object { "$_" }
    } finally {
        $ErrorActionPreference = $anterior
    }
    return [pscustomobject]@{
        Output   = $saida
        ExitCode = $LASTEXITCODE
    }
}

# ---------------------------------------------------------------- JDK
Passo 1 "Conferindo o JDK"

$jdk = Get-ChildItem "C:\Program Files\Eclipse Adoptium" -Filter "jdk-17*" -Directory -ErrorAction SilentlyContinue |
       Select-Object -First 1
if (-not $jdk) {
    Write-Host "JDK 17 não encontrado. Instale com:" -ForegroundColor Yellow
    Write-Host "  winget install --id EclipseAdoptium.Temurin.17.JDK"
    exit 1
}
$env:JAVA_HOME = $jdk.FullName
Write-Host "  JAVA_HOME = $env:JAVA_HOME"
$javaCheck = Invoke-External "$env:JAVA_HOME\bin\java.exe" @("-version")
if ($javaCheck.ExitCode -ne 0) {
    Write-Host "  java -version falhou (código $($javaCheck.ExitCode)):" -ForegroundColor Yellow
    $javaCheck.Output | ForEach-Object { Write-Host "  $_" }
    exit 1
}
Write-Host "  $($javaCheck.Output | Select-Object -First 1)"

# ---------------------------------------------------------------- cmdline-tools
Passo 2 "Baixando as ferramentas de linha de comando do Android"

$cmdlineBin = Join-Path $SdkRoot "cmdline-tools\latest\bin"
if (Test-Path (Join-Path $cmdlineBin "sdkmanager.bat")) {
    Write-Host "  já estão instaladas em $SdkRoot"
} else {
    $zip = Join-Path $env:TEMP "android-cmdline-tools.zip"
    Write-Host "  baixando de dl.google.com (uma vez só, ~150 MB)..."
    Invoke-WebRequest -Uri $CmdlineUrl -OutFile $zip -UseBasicParsing

    $tmp = Join-Path $env:TEMP "android-cmdline-extract"
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force

    $dest = Join-Path $SdkRoot "cmdline-tools\latest"
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Copy-Item (Join-Path $tmp "cmdline-tools\*") $dest -Recurse -Force
    Remove-Item $zip, $tmp -Recurse -Force
    Write-Host "  instaladas em $dest"
}

$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot

# ---------------------------------------------------------------- licença
Passo 3 "Licença do Android SDK — precisa de você"

$licencas = Join-Path $SdkRoot "licenses\android-sdk-license"
if (Test-Path $licencas) {
    Write-Host "  licença já aceita neste computador"
} else {
    Write-Host ""
    Write-Host "  PARE AQUI." -ForegroundColor Yellow
    Write-Host "  O SDK do Android exige aceitar os termos do Google. Esse acordo é" -ForegroundColor Yellow
    Write-Host "  entre VOCÊ e o Google — não aceito no seu nome." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Rode o comando abaixo, leia e responda 'y' para cada item:"
    Write-Host "    `$env:JAVA_HOME = `"$($jdk.FullName)`""
    Write-Host "    & `"$cmdlineBin\sdkmanager.bat`" --sdk_root=`"$SdkRoot`" --licenses"
    Write-Host ""
    Write-Host "  Depois, rode este script de novo. Ele continua do passo 4."
    exit 2
}

# ---------------------------------------------------------------- pacotes
Passo 4 "Instalando os pacotes que o projeto usa"

$pacotes = @("platform-tools", "platforms;android-34", "build-tools;34.0.0")
Write-Host "  $($pacotes -join ', ')"
$sdkArgs = @("--sdk_root=$SdkRoot") + $pacotes
$instalacao = Invoke-External "$cmdlineBin\sdkmanager.bat" $sdkArgs
$instalacao.Output | ForEach-Object { Write-Host "  $_" }
if ($instalacao.ExitCode -ne 0) {
    Write-Host "sdkmanager falhou (código $($instalacao.ExitCode))." -ForegroundColor Yellow
    exit 1
}

# ---------------------------------------------------------------- local.properties
Passo 5 "Apontando o SDK para o projeto"

$localProps = Join-Path $AndroidDir "local.properties"
$sdkEscaped = $SdkRoot -replace '\\', '\\'
Set-Content -Path $localProps -Value "sdk.dir=$sdkEscaped" -Encoding ASCII
Write-Host "  $localProps  (está no .gitignore)"

# ---------------------------------------------------------------- build
Passo 6 "Compilando"

Set-Location $AndroidDir
$build = Invoke-External ".\gradlew.bat" @("assembleDebug", "--console=plain")
$build.Output | ForEach-Object { Write-Host $_ }
if ($build.ExitCode -ne 0) {
    Write-Host "`ngradlew falhou (código $($build.ExitCode))." -ForegroundColor Yellow
    exit 1
}

$apk = Join-Path $AndroidDir "app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apk) {
    $info = Get-Item $apk
    $hash = (Get-FileHash $apk -Algorithm SHA256).Hash
    Write-Host "`nAPK gerado:" -ForegroundColor Green
    Write-Host "  caminho: $apk"
    Write-Host "  tamanho: $([math]::Round($info.Length / 1MB, 2)) MB"
    Write-Host "  sha256:  $hash"
    Write-Host "`nInstalar no aparelho (com depuração USB ligada):"
    Write-Host "  adb install -r `"$apk`""
} else {
    Write-Host "`nO build terminou sem gerar o APK. Leia o erro acima." -ForegroundColor Yellow
    exit 1
}
