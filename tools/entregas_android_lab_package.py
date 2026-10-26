#!/usr/bin/env python3
"""Empacota somente APKs debug de bancada, nunca uma liberacao de campo."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import zipfile

LAB_URLS = ("https://10.0.2.2:5193", "https://10.0.2.2:8080")


def package_name(badging):
    match = re.search(r"^package: name='([^']+)'", badging, re.M)
    if not match:
        raise ValueError("APK sem identidade de pacote verificavel")
    return match.group(1)


def signer_digest(output):
    matches = re.findall(r"^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]{64})$", output, re.M)
    if len(matches) != 1:
        raise ValueError("exige exatamente um assinante verificavel")
    return matches[0].lower()


def validate(apk, test_apk, badging, test_badging, signature, test_signature, commit):
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("commit Git completo obrigatorio")
    if package_name(badging) != "br.com.tata.entregas.debug":
        raise ValueError("somente aplicativo debug de bancada")
    if package_name(test_badging) != "br.com.tata.entregas.debug.test":
        raise ValueError("APK de testes nao corresponde a variante debug")
    if "application-debuggable" not in badging.splitlines():
        raise ValueError("variante de bancada precisa ser explicitamente debug")
    if not re.search(r"^sdkVersion:'26'$", badging, re.M):
        raise ValueError("SDK minimo divergiu do contrato Android 8/API 26")
    if signer_digest(signature) != signer_digest(test_signature):
        raise ValueError("APK e testes possuem assinantes diferentes")
    with zipfile.ZipFile(apk) as archive:
        dex = [archive.read(name) for name in archive.namelist() if re.fullmatch(r"classes\d*\.dex", name)]
    if not all(any(url.encode() in content for content in dex) for url in LAB_URLS):
        raise ValueError("endpoints padrao do emulador nao foram encontrados no APK")
    with zipfile.ZipFile(test_apk) as archive:
        if "AndroidManifest.xml" not in archive.namelist():
            raise ValueError("APK de testes sem manifesto")


def inspect(binary, args):
    result = subprocess.run([str(binary), *args], capture_output=True, text=True, check=True, timeout=60)
    return result.stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("apk", "test-apk", "aapt", "apksigner", "output"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--commit", required=True)
    args = parser.parse_args()
    if args.output.exists() and any(args.output.iterdir()):
        raise ValueError("destino nao vazio; nenhum arquivo foi substituido")
    badging = inspect(args.aapt, ["dump", "badging", str(args.apk)])
    test_badging = inspect(args.aapt, ["dump", "badging", str(args.test_apk)])
    signature = inspect(args.apksigner, ["verify", "--print-certs", str(args.apk)])
    test_signature = inspect(args.apksigner, ["verify", "--print-certs", str(args.test_apk)])
    validate(args.apk, args.test_apk, badging, test_badging, signature, test_signature, args.commit)
    files = [(args.apk, "app-bancada-debug.apk"), (args.test_apk, "testes-bancada-debug.apk")]
    manifest = {
        "status": "LAB_BUILD_ONLY_NOT_FIELD_READY", "commit": args.commit,
        "variant": "debug", "application_id": package_name(badging),
        "minimum_android_api": 26, "field_ready": False, "physical_device_tested": False,
        "endpoints": {"pilot": LAB_URLS[0], "platform": LAB_URLS[1]},
        "signer_certificate_sha256": signer_digest(signature),
        "files": [{"name": name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                   "bytes": path.stat().st_size} for path, name in files],
    }
    args.output.mkdir(parents=True, exist_ok=True)
    for source, name in files:
        shutil.copyfile(source, args.output / name)
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (args.output / "LEIA-ME.txt").write_text(
        "SOMENTE BANCADA DE EMULADOR. NAO INSTALAR EM CELULAR DE MOTOBOY.\n"
        "Debug usa enderecos do emulador e certificado de desenvolvimento.\n"
        "Compilacao e assinatura verificadas nao provam instalacao, teste instrumentado ou GPS fisico.\n"
        "Campo exige variante pilot assinada sob custodia aprovada, URLs HTTPS definidas,\n"
        "termo vigente e autorizacao do ensaio conforme o gate de campo.\n"
        "Nenhuma chave privada, token ou dado de loja integra este pacote.\n"
    )
    print("ANDROID_LAB_PACKAGE_VERIFIED: debug + testes, assinantes iguais, SHA-256; campo bloqueado")


if __name__ == "__main__":
    main()
