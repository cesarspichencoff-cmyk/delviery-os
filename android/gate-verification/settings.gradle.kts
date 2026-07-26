/*
 * Build independente, de propósito.
 *
 * O projeto do aplicativo precisa do Android SDK para sequer ser configurado,
 * e o SDK exige aceitar a licença da Google — decisão do responsável, não
 * minha. Mas o `CaptureGate` é Kotlin puro: ele não importa nada de Android.
 *
 * Este build compila e roda EXATAMENTE o mesmo arquivo do aplicativo, numa
 * JVM comum. Serve para provar, sem SDK e sem aparelho, que o portão de
 * captura compila e que suas regras valem — que é a parte de que a
 * privacidade do motoboy depende.
 */
rootProject.name = "entregas-gate-verification"
