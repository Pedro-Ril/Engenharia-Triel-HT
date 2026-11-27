package br.com.trielht.plm.duplicacao;

import br.com.trielht.plm.core.PluginModule;
import br.com.trielht.plm.core.Release;

import java.util.List;

/**
 * Duplicacao avancada (plugin "advanced-duplicate"). O trabalho e do AdvancedDuplicateFilter (registrado pelo
 * web-fragment.xml deste jar) na resposta de POST /resources/lifecycle/expand/federated, que traz a estrutura da
 * janela de Duplicacao avancada com a acao inicial de cada linha (atributo expand::defaultAction). Este modulo so o
 * coloca no nucleo: modo e parametros pelo Portal, versao, autoteste e saude do no. Nao tem fila.
 *
 * Acao inicial (0.2.0): item principal -> acaoPrincipal (padrao Duplicar com Desenhos), demais -> acaoFilhos
 * (padrao Reutilizar). Ver DefaultActionRewriter e AdvancedDuplicateFilter.
 *
 * Miniatura (0.3.0): passando o mouse no Titulo de uma linha aparece a miniatura do item (ver ThumbnailUi).
 *
 * Parametros (Portal): acaoPrincipal, acaoFilhos, maxBytes, amostrasPorDia, miniatura, miniaturaAtrasoMs,
 * miniaturaLargura, miniaturaTimeoutMs.
 */
public class AdvancedDuplicateModule implements PluginModule {

    public static final String KEY = "advanced-duplicate";
    public static final String VERSION = "0.3.0";

    @Override
    public String key() {
        return KEY;
    }

    @Override
    public String version() {
        return VERSION;
    }

    /**
     * Trechos do AdvancedView.js (a janela, no navegador) de que a regra depende: a janela le expand::defaultAction e
     * converte 2 -> Reutilizar e 100000 (Max) -> Duplicar com Desenhos. Um hotfix que mude isso desliga a alteracao
     * (o filtro so registra) e o autoteste falha.
     */
    static final String[] UI_MARKERS = {
            "a.attributes[\"expand::defaultAction\"]",
            "[E.ExpandNodeCapabilites.Reuse,EnoTreeNodeAction.Reuse]",
            "[E.ExpandNodeCapabilites.Max,EnoTreeNodeAction.DuplicateWDrw]",
            "ExpandNodeCapabilites:{Undefined:0,Duplicate:1,Reuse:2,Exclude:3,ChangeTitle:4,FollowParent:5,Branch:6,Max:1e5}"};

    /**
     * Trechos de que a miniatura depende: o modulo da janela (onde o carregador e emendado) e o conteiner da arvore
     * (onde o balao procura a grade). Faltando, so a miniatura fica de fora (o autoteste acusa).
     */
    static final String[] THUMB_MARKERS = {ThumbnailUi.UI_MARKER, "assemblyTreeListContainer"};

    private static volatile String uiProblem = "janela ainda não conferida";

    /** null = a janela da Dassault tem os trechos esperados; a alteracao so e aplicada nesse caso. */
    static String uiProblem() {
        return uiProblem;
    }

    @Override
    public void start() {
        uiProblem = checkUi(UI_MARKERS);
        if (uiProblem != null) {
            br.com.trielht.plm.core.Core.LOG.warn("[TRIEL-{}] {}: a janela fica no padrão do 3DX", KEY, uiProblem);
        }
    }

    static String checkUi(String[] markers) {
        try {
            java.nio.file.Path js = java.nio.file.Path.of(System.getProperty("catalina.base", "."),
                    "webapps", "3dspace", "webapps", "AdvancedView", "AdvancedView.js");
            String s = java.nio.file.Files.readString(js);
            for (String m : markers) {
                if (!s.contains(m)) return "AdvancedView.js mudou (trecho nao encontrado: " + m + ")";
            }
            return null;
        } catch (Exception e) {
            return "AdvancedView.js ilegivel: " + e;
        }
    }

    @Override
    public List<String> requires() {
        // a resposta que o filtro le e montada por estas classes do 3DSpace (expand federado da Duplicacao avancada)
        java.util.List<String> r = new java.util.ArrayList<>(List.of(
                "com.dassault_systemes.lifecycle.extensibility.expand.ExpandResponse#fromResultAsJSON",
                "com.dassault_systemes.lifecycle.extensibility.INode#getDefaultAction",
                // miniatura: o servico da Dassault que da a URL da imagem (o mesmo do Comparador)
                "com.dassault_systemes.enovia.compare.CompareWebService#fetchThumbnailUrl"));
        String ui = uiProblem == null ? null : checkUi(UI_MARKERS);
        if (ui != null) r.add(ui); // texto que nao e classe: o autoteste acusa como faltando
        String thumb = checkUi(THUMB_MARKERS);
        if (thumb != null) r.add("miniatura: " + thumb);
        return r;
    }

    @Override
    public List<Release> releases() {
        return List.of(
                Release.of("0.3.0", "2026-11-27", "Miniatura na Duplicação avançada: passando o mouse no título de "
                        + "uma linha aparece a imagem do item (serviço de miniatura da própria Dassault). Só em Ativo; "
                        + "chega a cada navegador quando o cache da janela renovar (até 7 dias, ou Ctrl+F5). Qualquer "
                        + "falha esconde o balão e fica registrada no Portal."),
                Release.of("0.2.0", "2026-11-27", "Ação inicial na Duplicação avançada: o item principal vem como "
                        + "\"Duplicar com Desenhos\" e os demais como \"Reutilizar\" (configurável no Portal). Itens "
                        + "que seguem o pai e qualquer caso fora do esperado ficam como o 3DX mandou; em Simulação só "
                        + "registra o que mudaria."),
                Release.of("0.1.0", "2026-11-27", "Observação da janela de Duplicação avançada: registra amostras do "
                        + "pedido e da resposta da estrutura (operação, nós e ações que já vêm) para validar o formato "
                        + "no dev-plm. Não altera nada na janela."));
    }
}
