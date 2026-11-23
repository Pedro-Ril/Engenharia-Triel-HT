package br.com.trielht.plm.core;

import jakarta.json.Json;
import jakarta.json.JsonNumber;
import jakarta.json.JsonObject;
import jakarta.json.JsonReader;
import jakarta.json.JsonString;
import jakarta.json.JsonValue;

import java.io.StringReader;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Modo e parametros de cada plugin, vindos de dbo.portal_3dx_plugins (tela Plugins 3DX do Portal).
 *
 * Uma thread do nucleo rele a tabela a cada 30 s ({@link #refresh()}); quem consulta ({@link #of(String)}) so le o
 * que esta em memoria, entao a liberacao/duplicacao do usuario nunca espera o banco. Sem banco: fica o ultimo valor
 * lido; se o banco nunca respondeu desde a subida, vale plugin.&lt;chave&gt;.modo do arquivo local (padrao SIMULACAO).
 */
public final class PluginConfig {

    public enum Mode { DESLIGADO, SIMULACAO, ATIVO }

    /** Configuracao de um plugin num instante. */
    public static final class Settings {
        public final String key;
        public final Mode mode;
        public final JsonObject params;
        /** "banco" ou "local" */
        public final String source;

        Settings(String key, Mode mode, JsonObject params, String source) {
            this.key = key;
            this.mode = mode;
            this.params = params;
            this.source = source;
        }

        public boolean off() {
            return mode == Mode.DESLIGADO;
        }

        public boolean simulate() {
            return mode == Mode.SIMULACAO;
        }

        public String text(String name, String def) {
            JsonValue v = params.get(name);
            return v instanceof JsonString s ? s.getString() : def;
        }

        public int integer(String name, int def) {
            JsonValue v = params.get(name);
            return v instanceof JsonNumber n ? n.intValue() : def;
        }

        public boolean flag(String name, boolean def) {
            JsonValue v = params.get(name);
            if (v == JsonValue.TRUE) return true;
            if (v == JsonValue.FALSE) return false;
            return def;
        }
    }

    private static final Map<String, Settings> CACHE = new ConcurrentHashMap<>();
    private static volatile long lastRefresh;

    private PluginConfig() {
    }

    public static Settings of(String key) {
        if (Core.ambiente() == null) {
            return new Settings(key, Mode.DESLIGADO, JsonValue.EMPTY_JSON_OBJECT, "sem-ambiente");
        }
        Settings s = CACHE.get(key);
        if (s != null) return s;
        String m = Core.local().getProperty("plugin." + key + ".modo", "SIMULACAO").trim().toUpperCase();
        Mode mode;
        try {
            mode = Mode.valueOf(m);
        } catch (IllegalArgumentException e) {
            mode = Mode.SIMULACAO;
        }
        return new Settings(key, mode, JsonValue.EMPTY_JSON_OBJECT, "local");
    }

    public static long lastRefresh() {
        return lastRefresh;
    }

    /** Rele a tabela (thread do nucleo). */
    private static volatile boolean warnedNoEnvironment;

    public static void refresh() {
        if (!Db.configured()) return;
        String env = Core.ambiente();
        if (env == null) {
            if (!warnedNoEnvironment) {
                warnedNoEnvironment = true;
                Core.LOG.error("[TRIEL-CORE] ambiente= ausente ou invalido em {} (use TESTE ou PRODUCAO): todos os plugins "
                        + "ficam DESLIGADOS neste no", Core.CONFIG_FILE);
                Writer.event(null, "erro", "No " + Core.node() + " sem ambiente (ambiente=TESTE|PRODUCAO em "
                        + Core.CONFIG_FILE + "): plugins desligados", null, null);
            }
            return;
        }
        warnedNoEnvironment = false;
        try {
            Db.with(c -> {
                try (PreparedStatement st = c.prepareStatement("SELECT a.[plugin_chave], a.[modo], a.[parametros] "
                        + "FROM dbo.portal_3dx_plugins_ambientes a WHERE a.[ambiente] = ?")) {
                    st.setString(1, env);
                    try (ResultSet rs = st.executeQuery()) {
                    while (rs.next()) {
                        String key = rs.getString(1);
                        Mode mode;
                        try {
                            mode = Mode.valueOf(rs.getString(2));
                        } catch (IllegalArgumentException e) {
                            mode = Mode.SIMULACAO;
                        }
                        Settings old = CACHE.get(key);
                        Settings now = new Settings(key, mode, parse(rs.getString(3)), "banco");
                        CACHE.put(key, now);
                        if (old != null && old.mode != now.mode) {
                            Core.LOG.info("[TRIEL-CORE] Plugin {} ({}): modo {} -> {}", key, env, old.mode, now.mode);
                        }
                    }
                    }
                }
                return null;
            });
            lastRefresh = System.currentTimeMillis();
        } catch (Exception e) {
            Core.LOG.warn("[TRIEL-CORE] Nao foi possivel ler a configuracao dos plugins: {}", e.getMessage());
        }
    }

    static JsonObject parse(String json) {
        if (json == null || json.isBlank()) return JsonValue.EMPTY_JSON_OBJECT;
        try (JsonReader r = Json.createReader(new StringReader(json))) {
            return r.readObject();
        } catch (Exception e) {
            return JsonValue.EMPTY_JSON_OBJECT;
        }
    }
}
