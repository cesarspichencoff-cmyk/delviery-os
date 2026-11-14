# Frente C — intermitência dos labs Android na CI: histórico + diagnóstico legível sem credencial (14/11/2026)

Leitura **só pela API pública** do GitHub (jobs, passos, anotações). **Nenhuma credencial**;
download autenticado de log foi recusado pela política desta sessão.

## (a) Histórico das ~25 últimas execuções (fatos)

Workflows: `deliveryos-android-https-end-to-end-lab.yml` (218 execuções) e
`deliveryos-android-webview-emulator-lab.yml` (247). Conclusões por commit (API `/actions/runs`):

| commit | https-lab | webview-lab |
| --- | --- | --- |
| ac4491ae (12/11 12:47) | **failure** | success |
| ed47d6b9 (14/11 17:00) | **failure** | **failure (API 34)** |
| a5310d5f (14/11 17:23) | **failure** | success |
| (vários outros, sem mudança em android/) | success | success |

**Passo que falhou (API `/jobs`):**
- https-lab, as 3 falhas: passo **"Real Android Worker via 2 ephemeral strict TLS origins and real
  rider UI"** (o `android-emulator-runner` que roda `run_https_lab.sh`), durações **225 s / 174 s /
  168 s**; depois o gate "Require the actual Android end-to-end test result" falha em 0 s. Runners
  **GitHub-hosted, diferentes a cada execução** (`ubuntu-latest`).
- webview-lab, ed47d6b9: só a matriz **API 34 (modern)** falhou, no passo **"Android WebView + real
  Kotlin bridge + Room + WorkManager test"** (202 s); a API 29 (legacy) passou. O passo de
  screenshot acusou `No files were found ... gps-review-hold-lab.png` — consequência, não causa (a
  instrumentação falhou antes de gerar o PNG).

**`timeout-minutes: 35` (2100 s); as durações de falha (168–225 s) NÃO estão perto do timeout** — não
é estouro de tempo. Sem padrão forte de horário (as duas de 14/11 foram na mesma tarde, 17:00 e 17:23).

**Anotações públicas de hoje são ilegíveis** (`/check-runs/<job>/annotations`): só
`Process completed with exit code 1` e `The process '/usr/bin/sh' failed with exit code 1`. **Não
dizem o que quebrou no emulador/instrumentação.** Esse é o problema que (b) resolve.

## (b) Mudança: anotação pública sanitizada em caso de falha (não altera o que o teste prova)

Os scripts já computavam diagnóstico sanitizado, mas só para o **stdout do step** (exige credencial).
Agora, em falha, emitem **uma** anotação `::error title=...::` — que aparece na API pública de
check-runs **sem credencial**.

- **Novo** `tests/android/ci_lab_failure_annotation_v1.py`: lê artefatos já produzidos (JUnit XML,
  um dump de logcat filtrado por tag, poucos fatos de `/proc`) e imprime **uma** linha
  `::error title=...::` com, nesta ordem: **classe#método do teste que falhou**, **primeira linha da
  exceção**, **assinatura de morte de processo** (reusa `https_process_death_signature_v1.py`),
  **uptime do emulador**, **memória livre (MemAvailable)** e **últimas ~14 linhas do logcat**, total
  **≤ 1500 chars**. Reusa `https_failure_category_v1` e o classificador de morte existentes.
- **Sanitização (defense-in-depth)**: cada campo tem URLs, IP:porta, caminhos, **coordenadas GPS**,
  **`chave=valor` sensível** (token/secret/key/device_secret/lat/lng/cpf/email/…), `Bearer`, runs
  hex/base64 e alfanuméricos ≥12 com letra+dígito, e runs de dígitos ≥6 **removidos**; `::` e
  quebras de linha neutralizados (não dá para forjar workflow-command). Só identificadores fixos
  (classe/método/tipo da exceção e rótulos `LAB_*`) passam crus. Fatos numéricos de `/proc` (memória,
  uptime) são preservados inteiros porque vêm de fonte própria.
- **Ligação**: `run_https_lab.sh` e `run_webview_lab.sh`, **dentro** do passo do emulador (onde há
  `adb`), na branch de falha, **antes do `exit 1` já existente**. Captura `adb shell cat /proc/uptime`
  e `/proc/meminfo` (MemAvailable) e `adb logcat -d` filtrado por tags do app/WebView
  (`AndroidRuntime|chromium|ActivityManager|lowmemorykiller|cr_AwContents|WebView`), chama o helper
  com `|| true`. **O gate e os códigos de saída não mudaram** — o diagnóstico é aditivo e jamais vira
  verde.

**Validação local (Foxxy, sem emulador):** `bash -n` nos dois scripts (OK); helper exercitado com
fixture **adversarial** (token AWS-style, URL, IP, GPS lat/lng, token curto no logcat) → tudo
`[redacted]/[url]/[ip]/[coord]`, só uma linha emitida; robustez com inputs ausentes/vazios → uma
linha, sem crash; memória/uptime preservados inteiros.

## (c) Reprodução local do lab HTTPS: NOT_RUN (motivo)

**NOT_RUN.** O lab HTTPS/WebView depende do `reactivecircus/android-emulator-runner` (ação
**específica de Linux**) bootando um AVD com **KVM**, fixture TLS em `10.0.2.2`, `adb`/`openssl` e
`connectedDebugAndroidTest`. No Foxxy (Windows 11) isso não é uma reprodução **barata (≤ 3 rodadas)**:
a ação não roda em Windows, o boot de AVD + build Gradle + instrumentação é longo e é justamente a
camada intermitente. O que era barato e **foi** reproduzido/validado localmente foi o **caminho de
diagnóstico** (helper + sanitizadores + sintaxe dos scripts), que é a parte alterada. A camada de
emulador/instrumentação fica **NOT_RUN** por fronteira real, não por conveniência.

## Fatos × hipóteses da intermitência

**Fatos:** falha isolada no passo do emulador/instrumentação; durações 168–225 s (longe do timeout
de 35 min); runners GitHub-hosted distintos; sem mudança em `android/` ou `tests/android/` entre
passar e falhar; anotações públicas atuais não carregam a causa; **ed47d6b9 falhou nos DOIS labs no
mesmo push**; a5310d5f e ac4491ae falharam só no https-lab (webview verde).

**Hipóteses (NÃO provadas sem o log da falha):**
1. Intermitência da camada de emulador/instrumentação (boot do AVD / KVM / aceleração do runner;
   morte do renderizador WebView sob pressão de memória via lmkd; timeout de conexão da
   instrumentação). A dupla falha simultânea de ed47d6b9 nos dois labs sugere **transiente de
   infraestrutura do runner naquele momento** mais do que defeito de código; as falhas só no
   https-lab sugerem **flakiness por-emulador** isolada à execução.
2. A assinatura de morte exata (SIGKILL de renderizador não tratado vs lmkd vs ANR vs crash nativo)
   **não é observável hoje** pela API pública — por isso a anotação de (b): a **próxima** falha vai
   dizer qual, sem credencial, e então a hipótese certa pode ser escolhida com evidência.
