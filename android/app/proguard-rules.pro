# Room e WorkManager ja' trazem suas regras. Aqui so' o que e' nosso.

# A ponte e' chamada por nome pelo JavaScript: ofuscar quebra a interface.
-keepclassmembers class br.com.tata.entregas.bridge.EntregasJsBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class br.com.tata.entregas.bridge.EntregasJsBridge { *; }

# Entidades do Room sao lidas por reflexao.
-keep class br.com.tata.entregas.data.** { *; }

# Nao vazar nome de arquivo/linha em stack trace de release.
-renamesourcefileattribute SourceFile
-keepattributes SourceFile,LineNumberTable
