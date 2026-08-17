import { NextResponse } from "next/server";

import { getSessionUsuario } from "@/lib/auth/session";
import { getUsuarioBySamAccountName } from "@/lib/auth/usuarios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sessao = await getSessionUsuario();

  if (!sessao) {
    return NextResponse.json({ ok: true, data: null });
  }

  const usuario = await getUsuarioBySamAccountName(sessao.sub);

  if (!usuario || !usuario.ativo) {
    return NextResponse.json({ ok: true, data: null });
  }

  return NextResponse.json({
    ok: true,
    data: {
      samAccountName: usuario.samAccountName,
      nomeExibicao: usuario.nomeExibicao,
      email: usuario.email,
      codigoEmpresa: usuario.codigoEmpresa,
      ehAdministrador: usuario.ehAdministrador,
    },
  });
}
