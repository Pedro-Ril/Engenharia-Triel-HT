package br.com.trielht.plm.core;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Conexao com o banco do Portal (SQL Server, driver mssql-jdbc no WEB-INF/lib).
 *
 * So as threads de segundo plano do nucleo (gravador, fila, configuracao, heartbeat) usam o banco: a thread
 * do usuario (liberacao, duplicacao) nunca espera por ele. Cada thread guarda a propria conexao e a reaproveita
 * enquanto estiver valida -- sao poucas threads, um pool seria exagero.
 */
public final class Db {

    private static final String DRIVER = "com.microsoft.sqlserver.jdbc.SQLServerDriver";
    private static final Map<Thread, Connection> CONNECTIONS = new ConcurrentHashMap<>();
    private static volatile long lastFailure;
    private static volatile String lastError;

    private Db() {
    }

    @FunctionalInterface
    public interface Work<T> {
        T run(Connection c) throws SQLException;
    }

    /** O arquivo local tem os dados de acesso ao banco? */
    public static boolean configured() {
        Properties p = Core.local();
        return !p.getProperty("db.url", "").isBlank() && !p.getProperty("db.usuario", "").isBlank();
    }

    /** Ultima falha de acesso (para o heartbeat e o log). */
    public static String lastError() {
        return lastError;
    }

    /** Executa com a conexao da thread atual; em erro de conexao descarta a conexao e relanca. */
    public static <T> T with(Work<T> work) throws SQLException {
        Connection c = connection();
        try {
            return work.run(c);
        } catch (SQLException e) {
            if (isConnectionError(e)) discard();
            lastFailure = System.currentTimeMillis();
            lastError = Core.cut(e.getMessage(), 500);
            throw e;
        }
    }

    /** Falhou ha menos de 30 s? (evita insistir com um banco fora do ar a cada evento) */
    public static boolean recentlyFailed() {
        return System.currentTimeMillis() - lastFailure < 30_000;
    }

    private static Connection connection() throws SQLException {
        Thread t = Thread.currentThread();
        Connection c = CONNECTIONS.get(t);
        if (c != null) {
            try {
                if (c.isValid(3)) return c;
            } catch (SQLException ignore) {
                // vai abrir outra
            }
            discard();
        }
        Properties p = Core.local();
        String url = p.getProperty("db.url", "").trim();
        if (url.isEmpty()) throw new SQLException("db.url nao configurado em " + Core.CONFIG_FILE);
        try {
            Class.forName(DRIVER);
        } catch (ClassNotFoundException e) {
            throw new SQLException("Driver " + DRIVER + " nao encontrado (mssql-jdbc no WEB-INF/lib?)", e);
        }
        Properties info = new Properties();
        info.setProperty("user", p.getProperty("db.usuario", "").trim());
        info.setProperty("password", p.getProperty("db.senha", ""));
        info.setProperty("loginTimeout", "5");
        info.setProperty("applicationName", "triel-3dx-plugins " + Core.node());
        try {
            c = DriverManager.getConnection(url, info);
        } catch (SQLException e) {
            lastFailure = System.currentTimeMillis();
            lastError = Core.cut(e.getMessage(), 500);
            throw e;
        }
        c.setAutoCommit(true);
        CONNECTIONS.put(t, c);
        lastError = null;
        return c;
    }

    /** Fecha a conexao da thread atual (fim da thread ou erro). */
    public static void discard() {
        Connection c = CONNECTIONS.remove(Thread.currentThread());
        if (c != null) {
            try {
                c.close();
            } catch (SQLException ignore) {
                // nada
            }
        }
    }

    /** Fecha todas (parada do 3DSpace). */
    public static void closeAll() {
        for (Connection c : CONNECTIONS.values()) {
            try {
                c.close();
            } catch (SQLException ignore) {
                // nada
            }
        }
        CONNECTIONS.clear();
    }

    private static boolean isConnectionError(SQLException e) {
        String state = e.getSQLState();
        return state != null && (state.startsWith("08") || state.equals("S0001") && e.getErrorCode() == 0);
    }
}
