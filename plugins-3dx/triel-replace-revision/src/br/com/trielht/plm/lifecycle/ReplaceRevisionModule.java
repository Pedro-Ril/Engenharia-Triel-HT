package br.com.trielht.plm.lifecycle;

import br.com.trielht.plm.core.Core;
import br.com.trielht.plm.core.Job;
import br.com.trielht.plm.core.JobQueue;
import br.com.trielht.plm.core.Mx;
import br.com.trielht.plm.core.PluginConfig;
import br.com.trielht.plm.core.PluginModule;
import br.com.trielht.plm.core.Release;
import br.com.trielht.plm.core.Report;

import com.dassault_systemes.lifecycle.itf.CompletionData;
import com.dassault_systemes.lifecycle.itf.CompletionObject;
import com.dassault_systemes.platform.model.Oxid;
import com.dassault_systemes.platform.model.itf.IConnectionAuthoringServices;
import com.dassault_systemes.platform.model.itf.nav.INavBusConnection;
import com.dassault_systemes.platform.model.itf.nav.INavBusObject;
import com.dassault_systemes.platform.model.itf.nav.INavBusProvider;
import com.dassault_systemes.platform.model.itf.nav.NavBusConnectionReplaceWrapperInfo;
import com.dassault_systemes.platform.model.services.AuthoringServicesProvider;
import com.dassault_systemes.platform.model.services.IdentificationServicesProvider;
import com.dassault_systemes.platform.model.services.NavigationServicesProvider;
import com.matrixone.apps.domain.util.ContextUtil;

import jakarta.json.Json;

import matrix.db.Context;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Hashtable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * Atualizacao automatica de revisao nos conjuntos LIBERADOS (plugin "replace-revision").
 *
 * Na liberacao (Change Status -> RELEASED) da ultima revisao de um Physical Product, um trabalho entra na fila e a
 * liberacao do usuario termina na hora. Na fila:
 *  1. espera a liberacao ser gravada (RELEASED); se nao for, o trabalho e ignorado;
 *  2. acha as instancias (VPMInstance) de revisoes ANTERIORES dentro de pais RELEASED (um expand por revisao);
 *  3. por pai, troca todas as instancias de uma vez (replace em lote da Dassault, transacao propria); se o lote
 *     falhar, tenta uma a uma; grava no historico do pai "Update Revisions";
 *  4. revisoes anteriores RELEASED viram OBSOLETE (servico de maturidade da propria tela, com os objetos de CAD).
 * Pais em outros estados nao sao tocados (aparecem no registro como "pai_nao_liberado").
 * O conjunto pai NAO ganha revisao. Repetivel: rodar de novo so trata o que faltou.
 *
 * Parametros (Portal): maxInstancias, esperaLiberacaoSeg, obsoletarAnteriores, papel (so para acao manual).
 * Acao manual no Portal: parametros {"nome": "<nome da peca>"} -- usa a ultima revisao, que deve estar RELEASED.
 */
public class ReplaceRevisionModule implements PluginModule {

    public static final String KEY = "replace-revision";
    public static final String VERSION = "7.2.0";

    private static final String CHANGE_STATUS = "Change Status";
    private static final String RELEASED = "RELEASED";
    private static final String OBSOLETE = "OBSOLETE";
    private static final String INSTANCE_REL = "VPMInstance";
    private static final String HISTORY_EVENT = "Update Revisions";
    private static final String MATURITY_CLASS = "com.dassault_systemes.rest.service.lifecycle.MaturityResource";
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    /** Uma instancia a substituir. */
    private static final class Target {
        String instancePid;
        String oldRev;
    }

    /** Um conjunto pai e as instancias dele a trocar. */
    private static final class Parent {
        String id;
        String pid;
        String type;
        String name;
        String revision;
        String title;
        String owner;
        final List<Target> targets = new ArrayList<>();
        final TreeSet<String> oldRevs = new TreeSet<>();

        String label() {
            return name + " " + revision + " '" + title + "'";
        }
    }

    @Override
    public String key() {
        return KEY;
    }

    @Override
    public String version() {
        return VERSION;
    }

    /** Partes internas da Dassault que este plugin usa (autoteste na subida; ver PluginModule.requires). */
    @Override
    public List<String> requires() {
        return List.of(
                MATURITY_CLASS + "#maturityChange_internal",
                "com.dassault_systemes.lifecycle.itf.CompletionData",
                "com.dassault_systemes.platform.model.services.AuthoringServicesProvider#getConnectionAuthoringServices",
                "com.dassault_systemes.platform.model.itf.IConnectionAuthoringServices#replace",
                "com.dassault_systemes.platform.model.services.NavigationServicesProvider#getNavBusProvider",
                "com.dassault_systemes.platform.model.itf.nav.INavBusProvider#createNavBusConnection",
                "com.dassault_systemes.platform.model.itf.nav.INavBusProvider#createNavBusObject",
                "com.dassault_systemes.platform.model.itf.nav.NavBusConnectionReplaceWrapperInfo",
                "com.dassault_systemes.platform.model.services.IdentificationServicesProvider#getOxidService");
    }

    /** O mais novo primeiro. Toda mudanca neste jar sobe VERSION e ganha uma linha aqui. */
    @Override
    public List<Release> releases() {
        return List.of(
                Release.of("7.2.0", "2026-11-24", "Espera da liberação sem prender a fila (núcleo 1.4.0) e prazo padrão de "
                        + "30 s; liberação que não se concretiza fica registrada como barrada por regra do 3DX ou cancelada."),
                Release.of("7.1.0", "2026-11-23", "Autoteste: declara as partes internas da Dassault que usa, conferidas na subida (aviso no Portal se um hotfix tirar alguma)."),
                Release.of("7.0.2", "2026-11-23", "Notas de versão gravadas no Portal."),
                Release.of("7.0.1", "2026-11-23", "Textos gravados no Portal com acentuação."),
                Release.of("7.0.0", "2026-11-22", "Passa a ser módulo do núcleo comum: fila persistente (retoma após "
                        + "reinício, sem trabalho repetido), grava quem liberou, um expand por revisão em vez de uma "
                        + "consulta por instância, cada conjunto atualizado e cada revisão obsoletada registrados no "
                        + "Portal (base dos avisos por e-mail); sem o código de diagnóstico."),
                Release.of("6", "2026-11-15", "Revisões anteriores liberadas viram OBSOLETAS pelo serviço de maturidade "
                        + "da própria tela (inclui os objetos de CAD)."),
                Release.of("5", "2026-11-15", "Troca em lote por conjunto, com alternativa uma a uma se o lote falhar."),
                Release.of("1", "2026-11-15", "Ao liberar a revisão nova de uma peça, os conjuntos LIBERADOS passam a usar "
                        + "a revisão nova, em segundo plano, com comentário no histórico do conjunto."));
    }

    // ------------------------------------------------------------------ liberacao (thread do usuario)

    @Override
    public void onPostprocess(Context context, String command, CompletionObject completion, PluginConfig.Settings cfg)
            throws Exception {
        if (!CHANGE_STATUS.equals(command)) return;
        Hashtable<String, CompletionData> table = completion.getCompletionTable();
        if (table == null || table.isEmpty()) return;
        String role = context.getRole(); // o segundo plano usa o contexto de seguranca de quem liberou
        String user = context.getUser();
        for (Map.Entry<String, CompletionData> entry : table.entrySet()) {
            String pid = entry.getKey();
            CompletionData d = entry.getValue();
            if (d == null || !d.getValidForCommand()) continue;
            String toState = d.getObjectValue("tostate");
            if (toState != null && !RELEASED.equals(toState)) continue;
            // ordem: isProduct | type | name | revision | id | last.id | titulo
            String[] o = Core.split(Mx.mql(context, "print bus $1 select $2 $3 $4 $5 $6 $7 $8 dump $9", pid,
                    "type.kindof[VPMReference]", "type", "name", "revision", "id", "last.id", "attribute[PLMEntity.V_Name]",
                    Core.SEP), 7);
            if (o.length < 7 || !"TRUE".equalsIgnoreCase(o[0])) continue;
            if (!o[4].equals(o[5])) continue; // nao e a ultima revisao
            if (Core.lines(Mx.mql(context, "temp query bus $1 $2 $3 select $4 dump $5", o[1], o[2], "*", "id",
                    Core.SEP)).length <= 1) continue; // primeira revisao: nada a trocar
            Job job = Job.of(KEY, "liberacao", cfg.mode).object(pid, o[4], o[1], o[2], o[3], o[6]);
            job.actorLogin = user;
            job.dedupKey = "rev:" + o[4];
            job.delaySeconds = 5;
            job.params = Json.createObjectBuilder().add("papel", role == null ? "" : role).build();
            JobQueue.submit(job);
        }
    }

    // ------------------------------------------------------------------ trabalho (fila)

    @Override
    public void run(Job job, Report rep, PluginConfig.Settings cfg) throws Exception {
        String role = job.param("papel", "");
        if (role.isBlank()) role = cfg.text("papel", "ctx::VPLMAdmin.Company Name.Default");
        Mx.asSystem(role, ctx -> process(ctx, job, rep, cfg));
    }

    private void process(Context ctx, Job job, Report rep, PluginConfig.Settings cfg) throws Exception {
        boolean sim = cfg.simulate();
        if (job.objectId == null && !resolveByName(ctx, job, rep)) return;

        String cur = Mx.awaitState(ctx, rep, job.objectId, RELEASED, cfg.integer("esperaLiberacaoSeg", 30));
        if (cur == null) return; // ainda nao gravou: volta para a fila e confere de novo
        if (!RELEASED.equals(cur)) {
            rep.ignore(job.label() + " não ficou RELEASED em " + Mx.waitedSeconds(job) + " s (estado " + cur
                    + "): liberação barrada por regra do 3DX ou cancelada");
            return;
        }
        Map<String, Parent> parents = new LinkedHashMap<>();
        int notReleased = findTargets(ctx, job, rep, parents);
        int total = parents.values().stream().mapToInt(p -> p.targets.size()).sum();
        int max = cfg.integer("maxInstancias", 5000);
        if (total > max) {
            rep.fail(total + " instâncias, acima do limite de " + max + ". Nada foi substituído nem obsoletado.");
            return;
        }
        String when = LocalDateTime.now().format(WHEN);
        int replaced = 0, parentsOk = 0;
        if (!parents.isEmpty()) {
            if (sim) {
                for (Parent p : parents.values()) {
                    rep.item("seria_instancia_substituida", true).target(p.pid, p.type, p.name, p.revision, p.title)
                            .state(RELEASED, p.owner).change(revs(p) + " (" + p.targets.size() + " instância(s))",
                                    job.objectRevision).add();
                }
            } else {
                IConnectionAuthoringServices authoring = AuthoringServicesProvider.getConnectionAuthoringServices();
                INavBusProvider nav = NavigationServicesProvider.getNavBusProvider();
                INavBusObject newRef = nav.createNavBusObject(ctx, oxid(ctx, job.objectPid));
                for (Parent p : parents.values()) {
                    int done;
                    String note = null;
                    try {
                        done = replaceBatch(ctx, authoring, nav, newRef, p.targets);
                    } catch (Exception batchError) {
                        note = "Lote falhou (" + Core.rootMessage(batchError) + "); trocadas uma a uma";
                        done = replaceOneByOne(ctx, authoring, nav, newRef, p.targets, rep, p);
                    }
                    replaced += done;
                    if (done > 0) {
                        parentsOk++;
                        Mx.addHistory(ctx, p.id, HISTORY_EVENT, "Revisao atualizada automaticamente: " + job.objectName
                                + " " + String.join(", ", p.oldRevs) + " -> " + job.objectRevision + " (" + done
                                + " instancia" + (done > 1 ? "s" : "") + ") na liberacao de " + when + ".");
                    }
                    boolean all = done == p.targets.size();
                    rep.item("instancia_substituida", all).target(p.pid, p.type, p.name, p.revision, p.title)
                            .state(RELEASED, p.owner).change(revs(p) + " (" + p.targets.size() + " instância(s))",
                                    job.objectRevision + " (" + done + " trocada(s))")
                            .message(all ? note : (p.targets.size() - done) + " instância(s) não trocada(s)"
                                    + (note == null ? "" : "; " + note)).add();
                }
            }
        }
        int obsoleted = cfg.flag("obsoletarAnteriores", true) ? obsoletePrevious(ctx, job, rep, sim, when) : 0;
        rep.summary(sim
                ? "Simulação: " + parents.size() + " conjunto(s) liberado(s) seriam atualizados (" + total
                        + " instância(s)); " + obsoleted + " revisão(ões) seriam obsoletadas; " + notReleased
                        + " instância(s) em conjuntos não liberados ficam como estão"
                : replaced + " instância(s) trocada(s) em " + parentsOk + " conjunto(s); " + obsoleted
                        + " revisão(ões) obsoleta(s); " + notReleased + " instância(s) em conjuntos não liberados mantidas");
    }

    /** Acao manual: {"nome": ...} -> ultima revisao da peca. */
    private static boolean resolveByName(Context ctx, Job job, Report rep) throws Exception {
        String name = job.param("nome", job.objectName);
        if (name == null || name.isBlank()) {
            rep.fail("Informe o nome da peça");
            return false;
        }
        // ordem: type | name | revision | id | last.id | physicalid | isProduct | titulo
        for (String line : Core.lines(Mx.mql(ctx, "temp query bus $1 $2 $3 select $4 $5 $6 $7 $8 dump $9", "*",
                name.trim(), "*", "id", "last.id", "physicalid", "type.kindof[VPMReference]", "attribute[PLMEntity.V_Name]",
                Core.SEP))) {
            String[] f = Core.split(line, 8);
            if (f.length < 8 || !"TRUE".equalsIgnoreCase(f[6]) || !f[3].equals(f[4])) continue;
            job.objectType = f[0];
            job.objectName = f[1];
            job.objectRevision = f[2];
            job.objectId = f[3];
            job.objectPid = f[5];
            job.objectTitle = f[7];
            return true;
        }
        rep.fail("Peça " + name + " não encontrada (Physical Product)");
        return false;
    }

    private static String revs(Parent p) {
        return "rev " + String.join(", ", p.oldRevs);
    }

    /** Instancias de revisoes anteriores, agrupadas por pai RELEASED. Devolve quantas ficaram em pais nao liberados. */
    private static int findTargets(Context ctx, Job job, Report rep, Map<String, Parent> parents) throws Exception {
        int notReleased = 0;
        for (String line : Core.lines(Mx.mql(ctx, "temp query bus $1 $2 $3 select $4 dump $5", job.objectType,
                job.objectName, "*", "id", Core.SEP))) {
            String[] f = Core.split(line, 4); // type | name | revision | id
            if (f.length < 4 || f[3].equals(job.objectId)) continue;
            String oldId = f[3], oldRev = f[2];
            // pais: nivel|rel|dir|type|name|rev| id | physicalid | current | owner | titulo | (rel) physicalid
            String exp = Mx.mql(ctx, "expand bus $1 to relationship $2 select bus $3 $4 $5 $6 $7 select rel $8 dump $9",
                    oldId, INSTANCE_REL, "id", "physicalid", "current", "owner", "attribute[PLMEntity.V_Name]",
                    "physicalid", Core.SEP);
            for (String l : Core.lines(exp)) {
                String[] p = Core.split(l, 12);
                if (p.length < 12 || p[11].isEmpty()) continue;
                if (!RELEASED.equals(p[8])) {
                    notReleased++;
                    rep.item("pai_nao_liberado", true).target(p[7], p[3], p[4], p[5], p[10]).state(p[8], p[9])
                            .change("rev " + oldRev, null).message("Conjunto não liberado: continua usando a rev "
                                    + oldRev).add();
                    continue;
                }
                Parent parent = parents.computeIfAbsent(p[6], k -> {
                    Parent n = new Parent();
                    n.id = p[6];
                    n.pid = p[7];
                    n.type = p[3];
                    n.name = p[4];
                    n.revision = p[5];
                    n.owner = p[9];
                    n.title = p[10];
                    return n;
                });
                Target t = new Target();
                t.instancePid = p[11];
                t.oldRev = oldRev;
                parent.targets.add(t);
                parent.oldRevs.add(oldRev);
            }
        }
        return notReleased;
    }

    /** Troca todas as instancias de um pai numa unica chamada e numa unica transacao. */
    private static int replaceBatch(Context ctx, IConnectionAuthoringServices authoring, INavBusProvider nav,
                                    INavBusObject newRef, List<Target> list) throws Exception {
        boolean ownTx = false;
        try {
            if (!ctx.isTransactionActive()) {
                ContextUtil.startTransaction(ctx, true);
                ownTx = true;
            }
            List<NavBusConnectionReplaceWrapperInfo> ops = new ArrayList<>();
            for (Target t : list) {
                INavBusConnection oldInst = nav.createNavBusConnection(ctx, oxid(ctx, t.instancePid));
                ops.add(new NavBusConnectionReplaceWrapperInfo(newRef, oldInst, null, null, null, null));
            }
            List<INavBusConnection> res = authoring.replace(ctx, ops, null);
            if (ownTx) ContextUtil.commitTransaction(ctx);
            return res == null ? list.size() : res.size();
        } catch (Exception e) {
            if (ownTx) ContextUtil.abortTransaction(ctx);
            throw e;
        }
    }

    /** Alternativa ao lote: uma instancia por vez, cada uma na sua transacao. */
    private static int replaceOneByOne(Context ctx, IConnectionAuthoringServices authoring, INavBusProvider nav,
                                       INavBusObject newRef, List<Target> list, Report rep, Parent p) {
        int ok = 0;
        for (Target t : list) {
            boolean ownTx = false;
            try {
                if (!ctx.isTransactionActive()) {
                    ContextUtil.startTransaction(ctx, true);
                    ownTx = true;
                }
                INavBusConnection oldInst = nav.createNavBusConnection(ctx, oxid(ctx, t.instancePid));
                authoring.replace(ctx, newRef, null, oldInst, null, null, null);
                if (ownTx) ContextUtil.commitTransaction(ctx);
                ok++;
            } catch (Exception e) {
                if (ownTx) {
                    try {
                        ContextUtil.abortTransaction(ctx);
                    } catch (Exception ignore) {
                        // nada
                    }
                }
                rep.warn("Instância " + t.instancePid + " (rev " + t.oldRev + ") no conjunto " + p.label() + " não trocada: "
                        + Core.rootMessage(e));
            }
        }
        return ok;
    }

    // ------------------------------------------------------------------ obsolescencia

    /**
     * Revisoes anteriores da familia que estao RELEASED viram OBSOLETE, pelo mesmo servico de maturidade da tela
     * (inclui os objetos de CAD associados). Cada revisao e tratada isoladamente.
     */
    private static int obsoletePrevious(Context ctx, Job job, Report rep, boolean sim, String when) throws Exception {
        int count = 0;
        // ordem: type | name | revision | id | physicalid | current | titulo
        for (String line : Core.lines(Mx.mql(ctx, "temp query bus $1 $2 $3 select $4 $5 $6 $7 dump $8", job.objectType,
                job.objectName, "*", "id", "physicalid", "current", "attribute[PLMEntity.V_Name]", Core.SEP))) {
            String[] f = Core.split(line, 7);
            if (f.length < 7 || f[3].equals(job.objectId) || !RELEASED.equals(f[5])) continue;
            if (sim) {
                count++;
                rep.item("seria_revisao_obsoleta", true).target(f[4], f[0], f[1], f[2], f[6]).state(RELEASED, null)
                        .change(RELEASED, OBSOLETE).add();
                continue;
            }
            String state;
            String error = null;
            try {
                state = changeMaturity(ctx, f[3], f[4], OBSOLETE);
            } catch (Exception e) {
                state = null;
                error = Core.rootMessage(e);
            }
            boolean ok = OBSOLETE.equals(state);
            if (ok) {
                count++;
                Mx.addHistory(ctx, f[3], HISTORY_EVENT, "Obsoleta automaticamente pela liberacao de " + job.objectName
                        + " " + job.objectRevision + " em " + when + ".");
            }
            rep.item("revisao_obsoleta", ok).target(f[4], f[0], f[1], f[2], f[6]).state(ok ? OBSOLETE : state, null)
                    .change(RELEASED, OBSOLETE).message(ok ? null : error != null ? error : "Ficou no estado " + state).add();
        }
        return count;
    }

    /**
     * Ponto mais sensivel a atualizacoes da Dassault: chama o servico interno de maturidade da tela
     * (MaturityResource.maturityChange_internal) por reflexao. Devolve o estado do objeto depois da chamada.
     */
    static String changeMaturity(Context ctx, String id, String pid, String toState) throws Exception {
        Object maturity = Class.forName(MATURITY_CLASS).getDeclaredConstructor().newInstance();
        java.lang.reflect.Method change = maturity.getClass().getMethod("maturityChange_internal", Context.class,
                String.class);
        String json = "{\"data\":[{\"physicalid\":\"" + pid + "\",\"tostate\":\"" + toState + "\"}]}";
        boolean hadTx = ctx.isTransactionActive();
        try {
            change.invoke(maturity, ctx, json);
            if (!hadTx && ctx.isTransactionActive()) ContextUtil.commitTransaction(ctx);
        } catch (java.lang.reflect.InvocationTargetException ite) {
            if (ctx.isTransactionActive()) ContextUtil.abortTransaction(ctx);
            throw ite.getCause() instanceof Exception e ? e : ite;
        }
        return Mx.mql(ctx, "print bus $1 select $2 dump", id, "current").trim();
    }

    private static Oxid oxid(Context ctx, String pid) throws Exception {
        return IdentificationServicesProvider.getOxidService().getOxidFromPid(ctx, pid);
    }
}
