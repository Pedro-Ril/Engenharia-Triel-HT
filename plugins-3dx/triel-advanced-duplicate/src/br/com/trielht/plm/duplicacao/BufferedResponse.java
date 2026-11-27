package br.com.trielht.plm.duplicacao;

import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.WriteListener;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletResponseWrapper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

/**
 * Guarda o corpo da resposta em memoria para o filtro poder mexer nele antes de mandar ao cliente. Status e
 * cabecalhos vao direto (exceto o tamanho, que o filtro grava no fim).
 *
 * Passou de maxBytes (resposta grande demais) ou o servlet seguiu em modo assincrono: vira "passagem direta" -- o
 * que estava guardado sai como veio e o resto vai direto ao cliente, sem nenhuma alteracao.
 */
final class BufferedResponse extends HttpServletResponseWrapper {

    private final HttpServletResponse real;
    private final int maxBytes;
    private final ByteArrayOutputStream buffer = new ByteArrayOutputStream(64 * 1024);
    private boolean passThrough;
    private long declaredLength = -1;
    private ServletOutputStream stream;
    private PrintWriter writer;

    BufferedResponse(HttpServletResponse real, int maxBytes) {
        super(real);
        this.real = real;
        this.maxBytes = maxBytes;
    }

    boolean passedThrough() {
        return passThrough;
    }

    /** Desiste de guardar: manda o que ja havia e segue direto (usado no assincrono e acima do limite). */
    void passThrough() throws IOException {
        if (passThrough) return;
        if (writer != null) writer.flush();
        passThrough = true;
        if (declaredLength >= 0 && buffer.size() == 0) real.setContentLengthLong(declaredLength);
        if (buffer.size() > 0) real.getOutputStream().write(buffer.toByteArray());
        buffer.reset();
    }

    byte[] bytes() {
        if (writer != null) writer.flush();
        return buffer.toByteArray();
    }

    Charset charset() {
        String enc = getCharacterEncoding();
        try {
            return enc == null ? StandardCharsets.UTF_8 : Charset.forName(enc);
        } catch (RuntimeException e) {
            return StandardCharsets.UTF_8;
        }
    }

    private void write(byte[] b, int off, int len) throws IOException {
        if (passThrough) {
            real.getOutputStream().write(b, off, len);
            return;
        }
        if (buffer.size() + len > maxBytes) {
            passThrough();
            real.getOutputStream().write(b, off, len);
            return;
        }
        buffer.write(b, off, len);
    }

    @Override
    public ServletOutputStream getOutputStream() {
        if (stream == null) {
            stream = new ServletOutputStream() {
                @Override
                public void write(int b) throws IOException {
                    BufferedResponse.this.write(new byte[] {(byte) b}, 0, 1);
                }

                @Override
                public void write(byte[] b, int off, int len) throws IOException {
                    BufferedResponse.this.write(b, off, len);
                }

                @Override
                public boolean isReady() {
                    return true;
                }

                @Override
                public void setWriteListener(WriteListener listener) {
                    // so escrita bloqueante; o assincrono vira passagem direta no filtro
                }
            };
        }
        return stream;
    }

    @Override
    public PrintWriter getWriter() {
        if (writer == null) {
            OutputStream out = new OutputStream() {
                @Override
                public void write(int b) throws IOException {
                    BufferedResponse.this.write(new byte[] {(byte) b}, 0, 1);
                }

                @Override
                public void write(byte[] b, int off, int len) throws IOException {
                    BufferedResponse.this.write(b, off, len);
                }
            };
            writer = new PrintWriter(new OutputStreamWriter(out, charset()), false);
        }
        return writer;
    }

    // o tamanho final e do filtro (o corpo pode mudar); em passagem direta vale o do servlet
    @Override
    public void setContentLength(int len) {
        if (passThrough) real.setContentLength(len);
        else declaredLength = len;
    }

    @Override
    public void setContentLengthLong(long len) {
        if (passThrough) real.setContentLengthLong(len);
        else declaredLength = len;
    }

    @Override
    public void setHeader(String name, String value) {
        if (!passThrough && "Content-Length".equalsIgnoreCase(name)) return;
        super.setHeader(name, value);
    }

    @Override
    public void addHeader(String name, String value) {
        if (!passThrough && "Content-Length".equalsIgnoreCase(name)) return;
        super.addHeader(name, value);
    }

    @Override
    public void flushBuffer() throws IOException {
        if (passThrough) real.flushBuffer();
        else if (writer != null) writer.flush();
    }

    @Override
    public void resetBuffer() {
        if (!passThrough) {
            buffer.reset();
        } else {
            super.resetBuffer();
        }
    }

    @Override
    public void reset() {
        super.reset();
        if (!passThrough) buffer.reset();
    }
}
