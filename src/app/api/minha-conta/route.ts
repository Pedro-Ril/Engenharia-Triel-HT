import { NextResponse } from "next/server";

import { getResumoAcessosModulos } from "@/lib/auth/acesso-modulo";
import {
  getSetoresComModulosPermitidos,
  getUsuarioAutenticado,
} from "@/lib/auth/autorizacao";
import { listarHistoricoDoUsuario } from "@/lib/auth/login-historico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const usuario = await getUsuarioAutenticado();

  if (!usuario) {
    return NextResponse.json(
      { ok: false, message: "É necessário estar autenticado." },
      { status: 401 }
    );
  }

  try {
    const [historico, setores, resumoAcessos] = await Promise.all([
      listarHistoricoDoUsuario(usuario.id, usuario.samAccountName),
      getSetoresComModulosPermitidos(usuario),
      getResumoAcessosModulos(usuario.id),
    ]);

    const resumoPorModuloId = new Map(
      resumoAcessos.map((item) => [item.moduloId, item])
    );

    const acessosModulos = setores
      .flatMap((setor) => setor.modulos)
      .map((modulo) => ({
        moduloId: modulo.id,
        moduloNome: modulo.nome,
        moduloIcone: modulo.icone,
        totalAcessos: resumoPorModuloId.get(modulo.id)?.totalAcessos ?? 0,
        ultimoAcesso: resumoPorModuloId.get(modulo.id)?.ultimoAcesso ?? null,
      }))
      .sort((a, b) => b.totalAcessos - a.totalAcessos);

    return NextResponse.json({
      ok: true,
      data: {
        perfil: {
          samAccountName: usuario.samAccountName,
          nomeExibicao: usuario.nomeExibicao,
          email: usuario.email,
          codigoEmpresa: usuario.codigoEmpresa,
          ehAdministrador: usuario.ehAdministrador,
          ultimoLoginEm: usuario.ultimoLoginEm,
        },
        historico,
        acessosModulos,
      },
    });
  } catch (error) {
    console.error("Erro ao carregar dados de Minha Conta:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar os dados da conta." },
      { status: 500 }
    );
  }
}
