package br.com.trielht.plm.estado;

import jakarta.json.Json;
import jakarta.json.JsonArray;
import jakarta.json.JsonArrayBuilder;
import jakarta.json.JsonObject;
import jakarta.json.JsonObjectBuilder;
import jakarta.json.JsonReader;
import jakarta.json.JsonString;
import jakarta.json.JsonValue;
import jakarta.json.JsonWriter;

import java.io.StringReader;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

/**
 * Acha, numa resposta JSON do 3DSpace, os objetos com estado de maturidade e troca SO esse estado pelo do banco.
 *
 * Formatos reconhecidos (o mesmo codigo serve para a busca dseng e para o cvservlet):
 * - objeto com id (physicalid | resourceid | physical_id, ou "id" de 32 hexadecimais) e estado em "state",
 *   "current" ou "ds6w:status" (este as vezes vem "politica.ESTADO": troca so o ESTADO);
 * - lista de atributos [{"name": ..., "value": ...}] com o id e o estado entre os nomes.
 * Nada mais muda na resposta. Sem diferenca, a resposta original e devolvida como veio (bytes iguais).
 */
final class StateRewriter {

    static final Set<String> ID_KEYS = Set.of("physicalid", "resourceid", "physical_id");
    static final Set<String> STATE_KEYS = Set.of("state", "current", "ds6w:status");
    private static final Pattern HEX32 = Pattern.compile("[0-9A-Fa-f]{32}");

    /** Um objeto encontrado: id e o estado como veio do indice (sem a politica). */
    record Found(String id, String indexState) {
    }

    /** Divergencia corrigida (ou que seria, na simulacao). */
    record Diff(String id, String index, String db) {
    }

    private StateRewriter() {
    }

    static JsonValue parse(String text) {
        try (JsonReader r = Json.createReader(new StringReader(text))) {
            return r.readValue();
        }
    }

    static String write(JsonValue v) {
        StringWriter sw = new StringWriter();
        try (JsonWriter w = Json.createWriter(sw)) {
            w.write(v);
        }
        return sw.toString();
    }

    // ------------------------------------------------------------------ coleta

    /** Todos os objetos com id e estado (o primeiro estado de cada id). */
    static Map<String, Found> collect(JsonValue root) {
        Map<String, Found> out = new LinkedHashMap<>();
        walk(root, out);
        return out;
    }

    private static void walk(JsonValue v, Map<String, Found> out) {
        if (v instanceof JsonObject o) {
            String id = idOf(o);
            String state = stateOf(o);
            if (id != null && state != null) out.putIfAbsent(id, new Found(id, bare(state)));
            for (JsonValue child : o.values()) walk(child, out);
        } else if (v instanceof JsonArray a) {
            String[] attr = fromAttributeList(a);
            if (attr != null) out.putIfAbsent(attr[0], new Found(attr[0], bare(attr[1])));
            for (JsonValue child : a) walk(child, out);
        }
    }

    static String idOf(JsonObject o) {
        for (String k : ID_KEYS) {
            if (o.get(k) instanceof JsonString s && HEX32.matcher(s.getString()).matches()) return s.getString();
        }
        if (o.get("id") instanceof JsonString s && HEX32.matcher(s.getString()).matches()) return s.getString();
        return null;
    }

    static String stateOf(JsonObject o) {
        for (String k : STATE_KEYS) {
            if (o.get(k) instanceof JsonString s && !s.getString().isBlank()) return s.getString();
        }
        return null;
    }

    /** [{"name":"physicalid","value":...},{"name":"ds6w:status","value":...}] -> {id, estado}; senao null. */
    static String[] fromAttributeList(JsonArray a) {
        String id = null, state = null;
        for (JsonValue e : a) {
            if (!(e instanceof JsonObject o) || !(o.get("name") instanceof JsonString n)) return null;
            if (!(o.get("value") instanceof JsonString val)) continue;
            String name = n.getString();
            if ((ID_KEYS.contains(name) || "id".equals(name)) && HEX32.matcher(val.getString()).matches()) id = val.getString();
            else if (STATE_KEYS.contains(name) && state == null) state = val.getString();
        }
        return id != null && state != null ? new String[] {id, state} : null;
    }

    /** "VPLM_SMB_Definition_MajorRev.RELEASED" -> "RELEASED"; "RELEASED" -> "RELEASED". */
    static String bare(String state) {
        int i = state.lastIndexOf('.');
        return i >= 0 ? state.substring(i + 1) : state;
    }

    /** Troca o ESTADO mantendo o que vinha antes dele ("politica." quando houver). */
    static String replaced(String original, String dbState) {
        int i = original.lastIndexOf('.');
        return i >= 0 ? original.substring(0, i + 1) + dbState : dbState;
    }

    // ------------------------------------------------------------------ troca

    /** As divergencias entre o indice e o banco (so ids que o banco respondeu). */
    static List<Diff> diffs(Map<String, Found> found, Map<String, String> db) {
        List<Diff> out = new ArrayList<>();
        for (Found f : found.values()) {
            String s = db.get(f.id().toUpperCase());
            if (s != null && !s.isBlank() && !s.equals(f.indexState())) out.add(new Diff(f.id(), f.indexState(), s));
        }
        return out;
    }

    /** Nova arvore com o estado do banco nos ids divergentes; o resto igual. */
    static JsonValue rewrite(JsonValue v, Map<String, String> fix) {
        if (v instanceof JsonObject o) {
            String id = idOf(o);
            String newState = id == null ? null : fix.get(id);
            JsonObjectBuilder b = Json.createObjectBuilder();
            for (Map.Entry<String, JsonValue> e : o.entrySet()) {
                JsonValue val = e.getValue();
                if (newState != null && STATE_KEYS.contains(e.getKey()) && val instanceof JsonString s) {
                    b.add(e.getKey(), replaced(s.getString(), newState));
                } else {
                    b.add(e.getKey(), rewrite(val, fix));
                }
            }
            return b.build();
        }
        if (v instanceof JsonArray a) {
            String[] attr = fromAttributeList(a);
            String newState = attr == null ? null : fix.get(attr[0]);
            JsonArrayBuilder b = Json.createArrayBuilder();
            for (JsonValue e : a) {
                if (newState != null && e instanceof JsonObject o && o.get("name") instanceof JsonString n
                        && STATE_KEYS.contains(n.getString()) && o.get("value") instanceof JsonString s) {
                    b.add(Json.createObjectBuilder(o).add("value", replaced(s.getString(), newState)));
                } else {
                    b.add(rewrite(e, fix));
                }
            }
            return b.build();
        }
        return v;
    }

    /** Chaves distintas dos objetos (para a amostra da observacao: mostra o formato sem os dados). */
    static Set<String> keys(JsonValue v, int max) {
        Set<String> out = new TreeSet<>();
        keys(v, out, max);
        return out;
    }

    private static void keys(JsonValue v, Set<String> out, int max) {
        if (out.size() >= max) return;
        if (v instanceof JsonObject o) {
            out.addAll(o.keySet());
            for (JsonValue c : o.values()) keys(c, out, max);
        } else if (v instanceof JsonArray a) {
            Set<String> names = new LinkedHashSet<>();
            for (JsonValue e : a) {
                if (e instanceof JsonObject o && o.get("name") instanceof JsonString n) names.add("@" + n.getString());
                keys(e, out, max);
            }
            out.addAll(names);
        }
    }
}
