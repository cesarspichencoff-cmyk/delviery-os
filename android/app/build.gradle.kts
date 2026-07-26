plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.ksp)
}

/**
 * Endereço do servidor do piloto. Vem de gradle.properties e pode ser
 * sobreposto na linha de comando. Nunca fica hardcoded no código Kotlin.
 */
val entregasBaseUrl: String =
    (project.findProperty("entregas.baseUrl") as String?) ?: "https://10.0.2.2:5193"

/**
 * Recusa endereço que não sustenta o que a variante promete.
 *
 * Vale para `pilot` e `release`: HTTPS obrigatório, e nada de apontar para a
 * máquina do desenvolvedor. Sem esta checagem, o jeito mais fácil de gerar um
 * APK de piloto é rodar o comando de sempre e distribuir um binário que fala
 * com um servidor que não existe fora daquela mesa — e isso só aparece com o
 * motoboy na rua, sem sincronizar, sem ninguém entender por quê.
 *
 * O `debug` fica de fora: ele existe justamente para apontar para o emulador.
 */
fun problemasDoEndereco(): List<String> {
    val problemas = mutableListOf<String>()
    if (!entregasBaseUrl.startsWith("https://")) {
        problemas += "não é HTTPS"
    }
    for (local in listOf("10.0.2.2", "localhost", "127.0.0.1", "0.0.0.0")) {
        if (entregasBaseUrl.contains(local)) problemas += "aponta para máquina local ($local)"
    }
    return problemas
}

/**
 * A checagem roda quando o grafo de tarefas está pronto — e não durante a
 * configuração do projeto.
 *
 * A diferença é grande: validar na configuração faz QUALQUER comando do
 * Gradle falhar, inclusive `assembleDebug`, `testDebugUnitTest` e `tasks`.
 * O desenvolvedor perde a bancada inteira por causa de uma variante que ele
 * nem pediu. Aqui o gate só age se o build realmente for produzir `pilot` ou
 * `release`.
 */
gradle.taskGraph.whenReady {
    val variantesDeCampo = listOf("Pilot", "Release")
    val alvo = allTasks.firstOrNull { tarefa ->
        variantesDeCampo.any { v ->
            tarefa.name.startsWith("assemble") && tarefa.name.endsWith(v) ||
                tarefa.name.startsWith("bundle") && tarefa.name.endsWith(v)
        }
    }
    if (alvo != null) {
        val problemas = problemasDoEndereco()
        if (problemas.isNotEmpty()) {
            throw GradleException(
                "Endereço inválido para a variante de campo (${alvo.name}): $entregasBaseUrl — " +
                    problemas.joinToString("; ") + ". " +
                    "Defina o domínio real: ./gradlew ${alvo.name} -Pentregas.baseUrl=https://SEU_DOMINIO",
            )
        }
    }
}

android {
    namespace = "br.com.tata.entregas"
    compileSdk = 34

    defaultConfig {
        applicationId = "br.com.tata.entregas"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        // Sem sufixo aqui: cada variante acrescenta o seu. Com "-piloto" na
        // base, a variante pilot virava "1.0.0-piloto-pilot" na tela do
        // aparelho, e o release se chamaria "piloto" sem ser.
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "ENTREGAS_BASE_URL", "\"$entregasBaseUrl\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            // Certificado local de desenvolvimento é aceito somente no debug,
            // e somente via network_security_config — nunca desativando TLS.
            manifestPlaceholders["networkSecurityConfig"] = "@xml/network_security_config_debug"
        }
        /**
         * `pilot` — a variante que vai para o aparelho do motoboy.
         *
         * Separada do `release` porque as duas respondem a perguntas
         * diferentes: `release` é o binário definitivo do produto; `pilot` é
         * um binário de campo, instalado em poucos aparelhos conhecidos,
         * apontando para a infraestrutura do piloto.
         *
         * Tem `applicationIdSuffix` para poder conviver com outra instalação
         * no mesmo aparelho — sem isso, instalar o piloto apagaria os dados
         * locais da outra, incluindo eventos ainda não sincronizados.
         */
        create("pilot") {
            initWith(getByName("release"))
            isMinifyEnabled = true
            isShrinkResources = true
            applicationIdSuffix = ".pilot"
            versionNameSuffix = "-pilot"
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // TLS estrito: mesma configuração do release, sem exceção para
            // certificado local. O piloto fala com servidor real ou não fala.
            manifestPlaceholders["networkSecurityConfig"] = "@xml/network_security_config"
            // Assinatura NÃO configurada: nenhuma chave privada no repositório.
            signingConfig = null
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            manifestPlaceholders["networkSecurityConfig"] = "@xml/network_security_config"
            // Assinatura de release NÃO é configurada aqui de propósito:
            // nenhuma chave privada entra no repositório. Ver docs do runbook.
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            isReturnDefaultValues = true
        }
    }

    packaging {
        resources.excludes += setOf("META-INF/LICENSE.md", "META-INF/LICENSE-notice.md")
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.activity)
    implementation(libs.androidx.lifecycle.service)
    implementation(libs.androidx.lifecycle.runtime)

    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)

    implementation(libs.work.runtime)
    implementation(libs.play.services.location)
    implementation(libs.coroutines.android)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.mockk)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.androidx.core.testing)
    testImplementation(libs.room.testing)
    testImplementation(libs.work.testing)

    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.room.testing)
    androidTestImplementation(libs.work.testing)
}
