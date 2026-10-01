package br.com.tata.entregas.sync

/**
 * Remove credenciais de mensagens antes de elas virarem log ou erro visível.
 *
 * Mantida em Kotlin puro de propósito: a camada HTTP pode usá-la sem puxar
 * Room/Android, e o gate JVM independente continua compilando o cliente real.
 */
fun semSegredo(texto: String): String =
    texto
        .replace(Regex("""[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}"""), "[token removido]")
        .replace(Regex("""(?i)(bearer\s+)\S+"""), "$1[removido]")
        .replace(
            Regex("""(?i)("?(?:token|authorization|secret|senha|password)"?\s*[:=]\s*"?)[^",;\s}]+"""),
            "$1[removido]",
        )
