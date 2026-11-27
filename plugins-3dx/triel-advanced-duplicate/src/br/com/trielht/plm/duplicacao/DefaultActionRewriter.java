package br.com.trielht.plm.duplicacao;

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
import java.util.List;
import java.util.Set;

/**
 * Acao inicial de cada linha da Duplicacao avancada, na resposta de POST /resources/lifecycle/expand/federated.
 *
 * Formato (lido no dev-plm em 27/11/2026): {"results":[{"attributes":[{"name":"physicalid","value":"..."},
 * {"name":"ds6w:cadmaster","value":"SOLIDWORKS"},{"name":"expand::capabilities","value":[1,3,2,4]},
 * {"name":"expand::defaultAction","value":1}, ...]}, ...]} -- um item por objeto (instancias vem em itens proprios,
 * sem capabilities).
 *
 * A janela (AdvancedView, carregamento da arvore) converte o valor do servidor para a acao da linha:
 * 1 Duplicar, 2 Reutilizar, 3 Excluir, 6 Ramificar, 100000 (ExpandNodeCapabilites.Max) Duplicar com Desenhos -- e so
 * usa o valor se ele estiver nas capabilities do no (para SOLIDWORKS/CATIA V5 com Duplicar, ela acrescenta o 100000).
 *
 * Regra: item principal (id do pedido) -> acaoPrincipal; demais nos que aceitam Reutilizar (capability 2) ->
 * acaoFilhos. Nos que "seguem o pai" (capability 5) e qualquer no fora dessas condicoes ficam como vieram.
 */
final class DefaultActionRewriter {

    static final int DUPLICAR = 1;
    static final int REUTILIZAR = 2;
    static final int SEGUE_PAI = 5;
    static final int DUPLICAR_COM_DESENHOS = 100000;

    private DefaultActionRewriter() {
    }

    /** O que mudaria: rotulo e acao antes/depois de cada no alterado. */
    record Change(String physicalId, String label, boolean root, int before, int after) {
    }

    record Result(String body, List<Change> changes, int nodes) {
    }

    /**
     * @param rootAction  acao do item principal (codigo do servidor) ou null para nao mexer
     * @param childAction acao dos demais (codigo do servidor) ou null para nao mexer
     * @return corpo novo (ou o mesmo texto se nada muda) e a lista de mudancas
     */
    static Result rewrite(String text, Set<String> rootIds, Integer rootAction, Integer childAction) {
        JsonObject root;
        try (JsonReader r = Json.createReader(new StringReader(text))) {
            root = r.readObject();
        }
        JsonArray results = root.getJsonArray("results");
        if (results == null) throw new IllegalStateException("resposta sem \"results\"");
        List<Change> changes = new ArrayList<>();
        JsonArrayBuilder out = Json.createArrayBuilder();
        int nodes = 0;
        for (JsonValue v : results) {
            if (!(v instanceof JsonObject item) || !(item.get("attributes") instanceof JsonArray attrs)) {
                out.add(v);
                continue;
            }
            String pid = null, label = null, cad = null;
            JsonArray caps = null;
            int defIndex = -1;
            int before = -1;
            for (int i = 0; i < attrs.size(); i++) {
                if (!(attrs.get(i) instanceof JsonObject a)) continue;
                String name = a.getString("name", "");
                JsonValue val = a.get("value");
                switch (name) {
                    case "physicalid" -> pid = str(val);
                    case "ds6w:label" -> label = str(val);
                    case "ds6w:cadmaster", "ds6w:cadMaster" -> cad = str(val);
                    case "expand::capabilities" -> caps = val instanceof JsonArray arr ? arr : null;
                    case "expand::defaultAction" -> {
                        defIndex = i;
                        before = intOf(val);
                    }
                    default -> {
                    }
                }
            }
            if (caps == null || pid == null) {
                out.add(item);
                continue;
            }
            nodes++;
            boolean isRoot = rootIds.contains(pid);
            Integer target = null;
            if (isRoot && rootAction != null) {
                // Duplicar com Desenhos so existe para SOLIDWORKS/CATIA V5 com Duplicar (a janela acrescenta o 100000)
                boolean drwOk = rootAction != DUPLICAR_COM_DESENHOS
                        || (has(caps, DUPLICAR) && ("SOLIDWORKS".equals(cad) || "CATIAV5".equals(cad)));
                if (drwOk && (rootAction == DUPLICAR_COM_DESENHOS || has(caps, rootAction))) target = rootAction;
            } else if (!isRoot && childAction != null && !has(caps, SEGUE_PAI) && has(caps, childAction)) {
                target = childAction;
            }
            if (target == null || target == before) {
                out.add(item);
                continue;
            }
            changes.add(new Change(pid, label, isRoot, before, target));
            JsonArrayBuilder na = Json.createArrayBuilder();
            JsonObject def = Json.createObjectBuilder().add("name", "expand::defaultAction").add("value", target).build();
            for (int i = 0; i < attrs.size(); i++) na.add(i == defIndex ? def : attrs.get(i));
            if (defIndex < 0) na.add(def);
            JsonObjectBuilder ni = Json.createObjectBuilder(item);
            ni.add("attributes", na);
            out.add(ni);
        }
        if (changes.isEmpty()) return new Result(text, changes, nodes);
        JsonObjectBuilder nr = Json.createObjectBuilder(root);
        nr.add("results", out);
        StringWriter sw = new StringWriter(text.length() + 256);
        try (JsonWriter w = Json.createWriter(sw)) {
            w.writeObject(nr.build());
        }
        return new Result(sw.toString(), changes, nodes);
    }

    /** ids do item principal no pedido: {"command":"duplicate","ids":["..."]}; null se nao for duplicacao. */
    static Set<String> duplicateRoots(String requestBody) {
        JsonObject req;
        try (JsonReader r = Json.createReader(new StringReader(requestBody))) {
            req = r.readObject();
        }
        if (!"duplicate".equals(req.getString("command", ""))) return null;
        JsonArray ids = req.getJsonArray("ids");
        if (ids == null || ids.isEmpty()) return null;
        java.util.Set<String> s = new java.util.HashSet<>();
        for (JsonValue v : ids) if (v instanceof JsonString js) s.add(js.getString());
        return s;
    }

    /** "duplicar_com_desenhos" | "duplicar" | "reutilizar" | "padrao" -> codigo do servidor (null = nao mexer). */
    static Integer code(String name) {
        return switch (name == null ? "" : name) {
            case "duplicar_com_desenhos" -> DUPLICAR_COM_DESENHOS;
            case "duplicar" -> DUPLICAR;
            case "reutilizar" -> REUTILIZAR;
            default -> null;
        };
    }

    static String name(int code) {
        return switch (code) {
            case DUPLICAR -> "Duplicar";
            case REUTILIZAR -> "Reutilizar";
            case 3 -> "Excluir";
            case 6 -> "Ramificar";
            case DUPLICAR_COM_DESENHOS -> "Duplicar com Desenhos";
            case -1 -> "(sem)";
            default -> String.valueOf(code);
        };
    }

    private static boolean has(JsonArray arr, int v) {
        for (JsonValue x : arr) if (intOf(x) == v) return true;
        return false;
    }

    private static int intOf(JsonValue v) {
        if (v instanceof jakarta.json.JsonNumber n) return n.intValue();
        if (v instanceof JsonString s) {
            try {
                return Integer.parseInt(s.getString().trim());
            } catch (NumberFormatException e) {
                return -1;
            }
        }
        return -1;
    }

    private static String str(JsonValue v) {
        return v instanceof JsonString s ? s.getString() : v == null || v == JsonValue.NULL ? null : v.toString();
    }
}
