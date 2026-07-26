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
sourceSets {
    main {
        kotlin.setSrcDirs(listOf("../app/src/main/java"))
        kotlin.include("**/location/CaptureGate.kt")
    }
    test {
        kotlin.setSrcDirs(listOf("../app/src/test/java"))
        kotlin.include("**/CaptureGateTest.kt")
    }
}

dependencies {
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
