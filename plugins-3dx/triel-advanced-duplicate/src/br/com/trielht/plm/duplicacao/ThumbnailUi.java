package br.com.trielht.plm.duplicacao;

import br.com.trielht.plm.core.AdvancedDuplicateEvents;
import br.com.trielht.plm.core.Core;
import br.com.trielht.plm.core.PluginConfig;

import jakarta.json.Json;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Collections;
import java.util.Enumeration;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Miniatura ao passar o mouse (0.3.0). Tres enderecos, todos so com o plugin fora de DESLIGADO:
 *
 * 1) GET /webapps/AdvancedView/AdvancedView.js (a janela da Dassault): sai como veio + um carregador pequeno e fixo
 *    no fim. O carregador so pede o (2). O navegador e o proxy do 3DDashboard guardam este arquivo por ate 7 dias,
 *    por isso o carregador nao decide nada: quem decide e o (2), sem cache, a cada janela aberta.
 * 2) GET /webapps/TrielAdvancedDuplicate/miniatura.js: em ATIVO com o parametro miniatura marcado (padrao: desmarcado) devolve o codigo do
 *    balao; em SIMULACAO ou com miniatura desligada, um script vazio. Sem cache.
 * 3) GET /webapps/TrielAdvancedDuplicate/evento?v=..&m=..: falhas vistas no navegador viram evento "aviso" no Portal
 *    (no maximo LIMITE_EVENTOS por dia por no).
 *
 * Plugin DESLIGADO: os tres passam direto (o 2 e o 3 dao 404 da propria TomEE e o carregador ja guardado nao faz
 * nada). Qualquer erro aqui: a resposta original sai como veio.
 */
final class ThumbnailUi {

    static final String UI_JS = "/webapps/AdvancedView/AdvancedView.js";
    static final String SCRIPT = "/webapps/TrielAdvancedDuplicate/miniatura.js";
    static final String EVENT = "/webapps/TrielAdvancedDuplicate/evento";

    /** Muda so quando o carregador mudar: entra no ETag do AdvancedView.js para os caches nao misturarem versoes. */
    static final String LOADER_VERSION = "1";

    static final String LOADER = "\n;/* Triel-HT advanced-duplicate: miniatura (carregador v" + LOADER_VERSION + ") */"
            + "(function(){try{if(window.__trielAdvDupLoader)return;window.__trielAdvDupLoader=1;"
            + "var u=require.toUrl(\"DS/TrielAdvancedDuplicate/miniatura.js\");var s=document.createElement(\"script\");"
            + "s.async=true;s.src=u+(u.indexOf(\"?\")<0?\"?\":\"&\")+\"t=\"+Date.now();s.onerror=function(){};"
            + "(document.head||document.documentElement).appendChild(s);}catch(e){}})();\n";

    /** Trecho que identifica o arquivo certo (o define da arvore da janela, dentro do arquivo agrupado). */
    static final String UI_MARKER = "define(\"DS/AdvancedView/AdvancedTree\"";

    private static final int LIMITE_EVENTOS = 50;
    private static final AtomicInteger EVENTS = new AtomicInteger();
    private static volatile LocalDate eventsDay = LocalDate.now();
    private static volatile String script;

    private ThumbnailUi() {
    }

    static boolean handles(String path) {
        return UI_JS.equals(path) || SCRIPT.equals(path) || EVENT.equals(path);
    }

    static void handle(String path, HttpServletRequest req, HttpServletResponse res, FilterChain chain,
                       PluginConfig.Settings cfg) throws IOException, ServletException {
        if (!"GET".equals(req.getMethod()) && !"HEAD".equals(req.getMethod())) {
            chain.doFilter(req, res);
            return;
        }
        switch (path) {
            case UI_JS -> appendLoader(req, res, chain, cfg);
            case SCRIPT -> serveScript(res, cfg);
            default -> clientEvent(req, res);
        }
    }

    // ---------------------------------------------------------------- 1) carregador no AdvancedView.js

    private static void appendLoader(HttpServletRequest req, HttpServletResponse res, FilterChain chain,
                                     PluginConfig.Settings cfg) throws IOException, ServletException {
        if (!cfg.flag("miniatura", false) || !"GET".equals(req.getMethod())) {
            chain.doFilter(req, res);
            return;
        }
        BufferedResponse buffered = new BufferedResponse(res, 5_000_000);
        try {
            chain.doFilter(new FullRequest(req), buffered); // sem 304/Range: precisa do arquivo inteiro para emendar
        } finally {
            if (req.isAsyncStarted()) buffered.passThrough();
        }
        if (buffered.passedThrough()) return;
        byte[] original = buffered.bytes();
        byte[] out = original;
        try {
            String type = String.valueOf(buffered.getContentType()).toLowerCase(Locale.ROOT);
            if (buffered.getStatus() == 200 && type.contains("javascript") && buffered.getHeader("Content-Encoding") == null
                    && original.length > 0) {
                String text = new String(original, StandardCharsets.UTF_8);
                if (text.contains(UI_MARKER) && !text.contains("__trielAdvDupLoader")) {
                    out = (text + LOADER).getBytes(StandardCharsets.UTF_8);
                    String etag = buffered.getHeader("ETag");
                    if (etag != null && etag.endsWith("\"")) {
                        res.setHeader("ETag", etag.substring(0, etag.length() - 1) + "-triel" + LOADER_VERSION + "\"");
                    } else {
                        res.setHeader("ETag", "W/\"triel" + LOADER_VERSION + "-" + original.length + "\"");
                    }
                } else if (!text.contains(UI_MARKER)) {
                    event("aviso", "miniatura: AdvancedView.js sem o trecho esperado; janela padrão do 3DX", null);
                }
            }
        } catch (Throwable e) {
            out = original;
            event("aviso", "miniatura: erro ao preparar a janela (" + Core.rootMessage(e) + "): janela padrão do 3DX",
                    null);
        }
        res.setContentLength(out.length);
        res.getOutputStream().write(out);
    }

    /** Pedido sem os cabecalhos condicionais e de faixa: a resposta vem sempre 200 com o arquivo inteiro. */
    static final class FullRequest extends HttpServletRequestWrapper {
        private static final Set<String> HIDDEN = Set.of("if-none-match", "if-modified-since", "if-range", "range",
                "if-match", "if-unmodified-since");

        FullRequest(HttpServletRequest req) {
            super(req);
        }

        private static boolean hidden(String name) {
            return name != null && HIDDEN.contains(name.toLowerCase(Locale.ROOT));
        }

        @Override
        public String getHeader(String name) {
            return hidden(name) ? null : super.getHeader(name);
        }

        @Override
        public Enumeration<String> getHeaders(String name) {
            return hidden(name) ? Collections.emptyEnumeration() : super.getHeaders(name);
        }

        @Override
        public long getDateHeader(String name) {
            return hidden(name) ? -1 : super.getDateHeader(name);
        }

        @Override
        public Enumeration<String> getHeaderNames() {
            return Collections.enumeration(Collections.list(super.getHeaderNames()).stream()
                    .filter(n -> !hidden(n)).toList());
        }
    }

    // ---------------------------------------------------------------- 2) codigo do balao

    private static void serveScript(HttpServletResponse res, PluginConfig.Settings cfg) throws IOException {
        String body;
        if (cfg.simulate() || !cfg.flag("miniatura", false)) {
            body = "/* Triel-HT advanced-duplicate: miniatura desligada (" + (cfg.simulate() ? "modo Simulação"
                    : "parâmetro miniatura") + ") */\n";
        } else {
            String cfgJson = Json.createObjectBuilder()
                    .add("versao", AdvancedDuplicateModule.VERSION)
                    .add("atrasoMs", clamp(cfg.integer("miniaturaAtrasoMs", 350), 0, 3000))
                    .add("largura", clamp(cfg.integer("miniaturaLargura", 200), 80, 600))
                    .add("timeoutMs", clamp(cfg.integer("miniaturaTimeoutMs", 5000), 500, 30000))
                    .build().toString();
            body = template().replace("__CFG__", cfgJson);
        }
        byte[] out = body.getBytes(StandardCharsets.UTF_8);
        res.setStatus(200);
        res.setContentType("text/javascript;charset=UTF-8");
        res.setHeader("Cache-Control", "no-store, no-cache, max-age=0");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.setContentLength(out.length);
        res.getOutputStream().write(out);
    }

    static String template() throws IOException {
        String s = script;
        if (s == null) {
            try (InputStream in = ThumbnailUi.class.getResourceAsStream("/META-INF/triel-advanced-duplicate/miniatura.js")) {
                if (in == null) throw new IOException("miniatura.js ausente no jar");
                s = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            }
            script = s;
        }
        return s;
    }

    private static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }

    // ---------------------------------------------------------------- 3) falhas vistas no navegador

    private static void clientEvent(HttpServletRequest req, HttpServletResponse res) {
        try {
            LocalDate today = LocalDate.now();
            if (!today.equals(eventsDay)) {
                eventsDay = today;
                EVENTS.set(0);
            }
            if (EVENTS.incrementAndGet() <= LIMITE_EVENTOS) {
                String m = Core.cut(String.valueOf(req.getParameter("m")), 300);
                String v = Core.cut(String.valueOf(req.getParameter("v")), 20);
                event("aviso", "miniatura (navegador, v" + v + "): " + m + "; a janela seguiu no padrão do 3DX", null);
            }
        } catch (Throwable e) {
            Core.LOG.warn("[TRIEL-{}] evento da miniatura ignorado: {}", AdvancedDuplicateModule.KEY, e.toString());
        }
        res.setStatus(204);
        res.setHeader("Cache-Control", "no-store");
    }

    private static void event(String level, String msg, String detail) {
        Core.LOG.info("[TRIEL-{}] {}", AdvancedDuplicateModule.KEY, msg);
        AdvancedDuplicateEvents.event(AdvancedDuplicateModule.KEY, level, msg, detail);
    }
}
