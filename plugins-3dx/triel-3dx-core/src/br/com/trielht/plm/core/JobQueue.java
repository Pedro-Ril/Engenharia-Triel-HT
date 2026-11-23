package br.com.trielht.plm.core;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.LinkedBlockingDeque;
import java.util.concurrent.TimeUnit;

/**
 * Fila de trabalhos dos plugins, guardada em dbo.portal_3dx_plugins_execucoes (status 'pendente').
 *
 * - Sobrevive a reinicio do 3DSpace: o que estava pendente continua la; o que estava 'processando' num no que
 *   parou (sem contato ha mais de 10 min) volta para 'pendente' (ate 3 tentativas).
 * - Com dois nos, cada trabalho e pego por um so (UPDATE ... WITH (READPAST, UPDLOCK)).
 * - Um trabalho por vez por no: o 3DSpace nao fica disputando a mesma estrutura com ele mesmo.
 * - O mesmo trabalho nao entra duas vezes (chave_dedup unica entre pendente/processando).
 */
public final class JobQueue {

    private static final LinkedBlockingDeque<Job> LOCAL = new LinkedBlockingDeque<>();
    private static final Object SIGNAL = new Object();
    private static volatile Thread thread;
    private static volatile boolean running;
    private static long lastRecovery;

    private JobQueue() {
    }

    /** Novo trabalho (de qualquer thread, inclusive a do usuario): so registra e segue. */
    public static void submit(Job job) {
        Writer.enqueue(job);
        Core.LOG.info("[TRIEL-{}] Trabalho enfileirado ({}, {}): {}", job.plugin, job.trigger, job.mode, job.label());
    }

    /**
     * Trabalho feito na hora, na thread do usuario (ex.: titulo na duplicacao): abre o relatorio para preencher e
     * depois registrar com {@link #recordFinished(Report)} -- a gravacao no banco e assincrona.
     */
    public static Report startInline(Job job) {
        job.local = true; // nao passou pela fila: entra no banco ja concluido
        return new Report(job);
    }

    public static void recordFinished(Report rep) {
        Writer.finish(rep);
    }

    /** Banco fora do ar: o trabalho roda neste no, sem passar pela fila do banco. */
    static void runLocal(Job job) {
        job.local = true;
        LOCAL.offer(job);
        wakeUp();
    }

    static void wakeUp() {
        synchronized (SIGNAL) {
            SIGNAL.notifyAll();
        }
    }

    static int localSize() {
        return LOCAL.size();
    }

    // ------------------------------------------------------------------ thread

    static synchronized void start() {
        if (running) return;
        running = true;
        thread = new Thread(JobQueue::loop, "triel-3dx-fila");
        thread.setDaemon(true);
        thread.start();
    }

    static synchronized void stop() {
        running = false;
        if (thread != null) thread.interrupt();
    }

    private static void loop() {
        recoverOrphans(true);
        while (running) {
            try {
                Job job = LOCAL.poll();
                if (job == null && Db.configured() && !Db.recentlyFailed()) {
                    if (System.currentTimeMillis() - lastRecovery > 120_000) recoverOrphans(false);
                    job = claimNext();
                }
                if (job == null) {
                    synchronized (SIGNAL) {
                        SIGNAL.wait(5_000);
                    }
                    continue;
                }
                execute(job);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                Core.LOG.warn("[TRIEL-CORE] Fila: {}", Core.rootMessage(e));
                try {
                    TimeUnit.SECONDS.sleep(5);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
        Db.discard();
    }

    private static void execute(Job job) {
        PluginModule module = Plugins.module(job.plugin);
        Report rep = new Report(job);
        if (module == null) {
            rep.fail("Plugin " + job.plugin + " não instalado neste nó (" + Core.node() + ")");
            Writer.finish(rep);
            return;
        }
        PluginConfig.Settings cfg = PluginConfig.of(job.plugin);
        if (cfg.off()) {
            rep.ignore("Plugin desligado no Portal quando o trabalho ia rodar");
            Writer.finish(rep);
            return;
        }
        job.mode = cfg.mode; // vale o modo da hora em que roda (pode ter mudado desde o enfileiramento)
        try {
            module.run(job, rep, cfg);
        } catch (Exception e) {
            rep.fail(Core.rootMessage(e));
            Writer.event(job.plugin, "erro", "Falha no trabalho " + job.label() + ": " + Core.rootMessage(e),
                    stackTrace(e), job.local ? null : job.id);
            Core.LOG.warn("[TRIEL-{}] Falha no trabalho {}: {}", job.plugin, job.label(), Core.rootMessage(e), e);
        }
        Writer.finish(rep);
        Core.LOG.info("[TRIEL-{}] Trabalho {} ({}): {} -- {}", job.plugin, job.label(), job.mode, rep.finalStatus(),
                rep.summary == null ? "" : rep.summary);
    }

    private static String stackTrace(Throwable e) {
        java.io.StringWriter sw = new java.io.StringWriter();
        e.printStackTrace(new java.io.PrintWriter(sw));
        return Core.cut(sw.toString(), 8000);
    }

    // ------------------------------------------------------------------ SQL

    private static Job claimNext() throws SQLException {
        List<String> keys = Plugins.keys();
        String env = Core.ambiente();
        if (keys.isEmpty() || env == null) return null; // sem ambiente o no nao pega trabalho
        String in = String.join(", ", java.util.Collections.nCopies(keys.size(), "?"));
        String sql = ";WITH proximo AS (SELECT TOP (1) * FROM dbo.portal_3dx_plugins_execucoes WITH (ROWLOCK, READPAST, UPDLOCK) "
                + "WHERE [status] = 'pendente' AND [ambiente] = ? AND [plugin_chave] IN (" + in + ") "
                + "AND ([executar_apos] IS NULL OR [executar_apos] <= SYSDATETIME()) ORDER BY [enfileirado_em]) "
                + "UPDATE proximo SET [status] = 'processando', [no] = ?, [iniciado_em] = SYSDATETIME(), "
                + "[ultimo_contato] = SYSDATETIME(), [tentativas] = [tentativas] + 1 "
                + "OUTPUT inserted.[id], inserted.[plugin_chave], inserted.[gatilho], inserted.[modo], inserted.[chave_dedup], "
                + "inserted.[correlacao_id], inserted.[parametros], inserted.[objeto_physicalid], inserted.[objeto_id], "
                + "inserted.[objeto_tipo], inserted.[objeto_nome], inserted.[objeto_revisao], inserted.[objeto_titulo], "
                + "inserted.[ator_login], inserted.[tentativas], inserted.[ambiente]";
        return Db.with(c -> {
            try (PreparedStatement st = c.prepareStatement(sql)) {
                int i = 1;
                st.setString(i++, env);
                for (String k : keys) st.setString(i++, k);
                st.setString(i, Core.node());
                try (ResultSet rs = st.executeQuery()) {
                    if (!rs.next()) return null;
                    Job j = new Job();
                    j.id = UUID.fromString(rs.getString(1));
                    j.plugin = rs.getString(2);
                    j.trigger = rs.getString(3);
                    j.mode = PluginConfig.Mode.valueOf(rs.getString(4));
                    j.dedupKey = rs.getString(5);
                    String corr = rs.getString(6);
                    j.correlationId = corr == null ? null : UUID.fromString(corr);
                    String params = rs.getString(7);
                    j.params = params == null ? jakarta.json.JsonValue.EMPTY_JSON_OBJECT : PluginConfig.parse(params);
                    j.objectPid = rs.getString(8);
                    j.objectId = rs.getString(9);
                    j.objectType = rs.getString(10);
                    j.objectName = rs.getString(11);
                    j.objectRevision = rs.getString(12);
                    j.objectTitle = rs.getString(13);
                    j.actorLogin = rs.getString(14);
                    j.attempts = rs.getInt(15);
                    j.ambiente = rs.getString(16);
                    return j;
                }
            }
        });
    }

    /**
     * Trabalho 'processando' sem contato ha mais de 10 min (no parado no meio) volta para a fila; depois de 3
     * tentativas, vira 'falha'. Na subida, os deste proprio no voltam na hora (ele acabou de reiniciar).
     */
    private static void recoverOrphans(boolean boot) {
        lastRecovery = System.currentTimeMillis();
        String env = Core.ambiente();
        if (!Db.configured() || env == null) return;
        try {
            int n = Db.with(c -> {
                try (PreparedStatement st = c.prepareStatement("UPDATE dbo.portal_3dx_plugins_execucoes SET "
                        + "[status] = CASE WHEN [tentativas] >= 3 THEN 'falha' ELSE 'pendente' END, "
                        + "[erro] = CASE WHEN [tentativas] >= 3 THEN N'Interrompido 3 vezes (o nó parou no meio do trabalho)' "
                        + "ELSE [erro] END, [finalizado_em] = CASE WHEN [tentativas] >= 3 THEN SYSDATETIME() ELSE NULL END "
                        + "WHERE [status] = 'processando' AND [ambiente] = ? AND ([ultimo_contato] < DATEADD(MINUTE, -10, SYSDATETIME()) "
                        + "OR ([no] = ? AND ? = 1))")) {
                    st.setString(1, env);
                    st.setString(2, Core.node());
                    st.setInt(3, boot ? 1 : 0);
                    return st.executeUpdate();
                }
            });
            if (n > 0) {
                Core.LOG.info("[TRIEL-CORE] {} trabalho(s) interrompido(s) devolvido(s) a fila", n);
                Writer.event(null, "aviso", n + " trabalho(s) interrompido(s) devolvido(s) à fila"
                        + (boot ? " na subida do nó" : ""), null, null);
            }
        } catch (SQLException e) {
            Core.LOG.warn("[TRIEL-CORE] Nao foi possivel conferir trabalhos interrompidos: {}", e.getMessage());
        }
    }

    /** Pendentes no banco por plugin (heartbeat). */
    static int pendingInDb(String plugin) {
        try {
            return Db.with(c -> {
                try (PreparedStatement st = c.prepareStatement("SELECT COUNT(*) FROM dbo.portal_3dx_plugins_execucoes "
                        + "WHERE [plugin_chave] = ? AND [ambiente] = ? AND [status] = 'pendente'")) {
                    st.setString(1, plugin);
                    st.setString(2, Core.ambiente());
                    try (ResultSet rs = st.executeQuery()) {
                        return rs.next() ? rs.getInt(1) : 0;
                    }
                }
            });
        } catch (SQLException e) {
            return -1;
        }
    }
}
