#!/usr/bin/env bash
# Usa um emulador descartável e prova somente a instalação da variante pilot.
set -euo pipefail
umask 077
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
package=br.com.tata.entregas.pilot
api="${1:?informe a API esperada}"
mapfile -t devices < <(adb devices | tr -d '\r' | awk 'NR > 1 && NF {print $1, $2}')
if [[ "${#devices[@]}" -ne 1 || ! "${devices[0]}" =~ ^emulator-[0-9]+\ device$ ]]; then
  echo APK_LAB_REQUIRES_ONE_EMULATOR
  exit 1
fi
export ANDROID_SERIAL="${devices[0]%% *}"
[[ "$(adb shell getprop ro.build.version.sdk | tr -d '\r')" == "$api" ]]
[[ -z "$(adb shell pm path "$package" | tr -d '\r')" ]] || { echo 'APK_LAB_ALREADY_INSTALLED'; exit 1; }

work="$(mktemp -d)"
installed=false
cleanup() {
  if "$installed"; then adb uninstall "$package" >/dev/null || true; fi
  rm -rf -- "$work"
}
trap cleanup EXIT
export KSP="$(openssl rand -hex 24)"
export KP="$KSP"
export KA=entregas-apk-lab
export BASE=https://entregas-piloto.invalid
export PLAT=https://entregas-plataforma.invalid
keytool -genkeypair -keystore "$work/lab.jks" -alias "$KA" -keyalg RSA -keysize 2048 \
  -validity 1 -storepass:env KSP -keypass:env KP -dname 'CN=DeliveryOS Disposable APK Lab' >/dev/null 2>&1
export KS="$(base64 -w0 "$work/lab.jks")"
bash "$root/tools/android_compilar_assinar_piloto.sh" "$work/entregas.apk"
unset KS KSP KP KA
adb install "$work/entregas.apk"
installed=true
adb shell pm path "$package" | grep '^package:'
startup="$(adb shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER \
  -n "$package/br.com.tata.entregas.ui.MainActivity" 2>&1)"
printf '%s\n' "$startup"
if ! printf '%s\n' "$startup" | tr -d '\r' | grep -Eq '^[[:space:]]*Status: ok[[:space:]]*$'; then
  echo 'APK_LAB_LAUNCH_FAILED'
  exit 1
fi
sleep 3
if [[ -z "$(adb shell pidof "$package" | tr -d '\r')" ]]; then
  adb logcat -b crash -d -v brief | tail -n 30 || true
  echo 'APK_LAB_PROCESS_NOT_RUNNING'
  exit 1
fi

proof="$root/android-pilot-package-proof.txt"
{
  printf 'commit=%s\nandroid_api=%s\n' "${GITHUB_SHA:-local}" "$api"
  echo 'variant=pilot install=success cold_launch=success signing=disposable field_ready=false'
  printf 'apk_sha256=%s\n' "$(sha256sum "$work/entregas.apk" | cut -d ' ' -f1)"
} | tee "$proof"
