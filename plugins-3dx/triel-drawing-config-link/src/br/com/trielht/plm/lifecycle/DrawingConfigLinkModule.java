package br.com.trielht.plm.lifecycle;

import br.com.trielht.plm.core.Core;
import br.com.trielht.plm.core.Job;
import br.com.trielht.plm.core.JobQueue;
import br.com.trielht.plm.core.Mx;
import br.com.trielht.plm.core.PluginConfig;
import br.com.trielht.plm.core.PluginModule;
import br.com.trielht.plm.core.Report;

import com.dassault_systemes.enovia.xapps.dsxcad.interfaces.IdsxcadAuthoring;
import com.dassault_systemes.enovia.xapps.dsxcad.interfaces.dsxcadFactory;
import com.dassault_systemes.enovia.xapps.services.ER.implementations.ENOXERContext;
import com.dassault_systemes.enovia.xapps.services.context.ENOXContext;
import com.dassault_systemes.enovia.xapps.services.context.ENOXContextManager;
import com.dassault_systemes.lifecycle.itf.CompletionData;
import com.dassault_systemes.lifecycle.itf.CompletionObject;

import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.ws.rs.core.Response;

import matrix.db.Context;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Hashtable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Desenho encontrado por qualquer configuracao (plugin "drawing-config-link").
 *
 * O desenho so fica ligado (XCADBaseDependency, tipo CADDrawing) as configuracoes que tem vista nele; com isso o
 * SOLIDWORKS e o "Duplicar com Desenhos" nao acham o desenho pelas outras configuracoes. Aqui o desenho LIBERADO
 * recebe o vinculo com todas as configuracoes do mesmo modelo (XCADModelRepReference, ligado a cada configuracao
 * por XCADItem), pelo servico da propria Dassault (dsxcad createDependencyLink) -- o mesmo vinculo do conector.
 *
 * Desenhos fora de RELEASED nunca sao alterados (o SOLIDWORKS refaz os vinculos a cada gravacao). Repetivel.
 *
 * Gatilhos: liberacao de desenho; rotina noturna (noturnoAtivo/noturnoHora -- os dois nos agendam, a fila do banco
 * deixa uma so varredura); acao manual no Portal: {"acao":"reprocessar","nome":"..."} ou {"acao":"varredura","limite":N}.
 * Parametros: papel, maxVinculosPorDesenho, esperaLiberacaoSeg, noturnoAtivo, noturnoHora.
 */
public class DrawingConfigLinkModule implements PluginModule {

    public static final String KEY = "drawing-config-link";
    public static final String VERSION = "3.0.0";

    private static final String CHANGE_STATUS = "Change Status";
    private static final String RELEASED = "RELEASED";
    private static final String DEP_REL = "XCADBaseDependency";
    private static final String ITEM_REL = "XCADItem";
    private static final String LINK_TYPE = "CADDrawing";
    private static final String HISTORY_EVENT = "Link Configurations";
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    private ScheduledExecutorService nightly;

    @Override
    public String key() {
        return KEY;
    }

    @Override
    public String version() {
        return VERSION;
    }

    // ------------------------------------------------------------------ rotina noturna

    @Override
    public void start() {
        nightly = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "triel-drawing-config-link-noturno");
            t.setDaemon(true);
            return t;
        });
        // confere a cada 5 min se chegou a hora configurada no Portal (muda sem reiniciar)
        nightly.scheduleWithFixedDelay(this::nightlyTick, 1, 5, TimeUnit.MINUTES);
    }

    @Override
    public void stop() {
        if (nightly != null) nightly.shutdownNow();
    }

    private volatile String lastNightlyDay;

    private void nightlyTick() {
        try {
            PluginConfig.Settings cfg = PluginConfig.of(KEY);
            if (cfg.off() || !cfg.flag("noturnoAtivo", false)) return;
            LocalTime at = LocalTime.parse(cfg.text("noturnoHora", "02:00").trim());
            LocalDateTime now = LocalDateTime.now();
            String today = now.toLocalDate().toString();
            long minutesLate = Duration.between(now.toLocalDate().atTime(at), now).toMinutes();
            if (minutesLate < 0 || minutesLate >= 60 || today.equals(lastNightlyDay)) return;
            lastNightlyDay = today;
            Job job = Job.of(KEY, "noturna", cfg.mode);
            job.dedupKey = "drw:varredura";
            job.params = Json.createObjectBuilder().add("acao", "varredura").build();
            job.objectName = "Varredura dos desenhos liberados";
            JobQueue.submit(job);
        } catch (Exception e) {
            Core.LOG.warn("[TRIEL-{}] Rotina noturna: {}", KEY, e.getMessage());
        }
    }

    // ------------------------------------------------------------------ liberacao (thread do usuario)

    @Override
    public void onPostprocess(Context context, String command, CompletionObject completion, PluginConfig.Settings cfg)
            throws Exception {
        if (!CHANGE_STATUS.equals(command)) return;
        Hashtable<String, CompletionData> table = completion.getCompletionTable();
        if (table == null || table.isEmpty()) return;
        for (Map.Entry<String, CompletionData> entry : table.entrySet()) {
            String pid = entry.getKey();
            CompletionData d = entry.getValue();
            if (d == null || !d.getValidForCommand()) continue;
            String toState = d.getObjectValue("tostate");
            if (toState != null && !RELEASED.equals(toState)) continue;
            // ordem: isDrawing | type | id | name | revision | titulo
            String[] o = Core.split(Mx.mql(context, "print bus $1 select $2 $3 $4 $5 $6 $7 dump $8", pid,
                    "type.kindof[Drawing]", "type", "id", "name", "revision", "attribute[PLMEntity.V_Name]", Core.SEP), 6);
            if (o.length < 6 || !"TRUE".equalsIgnoreCase(o[0])) continue;
            Job job = Job.of(KEY, "liberacao", cfg.mode).object(pid, o[2], o[1], o[3], o[4], o[5]);
            job.actorLogin = context.getUser();
            job.dedupKey = "drw:" + o[2];
            job.delaySeconds = 5;
            JobQueue.submit(job);
        }
    }

    // ------------------------------------------------------------------ trabalho (fila)

    @Override
    public void run(Job job, Report rep, PluginConfig.Settings cfg) throws Exception {
        String role = cfg.text("papel", "ctx::VPLMAdmin.Company Name.Default");
        String action = job.param("acao", "reprocessar");
        Mx.asSystem(role, ctx -> {
            if ("varredura".equals(action)) {
                scanAll(ctx, job, rep, cfg);
                return;
            }
            if (job.objectId == null && !resolveByName(ctx, job, rep)) return;
            Result r = processDrawing(ctx, job.objectId, rep, cfg, "liberacao".equals(job.trigger));
            rep.summary(r.toString());
            if (r.status.startsWith("IGNORADO")) rep.ignore(r.toString());
        });
    }

    /** Acao manual: {"nome": ...} -> ultima revisao LIBERADA do desenho. */
    private static boolean resolveByName(Context ctx, Job job, Report rep) throws Exception {
        String name = job.param("nome", job.objectName);
        if (name == null || name.isBlank()) {
            rep.fail("Informe o nome do desenho");
            return false;
        }
        String found = null;
        // ordem: type | name | revision | id | current | isDrawing
        for (String line : Core.lines(Mx.mql(ctx, "temp query bus $1 $2 $3 select $4 $5 $6 dump $7", "*", name.trim(), "*",
                "id", "current", "type.kindof[Drawing]", Core.SEP))) {
            String[] f = Core.split(line, 6);
            if (f.length < 6 || !"TRUE".equalsIgnoreCase(f[5]) || !RELEASED.equals(f[4])) continue;
            found = f[3]; // a ultima liberada fica por ultimo
            job.objectType = f[0];
            job.objectName = f[1];
            job.objectRevision = f[2];
        }
        if (found == null) {
            rep.fail("Desenho " + name + " sem revisão LIBERADA");
            return false;
        }
        job.objectId = found;
        return true;
    }

    /** Resultado de um desenho. */
    static final class Result {
        String label = "";
        String status = "";     // IGNORADO | COMPLETO | VINCULADO | SIMULADO | FALHA
        int configsLigadas;
        int faltando;
        int criados;
        int falhas;

        @Override
        public String toString() {
            return label + " → " + status + " (configurações já ligadas: " + configsLigadas + ", faltando: " + faltando
                    + ", criados: " + criados + ", falhas: " + falhas + ")";
        }
    }

    /** Liga o desenho as configuracoes que faltam; cada vinculo (ou o que seria criado, na simulacao) vira item. */
    static Result processDrawing(Context ctx, String drawingId, Report rep, PluginConfig.Settings cfg, boolean waitRelease)
            throws Exception {
        Result r = new Result();
        boolean sim = cfg.simulate();
        // ordem: isDrawing | current | name | revision | physicalid | titulo
        String[] o = Core.split(Mx.mql(ctx, "print bus $1 select $2 $3 $4 $5 $6 $7 dump $8", drawingId,
                "type.kindof[Drawing]", "current", "name", "revision", "physicalid", "attribute[PLMEntity.V_Name]", Core.SEP), 6);
        if (o.length < 6 || !"TRUE".equalsIgnoreCase(o[0])) {
            r.status = "IGNORADO (não é desenho)";
            return r;
        }
        r.label = o[2] + " " + o[3] + " '" + o[5] + "'";
        String current = o[1];
        if (waitRelease && !RELEASED.equals(current)) {
            current = Mx.waitState(ctx, drawingId, RELEASED, cfg.integer("esperaLiberacaoSeg", 120) * 1000L);
        }
        if (!RELEASED.equals(current)) {
            r.status = "IGNORADO (estado " + current + ")";
            return r;
        }
        String drawingPid = o[4];

        // vinculos atuais: nivel|rel|direcao|tipo|nome|rev| id | isRef | linkType | origem
        Set<String> linked = new HashSet<>();
        List<String> configIds = new ArrayList<>();
        String origin = null;
        for (String line : Core.lines(Mx.mql(ctx, "expand bus $1 from relationship $2 select bus $3 $4 select rel $5 $6 dump $7",
                drawingId, DEP_REL, "id", "type.kindof[VPMReference]", "attribute[V_CADLinkType]", "attribute[V_CADOrigin]",
                Core.SEP))) {
            String[] f = Core.split(line, 10);
            if (f.length < 10) continue;
            linked.add(f[6]);
            if ("TRUE".equalsIgnoreCase(f[7]) && LINK_TYPE.equals(f[8])) {
                configIds.add(f[6]);
                if (origin == null && !f[9].isEmpty()) origin = f[9];
            }
        }
        r.configsLigadas = configIds.size();
        if (configIds.isEmpty()) {
            r.status = "IGNORADO (sem configuração ligada)";
            return r;
        }
        if (!"SOLIDWORKS".equalsIgnoreCase(origin)) {
            r.status = "IGNORADO (origem " + origin + ")";
            return r;
        }

        // configuracoes irmas: configuracao <-XCADItem- modelo -XCADItem-> todas as configuracoes
        Map<String, String[]> missing = new LinkedHashMap<>();
        Set<String> families = new HashSet<>();
        for (String c : configIds) {
            for (String line : Core.lines(Mx.mql(ctx, "expand bus $1 to relationship $2 select bus $3 dump $4", c, ITEM_REL,
                    "id", Core.SEP))) {
                String[] f = Core.split(line, 7);
                if (f.length >= 7 && !f[6].isEmpty()) families.add(f[6]);
            }
        }
        for (String famId : families) {
            for (String line : Core.lines(Mx.mql(ctx, "expand bus $1 from relationship $2 select bus $3 $4 $5 dump $6", famId,
                    ITEM_REL, "id", "physicalid", "attribute[PLMEntity.V_Name]", Core.SEP))) {
                String[] f = Core.split(line, 9); // nivel|rel|dir|tipo|nome|rev| id | physicalid | titulo
                if (f.length < 9 || linked.contains(f[6])) continue;
                missing.put(f[6], new String[] {f[7], f[3], f[4], f[5], f[8]});
            }
        }
        r.faltando = missing.size();
        if (missing.isEmpty()) {
            r.status = "COMPLETO";
            return r;
        }
        int max = cfg.integer("maxVinculosPorDesenho", 200);
        if (missing.size() > max) {
            r.status = "IGNORADO (" + missing.size() + " configurações, acima do limite " + max + ")";
            rep.warn(r.label + ": " + r.status);
            return r;
        }

        List<String> created = new ArrayList<>();
        for (String[] m : missing.values()) { // physicalid | tipo | nome | rev | titulo
            if (sim) {
                rep.item("seria_vinculo_criado", true).target(m[0], m[1], m[2], m[3], m[4]).change(null, r.label).add();
                continue;
            }
            try {
                createLink(ctx, drawingPid, m[0], origin);
                r.criados++;
                created.add(m[2] + " '" + m[4] + "'");
                rep.item("vinculo_criado", true).target(m[0], m[1], m[2], m[3], m[4]).change(null, r.label).add();
            } catch (Exception ex) {
                // o servico da Dassault as vezes acusa erro depois de ja ter criado o vinculo: confere antes de contar falha
                Thread.sleep(2_000);
                if (linkExists(ctx, drawingId, m[0])) {
                    r.criados++;
                    created.add(m[2] + " '" + m[4] + "'");
                    rep.item("vinculo_criado", true).target(m[0], m[1], m[2], m[3], m[4]).change(null, r.label)
                            .message("Erro acusado pelo serviço, mas o vínculo foi criado (conferido): "
                                    + Core.rootMessage(ex)).add();
                } else {
                    r.falhas++;
                    rep.item("vinculo_criado", false).target(m[0], m[1], m[2], m[3], m[4]).change(null, r.label)
                            .message(Core.rootMessage(ex)).add();
                }
            }
        }
        if (sim) {
            r.status = "SIMULADO";
        } else {
            r.status = r.falhas == 0 ? "VINCULADO" : (r.criados > 0 ? "VINCULADO COM FALHAS" : "FALHA");
            if (!created.isEmpty()) {
                Mx.addHistory(ctx, drawingId, HISTORY_EVENT, "Vinculo automatico com as configuracoes da mesma peca: "
                        + String.join("; ", created) + " em " + LocalDateTime.now().format(WHEN) + ".");
            }
        }
        return r;
    }

    /** Cria o vinculo pelo servico da Dassault (o mesmo do conector), registrando o contexto ENOX que ele espera. */
    static void createLink(Context ctx, String drawingPid, String configPid, String origin) throws Exception {
        JsonObject in = Json.createObjectBuilder()
                .add("pointingid", drawingPid)
                .add("pointedid", configPid)
                .add("cadlinktype", LINK_TYPE)
                .add("cadorigin", origin)
                .build();
        ENOXContext xctx = new ENOXERContext(ctx, "dsxcad", 1);
        ENOXContextManager.getContextManager().addContext(ctx, xctx);
        try {
            IdsxcadAuthoring svc = dsxcadFactory.getAuthoringServices(ctx);
            Response resp = svc.createDependencyLink(ctx, in);
            if (resp != null && resp.getStatus() >= 300) {
                throw new IllegalStateException("status " + resp.getStatus() + ": " + resp.getEntity());
            }
            if (ctx.isTransactionActive()) ctx.commit();
        } catch (Exception e) {
            if (ctx.isTransactionActive()) ctx.abort();
            throw e;
        } finally {
            ENOXContextManager.removeContext(xctx);
        }
    }

    /** Varre os desenhos liberados. So os que tinham configuracao faltando viram item. */
    static void scanAll(Context ctx, Job job, Report rep, PluginConfig.Settings cfg) throws Exception {
        int limit = job.params.getInt("limite", 0);
        String[] lines = Core.lines(Mx.mql(ctx, "temp query bus $1 $2 $3 where $4 select $5 dump $6", "Drawing", "*", "*",
                "current==RELEASED", "id", Core.SEP));
        int total = 0, completos = 0, ignorados = 0, comFalta = 0, erros = 0;
        rep.info("Varredura iniciada: " + lines.length + " desenho(s) liberado(s)" + (limit > 0 ? ", limite " + limit : ""));
        for (String line : lines) {
            if (limit > 0 && total >= limit) break;
            String[] f = Core.split(line, 4); // tipo|nome|rev|id
            if (f.length < 4) continue;
            total++;
            try {
                Result r = processDrawing(ctx, f[3], rep, cfg, false);
                if (r.status.startsWith("COMPLETO")) completos++;
                else if (r.status.startsWith("IGNORADO")) ignorados++;
                else comFalta++;
            } catch (Exception e) {
                erros++;
                rep.count(false);
                rep.warn("Erro no desenho " + f[1] + " " + f[2] + ": " + Core.rootMessage(e));
            }
            if (total % 200 == 0) rep.touch();
        }
        rep.total(total);
        rep.summary("Varredura: " + total + " desenho(s) verificado(s), " + completos + " completo(s), " + ignorados
                + " ignorado(s), " + comFalta + " com configuração faltando, " + erros + " erro(s)");
    }

    /** O desenho ja esta ligado a esta configuracao (physicalid)? */
    private static boolean linkExists(Context ctx, String drawingId, String configPid) {
        try {
            for (String line : Core.lines(Mx.mql(ctx, "expand bus $1 from relationship $2 select bus $3 dump $4", drawingId,
                    DEP_REL, "physicalid", Core.SEP))) {
                String[] f = Core.split(line, 7);
                if (f.length >= 7 && configPid.equals(f[6])) return true;
            }
        } catch (Exception ignore) {
            // na duvida, conta como falha
        }
        return false;
    }
}
