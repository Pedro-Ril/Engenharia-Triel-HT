import br.com.trielht.plm.ief.IefCheckinGuard;
import java.util.concurrent.*;
import java.util.*;

/**
 * Testes do IefCheckinGuard (modos, erro, cancelamento, aninhamento). Uso: javac -d c ../classes-src/.../IefCheckinGuard.java;
 * javac -cp c GuardTest.java; java -cp c:. GuardTest
 */
public class GuardTest {
    static int fails = 0;
    static void check(boolean ok, String what) { System.out.println((ok ? "ok   " : "FALHA ") + what); if (!ok) fails++; }
    static long live() { return IefCheckinGuard.counters()[6]; }
    static void waitLive(long expected) throws Exception { for (int i = 0; i < 50 && live() != expected; i++) Thread.sleep(50); }
    static ScheduledExecutorService save(boolean throwIt, Object h) throws Exception {
        int m = IefCheckinGuard.enter();
        ScheduledExecutorService s = null;
        try {
            s = IefCheckinGuard.newScheduler(1);
            s.scheduleAtFixedRate(() -> {}, 0, 2, TimeUnit.SECONDS);
            if (throwIt) throw new IllegalStateException("erro de teste");
        } catch (Throwable t) { IefCheckinGuard.failed(h, m, t); return s; }
        IefCheckinGuard.exit(m);
        return s;
    }
    public static void main(String[] a) throws Exception {
        List<String> got = new ArrayList<>();
        IefCheckinGuard.setListener((h, e, ms) -> got.add(h + ":" + e.getMessage() + ":" + (ms >= 0)));
        // 1) SIMULACAO (padrao): timer fica vivo, contado
        check(IefCheckinGuard.mode() == IefCheckinGuard.SIMULACAO, "padrao e SIMULACAO");
        ScheduledExecutorService s1 = save(false, "h1");
        long[] c = IefCheckinGuard.counters();
        check(!s1.isShutdown(), "simulacao: timer continua vivo (original)");
        check(c[0] == 1 && c[2] == 1 && c[5] == 1 && c[6] == 1, "simulacao: 1 salvamento, 1 criado, 1 deixado vivo, 1 vivo " + Arrays.toString(c));
        // 2) ATIVO: timer encerrado
        IefCheckinGuard.configure(IefCheckinGuard.ATIVO);
        ScheduledExecutorService s2 = save(false, "h2");
        check(s2.isShutdown(), "ativo: timer encerrado no fim do salvamento");
        waitLive(1);
        c = IefCheckinGuard.counters();
        check(c[3] == 1 && c[6] == 1, "ativo: 1 encerrado pela correcao, so o da simulacao vivo " + Arrays.toString(c));
        // 3) ATIVO com erro: encerra e avisa
        ScheduledExecutorService s3 = save(true, "h3");
        check(s3.isShutdown(), "ativo+erro: timer encerrado");
        check(got.size() == 1 && got.get(0).equals("h3:erro de teste:true"), "ativo+erro: listener recebeu " + got);
        c = IefCheckinGuard.counters();
        check(c[1] == 1, "ativo+erro: 1 com erro");
        // 4) cancelamento pela Dassault (shutdown direto) conta
        s1.shutdown();
        waitLive(0);
        c = IefCheckinGuard.counters();
        check(c[4] == 1 && c[6] == 0, "cancelamento: encerrado pela Dassault, nenhum vivo " + Arrays.toString(c));
        // 5) DESLIGADO: original puro, nada contado, listener nao chamado
        IefCheckinGuard.configure(IefCheckinGuard.DESLIGADO);
        long saves = c[0];
        ScheduledExecutorService s5 = save(true, "h5");
        check(!s5.isShutdown() && !(s5.getClass().getName().contains("IefCheckinGuard")), "desligado: executor original, vivo");
        check(IefCheckinGuard.counters()[0] == saves && got.size() == 1, "desligado: nada contado, sem aviso");
        s5.shutdownNow();
        // 6) aninhado em ATIVO: o externo so encerra o seu
        IefCheckinGuard.configure(IefCheckinGuard.ATIVO);
        int m1 = IefCheckinGuard.enter();
        ScheduledExecutorService outer = IefCheckinGuard.newScheduler(1);
        int m2 = IefCheckinGuard.enter();
        ScheduledExecutorService inner = IefCheckinGuard.newScheduler(1);
        IefCheckinGuard.exit(m2);
        check(inner.isShutdown() && !outer.isShutdown(), "aninhado: interno encerrado, externo segue");
        IefCheckinGuard.exit(m1);
        check(outer.isShutdown(), "aninhado: externo encerrado no fim dele");
        // 7) listener que explode nao muda nada
        IefCheckinGuard.setListener((h, e, ms) -> { throw new RuntimeException("x"); });
        ScheduledExecutorService s7 = save(true, "h7");
        check(s7.isShutdown(), "listener com erro: salvamento segue normal");
        // 8) newScheduler fora de execute (sem enter): original
        ScheduledExecutorService s8 = IefCheckinGuard.newScheduler(1);
        check(!s8.getClass().getName().contains("IefCheckinGuard"), "fora do execute: executor original");
        s8.shutdownNow();
        // 9) nome da thread
        IefCheckinGuard.configure(IefCheckinGuard.SIMULACAO);
        int m9 = IefCheckinGuard.enter();
        ScheduledExecutorService s9 = IefCheckinGuard.newScheduler(1);
        String[] name = {null};
        s9.schedule(() -> name[0] = Thread.currentThread().getName() + "/" + Thread.currentThread().isDaemon(), 0, TimeUnit.MILLISECONDS).get();
        IefCheckinGuard.exit(m9);
        check(name[0] != null && name[0].matches("triel-ief-checkin-[0-9]+/true"), "thread com nome e daemon: " + name[0]);
        s9.shutdownNow();
        // 10) orfao (1.1.0): o timer de um salvamento ja terminado desliga o de outro -> ORFAO_AGIU
        IefCheckinGuard.configure(IefCheckinGuard.SIMULACAO);
        List<String> orf = Collections.synchronizedList(new ArrayList<>());
        IefCheckinGuard.setListener(new IefCheckinGuard.Listener() {
            public void failed(Object h, Throwable e, long ms) { }
            public void orphan(int kind, Object culprit, Object victim, long age) { orf.add(kind + ":" + culprit + ">" + victim); }
        });
        int ma = IefCheckinGuard.enter("hA");
        ScheduledExecutorService ta = IefCheckinGuard.newScheduler(1);
        IefCheckinGuard.exit(ma);
        int mb = IefCheckinGuard.enter("hB");
        ScheduledExecutorService tb = IefCheckinGuard.newScheduler(1);
        IefCheckinGuard.exit(mb);
        ta.submit(() -> tb.shutdown()).get();
        check(orf.equals(List.of("2:hA>hB")), "orfao agiu: timer de A (terminado) desligou o de B " + orf);
        check(IefCheckinGuard.counters()[8] == 1, "contador de acoes de orfao");
        // 11) cancelamento dentro do salvamento C desliga o timer de D (outro salvamento) -> ORFAO_NASCEU
        orf.clear();
        int mc = IefCheckinGuard.enter("hC");
        ScheduledExecutorService tc = IefCheckinGuard.newScheduler(1);
        ScheduledExecutorService[] td = {null};
        Thread outra = new Thread(() -> { int md = IefCheckinGuard.enter("hD"); td[0] = IefCheckinGuard.newScheduler(1); IefCheckinGuard.exit(md); });
        outra.start(); outra.join();
        td[0].shutdown();
        IefCheckinGuard.exit(mc);
        check(orf.equals(List.of("1:hC>hD")), "orfao nasceu: cancelamento de C desligou o timer de D " + orf);
        check(IefCheckinGuard.counters()[7] == 1, "contador de orfaos nascidos");
        // 12) timer desligando a si mesmo (cancelamento normal) nao e orfao
        orf.clear();
        int me = IefCheckinGuard.enter("hE");
        ScheduledExecutorService te = IefCheckinGuard.newScheduler(1);
        te.submit(() -> te.shutdown()).get();
        IefCheckinGuard.exit(me);
        check(orf.isEmpty(), "timer desligando a si mesmo: sem evento");
        // 13) em ATIVO nao sobra timer para virar orfao: o do salvamento terminado ja esta encerrado
        IefCheckinGuard.configure(IefCheckinGuard.ATIVO);
        int mf = IefCheckinGuard.enter("hF");
        ScheduledExecutorService tf = IefCheckinGuard.newScheduler(1);
        IefCheckinGuard.exit(mf);
        check(tf.isShutdown(), "ativo: timer do salvamento encerrado (nao pode virar orfao)");
        ta.shutdownNow(); tc.shutdownNow();
        // 14) (1.2) ao entrar em Ativo, as sobras da Simulacao (salvamento terminado, timer vivo) sao encerradas
        IefCheckinGuard.configure(IefCheckinGuard.SIMULACAO);
        int mg = IefCheckinGuard.enter("hG");
        ScheduledExecutorService tg = IefCheckinGuard.newScheduler(1);
        IefCheckinGuard.exit(mg);
        check(!tg.isShutdown() && IefCheckinGuard.closeEnded() == 0, "simulacao: sobra continua viva, closeEnded nao age");
        IefCheckinGuard.configure(IefCheckinGuard.ATIVO);
        int fechados = IefCheckinGuard.closeEnded();
        check(tg.isShutdown() && fechados >= 1 && IefCheckinGuard.counters()[9] >= 1, "ativo: sobra encerrada (" + fechados + ")");
        // 15) (1.2) em Ativo, o cancelamento de Q pede para desligar o timer de P (em andamento): desliga o de Q
        orf.clear();
        java.util.concurrent.CountDownLatch pronto = new java.util.concurrent.CountDownLatch(1), fim = new java.util.concurrent.CountDownLatch(1);
        ScheduledExecutorService[] tp = {null};
        Thread salvP = new Thread(() -> {
            int mp = IefCheckinGuard.enter("hP");
            tp[0] = IefCheckinGuard.newScheduler(1);
            pronto.countDown();
            try { fim.await(); } catch (InterruptedException e) { }
            IefCheckinGuard.exit(mp);
        });
        salvP.start(); pronto.await();
        int mq = IefCheckinGuard.enter("hQ");
        ScheduledExecutorService tq = IefCheckinGuard.newScheduler(1);
        tq.submit(() -> { tp[0].shutdown(); tp[0].shutdown(); }).get(); // a Dassault pode pedir mais de uma vez
        check(!tp[0].isShutdown(), "ativo: timer de P (em andamento) mantido");
        check(tq.isShutdown(), "ativo: timer de Q (cancelado) desligado no lugar");
        check(orf.equals(List.of("3:hQ>hP")), "ativo: desvio registrado uma vez " + orf);
        IefCheckinGuard.exit(mq);
        fim.countDown(); salvP.join();
        check(tp[0].isShutdown(), "ativo: timer de P encerrado no fim do salvamento dele");
        // 16) em Simulacao o desvio NAO acontece (comportamento original, so registra)
        IefCheckinGuard.configure(IefCheckinGuard.SIMULACAO);
        orf.clear();
        int mr = IefCheckinGuard.enter("hR");
        ScheduledExecutorService tr = IefCheckinGuard.newScheduler(1);
        int ms = IefCheckinGuard.enter("hS");
        ScheduledExecutorService ts = IefCheckinGuard.newScheduler(1);
        IefCheckinGuard.exit(ms);
        tr.submit(() -> ts.shutdown()).get();
        check(ts.isShutdown() && !tr.isShutdown() && orf.equals(List.of("1:hR>hS")), "simulacao: original (desliga o outro) " + orf);
        IefCheckinGuard.exit(mr);
        tr.shutdownNow();
        // 17) (1.3) verificacao de cliente: a atual segue o original; a antiga em Ativo se encerra sem agir
        List<String> ver = Collections.synchronizedList(new ArrayList<>());
        IefCheckinGuard.setListener(new IefCheckinGuard.Listener() {
            public void failed(Object h, Throwable e, long ms) { }
            public void staleVerifier(Object tracked, boolean acting) { ver.add(tracked + ":" + acting); }
        });
        FakeSession sess = new FakeSession();
        FakeVerifier antiga = new FakeVerifier(sess, "hVelho"), atual = new FakeVerifier(sess, "hNovo");
        sess.atual = atual;
        IefCheckinGuard.configure(IefCheckinGuard.ATIVO);
        check(!IefCheckinGuard.verifierTick(atual) && ver.isEmpty(), "verificacao atual: comportamento original");
        check(IefCheckinGuard.verifierTick(antiga) && antiga.cancelada, "ativo: verificacao antiga encerrada sem agir");
        check(ver.equals(List.of("hVelho:false")) && IefCheckinGuard.counters()[11] == 1, "ativo: registrada " + ver);
        // 18) Simulacao: a antiga segue o original; avisa so quando vai agir (cliente nao avisou)
        ver.clear();
        IefCheckinGuard.configure(IefCheckinGuard.SIMULACAO);
        FakeVerifier antiga2 = new FakeVerifier(sess, "hVelho2");
        antiga2.isClientExists = true;
        check(!IefCheckinGuard.verifierTick(antiga2) && ver.isEmpty(), "simulacao: antiga com aviso recente, ainda nao age");
        antiga2.isClientExists = false;
        check(!IefCheckinGuard.verifierTick(antiga2) && !antiga2.cancelada, "simulacao: antiga segue o original");
        check(ver.equals(List.of("hVelho2:true")) && IefCheckinGuard.counters()[12] == 1, "simulacao: 'vai agir' registrado " + ver);
        // 19) sem sessao / objeto estranho / desligado: original, sem erro
        IefCheckinGuard.configure(IefCheckinGuard.ATIVO);
        check(!IefCheckinGuard.verifierTick(new Object()) && !IefCheckinGuard.verifierTick(null), "objeto estranho: original");
        sess.atual = null;
        FakeVerifier semAtual = new FakeVerifier(sess, "x");
        check(IefCheckinGuard.verifierTick(semAtual) && semAtual.cancelada,
                "ativo: sessao sem verificacao atual (removida no fim normal de outra operacao) = antiga, encerrada");
        IefCheckinGuard.configure(IefCheckinGuard.DESLIGADO);
        sess.atual = atual;
        check(!IefCheckinGuard.verifierTick(new FakeVerifier(sess, "y")), "desligado: original");
        atual.cancel(); antiga2.cancel();
        System.out.println(fails == 0 ? "TODOS OK" : fails + " FALHA(S)");
        System.exit(fails == 0 ? 0 : 1);
    }

    /** Imita MCADIntegrationSessionData (so a chave da verificacao atual). */
    public static class FakeSession {
        volatile Object atual;
        public Object getSessionObjectByKey(String k) { return "MCAD_CLIENT_CHECK_TIMER".equals(k) ? atual : null; }
    }

    /** Imita ENOIEFClientExistanceVerifier (um java.util.Timer com os mesmos campos). */
    static class FakeVerifier extends java.util.Timer {
        private final Object integSessionData;
        private final Object beanThreadBeingTracked;
        protected volatile boolean isClientExists;
        volatile boolean cancelada;
        FakeVerifier(Object s, Object tracked) { super(true); integSessionData = s; beanThreadBeingTracked = tracked; }
        @Override public void cancel() { cancelada = true; super.cancel(); }
    }
}
