package br.com.trielht.plm.core;

import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.json.JsonObjectBuilder;
import jakarta.json.JsonValue;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Gravador assincrono no banco do Portal. Tudo que os plugins registram passa por aqui, numa thread propria:
 * a liberacao/duplicacao do usuario so poe uma operacao na fila e segue.
 *
 * Se o banco estiver fora do ar, as operacoes vao para um arquivo de spool (uma linha JSON por operacao) e sao
 * regravadas quando o banco voltar. Exceção: um trabalho novo (enqueue) que nao chega ao banco roda direto no
 * proprio no (Job.local), para a liberacao nao ficar sem o tratamento -- o registro dele vai depois, pelo spool.
 */
final class Writer {

    private static final LinkedBlockingQueue<JsonObject> OPS = new LinkedBlockingQueue<>(100_000);
    private static final long SPOOL_MAX_BYTES = 50L * 1024 * 1024;
    private static volatile Thread thread;
    private static volatile boolean running;
    private static long lastReplay;

    private Writer() {
    }

    // ------------------------------------------------------------------ operacoes (chamadas de qualquer thread)

    static void enqueue(Job job) {
        offer(op("enqueue").add("job", job.toJson()));
    }

    static void finish(Report rep) {
        String kind = rep.job.local ? "exec_insert" : "exec_finish";
        offer(op(kind).add("rep", rep.toJson(LocalDateTime.now())));
    }

    /**
     * Devolve o trabalho a fila para rodar de novo daqui a {@code seconds} s (ver Mx.awaitState). Sincrono, na
     * thread da fila: so depois de gravado a fila segue. A tentativa nao conta (tentativas volta 1), os parametros
     * levam o controle da espera e o resumo mostra no Portal o que ele aguarda.
     *
     * @return TRUE = reagendado; FALSE = o trabalho nao esta mais 'processando' (ex.: cancelado no Portal), nao
     *         rodar de novo; null = banco indisponivel (quem chama espera e tenta neste mesmo no).
     */
    static Boolean reschedule(Job job, int seconds, String summary) {
        if (!Db.configured()) return null;
        try {
            int n = Db.with(c -> {
                try (PreparedStatement st = c.prepareStatement("UPDATE dbo.portal_3dx_plugins_execucoes SET "
                        + "[status] = 'pendente', [executar_apos] = DATEADD(SECOND, ?, SYSDATETIME()), [parametros] = ?, "
                        + "[tentativas] = CASE WHEN [tentativas] > 0 THEN [tentativas] - 1 ELSE 0 END, [no] = NULL, "
                        + "[iniciado_em] = NULL, [ultimo_contato] = SYSDATETIME(), [resumo] = ? "
                        + "WHERE [id] = ? AND [status] = 'processando'")) {
                    st.setInt(1, Math.max(1, seconds));
                    st.setString(2, job.params == null || job.params.isEmpty() ? null : job.params.toString());
                    st.setString(3, Core.cut(summary, 1000));
                    st.setString(4, job.id.toString());
                    return st.executeUpdate();
                }
            });
            return n == 1;
        } catch (SQLException e) {
            Core.LOG.warn("[TRIEL-CORE] Nao foi possivel reagendar {}: {}", job.label(), e.getMessage());
            return null;
        }
    }

    static void touch(UUID execId) {
        offer(op("touch").add("id", execId.toString()));
    }

    static void event(String plugin, String level, String message, String detail, UUID execId) {
        JsonObjectBuilder b = op("event");
        Json2.put(b, "plugin", plugin);
        b.add("nivel", level);
        b.add("mensagem", Core.cut(message == null ? "" : message, 1000));
        Json2.put(b, "detalhe", detail);
        Json2.put(b, "execucao_id", execId == null ? null : execId.toString());
        b.add("em", LocalDateTime.now().toString());
        if ("erro".equals(level) && plugin != null) Plugins.lastError(plugin, message);
        offer(b);
    }

    private static JsonObjectBuilder op(String kind) {
        return Json.createObjectBuilder().add("op", kind);
    }

    private static void offer(JsonObjectBuilder b) {
        JsonObject o = b.build();
        if (!OPS.offer(o)) {
            Core.LOG.warn("[TRIEL-CORE] Fila do gravador cheia: operacao {} descartada", o.getString("op"));
        }
    }

    // ------------------------------------------------------------------ thread

    static synchronized void start() {
        if (running) return;
        running = true;
        thread = new Thread(Writer::loop, "triel-3dx-gravador");
        thread.setDaemon(true);
        thread.start();
    }

    static synchronized void stop() {
        running = false;
        if (thread != null) thread.interrupt();
        // o que sobrou na fila vai para o spool: nada se perde numa parada
        JsonObject o;
        while ((o = OPS.poll()) != null) {
            if (!"enqueue".equals(o.getString("op"))) spool(o);
        }
    }

    private static void loop() {
        while (running) {
            try {
                JsonObject o = OPS.poll(2, TimeUnit.SECONDS);
                if (System.currentTimeMillis() - lastReplay > 60_000) replaySpool();
                if (o == null) continue;
                apply(o);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                Core.LOG.warn("[TRIEL-CORE] Gravador: {}", Core.rootMessage(e));
            }
        }
        Db.discard();
    }

    private static void apply(JsonObject o) {
        String kind = o.getString("op");
        if (!Db.configured()) {
            if ("enqueue".equals(kind)) JobQueue.runLocal(Job.fromJson(o.getJsonObject("job")));
            return; // sem banco configurado nao ha onde registrar (fica so no catalina.out)
        }
        try {
            Db.with(c -> {
                write(c, o);
                return null;
            });
            if ("enqueue".equals(kind)) JobQueue.wakeUp();
        } catch (SQLException e) {
            if (isDuplicate(e)) {
                if ("enqueue".equals(kind)) {
                    Core.LOG.info("[TRIEL-CORE] Trabalho ja estava na fila: {}",
                            Job.fromJson(o.getJsonObject("job")).label());
                }
                return; // exec_insert regravado do spool que ja tinha entrado
            }
            Core.LOG.warn("[TRIEL-CORE] Banco do Portal indisponivel ({}): {}", kind, e.getMessage());
            if ("enqueue".equals(kind)) {
                JobQueue.runLocal(Job.fromJson(o.getJsonObject("job")));
            } else if (!"touch".equals(kind)) {
                spool(o);
            }
        }
    }

    private static boolean isDuplicate(SQLException e) {
        return e.getErrorCode() == 2601 || e.getErrorCode() == 2627;
    }

    // ------------------------------------------------------------------ SQL

    private static void write(Connection c, JsonObject o) throws SQLException {
        switch (o.getString("op")) {
            case "enqueue" -> insertPending(c, Job.fromJson(o.getJsonObject("job")));
            case "exec_finish" -> finishExec(c, o.getJsonObject("rep"));
            case "exec_insert" -> insertExec(c, o.getJsonObject("rep"));
            case "touch" -> {
                try (PreparedStatement st = c.prepareStatement("UPDATE dbo.portal_3dx_plugins_execucoes "
                        + "SET [ultimo_contato] = SYSDATETIME() WHERE [id] = ? AND [status] = 'processando'")) {
                    st.setString(1, o.getString("id"));
                    st.executeUpdate();
                }
            }
            case "event" -> insertEvent(c, o);
            default -> Core.LOG.warn("[TRIEL-CORE] Operacao desconhecida: {}", o.getString("op"));
        }
    }

    private static final String JOB_COLUMNS = "[id], [plugin_chave], [ambiente], [gatilho], [modo], [chave_dedup], [correlacao_id], "
            + "[parametros], [objeto_physicalid], [objeto_id], [objeto_tipo], [objeto_nome], [objeto_revisao], "
            + "[objeto_titulo], [ator_login], [ator_usuario_id]";
    private static final String JOB_VALUES = "?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "
            + "(SELECT TOP (1) [id] FROM dbo.portal_usuarios WHERE [sam_account_name] = ?)";

    private static int bindJob(PreparedStatement st, Job j) throws SQLException {
        int i = 1;
        st.setString(i++, j.id.toString());
        st.setString(i++, j.plugin);
        st.setString(i++, j.ambiente);
        st.setString(i++, j.trigger);
        st.setString(i++, j.mode.name());
        st.setString(i++, j.dedupKey);
        st.setString(i++, j.correlationId == null ? null : j.correlationId.toString());
        st.setString(i++, j.params == null || j.params.isEmpty() ? null : j.params.toString());
        st.setString(i++, j.objectPid);
        st.setString(i++, j.objectId);
        st.setString(i++, Core.cut(j.objectType, 100));
        st.setString(i++, Core.cut(j.objectName, 200));
        st.setString(i++, Core.cut(j.objectRevision, 20));
        st.setString(i++, Core.cut(j.objectTitle, 300));
        st.setString(i++, Core.cut(j.actorLogin, 100));
        st.setString(i++, j.actorLogin);
        return i;
    }

    private static void insertPending(Connection c, Job j) throws SQLException {
        try (PreparedStatement st = c.prepareStatement("INSERT INTO dbo.portal_3dx_plugins_execucoes (" + JOB_COLUMNS
                + ", [status], [executar_apos]) VALUES (" + JOB_VALUES + ", 'pendente', DATEADD(SECOND, ?, SYSDATETIME()))")) {
            int i = bindJob(st, j);
            st.setInt(i, Math.max(0, j.delaySeconds));
            st.executeUpdate();
        }
    }

    private static void insertExec(Connection c, JsonObject rep) throws SQLException {
        Job j = Job.fromJson(rep.getJsonObject("job"));
        boolean auto = c.getAutoCommit();
        c.setAutoCommit(false);
        try {
            try (PreparedStatement st = c.prepareStatement("INSERT INTO dbo.portal_3dx_plugins_execucoes (" + JOB_COLUMNS
                    + ", [status], [no], [tentativas], [enfileirado_em], [iniciado_em], [ultimo_contato], [finalizado_em], "
                    + "[duracao_ms], [total_itens], [total_ok], [total_falhas], [resumo], [erro]) VALUES (" + JOB_VALUES
                    + ", ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")) {
                int i = bindJob(st, j);
                st.setString(i++, rep.getString("status"));
                st.setString(i++, Core.node());
                Timestamp started = ts(rep.getString("iniciado_em"));
                Timestamp finished = ts(rep.getString("finalizado_em"));
                st.setTimestamp(i++, started);
                st.setTimestamp(i++, started);
                st.setTimestamp(i++, finished);
                st.setTimestamp(i++, finished);
                bindTotals(st, i, rep);
                st.executeUpdate();
            }
            insertItems(c, j.id.toString(), rep);
            c.commit();
        } catch (SQLException e) {
            c.rollback();
            throw e;
        } finally {
            c.setAutoCommit(auto);
        }
    }

    private static void finishExec(Connection c, JsonObject rep) throws SQLException {
        Job j = Job.fromJson(rep.getJsonObject("job"));
        boolean auto = c.getAutoCommit();
        c.setAutoCommit(false);
        try {
            try (PreparedStatement st = c.prepareStatement("UPDATE dbo.portal_3dx_plugins_execucoes SET [status] = ?, "
                    + "[modo] = ?, [ultimo_contato] = SYSDATETIME(), [finalizado_em] = ?, [duracao_ms] = ?, [total_itens] = ?, "
                    + "[total_ok] = ?, [total_falhas] = ?, [resumo] = ?, [erro] = ? WHERE [id] = ?")) {
                st.setString(1, rep.getString("status"));
                st.setString(2, j.mode.name());
                st.setTimestamp(3, ts(rep.getString("finalizado_em")));
                int i = bindTotals(st, 4, rep);
                st.setString(i, j.id.toString());
                st.executeUpdate();
            }
            insertItems(c, j.id.toString(), rep);
            c.commit();
        } catch (SQLException e) {
            c.rollback();
            throw e;
        } finally {
            c.setAutoCommit(auto);
        }
    }

    private static int bindTotals(PreparedStatement st, int i, JsonObject rep) throws SQLException {
        st.setInt(i++, rep.getInt("duracao_ms", 0));
        st.setInt(i++, rep.getInt("total_itens", 0));
        st.setInt(i++, rep.getInt("total_ok", 0));
        st.setInt(i++, rep.getInt("total_falhas", 0));
        st.setString(i++, Json2.str(rep, "resumo"));
        st.setString(i++, Json2.str(rep, "erro"));
        return i;
    }

    private static final String[] ITEM_COLUMNS = {"acao", "alvo_physicalid", "alvo_tipo", "alvo_nome", "alvo_revisao",
            "alvo_titulo", "alvo_estado", "alvo_owner", "valor_antes", "valor_depois", "mensagem"};

    private static void insertItems(Connection c, String execId, JsonObject rep) throws SQLException {
        List<JsonValue> items = rep.getJsonArray("itens");
        if (items == null || items.isEmpty()) return;
        StringBuilder sql = new StringBuilder("INSERT INTO dbo.portal_3dx_plugins_itens ([execucao_id], [ordem], [sucesso]");
        for (String col : ITEM_COLUMNS) sql.append(", [").append(col).append(']');
        sql.append(") VALUES (?, ?, ?").append(", ?".repeat(ITEM_COLUMNS.length)).append(')');
        try (PreparedStatement st = c.prepareStatement(sql.toString())) {
            int n = 0;
            for (JsonValue v : items) {
                JsonObject it = v.asJsonObject();
                st.setString(1, execId);
                st.setInt(2, it.getInt("ordem", ++n));
                st.setBoolean(3, it.getBoolean("sucesso", true));
                for (int k = 0; k < ITEM_COLUMNS.length; k++) st.setString(4 + k, Json2.str(it, ITEM_COLUMNS[k]));
                st.addBatch();
                if (n % 500 == 0) st.executeBatch();
            }
            st.executeBatch();
        }
    }

    private static void insertEvent(Connection c, JsonObject o) throws SQLException {
        try (PreparedStatement st = c.prepareStatement("INSERT INTO dbo.portal_3dx_plugins_eventos ([plugin_chave], [no], "
                + "[nivel], [mensagem], [detalhe], [execucao_id], [criado_em], [ambiente]) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")) {
            st.setString(1, Json2.str(o, "plugin"));
            st.setString(2, Core.node());
            st.setString(3, o.getString("nivel"));
            st.setString(4, o.getString("mensagem"));
            st.setString(5, Json2.str(o, "detalhe"));
            String exec = Json2.str(o, "execucao_id");
            if (exec == null) st.setNull(6, Types.VARCHAR);
            else st.setString(6, exec);
            st.setTimestamp(7, ts(o.getString("em")));
            st.setString(8, Core.ambiente());
            st.executeUpdate();
        }
    }

    private static Timestamp ts(String iso) {
        return Timestamp.valueOf(LocalDateTime.parse(iso));
    }

    // ------------------------------------------------------------------ spool

    private static Path spoolFile() {
        String dir = Core.local().getProperty("spool.dir", "/App/triel/spool").trim();
        return Path.of(dir, "spool-" + Integer.toHexString(Core.node().hashCode()) + ".jsonl");
    }

    private static synchronized void spool(JsonObject o) {
        Path f = spoolFile();
        try {
            Files.createDirectories(f.getParent());
            if (Files.exists(f) && Files.size(f) > SPOOL_MAX_BYTES) {
                Core.LOG.warn("[TRIEL-CORE] Spool cheio ({}): operacao {} descartada", f, o.getString("op"));
                return;
            }
            try (BufferedWriter w = Files.newBufferedWriter(f, StandardCharsets.UTF_8, StandardOpenOption.CREATE,
                    StandardOpenOption.APPEND)) {
                w.write(o.toString());
                w.newLine();
            }
        } catch (IOException e) {
            Core.LOG.warn("[TRIEL-CORE] Nao foi possivel gravar o spool {}: {}", f, e.getMessage());
        }
    }

    /** Regrava o spool no banco. Para na primeira falha (o resto fica para a proxima tentativa). */
    private static synchronized void replaySpool() {
        lastReplay = System.currentTimeMillis();
        Path f = spoolFile();
        if (!Files.exists(f) || !Db.configured()) return;
        List<String> lines;
        try {
            lines = Files.readAllLines(f, StandardCharsets.UTF_8);
        } catch (IOException e) {
            return;
        }
        int done = 0;
        for (String line : lines) {
            if (line.isBlank()) {
                done++;
                continue;
            }
            JsonObject o;
            try {
                o = Json2.parse(line);
            } catch (Exception bad) {
                done++;
                continue;
            }
            try {
                Db.with(c -> {
                    write(c, o);
                    return null;
                });
                done++;
            } catch (SQLException e) {
                if (isDuplicate(e)) {
                    done++;
                    continue;
                }
                break;
            }
        }
        try {
            if (done >= lines.size()) {
                Files.delete(f);
            } else if (done > 0) {
                Files.write(f, lines.subList(done, lines.size()), StandardCharsets.UTF_8);
            }
            if (done > 0) Core.LOG.info("[TRIEL-CORE] Spool: {} de {} operacao(oes) regravada(s) no banco", done, lines.size());
        } catch (IOException e) {
            Core.LOG.warn("[TRIEL-CORE] Nao foi possivel atualizar o spool {}: {}", f, e.getMessage());
        }
    }
}
