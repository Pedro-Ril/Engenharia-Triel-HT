package br.com.trielht.plm.estado;

import br.com.trielht.plm.core.Core;
import br.com.trielht.plm.core.Mx;

import com.matrixone.apps.domain.util.ContextUtil;

import matrix.db.Context;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * O estado de maturidade (current) no BANCO, por physicalid, num contexto de sistema so de leitura.
 *
 * Em LOTE: uma consulta por grupo de ate `lote` physicalids (temp query ... where physicalid matchlist), em vez de
 * um print por objeto (~3 ms cada: uma estrutura de 4.000 objetos levaria ~12 s). Se a consulta em lote falhar, o
 * grupo cai para um print por objeto.
 *
 * Diferente de Mx.asSystem, NAO tenta de novo nem espera: roda dentro da requisicao do usuario, entao qualquer
 * problema devolve o que ja leu e o filtro fica com o estado do indice. Para no prazo (prazoMs) e no limite de
 * objetos (maxObjetos).
 */
final class StateLookup {

    /** O que foi lido e quanto custou. */
    record Result(Map<String, String> states, int asked, int read, int failed, boolean cut, long millis, String error,
                  int queries, int fallbacks) {
    }

    private StateLookup() {
    }

    static Result read(Collection<String> ids, String role, int maxObjects, long budgetMs, int batch) {
        long t0 = System.currentTimeMillis();
        Map<String, String> out = new LinkedHashMap<>();
        int failed = 0, queries = 0, fallbacks = 0;
        boolean cut = false;
        String error = null;
        Context ctx = null;
        boolean pushed = false;
        try {
            ctx = ContextUtil.getAnonymousContext();
            ContextUtil.pushContext(ctx);
            pushed = true;
            try {
                ctx.resetVault("vplm");
            } catch (Exception e) {
                // so leitura: segue sem trocar o cofre
            }
            if (role != null && !role.isBlank()) ctx.resetRole(role.trim());

            List<String> all = new ArrayList<>(ids);
            if (all.size() > maxObjects) {
                all = all.subList(0, maxObjects);
                cut = true;
            }
            int size = Math.max(1, batch);
            for (int i = 0; i < all.size(); i += size) {
                if (System.currentTimeMillis() - t0 > budgetMs) {
                    cut = true;
                    break;
                }
                List<String> group = all.subList(i, Math.min(all.size(), i + size));
                queries++;
                try {
                    readBatch(ctx, group, out);
                } catch (Exception e) {
                    // lote recusado (ex.: sintaxe/tamanho): um por um, para este grupo
                    fallbacks++;
                    for (String id : group) {
                        if (System.currentTimeMillis() - t0 > budgetMs) {
                            cut = true;
                            break;
                        }
                        try {
                            String cur = Mx.mql(ctx, "print bus $1 select $2 dump", id, "current").trim();
                            if (!cur.isEmpty()) out.put(id.toUpperCase(), cur);
                        } catch (Exception one) {
                            failed++; // id que nao e objeto (ex.: instancia) ou sem acesso: fica o do indice
                        }
                    }
                }
            }
        } catch (Exception e) {
            error = Core.rootMessage(e);
        } finally {
            if (pushed) {
                try {
                    ContextUtil.popContext(ctx);
                } catch (Exception ignore) {
                    // nada
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
        return new Result(out, ids.size(), out.size(), failed, cut, System.currentTimeMillis() - t0, error, queries,
                fallbacks);
    }

    /** Uma consulta para o grupo: type | name | revision | physicalid | current. */
    private static void readBatch(Context ctx, List<String> group, Map<String, String> out) throws Exception {
        String where = "physicalid matchlist \"" + String.join(",", group) + "\" \",\"";
        String res = Mx.mql(ctx, "temp query bus $1 $2 $3 where $4 select $5 $6 dump $7", "*", "*", "*", where,
                "physicalid", "current", Core.SEP);
        for (String line : Core.lines(res)) {
            String[] f = Core.split(line, 5);
            if (f.length >= 5 && !f[3].isEmpty() && !f[4].isEmpty()) out.put(f[3].trim().toUpperCase(), f[4].trim());
        }
    }
}
