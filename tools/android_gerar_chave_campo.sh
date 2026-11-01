#!/usr/bin/env bash
# Gera a chave de assinatura do APK de campo NO COMPUTADOR DO RESPONSÁVEL e
# mostra o que colar nos segredos do projeto no GitHub. A chave nunca entra
# no repositório (que é público). Guarde o arquivo .jks e a senha num cofre:
# perder a chave impede atualizar o app nos aparelhos sem reinstalar.
set -euo pipefail
arquivo="${1:-entregas-campo.jks}"
alias="entregas-campo"
[ -e "$arquivo" ] && { echo "já existe $arquivo — não sobrescrevo"; exit 1; }
read -r -s -p "Senha da chave (mín. 12 caracteres): " senha; echo
[ "${#senha}" -ge 12 ] || { echo "senha curta demais"; exit 1; }
keytool -genkeypair -v -keystore "$arquivo" -alias "$alias" -keyalg RSA -keysize 4096 \
  -validity 9125 -storepass "$senha" -keypass "$senha" -dname "CN=Entregas Campo, O=TATA, C=BR"
echo
echo "No GitHub do projeto: Settings > Secrets and variables > Actions"
echo "  Secret ENTREGAS_PILOT_KEYSTORE_B64      = (conteúdo abaixo, uma linha)"
echo "  Secret ENTREGAS_PILOT_KEYSTORE_PASSWORD = a senha digitada"
echo "  Secret ENTREGAS_PILOT_KEY_ALIAS         = $alias"
echo "  Secret ENTREGAS_PILOT_KEY_PASSWORD      = a senha digitada"
echo "  Variable ENTREGAS_PILOT_BASE_URL        = https://<origem do piloto>"
echo "  Variable ENTREGAS_PILOT_PLATFORM_URL    = https://<runtime crítico>"
echo
base64 -w0 "$arquivo" 2>/dev/null || base64 "$arquivo" | tr -d '\n'
echo
