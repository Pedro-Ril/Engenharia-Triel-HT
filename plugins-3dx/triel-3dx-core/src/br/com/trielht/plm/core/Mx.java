package br.com.trielht.plm.core;

import com.matrixone.apps.domain.util.ContextUtil;

import matrix.db.Context;
import matrix.db.MQLCommand;

/**
 * Acesso ao 3DSpace (ENOVIA/MQL) usado pelos plugins: contexto de sistema, MQL, historico e espera de estado.
 */
public final class Mx {

    private Mx() {
    }

    @FunctionalInterface
    public interface Work {
        void run(Context ctx) throws Exception;
    }

    public static String mql(Context ctx, String cmd, String... args) throws Exception {
        return MQLCommand.exec(ctx, cmd, args);
    }

    /**
     * Roda o trabalho num contexto proprio com privilegio de sistema (getAnonymousContext + pushContext) e o
     * contexto de seguranca informado (papel.organizacao.projeto -- sem ele a API da Dassault recusa alteracoes).
     * Se a sessao do sistema estiver ocupada por outra thread do servidor ("in use by multiple threads"),
     * espera 3 s e tenta de novo, ate 2 vezes.
     */
    public static void asSystem(String role, Work work) throws Exception {
        for (int attempt = 1; ; attempt++) {
            try {
                runOnce(role, work);
                return;
            } catch (Exception e) {
                String msg = String.valueOf(Core.rootMessage(e));
                if (attempt >= 3 || !msg.contains("in use by multiple threads")) throw e;
                Core.LOG.info("[TRIEL-CORE] Sessao do sistema ocupada; nova tentativa ({}/3)", attempt + 1);
                Thread.sleep(3_000);
            }
        }
    }

    private static void runOnce(String role, Work work) throws Exception {
        Context ctx = null;
        boolean pushed = false;
        try {
            ctx = ContextUtil.getAnonymousContext();
            ContextUtil.pushContext(ctx);
            pushed = true;
            try {
                ctx.resetVault("vplm");
            } catch (Exception e) {
                Core.LOG.debug("[TRIEL-CORE] resetVault: {}", e.getMessage());
            }
            if (role != null && !role.isBlank()) ctx.resetRole(role.trim());
            work.run(ctx);
        } finally {
            if (pushed) {
                try {
                    ContextUtil.popContext(ctx);
                } catch (Exception e) {
                    Core.LOG.warn("[TRIEL-CORE] Falha ao restaurar o contexto: {}", e.getMessage());
                }
            }
            if (ctx != null) {
                try {
                    ctx.shutdown();
                } catch (Exception ignore) {
                    // nada
                }
            }
        }
    }

    /** Comentario no historico do objeto (evento proprio, numa transacao propria se nao houver uma aberta). */
    public static boolean addHistory(Context ctx, String objectId, String event, String comment) {
        boolean ownTx = false;
        try {
            if (!ctx.isTransactionActive()) {
                ContextUtil.startTransaction(ctx, true);
                ownTx = true;
            }
            MQLCommand.exec(ctx, "modify bus $1 add history $2 comment $3", objectId, event, Core.ascii(comment));
            if (ownTx) ContextUtil.commitTransaction(ctx);
            return true;
        } catch (Exception ex) {
            if (ownTx) {
                try {
                    ContextUtil.abortTransaction(ctx);
                } catch (Exception ignore) {
                    // nada
                }
            }
            Core.LOG.warn("[TRIEL-CORE] Nao foi possivel gravar o historico em {}: {}", objectId, ex.getMessage());
            return false;
        }
    }

    /** Espera o objeto chegar ao estado (a liberacao e gravada depois do Postprocess). */
    public static String waitState(Context ctx, String objectId, String state, long timeoutMs) throws Exception {
        long limit = System.currentTimeMillis() + timeoutMs;
        while (true) {
            String cur = MQLCommand.exec(ctx, "print bus $1 select $2 dump", objectId, "current").trim();
            if (state.equals(cur) || System.currentTimeMillis() > limit) return cur;
            Thread.sleep(2_000);
        }
    }
}
