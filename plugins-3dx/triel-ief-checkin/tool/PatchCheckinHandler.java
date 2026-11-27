import jdk.internal.org.objectweb.asm.ClassReader;
import jdk.internal.org.objectweb.asm.ClassVisitor;
import jdk.internal.org.objectweb.asm.ClassWriter;
import jdk.internal.org.objectweb.asm.Label;
import jdk.internal.org.objectweb.asm.MethodVisitor;
import jdk.internal.org.objectweb.asm.Opcodes;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Gera a ENOIEFCheckinHandler.class corrigida a partir da original (ENOIEFCmdHandlers.jar):
 *  - execute()V original vira private triel$execute()V, com Executors.newScheduledThreadPool trocado por
 *    IefCheckinGuard.newScheduler;
 *  - novo public execute()V:
 *      int m = IefCheckinGuard.enter(this);
 *      try { triel$execute(); } catch (Throwable t) { IefCheckinGuard.failed(this, m, t); throw t; }
 *      IefCheckinGuard.exit(m);
 * Mais nada muda. Roda com: java --add-exports java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED
 *   PatchCheckinHandler.java <original.class> <saida.class>
 * (o build.sh extrai a original do ENOIEFCmdHandlers.jar e confere o md5 do jar antes)
 */
public class PatchCheckinHandler implements Opcodes {

    static final String OWNER = "com/dassault_systems/MCADIntegration/server/handler/ENOIEFCheckinHandler";
    static final String GUARD = "br/com/trielht/plm/ief/IefCheckinGuard";
    static final String RENAMED = "triel$execute";

    public static void main(String[] args) throws Exception {
        byte[] in = Files.readAllBytes(Path.of(args[0]));
        ClassReader cr = new ClassReader(in);
        if (!OWNER.equals(cr.getClassName())) throw new IllegalStateException("classe inesperada: " + cr.getClassName());
        ClassWriter cw = new ClassWriter(cr, ClassWriter.COMPUTE_MAXS);
        int[] trocas = {0};
        boolean[] achou = {false};
        String[][] excecoes = {null};

        ClassVisitor cv = new ClassVisitor(ASM9, cw) {
            @Override
            public MethodVisitor visitMethod(int acc, String name, String desc, String sig, String[] exc) {
                if (name.equals(RENAMED)) throw new IllegalStateException("classe ja corrigida");
                if (!(name.equals("execute") && desc.equals("()V"))) return super.visitMethod(acc, name, desc, sig, exc);
                achou[0] = true;
                excecoes[0] = exc;
                int novoAcc = (acc & ~(ACC_PUBLIC | ACC_PROTECTED)) | ACC_PRIVATE;
                MethodVisitor mv = super.visitMethod(novoAcc, RENAMED, desc, sig, exc);
                return new MethodVisitor(ASM9, mv) {
                    @Override
                    public void visitMethodInsn(int op, String owner, String n, String d, boolean itf) {
                        if (op == INVOKESTATIC && owner.equals("java/util/concurrent/Executors")
                                && n.equals("newScheduledThreadPool")
                                && d.equals("(I)Ljava/util/concurrent/ScheduledExecutorService;")) {
                            trocas[0]++;
                            super.visitMethodInsn(INVOKESTATIC, GUARD, "newScheduler", d, false);
                            return;
                        }
                        super.visitMethodInsn(op, owner, n, d, itf);
                    }
                };
            }

            @Override
            public void visitEnd() {
                if (achou[0]) {
                    MethodVisitor mv = super.visitMethod(ACC_PUBLIC, "execute", "()V", null, excecoes[0]);
                    mv.visitCode();
                    Label ini = new Label(), fim = new Label(), trata = new Label();
                    mv.visitTryCatchBlock(ini, fim, trata, null);
                    mv.visitVarInsn(ALOAD, 0);
                    mv.visitMethodInsn(INVOKESTATIC, GUARD, "enter", "(Ljava/lang/Object;)I", false);
                    mv.visitVarInsn(ISTORE, 1);
                    mv.visitLabel(ini);
                    mv.visitVarInsn(ALOAD, 0);
                    mv.visitMethodInsn(INVOKESPECIAL, OWNER, RENAMED, "()V", false);
                    mv.visitLabel(fim);
                    mv.visitVarInsn(ILOAD, 1);
                    mv.visitMethodInsn(INVOKESTATIC, GUARD, "exit", "(I)V", false);
                    mv.visitInsn(RETURN);
                    mv.visitLabel(trata);
                    mv.visitFrame(F_FULL, 2, new Object[]{OWNER, INTEGER}, 1, new Object[]{"java/lang/Throwable"});
                    mv.visitVarInsn(ASTORE, 2);
                    mv.visitVarInsn(ALOAD, 0);
                    mv.visitVarInsn(ILOAD, 1);
                    mv.visitVarInsn(ALOAD, 2);
                    mv.visitMethodInsn(INVOKESTATIC, GUARD, "failed", "(Ljava/lang/Object;ILjava/lang/Throwable;)V", false);
                    mv.visitVarInsn(ALOAD, 2);
                    mv.visitInsn(ATHROW);
                    mv.visitMaxs(0, 0);
                    mv.visitEnd();
                }
                super.visitEnd();
            }
        };
        cr.accept(cv, 0);
        if (!achou[0]) throw new IllegalStateException("execute()V nao encontrado");
        if (trocas[0] != 1) throw new IllegalStateException("esperava 1 newScheduledThreadPool, achou " + trocas[0]);
        Files.write(Path.of(args[1]), cw.toByteArray());
        System.out.println("OK: execute() envolvido, " + trocas[0] + " newScheduledThreadPool trocado");
    }
}
