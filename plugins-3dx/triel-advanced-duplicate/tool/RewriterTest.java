package br.com.trielht.plm.duplicacao;

import java.util.Set;

/**
 * Testes do DefaultActionRewriter com o formato real da resposta (dev-plm, 27/11/2026).
 * Uso (no servidor): javac -cp <jar do plugin>:<tomee/lib/*> -d t RewriterTest.java;
 *                    java -cp t:<jar do plugin>:<tomee/lib/*> br.com.trielht.plm.duplicacao.RewriterTest
 */
public class RewriterTest {
    static int fails = 0;

    static void check(boolean ok, String what) {
        System.out.println((ok ? "ok   " : "FALHA ") + what);
        if (!ok) fails++;
    }

    static String node(String did, String pid, String label, String cad, String caps, Integer def) {
        return "{\"attributes\":[{\"name\":\"did\",\"value\":\"" + did + "\"},{\"name\":\"physicalid\",\"value\":\"" + pid
                + "\"},{\"name\":\"expand::providerUUID\",\"value\":\"00000000-0008-0000-0000-000000000000\"},"
                + "{\"name\":\"ds6w:label\",\"value\":\"" + label + "\"},{\"name\":\"ds6w:cadmaster\",\"value\":\"" + cad
                + "\"},{\"name\":\"expand::capabilities\",\"value\":" + caps + "}"
                + (def == null ? "" : ",{\"name\":\"expand::defaultAction\",\"value\":" + def + "}") + "]}";
    }

    static String instance(String did, String pid) {
        return "{\"attributes\":[{\"name\":\"did\",\"value\":\"" + did + "\"},{\"name\":\"physicalid\",\"value\":\"" + pid
                + "\"},{\"name\":\"type\",\"value\":\"VPMInstance\"},{\"name\":\"ro.plminstance.V_treeorder\",\"value\":\"648482561.765\"}]}";
    }

    /** Trecho do no com o physicalid dado, ate o inicio do proximo no. */
    static String nodeText(String body, String pid) {
        int i = body.indexOf("\"" + pid + "\"");
        int end = body.indexOf("{\"attributes\"", i);
        return body.substring(i, end < 0 ? body.length() : end);
    }

    public static void main(String[] a) {
        String body = "{\"results\":[" + node("1", "ROOT", "73938", "SOLIDWORKS", "[1,3,2,4]", 1) + ","
                + instance("2", "INST1") + "," + node("3", "FILHO", "58180", "SOLIDWORKS", "[1,3,2,4]", 1) + ","
                + node("4", "SEGUE", "drw", "SOLIDWORKS", "[1,3,4,5]", 1) + ","
                + node("5", "SEMDEF", "58097", "SOLIDWORKS", "[1,3,2,4]", null) + "],\"extra\":{\"x\":1}}";

        // 1) regra padrao
        DefaultActionRewriter.Result r = DefaultActionRewriter.rewrite(body, Set.of("ROOT"),
                DefaultActionRewriter.DUPLICAR_COM_DESENHOS, DefaultActionRewriter.REUTILIZAR);
        check(r.nodes() == 4, "4 objetos com capacidades (instancia nao conta): " + r.nodes());
        check(r.changes().size() == 3, "3 mudancas (principal, filho, sem defaultAction): " + r.changes().size());
        check(r.body().contains("\"physicalid\",\"value\":\"ROOT\"") && r.body().matches("(?s).*ROOT.*expand::defaultAction\",\"value\":100000.*"),
                "principal -> 100000 (Duplicar com Desenhos)");
        check(nodeText(r.body(), "FILHO").contains("\"expand::defaultAction\",\"value\":2"), "filho -> 2 (Reutilizar)");
        check(nodeText(r.body(), "SEGUE").contains("\"expand::defaultAction\",\"value\":1"), "segue o pai: fica 1");
        check(nodeText(r.body(), "SEMDEF").contains("\"expand::defaultAction\",\"value\":2"), "sem defaultAction: ganha 2");
        check(r.body().contains("\"extra\":{\"x\":1}") && r.body().contains("INST1"), "resto da resposta preservado");

        // 2) principal nao-SOLIDWORKS: nao recebe Duplicar com Desenhos
        String body3dx = body.replace("\"ds6w:cadmaster\",\"value\":\"SOLIDWORKS\"},{\"name\":\"expand::capabilities\",\"value\":[1,3,2,4]},{\"name\":\"expand::defaultAction\",\"value\":1}]},{\"attributes\":[{\"name\":\"did\",\"value\":\"2\"",
                "\"ds6w:cadmaster\",\"value\":\"3DEXPERIENCE\"},{\"name\":\"expand::capabilities\",\"value\":[1,3,2,4]},{\"name\":\"expand::defaultAction\",\"value\":1}]},{\"attributes\":[{\"name\":\"did\",\"value\":\"2\"");
        DefaultActionRewriter.Result r2 = DefaultActionRewriter.rewrite(body3dx, Set.of("ROOT"),
                DefaultActionRewriter.DUPLICAR_COM_DESENHOS, DefaultActionRewriter.REUTILIZAR);
        check(r2.changes().stream().noneMatch(DefaultActionRewriter.Change::root), "principal 3DEXPERIENCE: sem Duplicar com Desenhos");

        // 3) nada a mudar: devolve o mesmo texto
        DefaultActionRewriter.Result r3 = DefaultActionRewriter.rewrite(body, Set.of("ROOT"), null, null);
        check(r3.changes().isEmpty() && r3.body() == body, "sem regra: mesmo texto, sem reserializar");

        // 4) pedido: so duplicacao
        check(DefaultActionRewriter.duplicateRoots("{\"command\":\"duplicate\",\"ids\":[\"ROOT\"],\"authoring\":true}").equals(Set.of("ROOT")), "pedido de duplicacao: ids");
        check(DefaultActionRewriter.duplicateRoots("{\"command\":\"delete\",\"ids\":[\"ROOT\"]}") == null, "outro comando: null");

        // 5) resposta fora do formato: erro (o filtro devolve como veio)
        boolean erro = false;
        try {
            DefaultActionRewriter.rewrite("{\"outra\":1}", Set.of("ROOT"), 100000, 2);
        } catch (RuntimeException e) {
            erro = true;
        }
        check(erro, "sem results: erro (filtro devolve a resposta original)");

        System.out.println(fails == 0 ? "TODOS OK" : fails + " FALHA(S)");
        System.exit(fails == 0 ? 0 : 1);
    }
}
