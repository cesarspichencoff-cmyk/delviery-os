"""Controles sinteticos do empacotador; nao substituem aapt/apksigner reais no CI."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("lab_package", Path(__file__).with_name("entregas_android_lab_package.py"))
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)


class LabPackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.apk = Path(self.temp.name) / "app.apk"
        self.test = Path(self.temp.name) / "test.apk"
        self.write_app(" ".join(lab.LAB_URLS).encode())
        with zipfile.ZipFile(self.test, "w") as archive:
            archive.writestr("AndroidManifest.xml", b"synthetic")
        self.badging = "package: name='br.com.tata.entregas.debug'\nsdkVersion:'26'\napplication-debuggable\n"
        self.test_badging = "package: name='br.com.tata.entregas.debug.test'\n"
        self.signature = "Signer #1 certificate SHA-256 digest: " + "a" * 64

    def write_app(self, data):
        with zipfile.ZipFile(self.apk, "w") as archive:
            archive.writestr("classes.dex", data)

    def check(self, **overrides):
        values = dict(apk=self.apk, test_apk=self.test, badging=self.badging,
                      test_badging=self.test_badging, signature=self.signature,
                      test_signature=self.signature, commit="a" * 40)
        lab.validate(**{**values, **overrides})

    def test_matching_lab_artifacts(self):
        self.check()

    def test_pilot_cannot_be_relabelled_debug(self):
        with self.assertRaisesRegex(ValueError, "somente aplicativo debug"):
            self.check(badging=self.badging.replace("entregas.debug", "entregas.pilot"))

    def test_wrong_test_package(self):
        with self.assertRaisesRegex(ValueError, "nao corresponde"):
            self.check(test_badging="package: name='wrong.test'")

    def test_not_debuggable(self):
        with self.assertRaisesRegex(ValueError, "explicitamente debug"):
            self.check(badging=self.badging.replace("application-debuggable", ""))

    def test_different_signers(self):
        with self.assertRaisesRegex(ValueError, "assinantes diferentes"):
            self.check(test_signature=self.signature.replace("a" * 64, "b" * 64))

    def test_missing_lab_endpoint(self):
        self.write_app(lab.LAB_URLS[0].encode())
        with self.assertRaisesRegex(ValueError, "endpoints padrao"):
            self.check()

    def test_incomplete_commit(self):
        with self.assertRaisesRegex(ValueError, "commit Git completo"):
            self.check(commit="abcdef0")

    def test_ambiguous_signer(self):
        with self.assertRaisesRegex(ValueError, "exatamente um"):
            self.check(signature=self.signature + "\n" + self.signature)

    def test_sdk_range_same_identity(self):
        certificate = " certificate SHA-256 digest: " + "a" * 64
        output = ("Signer (minSdkVersion=26, maxSdkVersion=32)" + certificate + "\n" +
                  "Signer (minSdkVersion=33, maxSdkVersion=2147483647)" + certificate)
        self.check(signature=output)

    def test_scheme_labels_same_identity(self):
        certificate = ": certificate SHA-256 digest: " + "a" * 64
        self.check(signature="V2 Signer" + certificate + "\nV3.0 Signer" + certificate)

    def test_rotated_identity_not_silently_accepted(self):
        output = ("Signer (minSdkVersion=26, maxSdkVersion=32) certificate SHA-256 digest: " + "a" * 64 +
                  "\nSigner (minSdkVersion=33, maxSdkVersion=2147483647) certificate SHA-256 digest: " + "b" * 64)
        with self.assertRaisesRegex(ValueError, "exatamente um"):
            self.check(signature=output)


if __name__ == "__main__":
    unittest.main()
