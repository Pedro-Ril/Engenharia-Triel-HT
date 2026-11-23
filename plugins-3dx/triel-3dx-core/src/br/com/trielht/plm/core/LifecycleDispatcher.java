package br.com.trielht.plm.core;

import com.dassault_systemes.lifecycle.itf.CompletionObject;
import com.dassault_systemes.lifecycle.itf.ENOLifecycleExtensionAdapter;

import matrix.db.Context;

/**
 * Unico ponto de entrada no Collaborative Lifecycle (META-INF/services/...ENOLifecycleExtensionItf do nucleo).
 *
 * Repassa o pos-processamento de cada comando (Change Status, Duplicate, ...) aos plugins instalados que nao estao
 * DESLIGADOS. Qualquer erro de plugin fica no log/banco: a operacao do usuario nunca falha por causa de um plugin.
 */
public class LifecycleDispatcher extends ENOLifecycleExtensionAdapter {

    private static final String SUCCESS = "{\"result\": \"success\"}";
    /** Um id por comando do usuario: os trabalhos que os plugins criam a partir dele ficam ligados no Portal. */
    private static final ThreadLocal<java.util.UUID> CORRELATION = new ThreadLocal<>();

    static java.util.UUID currentCorrelation() {
        return CORRELATION.get();
    }

    @Override
    public String Postprocess(Context context, String command, boolean wholeStructure, CompletionObject completion) {
        if (command == null || completion == null) return SUCCESS;
        CORRELATION.set(java.util.UUID.randomUUID());
        try {
            dispatch(context, command, completion);
        } finally {
            CORRELATION.remove();
        }
        return SUCCESS;
    }

    private static void dispatch(Context context, String command, CompletionObject completion) {
        for (PluginModule m : Plugins.all()) {
            PluginConfig.Settings cfg = PluginConfig.of(m.key());
            if (cfg.off()) continue;
            long start = System.currentTimeMillis();
            try {
                m.onPostprocess(context, command, completion, cfg);
            } catch (Throwable e) {
                Core.LOG.warn("[TRIEL-{}] Falha no pos-processamento de '{}': {}", m.key(), command, Core.rootMessage(e), e);
                Writer.event(m.key(), "erro", "Falha no pós-processamento de '" + command + "': " + Core.rootMessage(e),
                        null, null);
            }
            long ms = System.currentTimeMillis() - start;
            if (ms > 2_000) {
                Writer.event(m.key(), "aviso", "Pós-processamento de '" + command + "' levou " + ms + " ms", null, null);
            }
        }
    }
}
