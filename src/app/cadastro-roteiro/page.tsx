import { Suspense } from "react";

import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { buscarModoAberturaArquivos } from "@/lib/cadastro-roteiro/preferencias";
import { MODO_ABERTURA_PADRAO } from "@/modules/cadastro-roteiro/constants/abertura-arquivos";
import CadastroRoteiro from "./CadastroRoteiro";

/*
 * O acesso ao módulo já é exigido (e contado) no layout.tsx; aqui só se
 * lê quem é para buscar a preferência de abertura. getUsuarioAutenticado
 * está em cache() -- é a mesma consulta que o layout já fez.
 */
export default async function CadastroRoteiroPage() {
    const usuario = await getUsuarioAutenticado();
    const modoAbertura = usuario
        ? await buscarModoAberturaArquivos(usuario.id)
        : MODO_ABERTURA_PADRAO;

    return (
        <Suspense fallback={<div style={{ padding: 24 }}>Carregando cadastro de roteiro...</div>}>
            <CadastroRoteiro modoAbertura={modoAbertura} />
        </Suspense>
    );
}
