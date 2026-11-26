package br.com.trielht.plm.estado;

import br.com.trielht.plm.core.Core;
import br.com.trielht.plm.core.EventBridge;
import br.com.trielht.plm.core.Job;
import br.com.trielht.plm.core.JobQueue;
import br.com.trielht.plm.core.PluginConfig;
import br.com.trielht.plm.core.Report;

import jakarta.json.Json;
import jakarta.json.JsonArrayBuilder;
import jakarta.json.JsonObjectBuilder;
import jakarta.json.JsonValue;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Estado de maturidade pelo banco nas respostas que o integrador do SOLIDWORKS le (plugin "maturity-state").
 *
 * - GET  /resources/v1/modeler/dseng/dseng:EngItem/search  ("busca": o item pelo codigo)
 * - POST /cvservlet/zonequeries                            ("estrutura": a estrutura do item)
 * As duas vem do INDICE de busca do 3DX, que atrasa ~10 s a mais de 90 s depois de cada mudanca: um item recem
 * liberado ainda aparece IN_WORK. Aqui o 3DSpace responde como sempre e, antes de devolver, o estado de cada objeto
 * e conferido no banco (current por physicalid). So o estado muda; o resto da resposta fica como veio.
 *
 * Modos (Portal): DESLIGADO = passa direto; SIMULACAO = so observa (registra divergencias, custo e amostras do
 * formato), a resposta sai como veio; ATIVO = devolve o estado do banco.
 * Qualquer erro, resposta grande demais, comprimida, nao-JSON ou assincrona: sai como veio.
 */
public class MaturityStateFilter implements Filter {

    static final String SEARCH = "/resources/v1/modeler/dseng/dseng:EngItem/search";
    static final String ZONE = "/cvservlet/zonequeries";

    /** Amostras de formato por dia e por tipo (o detalhe completo vai so nas primeiras). */
    private static final Map<String, AtomicInteger> SAMPLES = new HashMap<>();
    private static volatile LocalDate samplesDay = LocalDate.now();

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (!(request instanceof HttpServletRequest req) || !(response instanceof HttpServletResponse res)) {
            chain.doFilter(request, response);
            return;
        }
        String path = req.getRequestURI().substring(req.getContextPath().length());
        String kind = SEARCH.equals(path) && "GET".equals(req.getMethod()) ? "busca"
                : ZONE.equals(path) && "POST".equals(req.getMethod()) ? "estrutura" : null;
        PluginConfig.Settings cfg = kind == null ? null : PluginConfig.of(MaturityStateModule.KEY);
        if (cfg == null || cfg.off()) {
            chain.doFilter(request, response);
            return;
        }

        long t0 = System.nanoTime();
        boolean sample = takeSample(kind, cfg);
        CachedRequest cached = sample && "estrutura".equals(kind) ? CachedRequest.of(req, 64 * 1024) : null;
        BufferedResponse buffered = new BufferedResponse(res, cfg.integer("maxBytes", 30_000_000));
        try {
            chain.doFilter(cached != null ? cached : req, buffered);
        } finally {
            if (req.isAsyncStarted()) buffered.passThrough(); // nao da para mexer: sai como veio
        }
        if (buffered.passedThrough()) {
            log(cfg, kind, "passagem direta (resposta assíncrona ou acima de maxBytes)", null);
            return;
        }
        byte[] original = buffered.bytes();
        long servletMs = (System.nanoTime() - t0) / 1_000_000;
        byte[] out = original;
        try {
            String type = String.valueOf(buffered.getContentType()).toLowerCase();
            if (buffered.getStatus() == 200 && type.contains("json") && buffered.getHeader("Content-Encoding") == null
                    && original.length > 0) {
                byte[] changed = process(kind, req, cached, original, buffered, cfg, servletMs, sample);
                if (changed != null && !cfg.simulate()) out = changed;
            }
        } catch (Throwable e) {
            out = original;
            Core.LOG.warn("[TRIEL-{}] {}: resposta devolvida como veio ({})", MaturityStateModule.KEY, kind,
                    Core.rootMessage(e));
            EventBridge.event(MaturityStateModule.KEY, "aviso", kind + ": resposta devolvida como veio ("
                    + Core.rootMessage(e) + ")", null);
        }
        res.setContentLength(out.length);
        res.getOutputStream().write(out);
    }

    /** Confere o estado no banco; devolve o corpo novo (ou null se nada muda). Registra a observacao. */
    private static byte[] process(String kind, HttpServletRequest req, CachedRequest cached, byte[] original,
                                  BufferedResponse res, PluginConfig.Settings cfg, long servletMs, boolean sample) {
        String text = new String(original, res.charset());
        JsonValue root = StateRewriter.parse(text);
        Map<String, StateRewriter.Found> found = StateRewriter.collect(root);
        if (found.isEmpty()) {
            if (sample) log(cfg, kind, "amostra sem objetos com estado (" + original.length + " bytes)",
                    detail(kind, req, cached, text, root, found, null, List.of(), servletMs, 0, false));
            return null;
        }
        StateLookup.Result db = StateLookup.read(found.keySet(),
                cfg.text("papel", "ctx::VPLMAdmin.Company Name.Default"),
                cfg.integer("maxObjetos", 5000), cfg.integer("prazoMs", 3000), cfg.integer("loteBanco", 300));
        List<StateRewriter.Diff> diffs = StateRewriter.diffs(found, db.states());
        byte[] changed = null;
        if (!diffs.isEmpty()) {
            Map<String, String> fix = new HashMap<>();
            for (StateRewriter.Diff d : diffs) fix.put(d.id(), d.db());
            changed = StateRewriter.write(StateRewriter.rewrite(root, fix)).getBytes(res.charset());
        }
        boolean applied = changed != null && !cfg.simulate();
        // registra toda estrutura (custo por tamanho), toda divergencia, os problemas e as amostras; a busca sem
        // divergencia nao (e o caso comum, ~500 por dia)
        boolean problem = db.error() != null || db.cut();
        if (sample || problem || !diffs.isEmpty() || "estrutura".equals(kind)) {
            String msg = kind + " " + query(req) + ": " + found.size() + " objeto(s), " + diffs.size()
                    + " com estado diferente no banco" + (applied ? " (corrigido)" : cfg.simulate() ? " (simulação)" : "")
                    + "; banco " + db.millis() + " ms, " + db.read() + " lido(s) em " + db.queries() + " consulta(s)"
                    + (db.fallbacks() > 0 ? " (" + db.fallbacks() + " lote(s) um a um)" : "")
                    + (db.cut() ? ", CORTADO no prazo/limite" : "")
                    + (db.error() != null ? ", erro: " + db.error() : "") + "; 3DSpace " + servletMs + " ms, "
                    + original.length + " bytes";
            log(cfg, kind, msg, detail(kind, req, cached, text, root, found, db, diffs, servletMs, db.millis(), sample));
            if (!diffs.isEmpty()) recordExecution(kind, req, cfg, found, diffs, applied, msg);
        }
        return changed;
    }

    /**
     * Divergencia vira EXECUCAO no Portal (gatilho "consulta"): o objeto e o item raiz da estrutura (o primeiro da
     * resposta) ou, na busca, o primeiro divergente; um item por objeto divergente (indice -> banco). Sem
     * divergencia nao grava execucao (o custo de cada estrutura fica so nos eventos).
     */
    private static void recordExecution(String kind, HttpServletRequest req, PluginConfig.Settings cfg,
                                        Map<String, StateRewriter.Found> found, List<StateRewriter.Diff> diffs,
                                        boolean applied, String summary) {
        try {
            StateRewriter.Found main = "estrutura".equals(kind) ? found.values().iterator().next()
                    : found.get(diffs.get(0).id());
            Job job = Job.of(MaturityStateModule.KEY, "consulta", cfg.mode)
                    .object(main.id(), null, null, null, main.revision(), main.label());
            job.objectName = main.label();
            job.actorLogin = req.getRemoteUser();
            Report rep = JobQueue.startInline(job);
            rep.total(found.size());
            for (StateRewriter.Diff d : diffs) {
                rep.item(applied ? "estado_corrigido" : "seria_estado_corrigido", true)
                        .target(d.id(), null, d.label(), d.revision(), d.label())
                        .change(d.index(), d.db())
                        .message(applied ? "Entregue com o estado do banco" : "Simulação: o integrador recebeu o do índice")
                        .add();
            }
            rep.summary(summary);
            JobQueue.recordFinished(rep);
        } catch (RuntimeException e) {
            Core.LOG.warn("[TRIEL-{}] Execução não registrada: {}", MaturityStateModule.KEY, e.getMessage());
        }
    }

    private static String query(HttpServletRequest req) {
        String q = req.getParameter("$searchStr");
        return q != null ? "'" + Core.cut(q, 60) + "'" : "";
    }

    private static String detail(String kind, HttpServletRequest req, CachedRequest cached, String text, JsonValue root,
                                 Map<String, StateRewriter.Found> found, StateLookup.Result db,
                                 List<StateRewriter.Diff> diffs, long servletMs, long dbMs, boolean sample) {
        JsonObjectBuilder b = Json.createObjectBuilder()
                .add("tipo", kind)
                .add("objetos", found.size())
                .add("ms3dspace", servletMs)
                .add("msBanco", dbMs);
        if (db != null) {
            b.add("lidosNoBanco", db.read()).add("falhas", db.failed()).add("cortado", db.cut())
                    .add("consultas", db.queries()).add("lotesUmAUm", db.fallbacks());
        }
        JsonArrayBuilder d = Json.createArrayBuilder();
        for (StateRewriter.Diff x : diffs.subList(0, Math.min(50, diffs.size()))) {
            d.add(Json.createObjectBuilder().add("id", x.id()).add("indice", x.index()).add("banco", x.db()));
        }
        b.add("divergencias", d);
        if (sample) {
            String qs = req.getQueryString();
            b.add("query", qs == null ? "" : Core.cut(qs.replaceAll("ticket=[^&]+", "ticket=…"), 500));
            if (cached != null) b.add("corpoRequisicao", cached.text(2000));
            b.add("chaves", String.join(" ", StateRewriter.keys(root, 120)));
            b.add("inicioResposta", Core.cut(text, 4000));
        }
        return b.build().toString();
    }

    private static void log(PluginConfig.Settings cfg, String kind, String msg, String detail) {
        Core.LOG.info("[TRIEL-{}] {}", MaturityStateModule.KEY, msg);
        EventBridge.event(MaturityStateModule.KEY, "info", msg, detail);
    }

    /** As primeiras N requisicoes do dia de cada tipo levam a amostra do formato (parametro amostrasPorDia). */
    private static boolean takeSample(String kind, PluginConfig.Settings cfg) {
        LocalDate today = LocalDate.now();
        synchronized (SAMPLES) {
            if (!today.equals(samplesDay)) {
                SAMPLES.clear();
                samplesDay = today;
            }
            return SAMPLES.computeIfAbsent(kind, k -> new AtomicInteger()).incrementAndGet()
                    <= cfg.integer("amostrasPorDia", 3);
        }
    }
}
