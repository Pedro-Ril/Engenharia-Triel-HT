package br.com.trielht.plm.core;

import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.json.JsonObjectBuilder;
import jakarta.json.JsonValue;

import java.util.UUID;

/**
 * Um trabalho de plugin (uma linha de dbo.portal_3dx_plugins_execucoes).
 *
 * Nasce na liberacao/duplicacao (gatilho), na rotina noturna ou por acao manual no Portal. Os dados do objeto sao a
 * "foto" da hora (nome, revisao, titulo) -- o Portal mostra o que era no momento, mesmo que o objeto mude depois.
 */
public final class Job {

    public UUID id = UUID.randomUUID();
    public String plugin;
    /** PRODUCAO | TESTE -- o do no que criou (ou o escolhido no Portal, na acao manual) */
    public String ambiente;
    /** liberacao | duplicacao | noturna | manual */
    public String trigger;
    public PluginConfig.Mode mode = PluginConfig.Mode.SIMULACAO;
    public String dedupKey;
    public UUID correlationId;
    public JsonObject params = JsonValue.EMPTY_JSON_OBJECT;
    public String objectPid;
    public String objectId;
    public String objectType;
    public String objectName;
    public String objectRevision;
    public String objectTitle;
    /** login do 3DEXPERIENCE de quem fez a acao */
    public String actorLogin;
    /** segundos a esperar antes de processar */
    public int delaySeconds;
    public int attempts;
    /** true = nao esta no banco (banco fora do ar na hora): roda direto e o registro vai depois, pelo spool */
    public boolean local;

    public static Job of(String plugin, String trigger, PluginConfig.Mode mode) {
        Job j = new Job();
        j.plugin = plugin;
        j.trigger = trigger;
        j.mode = mode;
        j.correlationId = LifecycleDispatcher.currentCorrelation();
        j.ambiente = Core.ambiente();
        return j;
    }

    public Job object(String pid, String id, String type, String name, String revision, String title) {
        objectPid = pid;
        objectId = id;
        objectType = type;
        objectName = name;
        objectRevision = revision;
        objectTitle = title;
        return this;
    }

    public String label() {
        StringBuilder sb = new StringBuilder();
        if (objectName != null) sb.append(objectName);
        if (objectRevision != null) sb.append(' ').append(objectRevision);
        if (objectTitle != null && !objectTitle.isEmpty()) sb.append(" '").append(objectTitle).append('\'');
        return sb.length() == 0 ? plugin + " " + trigger : sb.toString();
    }

    public String param(String name, String def) {
        return params.containsKey(name) && !params.isNull(name) ? params.getString(name, def) : def;
    }

    JsonObject toJson() {
        JsonObjectBuilder b = Json.createObjectBuilder();
        Json2.put(b, "id", id.toString());
        Json2.put(b, "plugin", plugin);
        Json2.put(b, "ambiente", ambiente);
        Json2.put(b, "trigger", trigger);
        Json2.put(b, "mode", mode.name());
        Json2.put(b, "dedupKey", dedupKey);
        Json2.put(b, "correlationId", correlationId == null ? null : correlationId.toString());
        b.add("params", params);
        Json2.put(b, "objectPid", objectPid);
        Json2.put(b, "objectId", objectId);
        Json2.put(b, "objectType", objectType);
        Json2.put(b, "objectName", objectName);
        Json2.put(b, "objectRevision", objectRevision);
        Json2.put(b, "objectTitle", objectTitle);
        Json2.put(b, "actorLogin", actorLogin);
        b.add("delaySeconds", delaySeconds);
        b.add("attempts", attempts);
        b.add("local", local);
        return b.build();
    }

    static Job fromJson(JsonObject o) {
        Job j = new Job();
        j.id = UUID.fromString(o.getString("id"));
        j.plugin = Json2.str(o, "plugin");
        j.ambiente = Json2.str(o, "ambiente");
        j.trigger = Json2.str(o, "trigger");
        j.mode = PluginConfig.Mode.valueOf(o.getString("mode", "SIMULACAO"));
        j.dedupKey = Json2.str(o, "dedupKey");
        String corr = Json2.str(o, "correlationId");
        j.correlationId = corr == null ? null : UUID.fromString(corr);
        j.params = o.containsKey("params") && o.get("params") instanceof JsonObject p ? p : JsonValue.EMPTY_JSON_OBJECT;
        j.objectPid = Json2.str(o, "objectPid");
        j.objectId = Json2.str(o, "objectId");
        j.objectType = Json2.str(o, "objectType");
        j.objectName = Json2.str(o, "objectName");
        j.objectRevision = Json2.str(o, "objectRevision");
        j.objectTitle = Json2.str(o, "objectTitle");
        j.actorLogin = Json2.str(o, "actorLogin");
        j.delaySeconds = o.getInt("delaySeconds", 0);
        j.attempts = o.getInt("attempts", 0);
        j.local = o.getBoolean("local", false);
        return j;
    }
}
