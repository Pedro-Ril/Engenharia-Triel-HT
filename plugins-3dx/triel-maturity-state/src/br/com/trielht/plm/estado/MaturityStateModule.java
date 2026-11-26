package br.com.trielht.plm.estado;

import br.com.trielht.plm.core.PluginModule;
import br.com.trielht.plm.core.Release;

import java.util.List;

/**
 * Estado de maturidade pelo banco (plugin "maturity-state"). O trabalho e do MaturityStateFilter (registrado pelo
 * web-fragment.xml deste jar); este modulo so o coloca no nucleo: modo e parametros pelo Portal, versao, autoteste e
 * saude do no. Nao tem fila nem age em liberacao/duplicacao.
 *
 * Parametros (Portal): papel, maxObjetos, prazoMs, loteBanco, maxBytes, amostrasPorDia.
 */
public class MaturityStateModule implements PluginModule {

    public static final String KEY = "maturity-state";
    public static final String VERSION = "1.2.0";

    @Override
    public String key() {
        return KEY;
    }

    @Override
    public String version() {
        return VERSION;
    }

    @Override
    public List<String> requires() {
        return List.of(
                "com.matrixone.apps.domain.util.ContextUtil#getAnonymousContext",
                "com.matrixone.apps.domain.util.ContextUtil#pushContext",
                "com.matrixone.apps.domain.util.ContextUtil#popContext");
    }

    @Override
    public List<Release> releases() {
        return List.of(
                Release.of("1.2.0", "2026-11-25", "Divergência entre o índice e o banco vira execução no Portal "
                        + "(gatilho Consulta, um item por objeto: estado no índice → no banco). Sem divergência, o custo "
                        + "de cada estrutura continua só no registro de eventos."),
                Release.of("1.1.1", "2026-11-25", "Toda estrutura fica registrada (objetos, consultas ao banco e tempo), "
                        + "também no modo Ativo sem divergência: mostra o custo real por tamanho de estrutura."),
                Release.of("1.1.0", "2026-11-25", "Estado lido no banco em lote (uma consulta por grupo de objetos, "
                        + "parâmetro loteBanco), em vez de um por um: estrutura grande deixa de estourar o prazo."),
                Release.of("1.0.0", "2026-11-25", "Busca de item (dseng) e estrutura (zonequeries) com o estado de "
                        + "maturidade conferido no banco: o índice de busca atrasa até ~1,5 min depois de cada "
                        + "mudança. Em Simulação só registra as divergências, o custo e amostras do formato; em Ativo "
                        + "devolve o estado do banco. Só o estado muda; qualquer problema devolve a resposta como veio."));
    }
}
