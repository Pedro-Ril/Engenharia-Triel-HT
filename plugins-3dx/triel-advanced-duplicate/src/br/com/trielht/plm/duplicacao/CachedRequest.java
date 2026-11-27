package br.com.trielht.plm.duplicacao;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

/** Le o corpo (pequeno) da requisicao uma vez, para a amostra da observacao, e o entrega intacto ao servlet. */
final class CachedRequest extends HttpServletRequestWrapper {

    private final byte[] body;

    private CachedRequest(HttpServletRequest req, byte[] body) {
        super(req);
        this.body = body;
    }

    /** Corpo de ate max bytes com tamanho declarado; senao null (a requisicao segue sem ser lida aqui). */
    static CachedRequest of(HttpServletRequest req, int max) throws IOException {
        long len = req.getContentLengthLong();
        if (len < 0 || len > max) return null;
        return new CachedRequest(req, req.getInputStream().readNBytes((int) len));
    }

    String text(int max) {
        String enc = getCharacterEncoding();
        Charset cs;
        try {
            cs = enc == null ? StandardCharsets.UTF_8 : Charset.forName(enc);
        } catch (RuntimeException e) {
            cs = StandardCharsets.UTF_8;
        }
        String s = new String(body, cs);
        return s.length() > max ? s.substring(0, max) + "…" : s;
    }

    @Override
    public ServletInputStream getInputStream() {
        ByteArrayInputStream in = new ByteArrayInputStream(body);
        return new ServletInputStream() {
            @Override
            public int read() {
                return in.read();
            }

            @Override
            public int read(byte[] b, int off, int len) {
                return in.read(b, off, len);
            }

            @Override
            public boolean isFinished() {
                return in.available() == 0;
            }

            @Override
            public boolean isReady() {
                return true;
            }

            @Override
            public void setReadListener(ReadListener listener) {
                throw new IllegalStateException("leitura assincrona nao suportada");
            }
        };
    }

    @Override
    public BufferedReader getReader() throws IOException {
        String enc = getCharacterEncoding();
        return new BufferedReader(new InputStreamReader(getInputStream(),
                enc == null ? StandardCharsets.UTF_8 : Charset.forName(enc)));
    }
}
