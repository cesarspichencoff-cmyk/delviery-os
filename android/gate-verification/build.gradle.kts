plugins {
    kotlin("jvm") version "2.0.20"
}

repositories {
    mavenCentral()
}

/*
 * Aponta para os arquivos ORIGINAIS do aplicativo. Nada é copiado: se alguém
 * mexer no portão lá, é aqui que quebra. Uma cópia daria a ilusão de
 * cobertura enquanto o código real seguia outro caminho.
 */
/*
 * Os dois arquivos do aplicativo que não dependem de Android:
 *  - CaptureGate: o portão de privacidade;
 *  - EntregasApi: o cliente HTTP, onde mora o tratamento de TLS e a
 *    classificação de erro entre "tenta de novo" e "o servidor recusou".
 *
 * `BuildConfig` é gerado pelo build Android e não existe aqui, então
 * EntregasApi entra só como compilação — o suficiente para pegar erro de
 * tipo na camada de rede sem precisar do SDK.
 */
sourceSets {
    main {
        kotlin.setSrcDirs(listOf("../app/src/main/java"))
        kotlin.include("**/location/CaptureGate.kt")
        kotlin.include("**/sync/EntregasApi.kt")
    }
    test {
        kotlin.setSrcDirs(listOf("../app/src/test/java"))
        kotlin.include("**/CaptureGateTest.kt")
    }
}

dependencies {
    // `org.json` vem do Android em produção; aqui usamos a implementação de
    // referência, que é a mesma API.
    implementation("org.json:json:20240303")
    testImplementation("junit:junit:4.13.2")
}

/*
 * Trava contra falso verde: `BUILD SUCCESSFUL` com NO-SOURCE não prova nada.
 * Se os arquivos deixarem de ser encontrados — renomeados, movidos, padrão
 * quebrado — o build falha em vez de passar vazio.
 */
val verificarFontes by tasks.registering {
    doFirst {
        val main = sourceSets.main.get().kotlin.files
        val test = sourceSets.test.get().kotlin.files
        require(main.any { it.name == "CaptureGate.kt" }) {
            "CaptureGate.kt não foi encontrado — a verificação passaria vazia"
        }
        require(main.any { it.name == "EntregasApi.kt" }) {
            "EntregasApi.kt não foi encontrado — a verificação passaria vazia"
        }
        require(test.any { it.name == "CaptureGateTest.kt" }) {
            "CaptureGateTest.kt não foi encontrado — a verificação passaria vazia"
        }
        logger.lifecycle("fontes verificadas: ${main.size} principal, ${test.size} de teste")
    }
}

tasks.named("compileKotlin") { dependsOn(verificarFontes) }

kotlin {
    jvmToolchain(17)
}

tasks.test {
    testLogging {
        events("passed", "failed", "skipped")
        showStandardStreams = false
    }
}
