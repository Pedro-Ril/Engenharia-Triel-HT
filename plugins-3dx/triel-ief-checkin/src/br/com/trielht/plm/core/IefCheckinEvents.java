package br.com.trielht.plm.core;

/**
 * Ponte publica para o registro de eventos do nucleo (Writer.event e de pacote). Fica neste jar, no pacote do
 * nucleo, para o plugin ief-checkin registrar com o nucleo 1.4.0 ja instalado (mesma ideia da EventBridge do
 * maturity-state; nome proprio para os dois jars nao terem a mesma classe).
 */
public final class IefCheckinEvents {

    private IefCheckinEvents() {
    }

    /** level: info | aviso | erro. Assincrono (thread do nucleo); nunca bloqueia nem falha quem chama. */
    public static void event(String plugin, String level, String message, String detail) {
        try {
            Writer.event(plugin, level, message, detail, null);
        } catch (RuntimeException e) {
            Core.LOG.debug("[TRIEL-{}] Evento nao registrado: {}", plugin, e.getMessage());
        }
    }
}
