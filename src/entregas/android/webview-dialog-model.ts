/**
 * O diálogo JS como o WebView DO APP o trata — para as provas com navegador.
 *
 * No Chromium de desktop todo confirm() aparece. No WebView do Android, sem
 * WebChromeClient registrado, o confirm() é cancelado em silêncio e a página
 * recebe false (Chromium, android_webview/glue/java/src/com/android/webview/
 * chromium/WebViewContentsClientAdapter.java, handleJsConfirm:
 * `mWebChromeClient == null` -> `receiver.cancel()`). A rider-mobile confirma a
 * saída e a entrega por confirm(): uma prova que aceita todo diálogo mede o
 * Chromium, não o app. Até 2026-09-26 as duas provas com navegador da Q-018
 * faziam isso, e passavam onde o aparelho pararia na saída.
 *
 * Por isso o comportamento vem da MainActivity, não de quem escreve a prova:
 *  - "mostra": registra o WebChromeClient padrão, sem override — o diálogo
 *    aparece e o motoboy confirma;
 *  - "cancela": não registra cliente — o WebView cancela, a página recebe false;
 *  - "desconhecido": registra um cliente próprio — o que ele faz com o diálogo
 *    não é conhecido daqui, e a prova falha em vez de supor.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export type ModeloDialogo = "mostra" | "cancela" | "desconhecido";

export const MAIN_ACTIVITY = "android/app/src/main/java/br/com/tata/entregas/ui/MainActivity.kt";

export function modeloDoDialogo(fonteKotlin: string): ModeloDialogo {
  const codigo = fonteKotlin
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/^\s*import\s.*$/gm, ""); // import sozinho não registra nada
  if (/\bwebChromeClient\s*=\s*WebChromeClient\(\)\s*$/m.test(codigo)) return "mostra";
  if (/\bwebChromeClient\s*=|setWebChromeClient\(|:\s*WebChromeClient\(\)/.test(codigo)) return "desconhecido";
  return "cancela";
}

/** O modelo do app no disco, a partir da raiz do repositório. */
export function modeloDoApp(raiz: string = process.cwd()): ModeloDialogo {
  return modeloDoDialogo(readFileSync(join(raiz, MAIN_ACTIVITY), "utf8"));
}

export const TEXTO_DO_MODELO: Record<ModeloDialogo, string> = {
  mostra: "MainActivity registra o WebChromeClient padrão — o WebView mostra o confirm()",
  cancela: "MainActivity NÃO registra WebChromeClient — o WebView cancela o confirm() em silêncio",
  desconhecido: "MainActivity registra um WebChromeClient próprio — comportamento do confirm() desconhecido daqui",
};
