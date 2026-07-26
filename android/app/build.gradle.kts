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

android {
    namespace = "br.com.tata.entregas"
    compileSdk = 34

    defaultConfig {
        applicationId = "br.com.tata.entregas"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0-piloto"
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
