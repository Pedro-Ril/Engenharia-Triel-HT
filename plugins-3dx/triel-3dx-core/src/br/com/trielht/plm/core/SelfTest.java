package br.com.trielht.plm.core;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Autoteste de compatibilidade: as partes internas da Dassault que o nucleo e cada plugin usam existem neste 3DSpace?
 *
 * Um hotfix pode renomear/remover uma classe ou metodo interno (ex.: MaturityResource.maturityChange_internal). Sem
 * isso o plugin so falharia na primeira liberacao; com o autoteste o heartbeat grava "falha" + o que faltou e o
 * Portal avisa (evento ambiente_3dx) logo depois da subida.
 *
 * Requisito: "pacote.Classe" ou "pacote.Classe#metodo" (metodo por nome, publico ou declarado, em qualquer superclasse).
 * Resultado calculado uma vez por subida (as classes nao mudam com o 3DSpace no ar).
 */
public final class SelfTest {

    /** O que o proprio nucleo usa (entrada no Collaborative Lifecycle, MQL, transacao e contexto). */
    static final List<String> CORE_REQUIRES = List.of(
            "com.dassault_systemes.lifecycle.itf.ENOLifecycleExtensionAdapter#Postprocess",
            "com.dassault_systemes.lifecycle.itf.CompletionObject",
            "matrix.db.Context",
            "matrix.db.MQLCommand#exec",
            "com.matrixone.apps.domain.util.ContextUtil#getAnonymousContext",
            "com.matrixone.apps.domain.util.ContextUtil#startTransaction",
            "com.matrixone.apps.domain.util.ContextUtil#commitTransaction",
            "com.matrixone.apps.domain.util.ContextUtil#abortTransaction",
            "com.matrixone.apps.domain.util.ContextUtil#pushContext",
            "com.matrixone.apps.domain.util.ContextUtil#popContext");

    /** [status ("ok"|"falha"), detalhe (o que faltou, ou null)] por plugin. */
    private static final Map<String, String[]> RESULT = new ConcurrentHashMap<>();

    private SelfTest() {
    }

    static String[] of(PluginModule m) {
        return RESULT.computeIfAbsent(m.key(), k -> {
            List<String> all = new ArrayList<>(CORE_REQUIRES);
            try {
                all.addAll(m.requires());
            } catch (Throwable t) {
                return new String[] {"falha", Core.cut("requires(): " + t, 2000)};
            }
            List<String> missing = missing(all);
            if (missing.isEmpty()) {
                Core.LOG.info("[TRIEL-CORE] Autoteste {}: ok ({} requisito(s))", k, all.size());
                return new String[] {"ok", null};
            }
            String detail = Core.cut(String.join(", ", missing), 2000);
            Core.LOG.warn("[TRIEL-CORE] Autoteste {}: FALHA -- faltando no 3DSpace: {}", k, detail);
            Writer.event(k, "erro", "Autoteste: partes da Dassault ausentes (provável atualização do 3DEXPERIENCE)",
                    detail, null);
            return new String[] {"falha", detail};
        });
    }

    static List<String> missing(List<String> requirements) {
        ClassLoader cl = Plugins.class.getClassLoader();
        List<String> out = new ArrayList<>();
        for (String r : requirements) {
            int hash = r.indexOf('#');
            String cls = hash < 0 ? r : r.substring(0, hash);
            String method = hash < 0 ? null : r.substring(hash + 1);
            try {
                Class<?> c = Class.forName(cls, false, cl);
                if (method != null && !hasMethod(c, method)) out.add(r);
            } catch (Throwable t) {
                out.add(r);
            }
        }
        return out;
    }

    private static boolean hasMethod(Class<?> c, String name) {
        for (Method m : c.getMethods()) if (m.getName().equals(name)) return true;
        for (Class<?> k = c; k != null; k = k.getSuperclass()) {
            for (Method m : k.getDeclaredMethods()) if (m.getName().equals(name)) return true;
        }
        return false;
    }
}
