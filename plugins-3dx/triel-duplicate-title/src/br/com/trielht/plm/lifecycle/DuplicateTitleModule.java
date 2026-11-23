package br.com.trielht.plm.lifecycle;

import br.com.trielht.plm.core.Core;
import br.com.trielht.plm.core.Job;
import br.com.trielht.plm.core.JobQueue;
import br.com.trielht.plm.core.PluginConfig;
import br.com.trielht.plm.core.PluginModule;
import br.com.trielht.plm.core.Report;

import com.dassault_systemes.lifecycle.itf.CompletionData;
import com.dassault_systemes.lifecycle.itf.CompletionObject;

import matrix.db.Context;
import matrix.db.MQLCommand;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Hashtable;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Titulo automatico na Duplicacao / Duplicacao avancada (plugin "duplicate-title").
 *
 * Problema: o objeto novo recebe o mesmo Titulo (PLMEntity.V_Name) do original.
 * Regra, para cada Physical Product (VPMReference) ou 3D Shape (VPMRepReference) duplicado cujo Titulo continuou
 * IGUAL ao do original (o usuario nao digitou outro):
 *  - objeto nativo: Titulo = Nome novo (como nos desenhos);
 *  - objeto de CAD (interface XCAD*) com titulo "base(configuracao)": mantem a configuracao e troca so a base, usando
 *    a) a base que o usuario digitou em algum objeto da mesma peca, ou
 *    b) o MENOR Nome novo entre os Physical Products da mesma peca (uma base unica para a peca inteira).
 *  - com uma unica peca na duplicacao, objetos de CAD com titulo fora do padrao tambem recebem a base nova.
 *
 * Roda na hora (dentro da duplicacao, sincrono). Com o plugin em SIMULACAO, so registra o que faria.
 * Cada duplicacao vira uma execucao no Portal com um item por titulo (de -> para).
 */
public class DuplicateTitleModule implements PluginModule {

    public static final String KEY = "duplicate-title";
    public static final String VERSION = "6.0.0";

    private static final Set<String> DUPLICATE_COMMANDS = Set.of("Advance Duplicate", "Duplicate");
    private static final String TITLE_ATTR = "PLMEntity.V_Name";

    /** Dados de um objeto duplicado. */
    private static final class Dup {
        String cloneId;
        String sourceId;
        boolean isProduct;
        boolean isCad;
        String type;
        String name;
        String revision;
        String title;
        String sourceTitle;
    }

    /** Titulo no formato "base(configuracao)". */
    private record CadTitle(String base, String config) {
        static CadTitle parse(String t) {
            if (t == null || !t.endsWith(")")) return null;
            int i = t.lastIndexOf('(');
            if (i <= 0) return null;
            return new CadTitle(t.substring(0, i), t.substring(i + 1, t.length() - 1));
        }
    }

    @Override
    public String key() {
        return KEY;
    }

    @Override
    public String version() {
        return VERSION;
    }

    @Override
    public void onPostprocess(Context context, String command, CompletionObject completion, PluginConfig.Settings cfg)
            throws Exception {
        if (!DUPLICATE_COMMANDS.contains(command)) return;
        Hashtable<String, CompletionData> table = completion.getCompletionTable();
        if (table == null || table.isEmpty()) return;

        List<Dup> dups = new ArrayList<>();
        for (Map.Entry<String, CompletionData> entry : table.entrySet()) {
            Dup d = load(context, entry.getKey(), entry.getValue());
            if (d != null) dups.add(d);
        }
        if (dups.isEmpty()) return;

        Map<String, String> newTitles = computeTitles(dups, cfg.integer("maxTitulo", 100));

        // execucao: o objeto "principal" e o Physical Product de menor Nome novo (normalmente o que o usuario duplicou)
        Dup main = dups.stream().filter(d -> d.isProduct).min(Comparator.comparing(d -> d.name)).orElse(dups.get(0));
        Job job = Job.of(KEY, "duplicacao", cfg.mode).object(main.cloneId, null, main.type, main.name, main.revision,
                main.title);
        job.actorLogin = context.getUser();
        Report rep = JobQueue.startInline(job);
        int changed = 0;
        for (Dup d : dups) {
            String newTitle = newTitles.get(d.cloneId);
            if (newTitle == null) continue;
            if (cfg.simulate()) {
                rep.item("seria_titulo_alterado", true).target(d.cloneId, d.type, d.name, d.revision, d.title)
                        .change(d.title, newTitle).message("Original: '" + d.sourceTitle + "'").add();
                continue;
            }
            try {
                MQLCommand.exec(context, "mod bus $1 $2 $3", d.cloneId, TITLE_ATTR, newTitle);
                changed++;
                rep.item("titulo_alterado", true).target(d.cloneId, d.type, d.name, d.revision, newTitle)
                        .change(d.title, newTitle).add();
            } catch (Exception e) {
                rep.item("titulo_alterado", false).target(d.cloneId, d.type, d.name, d.revision, d.title)
                        .change(d.title, newTitle).message(Core.rootMessage(e)).add();
            }
        }
        rep.summary(dups.size() + " objeto(s) duplicado(s); " + (cfg.simulate()
                ? newTitles.size() + " titulo(s) seriam alterados (simulacao)"
                : changed + " titulo(s) alterado(s)") + " -- comando " + command);
        if (newTitles.isEmpty()) rep.ignore("Nenhum titulo a alterar (" + dups.size() + " objeto(s) com titulo digitado)");
        JobQueue.recordFinished(rep);
    }

    /** Titulo novo por cloneId (so os que mudam). */
    static Map<String, String> computeTitles(List<Dup> dups, int maxTitle) {
        // a) base digitada pelo usuario (titulo diferente do original)
        Map<String, String> newBaseByOldBase = new HashMap<>();
        for (Dup d : dups) {
            if (!d.isCad || d.title.equals(d.sourceTitle)) continue;
            CadTitle old = CadTitle.parse(d.sourceTitle);
            if (old == null) continue;
            // titulo que ainda contem a base original nao foi digitado: e o original decorado por outra regra
            if (d.title.contains(old.base + "(") || d.title.contains(d.sourceTitle)) continue;
            // neste ponto a Dassault ainda nao recolocou "(configuracao)" no titulo digitado
            CadTitle now = CadTitle.parse(d.title);
            String typedBase = (now != null ? now.base : d.title).trim();
            if (!typedBase.isEmpty() && !typedBase.equals(old.base)) newBaseByOldBase.putIfAbsent(old.base, typedBase);
        }
        // b) menor Nome novo entre os Physical Products da mesma peca
        Map<String, String> productBase = new HashMap<>();
        for (Dup d : dups) {
            if (!d.isCad || !d.isProduct || !d.title.equals(d.sourceTitle)) continue;
            CadTitle old = CadTitle.parse(d.sourceTitle);
            if (old != null) productBase.merge(old.base, d.name, (a, b) -> a.compareTo(b) <= 0 ? a : b);
        }
        productBase.forEach(newBaseByOldBase::putIfAbsent);
        String singleBase = newBaseByOldBase.size() == 1 ? newBaseByOldBase.values().iterator().next() : null;

        Map<String, String> out = new HashMap<>();
        for (Dup d : dups) {
            if (!d.title.equals(d.sourceTitle)) continue; // usuario digitou outro titulo
            String newTitle = d.name;
            CadTitle ct = d.isCad ? CadTitle.parse(d.title) : null;
            if (ct != null && newBaseByOldBase.containsKey(ct.base)) {
                newTitle = newBaseByOldBase.get(ct.base) + "(" + ct.config + ")";
            } else if (d.isCad && ct == null && newBaseByOldBase.containsKey(d.title)) {
                newTitle = newBaseByOldBase.get(d.title);
            } else if (d.isCad && singleBase != null) {
                newTitle = ct != null ? singleBase + "(" + ct.config + ")" : singleBase;
            }
            if (newTitle.length() > maxTitle) newTitle = d.name.length() > maxTitle ? d.name.substring(0, maxTitle) : d.name;
            if (!newTitle.isEmpty() && !newTitle.equals(d.title)) out.put(d.cloneId, newTitle);
        }
        return out;
    }

    /** Le o objeto novo e o original; null se nao for Physical Product / 3D Shape. */
    private static Dup load(Context context, String cloneId, CompletionData data) {
        if (cloneId == null || data == null || !data.getValidForCommand()) return null;
        List<String> sources = data.getObjectSource();
        if (sources == null || sources.isEmpty()) return null;
        String sourceId = sources.get(0);
        if (sourceId == null || sourceId.isEmpty() || sourceId.equals(cloneId)) return null;
        try {
            // ordem: isProduct | isShape | type | name | revision | titulo (titulo por ultimo: qualquer caractere)
            String[] c = Core.split(MQLCommand.exec(context, "print bus $1 select $2 $3 $4 $5 $6 $7 dump $8", cloneId,
                    "type.kindof[VPMReference]", "type.kindof[VPMRepReference]", "type", "name", "revision",
                    "attribute[" + TITLE_ATTR + "]", Core.SEP), 6);
            if (c.length < 6) return null;
            Dup d = new Dup();
            d.cloneId = cloneId;
            d.sourceId = sourceId;
            d.isProduct = "TRUE".equalsIgnoreCase(c[0]);
            if (!d.isProduct && !"TRUE".equalsIgnoreCase(c[1])) return null;
            d.type = c[2];
            d.name = c[3];
            d.revision = c[4];
            d.title = c[5];
            d.sourceTitle = MQLCommand.exec(context, "print bus $1 select $2 dump", sourceId,
                    "attribute[" + TITLE_ATTR + "]").trim();
            String interfaces = MQLCommand.exec(context, "print bus $1 select $2 dump $3", cloneId, "interface", Core.SEP);
            d.isCad = interfaces != null && interfaces.contains("XCAD");
            return d;
        } catch (Exception e) {
            return null; // relacionamentos e tipos sem V_Name caem aqui: nao e erro de negocio
        }
    }
}
