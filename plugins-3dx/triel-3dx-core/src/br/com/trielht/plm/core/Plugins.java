package br.com.trielht.plm.core;

import jakarta.servlet.ServletContextEvent;
import jakarta.servlet.ServletContextListener;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.ServiceLoader;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Registro dos plugins instalados neste no e ciclo de vida do nucleo (sobe com o 3DSpace pelo web-fragment.xml).
 *
 * Tarefas periodicas: reler a configuracao (30 s) e o heartbeat de cada plugin em dbo.portal_3dx_plugins_nos (60 s).
 */
public final class Plugins implements ServletContextListener {

    private static volatile List<PluginModule> modules;
    private static final Map<String, String[]> LAST_ERROR = new ConcurrentHashMap<>();
    private static final LocalDateTime STARTED = LocalDateTime.now();
    private static ScheduledExecutorService scheduler;

    /** Carregados pelo ServiceLoader (cada jar de plugin declara o seu modulo). */
    public static List<PluginModule> all() {
        List<PluginModule> m = modules;
        if (m == null) {
            synchronized (Plugins.class) {
                m = modules;
                if (m == null) {
                    m = new ArrayList<>();
                    for (PluginModule pm : ServiceLoader.load(PluginModule.class, Plugins.class.getClassLoader())) {
                        m.add(pm);
                        Core.LOG.info("[TRIEL-CORE] Plugin carregado: {} {}", pm.key(), pm.version());
                    }
                    modules = m;
                }
            }
        }
        return m;
    }

    static PluginModule module(String key) {
        for (PluginModule m : all()) if (m.key().equals(key)) return m;
        return null;
    }

    static List<String> keys() {
        List<String> k = new ArrayList<>();
        for (PluginModule m : all()) k.add(m.key());
        return k;
    }

    static void lastError(String plugin, String message) {
        LAST_ERROR.put(plugin, new String[] {Core.cut(message, 2000), LocalDateTime.now().toString()});
    }

    // ------------------------------------------------------------------ ciclo de vida

    @Override
    public void contextInitialized(ServletContextEvent sce) {
        Core.LOG.info("[TRIEL-CORE] Nucleo {} subindo no no {} (banco {})", Core.VERSION, Core.node(),
                Db.configured() ? "configurado" : "NAO configurado: so catalina.out");
        all();
        scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "triel-3dx-agenda");
            t.setDaemon(true);
            return t;
        });
        scheduler.scheduleWithFixedDelay(PluginConfig::refresh, 0, 30, TimeUnit.SECONDS);
        scheduler.scheduleWithFixedDelay(Plugins::heartbeat, 20, 60, TimeUnit.SECONDS);
        Writer.start();
        JobQueue.start();
        for (PluginModule m : all()) {
            try {
                m.start();
            } catch (Exception e) {
                Core.LOG.warn("[TRIEL-CORE] Falha ao iniciar {}: {}", m.key(), e.getMessage(), e);
            }
        }
    }

    @Override
    public void contextDestroyed(ServletContextEvent sce) {
        for (PluginModule m : all()) {
            try {
                m.stop();
            } catch (Exception ignore) {
                // nada
            }
        }
        if (scheduler != null) scheduler.shutdownNow();
        JobQueue.stop();
        Writer.stop();
        Db.closeAll();
    }

    // ------------------------------------------------------------------ heartbeat

    /** Notas de versao ja gravadas desta subida (tenta de novo a cada heartbeat ate conseguir). */
    private static volatile boolean releasesRegistered;

    private static void registerReleases() {
        try {
            int n = Release.register("core", Core.RELEASES);
            for (PluginModule m : all()) n += Release.register(m.key(), m.releases());
            releasesRegistered = true;
            if (n > 0) Core.LOG.info("[TRIEL-CORE] {} nota(s) de versao registrada(s) no Portal", n);
        } catch (SQLException e) {
            Core.LOG.debug("[TRIEL-CORE] Notas de versao: {}", e.getMessage());
        } catch (Exception e) {
            Core.LOG.warn("[TRIEL-CORE] Notas de versao: {}", e.getMessage());
        }
    }

    private static void heartbeat() {
        if (!Db.configured()) return;
        if (!releasesRegistered) registerReleases();
        for (PluginModule m : all()) {
            try {
                int pending = JobQueue.pendingInDb(m.key());
                String[] err = LAST_ERROR.get(m.key());
                Db.with(c -> {
                    try (PreparedStatement st = c.prepareStatement("MERGE dbo.portal_3dx_plugins_nos AS d "
                            + "USING (SELECT ? AS [plugin_chave], ? AS [no]) AS o "
                            + "ON d.[plugin_chave] = o.[plugin_chave] AND d.[no] = o.[no] "
                            + "WHEN MATCHED THEN UPDATE SET [ambiente] = ?, [versao] = ?, [jar_md5] = ?, [core_versao] = ?, [modo_em_uso] = ?, "
                            + "[iniciado_em] = ?, [ultimo_contato] = SYSDATETIME(), [fila_pendente] = ?, "
                            + "[ultimo_erro] = COALESCE(?, d.[ultimo_erro]), [ultimo_erro_em] = COALESCE(?, d.[ultimo_erro_em]) "
                            + "WHEN NOT MATCHED THEN INSERT ([plugin_chave], [no], [ambiente], [versao], [jar_md5], [core_versao], [modo_em_uso], "
                            + "[iniciado_em], [ultimo_contato], [fila_pendente], [ultimo_erro], [ultimo_erro_em]) "
                            + "VALUES (o.[plugin_chave], o.[no], ?, ?, ?, ?, ?, ?, SYSDATETIME(), ?, ?, ?);")) {
                        String md5 = md5Of(m);
                        String mode = PluginConfig.of(m.key()).mode.name();
                        Timestamp started = Timestamp.valueOf(STARTED);
                        Timestamp errAt = err == null ? null : Timestamp.valueOf(LocalDateTime.parse(err[1]));
                        int i = 1;
                        st.setString(i++, m.key());
                        st.setString(i++, Core.node());
                        for (int pass = 0; pass < 2; pass++) {
                            st.setString(i++, Core.ambiente());
                            st.setString(i++, m.version());
                            st.setString(i++, md5);
                            st.setString(i++, Core.VERSION);
                            st.setString(i++, mode);
                            st.setTimestamp(i++, started);
                            if (pending < 0) st.setNull(i++, java.sql.Types.INTEGER);
                            else st.setInt(i++, pending + JobQueue.localSize());
                            st.setString(i++, err == null ? null : err[0]);
                            st.setTimestamp(i++, errAt);
                        }
                        st.executeUpdate();
                    }
                    return null;
                });
            } catch (SQLException e) {
                Core.LOG.debug("[TRIEL-CORE] Heartbeat {}: {}", m.key(), e.getMessage());
            } catch (Exception e) {
                Core.LOG.warn("[TRIEL-CORE] Heartbeat {}: {}", m.key(), e.getMessage());
            }
        }
    }

    private static final Map<String, String> MD5 = new ConcurrentHashMap<>();

    private static String md5Of(PluginModule m) {
        return MD5.computeIfAbsent(m.key(), k -> {
            String v = Core.jarMd5(m.getClass());
            return v == null ? "" : v;
        });
    }
}
