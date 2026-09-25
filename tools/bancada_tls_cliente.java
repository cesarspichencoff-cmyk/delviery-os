import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLException;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManagerFactory;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Proxy;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.time.Instant;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Cliente da bancada TLS (tools/bancada_tls_real.sh).
 *
 * Fala como o app fala: o mesmo HttpsURLConnection de EntregasApi.kt, o mesmo
 * corpo de DeviceSession.autenticar e do lote do SyncWorker. Confia SO na CA
 * de laboratorio, sem hostname verifier customizado (o padrao confere o IP
 * contra o SAN) e sem trust-all. Nunca imprime token nem segredo.
 *
 * Uso: java tools/bancada_tls_cliente.java <ca.pem> <plataforma> <piloto> <device_id> <host_fora_do_san>
 * Termina com CLIENTE_GREEN, ou CLIENTE_RED e exit 1.
 */
public class BancadaTlsCliente {
    static int falhas = 0;

    static void checa(boolean ok, String id, String texto) {
        System.out.println((ok ? "  ok  " : "  XX  ") + id + " " + texto);
        if (!ok) falhas++;
    }

    static SSLSocketFactory confiandoEm(KeyStore ks) throws Exception {
        TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        tmf.init(ks);
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(null, tmf.getTrustManagers(), null);
        return ctx.getSocketFactory();
    }

    static SSLSocketFactory soLab(String caPem) throws Exception {
        X509Certificate ca;
        try (InputStream in = new FileInputStream(caPem)) {
            ca = (X509Certificate) CertificateFactory.getInstance("X.509").generateCertificate(in);
        }
        KeyStore ks = KeyStore.getInstance(KeyStore.getDefaultType());
        ks.load(null, null);
        ks.setCertificateEntry("bancada", ca);
        return confiandoEm(ks);
    }

    static String[] req(String url, String metodo, String corpo, String bearer, SSLSocketFactory sf) throws Exception {
        HttpsURLConnection c = (HttpsURLConnection) URI.create(url).toURL().openConnection(Proxy.NO_PROXY);
        c.setSSLSocketFactory(sf);
        c.setRequestMethod(metodo);
        c.setConnectTimeout(5000);
        c.setReadTimeout(8000);
        c.setInstanceFollowRedirects(false);
        c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        c.setRequestProperty("X-Entregas-Client", "android-client@1.0.0");
        if (bearer != null) c.setRequestProperty("Authorization", "Bearer " + bearer);
        if (corpo != null) {
            c.setDoOutput(true);
            try (OutputStream o = c.getOutputStream()) { o.write(corpo.getBytes(StandardCharsets.UTF_8)); }
        }
        int st = c.getResponseCode();
        InputStream in = st < 400 ? c.getInputStream() : c.getErrorStream();
        String txt = in == null ? "" : new String(in.readAllBytes(), StandardCharsets.UTF_8);
        c.disconnect();
        return new String[] { String.valueOf(st), txt };
    }

    static String campo(String json, String nome) {
        Matcher m = Pattern.compile("\"" + nome + "\"\\s*:\\s*(\"([^\"]*)\"|([0-9.]+))").matcher(json);
        if (!m.find()) return null;
        return m.group(2) != null ? m.group(2) : m.group(3);
    }

    static String resumo(Exception e) {
        String m = String.valueOf(e.getMessage());
        return e.getClass().getSimpleName() + ": " + (m.length() > 120 ? m.substring(0, 120) : m);
    }

    public static void main(String[] a) throws Exception {
        String ca = a[0], plataforma = a[1], piloto = a[2], deviceId = a[3], foraDoSan = a[4];
        SSLSocketFactory lab = soLab(ca);

        // N1 — sem a CA de laboratorio o handshake falha: a confianca vem DELA.
        try {
            req(plataforma + "/health", "GET", null, null, confiandoEm(null));
            checa(false, "N1", "conectou SEM a CA de laboratorio");
        } catch (SSLException e) {
            checa(String.valueOf(e.getMessage()).contains("PKIX"), "N1", "sem a CA de laboratorio o TLS recusa -> " + resumo(e));
        }
        // N2 — o MESMO listener, por um endereco fora do SAN: a verificacao de
        // nome esta ligada. Conexao recusada NAO conta: nao provaria nada.
        try {
            req(foraDoSan + "/health", "GET", null, null, lab);
            checa(false, "N2", "aceitou endereco fora do SAN");
        } catch (Exception e) {
            boolean nome = e instanceof SSLException && String.valueOf(e.getMessage()).contains("subject alternative names");
            checa(nome, "N2", "endereco fora do SAN -> " + resumo(e));
        }

        String[] h = req(plataforma + "/health", "GET", null, null, lab);
        checa(h[0].equals("200"), "T1", "plataforma /health pelo TLS de bancada -> " + h[0]);
        String[] p = req(piloto + "/rider-mobile/", "GET", null, null, lab);
        checa(p[0].equals("200"), "T2", "piloto /rider-mobile/ com HTTPS nativo -> " + p[0]);

        // T3 — o corpo exato de DeviceSession.autenticar; segredo de 32 hex, como o app gera.
        byte[] b = new byte[16];
        new SecureRandom().nextBytes(b);
        StringBuilder seg = new StringBuilder();
        for (byte x : b) seg.append(String.format("%02x", x));
        String corpoSessao = "{\"device_id\":\"" + deviceId + "\",\"device_secret\":\"" + seg
            + "\",\"app_version\":\"1.0.0-debug\",\"client\":\"android-client@1.0.0\"}";
        String[] s = req(plataforma + "/api/device/session", "POST", corpoSessao, null, lab);
        String token = campo(s[1], "device_token");
        checa(s[0].equals("200") && token != null && !token.isBlank(), "T3",
            "POST /api/device/session -> " + s[0] + ", device_token " + (token == null ? "AUSENTE" : "presente (" + token.length() + " caracteres)")
                + ", expires_in_s=" + campo(s[1], "expires_in_s"));
        if (token == null) { System.out.println("CLIENTE_RED"); System.exit(1); }

        String[] s2 = req(plataforma + "/api/device/session", "POST", corpoSessao, null, lab);
        checa(s2[0].equals("200"), "T4", "renovacao com o mesmo segredo -> " + s2[0]);

        // T5 — o lote no formato do SyncWorker.
        String instante = Instant.now().minusSeconds(5).toString();
        String viagem = "trip-bancada-1";
        String ponto = "{\"point_id\":\"pt-bancada-1\",\"idempotency_key\":\"gps:" + deviceId + ":" + viagem + ":" + instante + "\","
            + "\"trip_id\":\"" + viagem + "\",\"device_id\":\"" + deviceId + "\","
            + "\"latitude\":-23.5838,\"longitude\":-46.6773,\"accuracy_m\":8.5,"
            + "\"occurred_at\":\"" + instante + "\",\"elapsed_realtime_ns\":123456789,"
            + "\"provider\":\"gps\",\"is_mock\":false,\"captured_offline\":false,"
            + "\"sequence_local\":1,\"source\":\"device\"}";
        String lote = "{\"schema_version\":\"android-client@1.0.0\",\"correlation_id\":\"sync-bancada\",\"points\":[" + ponto + "]}";
        String[] g = req(plataforma + "/api/gps/batch", "POST", lote, token, lab);
        checa(g[0].equals("200") && "1".equals(campo(g[1], "accepted")), "T5",
            "POST /api/gps/batch -> " + g[0] + ", classe=" + campo(g[1], "classe") + ", accepted=" + campo(g[1], "accepted")
                + ", ack_through_sequence=" + campo(g[1], "ack_through_sequence"));

        String[] g2 = req(plataforma + "/api/gps/batch", "POST", lote, null, lab);
        checa(g2[0].equals("401"), "T6", "o mesmo lote sem token -> " + g2[0]);

        System.out.println(falhas == 0 ? "CLIENTE_GREEN" : "CLIENTE_RED");
        System.exit(falhas == 0 ? 0 : 1);
    }
}
