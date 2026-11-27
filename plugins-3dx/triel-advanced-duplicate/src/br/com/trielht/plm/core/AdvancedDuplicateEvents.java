package br.com.trielht.plm.core;

/**
 * Ponte publica para o registro de eventos do nucleo (Writer.event e de pacote). Fica neste jar, no pacote do
 * nucleo, para o plugin advanced-duplicate registrar com o nucleo 1.4.0 ja instalado (mesma ideia da EventBridge do
 * maturity-state; nome proprio para os jars nao terem a mesma classe).
 */
public final class AdvancedDuplicateEvents {

    private AdvancedDuplicateEvents() {
    }

    /** level: info | aviso | erro. Assincrono (thread do nucleo); nunca bloqueia nem falha a requisicao. */
    public static void event(String plugin, String level, String message, String detail) {
        try {
            Writer.event(plugin, level, message, detail, null);
        } catch (RuntimeException e) {
            Core.LOG.debug("[TRIEL-{}] Evento nao registrado: {}", plugin, e.getMessage());
        }
    }
}
