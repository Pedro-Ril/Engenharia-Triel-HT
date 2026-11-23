package br.com.trielht.plm.core;

import jakarta.json.Json;
import jakarta.json.JsonArrayBuilder;
import jakarta.json.JsonObject;
import jakarta.json.JsonObjectBuilder;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * O que um trabalho fez: itens (objeto afetado, de -> para), totais, resumo e erro.
 * Vira as linhas de portal_3dx_plugins_itens e o fechamento de portal_3dx_plugins_execucoes.
 */
public final class Report {

    /** Acima disso so os totais sao gravados (varredura com dezenas de milhares de desenhos). */
    public static final int MAX_ITEMS = 5000;

    final Job job;
    final LocalDateTime startedAt = LocalDateTime.now();
    final long startMs = System.currentTimeMillis();
    final List<JsonObject> items = new ArrayList<>();
    int ok;
    int failed;
    int dropped;
    Integer totalOverride;
    /** concluida | parcial | falha | ignorada -- null = decide pelos totais */
    String status;
    String summary;
    String error;

    Report(Job job) {
        this.job = job;
    }

    public Job job() {
        return job;
    }

    /** Fluente para montar um item: rep.item("vinculo_criado", true).target(...).change(antes, depois).add(). */
    public final class Item {
        private final JsonObjectBuilder b = Json.createObjectBuilder();
        private final boolean success;

        Item(String action, boolean success) {
            this.success = success;
            b.add("acao", action);
            b.add("sucesso", success);
        }

        public Item target(String pid, String type, String name, String revision, String title) {
            Json2.put(b, "alvo_physicalid", pid);
            Json2.put(b, "alvo_tipo", type);
            Json2.put(b, "alvo_nome", name);
            Json2.put(b, "alvo_revisao", revision);
            Json2.put(b, "alvo_titulo", Core.cut(title, 300));
            return this;
        }

        public Item state(String state, String owner) {
            Json2.put(b, "alvo_estado", state);
            Json2.put(b, "alvo_owner", owner);
            return this;
        }

        public Item change(String before, String after) {
            Json2.put(b, "valor_antes", Core.cut(before, 1000));
            Json2.put(b, "valor_depois", Core.cut(after, 1000));
            return this;
        }

        public Item message(String msg) {
            Json2.put(b, "mensagem", Core.cut(msg, 2000));
            return this;
        }

        public void add() {
            synchronized (Report.this) {
                if (success) ok++;
                else failed++;
                if (items.size() >= MAX_ITEMS) {
                    dropped++;
                    return;
                }
                b.add("ordem", items.size() + 1);
                items.add(b.build());
            }
        }
    }

    public Item item(String action, boolean success) {
        return new Item(action, success);
    }

    /** Totais sem item (ex.: varredura: so os desenhos com alteracao viram item). */
    public synchronized void count(boolean success) {
        if (success) ok++;
        else failed++;
    }

    public synchronized void total(int total) {
        totalOverride = total;
    }

    public void summary(String text) {
        summary = Core.cut(text, 1000);
    }

    public void ignore(String reason) {
        status = "ignorada";
        summary = Core.cut(reason, 1000);
    }

    public void fail(String reason) {
        status = "falha";
        error = Core.cut(reason, 4000);
    }

    public void info(String msg) {
        Writer.event(job.plugin, "info", msg, null, job.local ? null : job.id);
        Core.LOG.info("[TRIEL-{}] {} {}", job.plugin, job.label(), msg);
    }

    public void warn(String msg) {
        Writer.event(job.plugin, "aviso", msg, null, job.local ? null : job.id);
        Core.LOG.warn("[TRIEL-{}] {} {}", job.plugin, job.label(), msg);
    }

    /** Trabalho longo: avisa o banco que o no continua vivo (senao outro no retoma o trabalho). */
    public void touch() {
        if (!job.local) Writer.touch(job.id);
    }

    synchronized String finalStatus() {
        if (status != null) return status;
        if (failed > 0) return ok > 0 ? "parcial" : "falha";
        return "concluida";
    }

    synchronized JsonObject toJson(LocalDateTime finishedAt) {
        JsonArrayBuilder arr = Json.createArrayBuilder();
        for (JsonObject i : items) arr.add(i);
        JsonObjectBuilder b = Json.createObjectBuilder();
        b.add("job", job.toJson());
        b.add("status", finalStatus());
        b.add("iniciado_em", startedAt.toString());
        b.add("finalizado_em", finishedAt.toString());
        b.add("duracao_ms", (int) Math.min(Integer.MAX_VALUE, System.currentTimeMillis() - startMs));
        b.add("total_itens", totalOverride != null ? totalOverride : ok + failed);
        b.add("total_ok", ok);
        b.add("total_falhas", failed);
        String sum = summary;
        if (dropped > 0) sum = Core.cut((sum == null ? "" : sum + " ") + "(" + dropped + " item(ns) alem de " + MAX_ITEMS
                + " nao detalhado(s))", 1000);
        Json2.put(b, "resumo", sum);
        Json2.put(b, "erro", error);
        b.add("itens", arr);
        return b.build();
    }
}
