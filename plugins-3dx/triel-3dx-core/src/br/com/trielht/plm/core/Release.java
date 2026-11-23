package br.com.trielht.plm.core;

import java.sql.Date;
import java.sql.PreparedStatement;
import java.time.LocalDate;
import java.util.List;

/**
 * Uma versao de um jar (nucleo ou plugin) e o que mudou nela.
 *
 * Cada jar declara no codigo o proprio historico (PluginModule.releases(), Core.RELEASES). Ao subir, o no grava em
 * dbo.portal_3dx_plugins_versoes as versoes que ainda nao existem: a nota sempre corresponde ao jar instalado.
 * Regra: toda mudanca no jar sobe a versao DELE e ganha uma linha aqui, no topo da lista.
 */
public record Release(String version, String date, String notes) {

    public static Release of(String version, String date, String notes) {
        return new Release(version, date, notes);
    }

    /** Grava as versoes que faltam (componente = "core" ou a chave do plugin). Devolve quantas entraram. */
    static int register(String component, List<Release> releases) throws java.sql.SQLException {
        if (releases == null || releases.isEmpty()) return 0;
        return Db.with(c -> {
            int n = 0;
            try (PreparedStatement st = c.prepareStatement("INSERT INTO dbo.portal_3dx_plugins_versoes "
                    + "([componente], [versao], [lancada_em], [notas], [registrado_no], [registrado_ambiente]) "
                    + "SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM dbo.portal_3dx_plugins_versoes "
                    + "WHERE [componente] = ? AND [versao] = ?)")) {
                for (Release r : releases) {
                    st.setString(1, component);
                    st.setString(2, r.version());
                    Date d;
                    try {
                        d = r.date() == null ? null : Date.valueOf(LocalDate.parse(r.date()));
                    } catch (Exception bad) {
                        d = null;
                    }
                    st.setDate(3, d);
                    st.setString(4, Core.cut(r.notes(), 2000));
                    st.setString(5, Core.node());
                    st.setString(6, Core.ambiente());
                    st.setString(7, component);
                    st.setString(8, r.version());
                    try {
                        n += st.executeUpdate();
                    } catch (java.sql.SQLException e) {
                        // dois nos subindo juntos: o outro ja gravou esta versao
                        if (e.getErrorCode() != 2627 && e.getErrorCode() != 2601) throw e;
                    }
                }
            }
            return n;
        });
    }
}
