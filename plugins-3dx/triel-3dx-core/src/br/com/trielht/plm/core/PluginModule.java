package br.com.trielht.plm.core;

import com.dassault_systemes.lifecycle.itf.CompletionObject;

import matrix.db.Context;

/**
 * Um plugin Triel (um jar), descoberto pelo nucleo via META-INF/services/br.com.trielht.plm.core.PluginModule.
 *
 * O nucleo cuida de: configuracao (modo/parametros vindos do Portal), fila persistente, registro no banco,
 * heartbeat e tratamento de erro. O modulo so implementa a regra de negocio.
 */
public interface PluginModule {

    /** Chave em dbo.portal_3dx_plugins (ex.: "replace-revision"). */
    String key();

    /** Versao do jar (aparece em Plugins 3DX > Saude dos nos). */
    String version();

    /**
     * Historico das versoes deste plugin (o mais novo primeiro), gravado no Portal na subida do no.
     * Toda mudanca no jar sobe version() e ganha uma linha aqui.
     */
    default java.util.List<Release> releases() {
        return java.util.List.of();
    }

    /** Subida do 3DSpace (ex.: agendar rotina noturna). */
    default void start() {
    }

    default void stop() {
    }

    /**
     * Pos-processamento de comando do Collaborative Lifecycle (thread do usuario: so decidir e enfileirar/registrar,
     * nunca esperar). Nao e chamado com o plugin DESLIGADO. Erros aqui sao registrados e nunca chegam ao usuario.
     */
    default void onPostprocess(Context ctx, String command, CompletionObject completion, PluginConfig.Settings cfg)
            throws Exception {
    }

    /** Trabalho da fila (thread do nucleo). Registra o que fez em rep. Com cfg.simulate(), nao altera nada no 3DX. */
    default void run(Job job, Report rep, PluginConfig.Settings cfg) throws Exception {
        rep.ignore("Plugin sem trabalho em segundo plano");
    }
}
