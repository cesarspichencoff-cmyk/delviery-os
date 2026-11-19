#!/usr/bin/env bash
# A chave é fornecida pelo processo chamador. O arquivo temporário fica no runner.
set -euo pipefail
umask 077
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
output="${1:?passe o caminho absoluto do APK de saída}"
[[ "$output" == /* && ! -e "$output" ]] || { echo 'APK_OUTPUT_INVALID'; exit 1; }
for name in KS KSP KA KP BASE PLAT; do
  [[ -n "${!name:-}" ]] || { echo "APK_INPUT_MISSING_$name"; exit 1; }
done

work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
printf '%s' "$KS" | base64 --decode > "$work/assinatura.jks"
unset KS
sdk="${ANDROID_HOME:?SDK Android indisponível}"
apksigner="$(find "$sdk/build-tools" -name apksigner -type f | sort -V | tail -n 1)"
[[ -x "$apksigner" ]] || { echo 'ANDROID_APKSIGNER_NOT_FOUND'; exit 1; }
build_tools="$(dirname -- "$apksigner")"

cd "$root/android"
# O Gradle recebe apenas os endereços. O subprocesso do build não precisa da chave.
env -u KSP -u KA -u KP bash ./gradlew --no-daemon --console=plain :app:assemblePilot \
  "-Pentregas.baseUrl=$BASE" "-Pentregas.platformUrl=$PLAT"
shopt -s nullglob
unsigned=(app/build/outputs/apk/pilot/*.apk)
[[ "${#unsigned[@]}" -eq 1 ]] || { echo 'APK_PILOT_BUILD_OUTPUT_UNEXPECTED'; exit 1; }
"$build_tools/zipalign" -P 16 -f 4 "${unsigned[0]}" "$work/alinhado.apk"
"$apksigner" sign --ks "$work/assinatura.jks" --ks-key-alias "$KA" \
  --ks-pass env:KSP --key-pass env:KP --out "$work/assinado.apk" "$work/alinhado.apk"
"$build_tools/zipalign" -c -P 16 4 "$work/assinado.apk"
signer_sha256="$(keytool -exportcert -keystore "$work/assinatura.jks" \
  -alias "$KA" -storepass:env KSP | sha256sum | cut -d ' ' -f1)"
python3 "$root/tools/entregas_android_pilot_proof.py" \
  --apk "$work/assinado.apk" --tools "$build_tools" --signer-sha256 "$signer_sha256"
mkdir -p -- "$(dirname -- "$output")"
cp -- "$work/assinado.apk" "$output"
