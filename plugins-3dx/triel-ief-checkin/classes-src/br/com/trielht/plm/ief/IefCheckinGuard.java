package br.com.trielht.plm.ief;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Correcao Triel para o ENOIEFCheckinHandler (salvamento pelo conector CAD, R2026x). Fica em WEB-INF/classes junto
 * com a classe da Dassault corrigida e NAO depende do nucleo dos plugins: se o TrielIefCheckin.jar sumir, o
 * salvamento continua funcionando (no comportamento original).
 *
 * O defeito: a cada salvamento o handler liga um timer (a cada 2 s confere se o salvamento foi cancelado), guarda em
 * campo ESTATICO e nunca o encerra no fim. Quando um timer ve "cancelado", ele limpa o cache da sessao do usuario,
 * aborta a transacao em andamento dessa sessao e desliga o timer do campo estatico -- que e o MAIS NOVO do servidor,
 * nao necessariamente o dele. Se ja havia um salvamento mais novo, o timer do cancelado sobrevive (orfao) e, a cada
 * salvamento seguinte do mesmo usuario, aborta a transacao e limpa o cache: o commit quebra com
 * NPE em ENOIEFCommitHandler.run:143 ("Map.get ... null") ate o usuario fechar o SOLIDWORKS.
 *
 * Na classe corrigida, execute() passa a ser:
 *   int m = enter(this); try { execute original } catch (Throwable t) { failed(this, m, t); throw t; } exit(m);
 * e o Executors.newScheduledThreadPool de dentro dele vira newScheduler(). O modo vem do plugin "ief-checkin"
 * (Portal), via configure():
 *   DESLIGADO -- exatamente o original da Dassault (nem conta);
 *   SIMULACAO -- original, mas conta salvamentos, timers e cancelamentos e detecta os orfaos;
 *   ATIVO     -- exit() encerra o timer criado naquele salvamento (nao sobra timer para virar orfao); ao entrar em
 *                Ativo, closeEnded() encerra as sobras da Simulacao (1.2); e o desligamento pedido pelo cancelamento
 *                de um salvamento vai para o timer DELE, nao para o de outro salvamento em andamento (1.2).
 * Enquanto o plugin nao informa o modo, vale SIMULACAO (comportamento original).
 *
 * Deteccao de orfao: cada timer sabe de qual salvamento (handler) e se esse salvamento ja terminou. Quando a Dassault
 * desliga um timer (shutdown) de dentro da thread de OUTRO timer, ou da thread de outro salvamento, o guard avisa o
 * plugin: ORFAO_AGIU (o salvamento do timer que desligou ja tinha terminado: e o orfao derrubando a sessao) ou
 * ORFAO_NASCEU (cancelamento detectado durante o salvamento, mas o timer desligado era o de outro salvamento).
 */
public final class IefCheckinGuard {

    public static final int DESLIGADO = 0;
    public static final int SIMULACAO = 1;
    public static final int ATIVO = 2;

    /** Tipos de evento de orfao (Listener.orphan). */
    public static final int ORFAO_NASCEU = 1;
    public static final int ORFAO_AGIU = 2;
    /** Ativo (1.2): a Dassault ia desligar o timer de outro salvamento em andamento; a correcao desligou o do cancelado. */
    public static final int DESVIO_CORRIGIDO = 3;

    /** Recebe os eventos (o plugin registra no Portal). Chamado na thread do salvamento ou do timer. */
    public interface Listener {
        void failed(Object handler, Throwable error, long millis);

        /**
         * Um timer foi desligado por causa do cancelamento de OUTRO salvamento. culprit = handler do salvamento
         * cancelado (cujo timer sobrevive), victim = handler do salvamento cujo timer foi desligado.
         */
        default void orphan(int kind, Object culprit, Object victim, long culpritAgeMillis) {
        }

        /**
         * (1.3) Verificacao de cliente ANTIGA (de uma operacao ja substituida, tipicamente um salvamento cancelado):
         * acting = true -> Simulacao, ela vai agir agora (abortar o salvamento em andamento, limpar o cache, marcar
         * cancelado); false -> Ativo, a correcao a encerrou sem agir. tracked = operacao que ela acompanhava.
         */
        default void staleVerifier(Object tracked, boolean acting) {
        }
    }

    private static volatile int mode = SIMULACAO;
    private static volatile Listener listener;

    /** Estado por thread: execute() em andamento (handler e inicio de cada um) e timers criados neles. */
    private static final class State {
        final List<Timer> own = new ArrayList<>(2);
        long[] starts = new long[4];
        Object[] handlers = new Object[4];
        int depth;
    }

    private static final ThreadLocal<State> STATE = new ThreadLocal<>();
    /** Nas threads dos timers: qual timer e. */
    private static final ThreadLocal<Timer> RUNNING = new ThreadLocal<>();
    private static final AtomicInteger SEQ = new AtomicInteger();

    // contadores desde a subida (o plugin le e registra o resumo)
    private static final AtomicLong SAVES = new AtomicLong();
    private static final AtomicLong ERRORS = new AtomicLong();
    private static final AtomicLong CREATED = new AtomicLong();
    private static final AtomicLong CLOSED_BY_FIX = new AtomicLong();
    private static final AtomicLong CLOSED_BY_DASSAULT = new AtomicLong();
    private static final AtomicLong LEFT_ALIVE = new AtomicLong();
    private static final AtomicInteger LIVE = new AtomicInteger();
    private static final AtomicLong ORPHANS_BORN = new AtomicLong();
    private static final AtomicLong ORPHAN_ACTS = new AtomicLong();
    private static final AtomicLong LEFTOVERS_CLOSED = new AtomicLong();
    private static final AtomicLong REDIRECTED = new AtomicLong();
    private static final AtomicLong STALE_SKIPPED = new AtomicLong();
    private static final AtomicLong STALE_ACTED = new AtomicLong();
    /** Chave da verificacao de cliente atual na sessao (ENOIEFManager.createClientExistanceCheckTimer). */
    private static final String CHECK_TIMER_KEY = "MCAD_CLIENT_CHECK_TIMER";
    /** Todos os timers vivos criados pelo guard (sai no terminated). */
    private static final java.util.Set<Timer> ALL = java.util.concurrent.ConcurrentHashMap.newKeySet();

    private IefCheckinGuard() {
    }

    // ------------------------------------------------------------------ plugin

    public static void configure(int newMode) {
        mode = newMode == DESLIGADO || newMode == ATIVO ? newMode : SIMULACAO;
    }

    public static int mode() {
        return mode;
    }

    public static void setListener(Listener l) {
        listener = l;
    }

    /**
     * Contadores desde a subida: [salvamentos, salvamentos com erro, timers criados, encerrados pela correcao,
     * encerrados pela Dassault (cancelamento), deixados vivos no fim do salvamento (simulacao), vivos agora,
     * orfaos nascidos, acoes de orfao, sobras encerradas ao entrar em Ativo, desligamentos desviados,
     * verificacoes antigas encerradas (Ativo), verificacoes antigas que agiram (Simulacao)].
     */
    public static long[] counters() {
        return new long[] {SAVES.get(), ERRORS.get(), CREATED.get(), CLOSED_BY_FIX.get(), CLOSED_BY_DASSAULT.get(),
                LEFT_ALIVE.get(), LIVE.get(), ORPHANS_BORN.get(), ORPHAN_ACTS.get(), LEFTOVERS_CLOSED.get(),
                REDIRECTED.get(), STALE_SKIPPED.get(), STALE_ACTED.get()};
    }

    // ------------------------------------------------------------------ (1.3) verificacao de cliente antiga

    /**
     * Inicio de cada passada (30 s) da verificacao de cliente da Dassault (ENOIEFClientExistanceVerifier, um
     * java.util.Timer por operacao; chamada pela classe ENOIEFExistanceVerifier corrigida). O SOLIDWORKS so avisa
     * "estou vivo" a verificacao ATUAL da sessao (chave MCAD_CLIENT_CHECK_TIMER). A de uma operacao cancelada nao e
     * encerrada pela Dassault, deixa de receber aviso e, ~60 s depois, conclui que o cliente sumiu: aborta o salvamento
     * em andamento da sessao, limpa o cache e marca a operacao como cancelada (reativando timers orfaos).
     *
     * Se esta verificacao ja nao e a atual da sessao (outra a substituiu, ou a chave foi removida no fim normal de
     * uma operacao posterior -- em ambos os casos o cliente mandou outra operacao depois, entao esta vivo):
     *   Ativo     -- encerra a verificacao e devolve true (a passada nao faz nada);
     *   Simulacao -- devolve false (original) e avisa quando ela vai agir agora.
     * Qualquer duvida (sessao/campo nao encontrado, erro): false = comportamento original.
     */
    public static boolean verifierTick(Object verifier) {
        try {
            if (mode == DESLIGADO || verifier == null) return false;
            Object session = field(verifier, "integSessionData");
            if (session == null) return false;
            Object current = session.getClass().getMethod("getSessionObjectByKey", String.class)
                    .invoke(session, CHECK_TIMER_KEY);
            // Sem verificacao atual tambem e antiga: no fim normal de cada salvamento a Dassault cancela a atual e
            // remove a chave (IEFManager.removeClientExistanceCheckTimer); a de um salvamento cancelado ja tinha sido
            // substituida e continua rodando com a chave vazia. A atual nunca roda com a chave apontando para outra.
            if (current == verifier) return false;
            Object tracked = field(verifier, "beanThreadBeingTracked");
            if (mode == ATIVO) {
                if (verifier instanceof java.util.Timer t) t.cancel();
                STALE_SKIPPED.incrementAndGet();
                notifyStale(tracked, false);
                return true;
            }
            if (Boolean.FALSE.equals(field(verifier, "isClientExists"))) {
                STALE_ACTED.incrementAndGet();
                notifyStale(tracked, true);
            }
            return false;
        } catch (Throwable t) {
            return false;
        }
    }

    private static void notifyStale(Object tracked, boolean acting) {
        try {
            Listener l = listener;
            if (l != null) l.staleVerifier(tracked, acting);
        } catch (Throwable ignored) {
            // so observacao
        }
    }

    /** Valor de um campo (de qualquer visibilidade), procurando da classe concreta para as superclasses. */
    private static Object field(Object target, String name) throws ReflectiveOperationException {
        for (Class<?> k = target.getClass(); k != null; k = k.getSuperclass()) {
            try {
                java.lang.reflect.Field f = k.getDeclaredField(name);
                f.setAccessible(true);
                return f.get(target);
            } catch (NoSuchFieldException e) {
                // superclasse
            }
        }
        throw new NoSuchFieldException(name);
    }

    /**
     * Em Ativo: encerra os timers de salvamentos que ja terminaram (sobras da Simulacao, inclusive orfaos). Eles so
     * serviam para detectar o cancelamento daquele salvamento; vivos, so podem virar orfao. Devolve quantos encerrou.
     */
    public static int closeEnded() {
        if (mode != ATIVO) return 0;
        int n = 0;
        for (Timer t : ALL) {
            if (t.ended && !t.isShutdown() && t.closeLeftover()) n++;
        }
        return n;
    }

    // ------------------------------------------------------------------ chamadas da classe corrigida

    /** Inicio de um execute() (sem o handler: classe corrigida 1.0.0). */
    public static int enter() {
        return enter(null);
    }

    /** Inicio de um execute(): devolve quantos timers esta thread ja tinha (chamada aninhada). */
    public static int enter(Object handler) {
        try {
            if (mode == DESLIGADO) return -1;
            SAVES.incrementAndGet();
            State s = STATE.get();
            if (s == null) {
                s = new State();
                STATE.set(s);
            }
            if (s.depth == s.starts.length) {
                s.starts = java.util.Arrays.copyOf(s.starts, s.depth * 2);
                s.handlers = java.util.Arrays.copyOf(s.handlers, s.depth * 2);
            }
            s.handlers[s.depth] = handler;
            s.starts[s.depth++] = System.nanoTime();
            return s.own.size();
        } catch (RuntimeException e) {
            return -1;
        }
    }

    /** No lugar de Executors.newScheduledThreadPool(n) dentro de execute(): mesmo comportamento, thread com nome. */
    public static ScheduledExecutorService newScheduler(int threads) {
        State s = mode == DESLIGADO ? null : STATE.get();
        if (s == null || s.depth == 0) return Executors.newScheduledThreadPool(threads);
        Timer t = Timer.create(Math.max(1, threads), SEQ.incrementAndGet(), s.handlers[s.depth - 1]);
        s.own.add(t);
        return t;
    }

    /** Fim normal do execute(). */
    public static void exit(int mark) {
        try {
            close(mark);
        } catch (RuntimeException ignored) {
            // nunca atrapalha o salvamento
        }
    }

    /** execute() terminou com erro: encerra como no fim normal e avisa o plugin. Nunca lanca nada. */
    public static void failed(Object handler, int mark, Throwable error) {
        long ms = -1;
        try {
            if (mark >= 0) {
                ERRORS.incrementAndGet();
                State s = STATE.get();
                if (s != null && s.depth > 0) ms = (System.nanoTime() - s.starts[s.depth - 1]) / 1_000_000L;
            }
            close(mark);
        } catch (RuntimeException ignored) {
            // nada
        }
        Listener l = listener;
        if (l == null || mark < 0) return;
        try {
            l.failed(handler, error, ms);
        } catch (Throwable ignored) {
            // o registro nunca muda o erro que o usuario recebe
        }
    }

    private static void close(int mark) {
        if (mark < 0) return;
        State s = STATE.get();
        if (s == null) return;
        boolean active = mode == ATIVO;
        while (s.own.size() > mark) {
            Timer t = s.own.remove(s.own.size() - 1);
            t.ended = true;
            if (t.isShutdown()) continue;
            if (active) t.closeByFix();
            else LEFT_ALIVE.incrementAndGet();
        }
        if (s.depth > 0) s.handlers[--s.depth] = null;
        if (s.depth == 0) STATE.remove();
    }

    /**
     * Quem pediu para desligar o timer {@code victim}: o timer ou o salvamento (thread) de OUTRO salvamento, ou null
     * (o proprio salvamento dele, ou origem desconhecida).
     */
    private static Timer culpritFor(Timer victim) {
        try {
            Timer culprit = RUNNING.get();
            if (culprit == null) {
                // desligado da thread de um salvamento (cancelamento detectado dentro do execute)
                State s = STATE.get();
                if (s == null || s.own.isEmpty()) return null;
                culprit = s.own.get(s.own.size() - 1);
            }
            return culprit == victim ? null : culprit;
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static void notifyOrphan(int kind, Timer culprit, Timer victim) {
        try {
            (kind == ORFAO_AGIU ? ORPHAN_ACTS : kind == ORFAO_NASCEU ? ORPHANS_BORN : REDIRECTED).incrementAndGet();
            Listener l = listener;
            if (l != null) l.orphan(kind, culprit.handler, victim.handler, System.currentTimeMillis() - culprit.created);
        } catch (Throwable ignored) {
            // so observacao: nunca muda o que a Dassault faz
        }
    }

    /** Cria as threads do timer (com nome, daemon) e marca em cada uma de qual timer ela e. */
    static final class Factory implements ThreadFactory {
        private final AtomicInteger t = new AtomicInteger();
        private final int n;
        private final int threads;
        volatile Timer owner;

        Factory(int threads, int n) {
            this.threads = threads;
            this.n = n;
        }

        @Override
        public Thread newThread(Runnable r) {
            Timer o = owner;
            Thread th = new Thread(() -> {
                RUNNING.set(o);
                r.run();
            }, "triel-ief-checkin-" + n + (threads > 1 ? "-" + t.incrementAndGet() : ""));
            th.setDaemon(true);
            return th;
        }
    }

    /** O timer do salvamento: igual ao Executors.newScheduledThreadPool, com nome, dono e contagem. */
    static final class Timer extends ScheduledThreadPoolExecutor {
        private final AtomicBoolean closed = new AtomicBoolean();
        final Object handler;
        final long created = System.currentTimeMillis();
        /** O execute() que criou este timer ja terminou. */
        volatile boolean ended;

        static Timer create(int threads, int n, Object handler) {
            Factory f = new Factory(threads, n);
            Timer t = new Timer(threads, f, handler);
            f.owner = t;
            return t;
        }

        private Timer(int threads, Factory f, Object handler) {
            super(threads, f);
            this.handler = handler;
            setRemoveOnCancelPolicy(true);
            CREATED.incrementAndGet();
            LIVE.incrementAndGet();
            ALL.add(this);
        }

        void closeByFix() {
            if (closed.compareAndSet(false, true)) CLOSED_BY_FIX.incrementAndGet();
            super.shutdown();
        }

        /** Sobra de salvamento terminado, encerrada ao entrar em Ativo. */
        boolean closeLeftover() {
            boolean first = closed.compareAndSet(false, true);
            if (first) LEFTOVERS_CLOSED.incrementAndGet();
            super.shutdown();
            return first;
        }

        /** Desligado no lugar de outro (cancelamento deste salvamento, desvio do Ativo). */
        private boolean closeAsCancelled() {
            boolean first = closed.compareAndSet(false, true);
            if (first) CLOSED_BY_DASSAULT.incrementAndGet();
            super.shutdown();
            return first;
        }

        /**
         * Chamado pela propria Dassault quando algum timer ou salvamento detecta cancelamento: ela desliga o timer do
         * campo estatico, que e o MAIS NOVO do servidor. Se quem detectou foi outro salvamento:
         *  - Ativo e este salvamento ainda em andamento: desliga o timer de quem cancelou e mantem este (o que a
         *    Dassault pretendia), para este salvamento nao perder a deteccao de cancelamento;
         *  - senao: comportamento original, so registrando (orfao nasceu / orfao agiu).
         */
        @Override
        public void shutdown() {
            Timer culprit = culpritFor(this);
            if (culprit != null && mode == ATIVO && !ended) {
                boolean wasOrphan = culprit.ended;
                // a Dassault pode pedir de novo (varias conferencias no mesmo cancelamento): registra so a primeira
                if (culprit.closeAsCancelled()) notifyOrphan(wasOrphan ? ORFAO_AGIU : DESVIO_CORRIGIDO, culprit, this);
                return;
            }
            if (closed.compareAndSet(false, true)) {
                CLOSED_BY_DASSAULT.incrementAndGet();
                if (culprit != null) notifyOrphan(culprit.ended ? ORFAO_AGIU : ORFAO_NASCEU, culprit, this);
            }
            super.shutdown();
        }

        @Override
        protected void terminated() {
            ALL.remove(this);
            LIVE.decrementAndGet();
            super.terminated();
        }
    }
}
