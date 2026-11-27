import java.lang.reflect.Method;
import java.lang.reflect.Modifier;

/**
 * Carrega e verifica (bytecode verifier completo) as classes da Dassault corrigidas contra os jars do 3dspace, sem
 * executar nada. Uso: java -Xverify:all -cp <classes-corrigidas>:<WEB-INF/lib/*>:<tomee/lib/*> VerifyLoad [classe...]
 * Sem argumento: ENOIEFCheckinHandler. Classe interna: confere tambem o nest host (acesso aos campos privados da
 * externa, que continua no jar).
 */
public class VerifyLoad {
    public static void main(String[] a) throws Exception {
        String[] nomes = a.length > 0 ? a
                : new String[] {"com.dassault_systems.MCADIntegration.server.handler.ENOIEFCheckinHandler"};
        for (String nome : nomes) {
            Class<?> c = Class.forName(nome, false, VerifyLoad.class.getClassLoader());
            // getDeclaredMethods forca a ligacao/verificacao da classe
            for (Method m : c.getDeclaredMethods()) {
                if (m.getName().equals("execute") || m.getName().startsWith("triel$") || m.getName().equals("run"))
                    System.out.println(Modifier.toString(m.getModifiers()) + " " + m.getName() + " throws "
                            + java.util.Arrays.toString(m.getExceptionTypes()));
            }
            Class.forName(nome, true, VerifyLoad.class.getClassLoader()); // inicializa (vale para classe nao publica)
            Class<?> host = c.getNestHost();
            if (c.getEnclosingClass() != null && host != c.getEnclosingClass()) {
                throw new IllegalStateException("nest host invalido para " + nome + ": " + host);
            }
            System.out.println("carregada e verificada: " + c.getProtectionDomain().getCodeSource().getLocation()
                    + " (nest host " + host.getSimpleName() + ")");
        }
    }
}
