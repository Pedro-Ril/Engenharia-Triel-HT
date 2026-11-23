package br.com.trielht.plm.core;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.util.HexFormat;
import java.util.Properties;
import java.util.regex.Pattern;

/**
 * Nucleo comum dos plugins Triel no 3DSpace: configuracao local, identificacao do no e utilitarios.
 *
 * Arquivo local (so o necessario para chegar ao banco do Portal; o resto da configuracao vem do banco):
 *   /App/triel/triel-plugins.properties  (chmod 600, dono admintriel)
 *     db.url=jdbc:sqlserver://192.168.0.22:1433;databaseName=PortalTrielHT;encrypt=true;trustServerCertificate=true
 *     db.usuario=triel_3dx_plugins
 *     db.senha=...
 *     spool.dir=/App/triel/spool                       (opcional)
 *     plugin.<chave>.modo=DESLIGADO|SIMULACAO|ATIVO      (opcional: usado so se o banco nunca respondeu)
 */
public final class Core {

    public static final Logger LOG = LoggerFactory.getLogger("br.com.trielht.plm.core");
    public static final String VERSION = "1.2.0";

    /** Historico do nucleo (o mais novo primeiro). Toda mudanca neste jar sobe VERSION e ganha uma linha aqui. */
    public static final java.util.List<Release> RELEASES = java.util.List.of(
            Release.of("1.2.0", "2026-11-23", "Notas de versão: o núcleo e cada plugin gravam no Portal o que mudou em "
                    + "cada versão, na subida do nó."),
            Release.of("1.1.1", "2026-11-23", "Textos gravados no Portal (resumo, mensagens, eventos) com acentuação."),
            Release.of("1.1.0", "2026-11-22", "Ambiente (TESTE/PRODUCAO): modo, parâmetros, fila e registros separados por "
                    + "ambiente; nó sem ambiente= no properties fica com os plugins desligados."),
            Release.of("1.0.0", "2026-11-22", "Núcleo comum: entrada única no Collaborative Lifecycle, configuração vinda "
                    + "do Portal, fila persistente no banco (sobrevive a reinício, sem trabalho repetido, cada trabalho "
                    + "num só nó), registro assíncrono com spool em arquivo e heartbeat dos nós."));
    public static final String CONFIG_FILE = "/App/triel/triel-plugins.properties";
    public static final String SEP = "|~|";

    private static volatile String nodeName;

    private Core() {
    }

    /** Propriedades locais (relidas a cada chamada: arquivo pequeno, uso raro). */
    public static Properties local() {
        Properties p = new Properties();
        try (InputStream in = Files.newInputStream(Path.of(CONFIG_FILE))) {
            p.load(in);
        } catch (NoSuchFileException e) {
            // sem arquivo: sem banco, tudo pelos padroes
        } catch (IOException e) {
            LOG.warn("[TRIEL-CORE] Nao foi possivel ler {}: {}", CONFIG_FILE, e.getMessage());
        }
        return p;
    }

    /**
     * Ambiente deste no: "PRODUCAO" ou "TESTE" (ambiente= no arquivo local). Null = nao informado ou invalido: os
     * plugins ficam DESLIGADOS (dev e producao gravam no mesmo banco; um no sem ambiente nao pode pegar trabalho).
     */
    public static String ambiente() {
        String a = local().getProperty("ambiente", "").trim().toUpperCase();
        return "PRODUCAO".equals(a) || "TESTE".equals(a) ? a : null;
    }

    /** host:catalina.base -- identifica o no do 3DSpace (dois nos podem estar no mesmo servidor). */
    public static String node() {
        String n = nodeName;
        if (n == null) {
            String host;
            try {
                host = InetAddress.getLocalHost().getHostName();
            } catch (Exception e) {
                host = "desconhecido";
            }
            int dot = host.indexOf('.');
            if (dot > 0) host = host.substring(0, dot);
            n = host + ":" + System.getProperty("catalina.base", "?");
            if (n.length() > 200) n = n.substring(n.length() - 200);
            nodeName = n;
        }
        return n;
    }

    /** md5 do jar de onde a classe foi carregada (para conferir a versao instalada em cada no). */
    public static String jarMd5(Class<?> c) {
        try {
            Path jar = Path.of(c.getProtectionDomain().getCodeSource().getLocation().toURI());
            if (!Files.isRegularFile(jar)) return null;
            byte[] digest = MessageDigest.getInstance("MD5").digest(Files.readAllBytes(jar));
            return HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            return null;
        }
    }

    // ------------------------------------------------------------------ texto

    public static String[] split(String s, int n) {
        if (s == null) return new String[0];
        String t = s.trim();
        if (t.isEmpty()) return new String[0];
        return t.split(Pattern.quote(SEP), n);
    }

    public static String[] lines(String s) {
        if (s == null) return new String[0];
        String t = s.trim();
        return t.isEmpty() ? new String[0] : t.split("\n");
    }

    /** So ASCII imprimivel: com acentos o 3DEXPERIENCE grava o comentario de historico codificado (#eNcOdEd#...). */
    public static String ascii(String s) {
        if (s == null) return "";
        String noAccents = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        String a = noAccents.replaceAll("[^\\x20-\\x7E]", " ");
        return a.length() > 1000 ? a.substring(0, 1000) + " ..." : a;
    }

    /** Mensagem da causa raiz (a Dassault embrulha o erro real em "An internal server error occurred"). */
    public static String rootMessage(Throwable e) {
        if (e == null) return null;
        Throwable c = e;
        while (c.getCause() != null && c.getCause() != c) c = c.getCause();
        return c == e ? String.valueOf(e.getMessage()) : e.getMessage() + " / causa: " + c.getMessage();
    }

    public static String cut(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max - 3) + "...";
    }
}
