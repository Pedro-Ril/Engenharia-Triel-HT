import { NextResponse } from "next/server";

import { getResumoAcessosModulos } from "@/lib/auth/acesso-modulo";
import {
  getSetoresComModulosPermitidos,
  getUsuarioAutenticado,
} from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { listarHistoricoDoUsuario } from "@/lib/auth/login-historico";
import { isObject, requiredText } from "@/lib/auth/validation";
import { buscarTemaUsuario, definirTemaUsuario, ehTemaValido } from "@/lib/preferencias/preferencias";

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
    const [historico, setores, resumoAcessos, tema] = await Promise.all([
      listarHistoricoDoUsuario(usuario.id, usuario.samAccountName),
      getSetoresComModulosPermitidos(usuario),
      getResumoAcessosModulos(usuario.id),
      buscarTemaUsuario(usuario.id),
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
          tema,
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

export async function PATCH(request: Request) {
  const usuario = await getUsuarioAutenticado();

  if (!usuario) {
    return NextResponse.json(
      { ok: false, message: "É necessário estar autenticado." },
      { status: 401 }
    );
  }

  try {
    const parsedBody: unknown = await request.json().catch(() => ({}));
    const body = isObject(parsedBody) ? parsedBody : {};

    const tema = requiredText(body.tema, "tema", 10);

    if (!ehTemaValido(tema)) {
      throw new ValidationError("Tema inválido.");
    }

    await definirTemaUsuario(usuario.id, tema);

    return NextResponse.json({ ok: true, message: "Preferência salva." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar preferência de tema:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a preferência." },
      { status: 500 }
    );
  }
}
