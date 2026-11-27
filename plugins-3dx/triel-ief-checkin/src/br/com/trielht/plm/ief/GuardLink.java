package br.com.trielht.plm.ief;

/**
 * Unico ponto do jar que toca no IefCheckinGuard (que fica em WEB-INF/classes). Se a classe corrigida nao estiver
 * instalada, o erro (LinkageError) aparece so quando esta classe for usada, e o modulo o trata; o modulo em si (e o
 * ServiceLoader do nucleo, que carrega todos os plugins) nunca depende dela para carregar.
 */
final class GuardLink {

    interface Callback {
        void failed(Object handler, Throwable error, long millis);

        /** kind: 1 orfao nasceu, 2 orfao agiu, 3 desligamento desviado em Ativo (ver IefCheckinGuard). */
        void orphan(int kind, Object culprit, Object victim, long culpritAgeMillis);

        /** (1.3) verificacao de cliente antiga: acting = vai agir agora (Simulacao); false = encerrada (Ativo). */
        void staleVerifier(Object tracked, boolean acting);
    }

    private GuardLink() {
    }

    /** mode: 0 desligado, 1 simulacao, 2 ativo. */
    static void configure(int mode) {
        IefCheckinGuard.configure(mode);
    }

    static long[] counters() {
        return IefCheckinGuard.counters();
    }

    /** Em Ativo: encerra os timers de salvamentos ja terminados (sobras da Simulacao). Classe 1.2+. */
    static int closeEnded() {
        return IefCheckinGuard.closeEnded();
    }

    static void listen(Callback cb) {
        if (cb == null) {
            IefCheckinGuard.setListener(null);
            return;
        }
        IefCheckinGuard.setListener(new IefCheckinGuard.Listener() {
            @Override
            public void failed(Object handler, Throwable error, long millis) {
                cb.failed(handler, error, millis);
            }

            @Override
            public void orphan(int kind, Object culprit, Object victim, long culpritAgeMillis) {
                cb.orphan(kind, culprit, victim, culpritAgeMillis);
            }

            @Override
            public void staleVerifier(Object tracked, boolean acting) {
                cb.staleVerifier(tracked, acting);
            }
        });
    }
}
