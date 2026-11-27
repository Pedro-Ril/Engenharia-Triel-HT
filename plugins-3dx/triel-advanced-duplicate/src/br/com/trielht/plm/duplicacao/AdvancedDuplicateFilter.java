package br.com.trielht.plm.duplicacao;

import br.com.trielht.plm.core.AdvancedDuplicateEvents;
import br.com.trielht.plm.core.Core;
import br.com.trielht.plm.core.PluginConfig;

import jakarta.json.Json;
import jakarta.json.JsonArrayBuilder;
import jakarta.json.JsonObjectBuilder;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.time.LocalDate;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Duplicacao avancada (plugin "advanced-duplicate"): POST /resources/lifecycle/expand/federated, a estrutura que a
 * janela de Duplicacao avancada mostra, com a acao inicial de cada linha (expand::defaultAction).
 *
 * So age quando o pedido e de duplicacao ({"command":"duplicate","ids":[...]}); outros usos da mesma rota passam
 * como vieram. Modos (Portal): DESLIGADO = passa direto; SIMULACAO = calcula e registra o que mudaria, a resposta sai
 * como veio; ATIVO = o item principal vem com acaoPrincipal e os demais com acaoFilhos (ver DefaultActionRewriter).
 * Qualquer erro, resposta assincrona, comprimida, nao-JSON ou grande demais: sai como veio (janela padrao do 3DX).
 * As primeiras N requisicoes do dia (amostrasPorDia) levam tambem o pedido e o inicio da resposta no registro.
 */
public class AdvancedDuplicateFilter implements Filter {

    static final String PATH = "/resources/lifecycle/expand/federated";

    private static final AtomicInteger SAMPLES = new AtomicInteger();
    private static volatile LocalDate samplesDay = LocalDate.now();

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (!(request instanceof HttpServletRequest req) || !(response instanceof HttpServletResponse res)) {
            chain.doFilter(request, response);
            return;
        }
        String path = req.getRequestURI().substring(req.getContextPath().length());
        boolean thumb = ThumbnailUi.handles(path);
        if (!thumb && (!"POST".equals(req.getMethod()) || !PATH.equals(path))) {
            chain.doFilter(request, response);
            return;
        }
        PluginConfig.Settings cfg = PluginConfig.of(AdvancedDuplicateModule.KEY);
        if (cfg.off()) {
            chain.doFilter(request, response);
            return;
        }
        if (thumb) { // miniatura ao passar o mouse (ver ThumbnailUi)
            ThumbnailUi.handle(path, req, res, chain, cfg);
            return;
        }

        long t0 = System.nanoTime();
        CachedRequest cached = CachedRequest.of(req, 256 * 1024);
        if (cached == null) { // sem tamanho declarado ou grande demais: nao e o pedido da janela; segue como veio
            chain.doFilter(request, response);
            return;
        }
        Set<String> roots;
        try {
            roots = DefaultActionRewriter.duplicateRoots(cached.text(256 * 1024));
        } catch (Throwable e) {
            // pedido ilegivel: nao e o formato esperado; segue o padrao do 3DX (o corpo ja lido vai na copia)
            event("aviso", "pedido não reconhecido (" + Core.rootMessage(e) + "): janela padrão do 3DX", null);
            chain.doFilter(cached, response);
            return;
        }
        if (roots == null) { // nao e duplicacao: outra tela usando a mesma rota
            chain.doFilter(cached, response);
            return;
        }

        BufferedResponse buffered = new BufferedResponse(res, cfg.integer("maxBytes", 20_000_000));
        try {
            chain.doFilter(cached, buffered);
        } finally {
            if (req.isAsyncStarted()) buffered.passThrough(); // nao da para mexer: sai como veio
        }
        if (buffered.passedThrough()) {
            event("aviso", "resposta assíncrona ou acima de maxBytes: janela padrão do 3DX", null);
            return;
        }
        byte[] original = buffered.bytes();
        byte[] out = original;
        boolean sample = takeSample(cfg);
        try {
            String type = String.valueOf(buffered.getContentType()).toLowerCase();
            if (buffered.getStatus() != 200 || !type.contains("json") || buffered.getHeader("Content-Encoding") != null
                    || original.length == 0) {
                event("info", "resposta não tratável (status " + buffered.getStatus() + ", " + type
                        + "): janela padrão do 3DX", null);
            } else {
                String text = new String(original, buffered.charset());
                DefaultActionRewriter.Result r = DefaultActionRewriter.rewrite(text, roots,
                        DefaultActionRewriter.code(cfg.text("acaoPrincipal", "duplicar_com_desenhos")),
                        DefaultActionRewriter.code(cfg.text("acaoFilhos", "reutilizar")));
                String ui = AdvancedDuplicateModule.uiProblem();
                boolean apply = !cfg.simulate() && !r.changes().isEmpty() && ui == null;
                if (!cfg.simulate() && ui != null && !r.changes().isEmpty()) {
                    event("aviso", "Ativo, mas " + ui + ": janela padrão do 3DX (só registrado)", null);
                }
                if (apply) out = r.body().getBytes(buffered.charset());
                record(cfg, r, apply, original.length, (System.nanoTime() - t0) / 1_000_000,
                        sample ? cached.text(6000) : null, sample ? Core.cut(text, 14000) : null);
            }
        } catch (Throwable e) {
            out = original;
            event("aviso", "erro ao ajustar a janela (" + Core.rootMessage(e) + "): janela padrão do 3DX", null);
        }
        res.setContentLength(out.length);
        res.getOutputStream().write(out);
    }

    private static void record(PluginConfig.Settings cfg, DefaultActionRewriter.Result r, boolean applied, int bytes,
                               long ms, String requestSample, String responseSample) {
        String principal = null;
        int children = 0;
        for (DefaultActionRewriter.Change c : r.changes()) {
            if (c.root()) principal = (c.label() == null ? c.physicalId() : c.label()) + " → "
                    + DefaultActionRewriter.name(c.after());
            else children++;
        }
        String how = applied ? "aplicado" : cfg.simulate() ? "simulação, a janela veio como o 3DX mandou" : "sem mudança";
        String msg = "Duplicação avançada: " + r.nodes() + " objeto(s); " + (principal == null ? "principal sem mudança"
                : "principal " + principal) + "; " + children + " outro(s) → "
                + DefaultActionRewriter.name(DefaultActionRewriter.code(cfg.text("acaoFilhos", "reutilizar")) == null
                ? -1 : DefaultActionRewriter.code(cfg.text("acaoFilhos", "reutilizar"))) + " (" + how + "; " + ms + " ms)";
        JsonArrayBuilder list = Json.createArrayBuilder();
        for (DefaultActionRewriter.Change c : r.changes().subList(0, Math.min(60, r.changes().size()))) {
            list.add(Json.createObjectBuilder().add("pid", c.physicalId()).add("titulo", String.valueOf(c.label()))
                    .add("principal", c.root()).add("antes", DefaultActionRewriter.name(c.before()))
                    .add("depois", DefaultActionRewriter.name(c.after())));
        }
        JsonObjectBuilder d = Json.createObjectBuilder().add("modo", cfg.mode.name()).add("aplicado", applied)
                .add("objetos", r.nodes()).add("mudancas", r.changes().size()).add("bytes", bytes).add("ms", ms)
                .add("itens", list);
        if (requestSample != null) d.add("pedido", requestSample);
        if (responseSample != null) d.add("respostaInicio", responseSample);
        event("info", msg, d.build().toString());
    }

    private static void event(String level, String msg, String detail) {
        Core.LOG.info("[TRIEL-{}] {}", AdvancedDuplicateModule.KEY, msg);
        AdvancedDuplicateEvents.event(AdvancedDuplicateModule.KEY, level, msg, detail);
    }

    /** As primeiras N requisicoes do dia levam a amostra (parametro amostrasPorDia). */
    private static boolean takeSample(PluginConfig.Settings cfg) {
        LocalDate today = LocalDate.now();
        if (!today.equals(samplesDay)) {
            samplesDay = today;
            SAMPLES.set(0);
        }
        return SAMPLES.incrementAndGet() <= cfg.integer("amostrasPorDia", 3);
    }
}
