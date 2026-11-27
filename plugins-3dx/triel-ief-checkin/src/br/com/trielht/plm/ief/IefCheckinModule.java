package br.com.trielht.plm.ief;

import br.com.trielht.plm.core.Core;
import br.com.trielht.plm.core.IefCheckinEvents;
import br.com.trielht.plm.core.Job;
import br.com.trielht.plm.core.JobQueue;
import br.com.trielht.plm.core.PluginConfig;
import br.com.trielht.plm.core.PluginModule;
import br.com.trielht.plm.core.Release;
import br.com.trielht.plm.core.Report;

import jakarta.json.Json;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Correcao do salvamento pelo conector CAD (plugin "ief-checkin"). O trabalho e da classe da Dassault corrigida e do
 * IefCheckinGuard, que ficam em WEB-INF/classes (ver IefCheckinGuard). Este modulo os coloca no nucleo:
 *  - passa o modo do Portal para o IefCheckinGuard (a cada 15 s, sem reiniciar);
 *  - registra um resumo periodico (salvamentos, timers encerrados/deixados vivos, cancelamentos);
 *  - salvamento que termina com erro no servidor vira execucao em falha (gatilho "salvamento");
 *  - autoteste: a classe corrigida esta carregada e o ENOIEFCmdHandlers.jar e o mesmo de onde ela foi gerada
 *    (um hotfix que troque o jar deixaria a nossa classe por cima da nova: o Portal avisa).
 *
 * Parametros (Portal): resumoMinutos, registrarFalhas, maxFalhasPorHora.
 */
public class IefCheckinModule implements PluginModule, GuardLink.Callback {

    public static final String KEY = "ief-checkin";
    public static final String VERSION = "1.3.1";

    /** md5 do ENOIEFCmdHandlers.jar de onde a classe corrigida foi gerada (R2026x, o mesmo nos dois nos e no dev). */
    static final String DASSAULT_JAR_MD5 = "fbbe7b2db855725c5f6275f92c80738d";
    static final String HANDLER = "com.dassault_systems.MCADIntegration.server.handler.ENOIEFCheckinHandler";
    /** Outra classe do mesmo jar (a CheckinHandler e lida de WEB-INF/classes, nao do jar). */
    static final String SAME_JAR = "com.dassault_systems.MCADIntegration.server.handler.ENOIEFCommitHandler";
    /** (1.3) md5 do ENOIEFCmdManagers.jar de onde a verificacao de cliente corrigida foi gerada (dev e os 2 nos). */
    static final String DASSAULT_MANAGERS_JAR_MD5 = "deee7b923cc46f29fe50765addb2f384";
    static final String VERIFIER_OUTER = "com.dassault_systems.MCADIntegration.server.manager.ENOIEFClientExistanceVerifier";
    static final String VERIFIER = VERIFIER_OUTER + "$ENOIEFExistanceVerifier";

    private ScheduledExecutorService scheduler;
    private volatile PluginConfig.Mode appliedMode;
    private volatile boolean guardMissingLogged;
    private long[] lastCounters = new long[N_COUNTERS];
    /** Contadores do IefCheckinGuard 1.3 (a 1.0 devolve 7, a 1.1 9 e a 1.2 11: o que faltar conta como 0). */
    private static final int N_COUNTERS = 13;
    private long lastSummaryAt = System.currentTimeMillis();
    private long failureWindowStart;
    private int failuresInWindow;
    private int failuresSuppressed;

    @Override
    public String key() {
        return KEY;
    }

    @Override
    public String version() {
        return VERSION;
    }

    @Override
    public List<Release> releases() {
        return List.of(
                Release.of("1.3.1", "2026-11-26", "Verificação de cliente antiga reconhecida também quando a sessão está "
                        + "sem verificação atual (a Dassault remove a atual no fim de cada salvamento normal): era o caso "
                        + "típico depois de um cancelamento seguido de outro salvamento."),
                Release.of("1.3.0", "2026-11-26", "Verificação de cliente antiga corrigida: a Dassault cria uma "
                        + "verificação \"o SOLIDWORKS ainda existe?\" por operação e não encerra a de um salvamento "
                        + "cancelado; cerca de 60 s depois ela abortava o salvamento em andamento (caixa de erro em "
                        + "branco), limpava a sessão e reativava timers órfãos. Em Ativo, a verificação que já foi "
                        + "substituída por outra operação se encerra sem agir; em Simulação, cada vez que ela age vira "
                        + "registro no Portal."),
                Release.of("1.2.0", "2026-11-26", "Ao entrar em Ativo, os timers que sobraram da Simulação (inclusive "
                        + "órfãos) são encerrados na hora, sem reiniciar. Em Ativo, o cancelamento de um salvamento "
                        + "desliga o timer dele, e não mais o de outro salvamento em andamento. O salvamento derrubado "
                        + "ou com erro passa a ter aviso próprio no Portal (resumo por e-mail), fora de \"Falha do plugin\"."),
                Release.of("1.1.0", "2026-11-26", "Timer órfão detectado: quando o timer de um salvamento cancelado "
                        + "desliga o de outro salvamento e continua vivo, ele passa a abortar os salvamentos seguintes "
                        + "do mesmo usuário (erro \"Map.get … null\"). Cada ação do órfão vira execução em falha com o "
                        + "usuário afetado, e o resumo conta órfãos nascidos e ações de órfão."),
                Release.of("1.0.0", "2026-11-26", "Correção do salvamento pelo conector CAD: cada salvamento deixava "
                        + "no servidor um timer que nunca parava, e o de um salvamento cancelado limpava a sessão do "
                        + "usuário, quebrando os salvamentos seguintes (erro \"null\" ao salvar). Em Ativo, o timer é "
                        + "encerrado no fim de cada salvamento; em Simulação, só conta. Salvamento com erro no servidor "
                        + "vira execução no Portal."));
    }

    @Override
    public List<String> requires() {
        List<String> r = new ArrayList<>(List.of(
                HANDLER + "#triel$execute",
                VERIFIER + "#triel$patched",
                "br.com.trielht.plm.ief.IefCheckinGuard#verifierTick",
                SAME_JAR,
                VERIFIER_OUTER + "#updateMCADBeanThread",
                "com.matrixone.MCADIntegration.server.beans.MCADIntegrationSessionData#getSessionObjectByKey"));
        String jar = jarProblem(SAME_JAR, "ENOIEFCmdHandlers.jar", DASSAULT_JAR_MD5);
        if (jar != null) r.add(jar);
        String mgr = jarProblem(VERIFIER_OUTER, "ENOIEFCmdManagers.jar", DASSAULT_MANAGERS_JAR_MD5);
        if (mgr != null) r.add(mgr);
        String nest = nestProblem();
        if (nest != null) r.add(nest);
        return r;
    }

    /** null = o jar da Dassault (de onde vem {@code cls}) e o mesmo de onde a classe corrigida foi gerada. */
    static String jarProblem(String cls, String jarName, String expected) {
        try {
            Class<?> c = Class.forName(cls, false, IefCheckinModule.class.getClassLoader());
            String md5 = Core.jarMd5(c);
            if (md5 == null) return jarName + " nao encontrado (md5 ilegivel)";
            if (!expected.equalsIgnoreCase(md5)) {
                return jarName + " mudou (md5 " + md5 + ", a correcao foi gerada do " + expected
                        + "): gerar a classe corrigida de novo no dev-plm ou remover de WEB-INF/classes";
            }
            return null;
        } catch (Throwable t) {
            return jarName + ": " + t;
        }
    }

    /**
     * A verificacao corrigida (WEB-INF/classes) le campos privados da externa (que fica no jar): so funciona se a
     * JVM aceitar as duas como do mesmo "nest" (mesmo carregador e pacote). null = ok.
     */
    static String nestProblem() {
        try {
            ClassLoader cl = IefCheckinModule.class.getClassLoader();
            Class<?> inner = Class.forName(VERIFIER, false, cl);
            Class<?> outer = Class.forName(VERIFIER_OUTER, false, cl);
            return inner.getNestHost() == outer ? null
                    : "verificacao corrigida fora do nest da ENOIEFClientExistanceVerifier (carregador diferente?)";
        } catch (Throwable t) {
            return "verificacao corrigida: " + t;
        }
    }

    // ------------------------------------------------------------------ ciclo de vida

    @Override
    public void start() {
        scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "triel-ief-checkin-plugin");
            t.setDaemon(true);
            return t;
        });
        scheduler.scheduleWithFixedDelay(this::tick, 5, 15, TimeUnit.SECONDS);
    }

    @Override
    public void stop() {
        if (scheduler != null) scheduler.shutdownNow();
        try {
            GuardLink.listen(null);
        } catch (LinkageError ignore) {
            // classe corrigida ausente
        }
    }

    /** Aplica o modo do Portal no IefCheckinGuard e, no intervalo configurado, registra o resumo. */
    private void tick() {
        try {
            PluginConfig.Settings cfg = PluginConfig.of(KEY);
            GuardLink.configure(cfg.off() ? 0 : cfg.simulate() ? 1 : 2);
            GuardLink.listen(this);
            if (appliedMode != cfg.mode) {
                if (appliedMode != null) {
                    IefCheckinEvents.event(KEY, "info", "Modo aplicado na correção do salvamento: " + cfg.mode, null);
                }
                Core.LOG.info("[TRIEL-{}] Modo aplicado na classe corrigida: {}", KEY, cfg.mode);
                appliedMode = cfg.mode;
            }
            if (cfg.mode == PluginConfig.Mode.ATIVO) closeLeftovers();
            summary(cfg);
        } catch (LinkageError e) {
            if (!guardMissingLogged) {
                guardMissingLogged = true;
                Core.LOG.warn("[TRIEL-{}] Classe corrigida ausente em WEB-INF/classes: o salvamento segue o "
                        + "original da Dassault ({})", KEY, e.toString());
            }
        } catch (RuntimeException e) {
            Core.LOG.warn("[TRIEL-{}] {}", KEY, e.getMessage(), e);
        }
    }

    /** Em Ativo, a cada 15 s: encerra as sobras da Simulacao (timers de salvamentos ja terminados, orfaos inclusive). */
    private void closeLeftovers() {
        int n;
        try {
            n = GuardLink.closeEnded();
        } catch (LinkageError e) {
            return; // classe corrigida 1.0/1.1: sem a funcao
        }
        if (n <= 0) return;
        String msg = n + " timer(s) de salvamentos já terminados (sobras da Simulação, inclusive órfãos) encerrado(s) "
                + "pela correção em Ativo: nenhum deles pode mais derrubar a sessão de um usuário.";
        IefCheckinEvents.event(KEY, "info", msg, null);
        Core.LOG.info("[TRIEL-{}] {}", KEY, msg);
    }

    private void summary(PluginConfig.Settings cfg) {
        long now = System.currentTimeMillis();
        int minutes = Math.max(5, Math.min(1440, cfg.integer("resumoMinutos", 60)));
        if (now - lastSummaryAt < minutes * 60_000L) return;
        long[] c = java.util.Arrays.copyOf(GuardLink.counters(), N_COUNTERS);
        long[] d = new long[c.length];
        for (int i = 0; i < c.length; i++) d[i] = i == 6 ? c[i] : c[i] - lastCounters[i];
        boolean changed = d[0] != 0 || d[2] != 0 || d[4] != 0 || d[7] != 0 || d[8] != 0 || d[9] != 0 || d[10] != 0
                || d[11] != 0 || d[12] != 0 || c[6] != lastCounters[6];
        lastCounters = c;
        lastSummaryAt = now;
        if (cfg.off() || !changed) return;

        long saves = d[0], errors = d[1], fixed = d[3], cancelled = d[4], leftAlive = d[5], live = c[6];
        long orphansBorn = d[7], orphanActs = d[8], leftovers = d[9], redirected = d[10];
        long staleSkipped = d[11], staleActed = d[12];
        StringBuilder msg = new StringBuilder("Últimos ").append(minutes).append(" min: ")
                .append(saves).append(" salvamento(s)");
        if (errors > 0) msg.append(", ").append(errors).append(" com erro");
        if (cfg.simulate()) {
            msg.append("; ").append(leftAlive).append(" timer(s) ficaram vivos (a correção encerraria)");
        } else {
            msg.append("; ").append(fixed).append(" timer(s) encerrado(s) pela correção");
        }
        if (cancelled > 0) msg.append("; ").append(cancelled).append(" cancelamento(s)");
        if (orphansBorn > 0 || orphanActs > 0) {
            msg.append("; órfãos: ").append(orphansBorn).append(" nascido(s), ").append(orphanActs)
                    .append(" ação(ões) derrubando sessão");
        }
        if (leftovers > 0) msg.append("; ").append(leftovers).append(" sobra(s) da Simulação encerrada(s)");
        if (redirected > 0) {
            msg.append("; ").append(redirected).append(" desligamento(s) trocado(s) da Dassault corrigido(s)");
        }
        if (staleActed > 0) {
            msg.append("; ").append(staleActed).append(" verificação(ões) de cliente antiga(s) agiram (derrubam a sessão)");
        }
        if (staleSkipped > 0) {
            msg.append("; ").append(staleSkipped).append(" verificação(ões) de cliente antiga(s) encerrada(s) pela correção");
        }
        msg.append(". Timers vivos agora: ").append(live).append('.');
        if (failuresSuppressed > 0) {
            msg.append(' ').append(failuresSuppressed).append(" erro(s) não registrado(s) (limite por hora).");
        }
        String detail = Json.createObjectBuilder()
                .add("modo", cfg.mode.name())
                .add("minutos", minutes)
                .add("salvamentos", saves)
                .add("comErro", errors)
                .add("timersCriados", d[2])
                .add("encerradosPelaCorrecao", fixed)
                .add("encerradosPelaDassault", cancelled)
                .add("deixadosVivos", leftAlive)
                .add("vivosAgora", live)
                .add("orfaosNascidos", orphansBorn)
                .add("acoesDeOrfao", orphanActs)
                .add("sobrasEncerradas", leftovers)
                .add("desligamentosCorrigidos", redirected)
                .add("verificacoesAntigasEncerradas", staleSkipped)
                .add("verificacoesAntigasQueAgiram", staleActed)
                .add("desdeASubida", Json.createObjectBuilder()
                        .add("salvamentos", c[0]).add("comErro", c[1]).add("timersCriados", c[2])
                        .add("encerradosPelaCorrecao", c[3]).add("encerradosPelaDassault", c[4])
                        .add("deixadosVivos", c[5]).add("orfaosNascidos", c[7]).add("acoesDeOrfao", c[8])
                        .add("sobrasEncerradas", c[9]).add("desligamentosCorrigidos", c[10])
                        .add("verificacoesAntigasEncerradas", c[11]).add("verificacoesAntigasQueAgiram", c[12]))
                .build().toString();
        IefCheckinEvents.event(KEY, errors > 0 || orphanActs > 0 || staleActed > 0 ? "aviso" : "info", msg.toString(),
                detail);
        Core.LOG.info("[TRIEL-{}] {}", KEY, msg);
        synchronized (this) {
            failuresSuppressed = 0;
        }
    }

    // ------------------------------------------------------------------ salvamento com erro

    /**
     * Timer de um salvamento cancelado desligou o timer de outro salvamento (thread do timer ou do salvamento: so
     * monta o registro). ORFAO_AGIU vira execucao em falha -- e o momento em que a sessao do usuario e derrubada;
     * ORFAO_NASCEU vira evento (o orfao so causa erro quando agir de novo).
     */
    @Override
    public void orphan(int kind, Object culprit, Object victim, long culpritAgeMillis) {
        PluginConfig.Settings cfg = PluginConfig.of(KEY);
        if (cfg.off()) return;
        String who = String.valueOf(user(culprit));
        String other = String.valueOf(user(victim));
        String age = seconds(culpritAgeMillis);
        if (kind == 3) {
            String msg = "Cancelamento de salvamento de " + who + ": a Dassault ia desligar o timer do salvamento em "
                    + "andamento de " + other + "; a correção desligou o do próprio salvamento cancelado.";
            IefCheckinEvents.event(KEY, "info", msg, null);
            Core.LOG.info("[TRIEL-{}] {}", KEY, msg);
            return;
        }
        if (kind != 2) {
            String msg = "Cancelamento de salvamento de " + who + " desligou o timer de outro salvamento (de " + other
                    + ") em vez do seu" + (cfg.simulate()
                    ? ": o timer do cancelado sobrevive como órfão (comportamento original)."
                    : ": a correção encerra o do cancelado no fim do salvamento.");
            IefCheckinEvents.event(KEY, cfg.simulate() ? "aviso" : "info", msg, null);
            Core.LOG.warn("[TRIEL-{}] {}", KEY, msg);
            return;
        }
        String summary = "Timer órfão de um salvamento cancelado de " + who + " (criado há " + age + ") detectou o "
                + "cancelamento de novo: limpou o cache da sessão, abortou o salvamento que estivesse em andamento e "
                + "desligou o timer do salvamento de " + other + ". Os salvamentos seguintes de " + who
                + " podem falhar com \"Map.get … null\" até fechar o SOLIDWORKS.";
        Core.LOG.warn("[TRIEL-{}] {}", KEY, summary);
        if (!cfg.flag("registrarFalhas", true)) return;
        if (!allowFailure(Math.max(1, cfg.integer("maxFalhasPorHora", 30)))) return;
        Job job = Job.of(KEY, "salvamento", cfg.mode);
        job.actorLogin = user(culprit);
        job.objectName = "Timer órfão (salvamento cancelado)";
        Report rep = JobQueue.startInline(job);
        rep.summary(summary);
        rep.fail("Timer órfão agiu (sessão de " + who + "; timer desligado: salvamento de " + other + "; idade do órfão: "
                + age + ", modo " + cfg.mode + ")" + (cfg.mode == PluginConfig.Mode.ATIVO
                ? ". Em Ativo não deveria haver órfão: timer anterior à correção ativa ou caso novo a analisar."
                : ". Em Ativo a correção encerra o timer no fim de cada salvamento."));
        JobQueue.recordFinished(rep);
    }

    /**
     * (1.3) Verificacao de cliente antiga (thread do java.util.Timer da Dassault: so monta o registro). Simulacao
     * (acting): ela vai abortar o salvamento em andamento e limpar a sessao agora -- execucao em falha, aviso
     * "salvamento_conector". Ativo: encerrada pela correcao -- evento.
     */
    @Override
    public void staleVerifier(Object tracked, boolean acting) {
        PluginConfig.Settings cfg = PluginConfig.of(KEY);
        if (cfg.off()) return;
        String who = String.valueOf(user(tracked));
        if (!acting) {
            String msg = "Verificação de cliente de uma operação já substituída (salvamento cancelado) de " + who
                    + " encerrada pela correção sem agir: ela abortaria o salvamento em andamento e limparia a sessão.";
            IefCheckinEvents.event(KEY, "info", msg, null);
            Core.LOG.info("[TRIEL-{}] {}", KEY, msg);
            return;
        }
        String summary = "Verificação de cliente de uma operação já substituída (salvamento cancelado) de " + who
                + " concluiu que o SOLIDWORKS sumiu: abortou o salvamento que estivesse em andamento (caixa de erro "
                + "em branco), limpou o cache da sessão e marcou a operação como cancelada, o que reativa timers órfãos.";
        Core.LOG.warn("[TRIEL-{}] {}", KEY, summary);
        if (!cfg.flag("registrarFalhas", true)) return;
        if (!allowFailure(Math.max(1, cfg.integer("maxFalhasPorHora", 30)))) return;
        Job job = Job.of(KEY, "salvamento", cfg.mode);
        job.actorLogin = user(tracked);
        job.objectName = "Verificação de cliente antiga (salvamento cancelado)";
        Report rep = JobQueue.startInline(job);
        rep.summary(summary);
        rep.fail("Verificação de cliente antiga agiu (sessão de " + who + ", modo " + cfg.mode
                + "). Em Ativo a correção encerra a verificação substituída sem agir.");
        JobQueue.recordFinished(rep);
    }

    /** Thread do salvamento: so monta o registro (a gravacao no banco e do nucleo, assincrona). */
    @Override
    public void failed(Object handler, Throwable error, long millis) {
        PluginConfig.Settings cfg = PluginConfig.of(KEY);
        if (cfg.off() || !cfg.flag("registrarFalhas", true)) return;
        if (!allowFailure(Math.max(1, cfg.integer("maxFalhasPorHora", 30)))) return;
        String user = user(handler);
        String root = Core.rootMessage(error);
        Core.LOG.warn("[TRIEL-{}] Salvamento de {} terminou com erro ({} ms): {}", KEY, user, millis, root);
        Job job = Job.of(KEY, "salvamento", cfg.mode);
        job.actorLogin = user;
        job.objectName = "Salvamento pelo conector";
        Report rep = JobQueue.startInline(job);
        rep.summary("Salvamento pelo conector terminou com erro no servidor"
                + (millis >= 0 ? " depois de " + seconds(millis) : "") + ": " + Core.cut(root, 600));
        rep.fail(describe(error));
        JobQueue.recordFinished(rep);
    }

    private synchronized boolean allowFailure(int maxPerHour) {
        long now = System.currentTimeMillis();
        if (now - failureWindowStart > 3_600_000L) {
            failureWindowStart = now;
            failuresInWindow = 0;
        }
        if (failuresInWindow >= maxPerHour) {
            failuresSuppressed++;
            return false;
        }
        failuresInWindow++;
        return true;
    }

    private static String seconds(long ms) {
        return ms < 1000 ? ms + " ms" : String.format(java.util.Locale.ROOT, "%.1f s", ms / 1000.0);
    }

    /** Login de quem salvou: campo context (matrix.db.Context) do handler da Dassault. */
    static String user(Object handler) {
        if (handler == null) return null;
        for (Class<?> k = handler.getClass(); k != null; k = k.getSuperclass()) {
            try {
                Field f = k.getDeclaredField("context");
                f.setAccessible(true);
                Object c = f.get(handler);
                return c instanceof matrix.db.Context ctx ? ctx.getUser() : null;
            } catch (NoSuchFieldException e) {
                // superclasse
            } catch (Exception | LinkageError e) {
                return null;
            }
        }
        return null;
    }

    /** Erro + causa raiz + as primeiras linhas da pilha da causa (o suficiente para achar no codigo da Dassault). */
    static String describe(Throwable e) {
        StringBuilder sb = new StringBuilder(String.valueOf(e));
        Throwable root = e;
        while (root.getCause() != null && root.getCause() != root) root = root.getCause();
        if (root != e) sb.append("\nCausa: ").append(root);
        StackTraceElement[] st = root.getStackTrace();
        for (int i = 0; i < Math.min(12, st.length); i++) sb.append("\n  at ").append(st[i]);
        return sb.toString();
    }
}
