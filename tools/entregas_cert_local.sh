#!/usr/bin/env bash
# Certificado local de desenvolvimento para o piloto do TATÁ Entregas.
#
# Por que isto existe: o GPS do navegador e o container Android exigem HTTPS.
# Sem certificado, o celular simplesmente não liga a localização — e a falha
# aparece como "não funcionou", sem explicação.
#
# REGRAS QUE ESTE SCRIPT NÃO QUEBRA:
#  - a chave privada NUNCA entra no repositório. O destino padrão é fora dele;
#  - nada é publicado na internet, nenhum túnel, nenhum serviço pago;
#  - o script recusa gravar dentro do repositório, mesmo se mandarem.
#
# Uso:
#   ./tools/entregas_cert_local.sh                 # usa ~/.entregas-certs
#   ./tools/entregas_cert_local.sh /outro/caminho
#
set -euo pipefail

DEST="${1:-$HOME/.entregas-certs}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Trava dura: certificado dentro do repositório vira segredo versionado por
# acidente na primeira vez que alguém rodar `git add -A`.
case "$(cd "$DEST" 2>/dev/null && pwd || echo "$DEST")" in
  "$REPO_ROOT"|"$REPO_ROOT"/*)
    echo "ERRO: destino está dentro do repositório ($DEST)." >&2
    echo "Escolha um caminho fora, por exemplo: $HOME/.entregas-certs" >&2
    exit 1
    ;;
esac

if ! command -v mkcert >/dev/null 2>&1; then
  cat >&2 <<'MSG'
ERRO: mkcert não encontrado.

O mkcert cria uma autoridade certificadora local e emite certificados que o
computador e o celular passam a confiar — sem comprar nada e sem expor o
servidor na internet.

Instale:
  Windows:  choco install mkcert     (ou scoop install mkcert)
  macOS:    brew install mkcert
  Linux:    veja https://github.com/FiloSottile/mkcert

Depois rode este script de novo.
MSG
  exit 1
fi

mkdir -p "$DEST"
chmod 700 "$DEST" 2>/dev/null || true

# Descobre o IP da máquina na rede local: é por ele que o celular vai acessar.
LAN_IP="$(
  { ipconfig 2>/dev/null | grep -i "IPv4" | head -1 | sed 's/.*: //' | tr -d '\r'; } \
  || { hostname -I 2>/dev/null | awk '{print $1}'; } \
  || echo ""
)"

echo "Instalando a autoridade local (pode pedir sua senha)..."
mkcert -install

echo "Emitindo certificado para localhost, 127.0.0.1${LAN_IP:+ e $LAN_IP}..."
(
  cd "$DEST"
  # shellcheck disable=SC2086
  mkcert -cert-file entregas.pem -key-file entregas-key.pem \
    localhost 127.0.0.1 ::1 ${LAN_IP:-}
)
chmod 600 "$DEST/entregas-key.pem" 2>/dev/null || true

CA_ROOT="$(mkcert -CAROOT)"

cat <<MSG

Pronto.

  certificado: $DEST/entregas.pem
  chave:       $DEST/entregas-key.pem   (nunca versione, nunca compartilhe)

1. Subir o servidor com HTTPS:

   export ENTREGAS_HTTPS=1
   export ENTREGAS_TLS_CERT="$DEST/entregas.pem"
   export ENTREGAS_TLS_KEY="$DEST/entregas-key.pem"
   export ENTREGAS_BIND=0.0.0.0
   npm run ui:entregas:pilot

   No Windows (PowerShell), troque \`export X=y\` por \`\$env:X = "y"\`.

   Se algo estiver errado, o servidor RECUSA subir em vez de cair para HTTP
   em silêncio. Isso é de propósito.

2. Confiar no certificado no celular Android:

   - copie o arquivo abaixo para o aparelho:
       $CA_ROOT/rootCA.pem
   - Configurações → Segurança → Criptografia e credenciais
     → Instalar um certificado → Certificado de CA
   - o Android vai avisar que a rede pode ser monitorada. É esperado: a
     autoridade é sua, e vale só para este certificado.

3. Testar a conexão:

   curl -sS "https://127.0.0.1:5193/api/health" | head -c 200
   ${LAN_IP:+curl -sS \"https://$LAN_IP:5193/api/health\" | head -c 200}

4. Trocar ou revogar:

   rm -rf "$DEST" && ./tools/entregas_cert_local.sh
   mkcert -uninstall     # remove a autoridade local do computador

   No aparelho, remova em Configurações → Segurança → Credenciais confiáveis
   → Usuário.

MSG
