import jdk.internal.org.objectweb.asm.ClassReader;
import jdk.internal.org.objectweb.asm.ClassVisitor;
import jdk.internal.org.objectweb.asm.ClassWriter;
import jdk.internal.org.objectweb.asm.Label;
import jdk.internal.org.objectweb.asm.MethodVisitor;
import jdk.internal.org.objectweb.asm.Opcodes;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * (1.3) Gera a ENOIEFClientExistanceVerifier$ENOIEFExistanceVerifier.class corrigida a partir da original
 * (ENOIEFCmdManagers.jar). So o comeco de run() muda:
 *
 *   public void run() {
 *       if (IefCheckinGuard.verifierTick(this.this$0)) return;   // verificacao antiga em Ativo: nao age
 *       ... run() original, sem nenhuma outra mudanca ...
 *   }
 *
 * e ganha o metodo vazio public static triel$patched() (o autoteste do plugin confere que a classe corrigida esta
 * carregada). Roda com: java --add-exports java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED
 *   PatchVerifier.java <original.class> <saida.class>
 */
public class PatchVerifier implements Opcodes {

    static final String OWNER = "com/dassault_systems/MCADIntegration/server/manager/ENOIEFClientExistanceVerifier$ENOIEFExistanceVerifier";
    static final String OUTER = "com/dassault_systems/MCADIntegration/server/manager/ENOIEFClientExistanceVerifier";
    static final String GUARD = "br/com/trielht/plm/ief/IefCheckinGuard";
    static final String MARKER = "triel$patched";

    public static void main(String[] args) throws Exception {
        byte[] in = Files.readAllBytes(Path.of(args[0]));
        ClassReader cr = new ClassReader(in);
        if (!OWNER.equals(cr.getClassName())) throw new IllegalStateException("classe inesperada: " + cr.getClassName());
        ClassWriter cw = new ClassWriter(cr, ClassWriter.COMPUTE_MAXS);
        boolean[] achouRun = {false};
        boolean[] achouCampo = {false};

        ClassVisitor cv = new ClassVisitor(ASM9, cw) {
            @Override
            public jdk.internal.org.objectweb.asm.FieldVisitor visitField(int acc, String name, String desc, String sig, Object v) {
                if (name.equals("this$0") && desc.equals("L" + OUTER + ";")) achouCampo[0] = true;
                return super.visitField(acc, name, desc, sig, v);
            }

            @Override
            public MethodVisitor visitMethod(int acc, String name, String desc, String sig, String[] exc) {
                if (name.equals(MARKER)) throw new IllegalStateException("classe ja corrigida");
                MethodVisitor mv = super.visitMethod(acc, name, desc, sig, exc);
                if (!(name.equals("run") && desc.equals("()V"))) return mv;
                achouRun[0] = true;
                return new MethodVisitor(ASM9, mv) {
                    private boolean instrucao;

                    @Override
                    public void visitCode() {
                        super.visitCode();
                        Label segue = new Label();
                        super.visitVarInsn(ALOAD, 0);
                        super.visitFieldInsn(GETFIELD, OWNER, "this$0", "L" + OUTER + ";");
                        super.visitMethodInsn(INVOKESTATIC, GUARD, "verifierTick", "(Ljava/lang/Object;)Z", false);
                        super.visitJumpInsn(IFEQ, segue);
                        super.visitInsn(RETURN);
                        super.visitLabel(segue);
                        super.visitFrame(F_SAME, 0, null, 0, null);
                    }

                    @Override
                    public void visitFrame(int type, int nLocal, Object[] local, int nStack, Object[] stack) {
                        // um frame da original no inicio do metodo colidiria com o nosso: nao arriscar
                        if (!instrucao) throw new IllegalStateException("run() original tem frame no inicio");
                        super.visitFrame(type, nLocal, local, nStack, stack);
                    }

                    @Override
                    public void visitInsn(int op) {
                        instrucao = true;
                        super.visitInsn(op);
                    }

                    @Override
                    public void visitVarInsn(int op, int v) {
                        instrucao = true;
                        super.visitVarInsn(op, v);
                    }

                    @Override
                    public void visitFieldInsn(int op, String o, String n, String d) {
                        instrucao = true;
                        super.visitFieldInsn(op, o, n, d);
                    }

                    @Override
                    public void visitMethodInsn(int op, String o, String n, String d, boolean itf) {
                        instrucao = true;
                        super.visitMethodInsn(op, o, n, d, itf);
                    }

                    @Override
                    public void visitJumpInsn(int op, Label l) {
                        instrucao = true;
                        super.visitJumpInsn(op, l);
                    }

                    @Override
                    public void visitLdcInsn(Object v) {
                        instrucao = true;
                        super.visitLdcInsn(v);
                    }

                    @Override
                    public void visitTypeInsn(int op, String t) {
                        instrucao = true;
                        super.visitTypeInsn(op, t);
                    }
                };
            }

            @Override
            public void visitEnd() {
                MethodVisitor mv = super.visitMethod(ACC_PUBLIC | ACC_STATIC, MARKER, "()V", null, null);
                mv.visitCode();
                mv.visitInsn(RETURN);
                mv.visitMaxs(0, 0);
                mv.visitEnd();
                super.visitEnd();
            }
        };
        cr.accept(cv, 0);
        if (!achouRun[0]) throw new IllegalStateException("run()V nao encontrado");
        if (!achouCampo[0]) throw new IllegalStateException("campo this$0 nao encontrado");
        Files.write(Path.of(args[1]), cw.toByteArray());
        System.out.println("OK: run() da verificacao de cliente com IefCheckinGuard.verifierTick no inicio");
    }
}
