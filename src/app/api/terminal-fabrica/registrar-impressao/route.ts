import { NextResponse } from "next/server";

import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { extrairIpOrigem } from "@/lib/auth/login-historico";
import { isObject, optionalInteger, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import {
  podeImprimirDesenho,
  registrarImpressaoDesenho,
} from "@/lib/terminal-fabrica/impressao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RegistrarImpressaoBody {
  codigo?: unknown;
  totalPaginas?: unknown;
}

/*
 * Fica sob o prefixo público "/api/terminal-fabrica" (ver
 * src/lib/auth/rotas-publicas.ts) como as outras rotas do kiosk, mas
 * ao contrário delas EXIGE sessão com permissão de impressão: é o
 * registro de uma ação restrita, não daria para aceitar de anônimo.
 * A checagem aqui não é só auditoria -- é o que impede alguém sem a
 * permissão de poluir o histórico chamando a rota na mão.
 */
async function handlePOST(request: Request) {
  let body: RegistrarImpressaoBody;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    body = parsedBody;
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, message: "O corpo da requisição contém um JSON inválido." },
      { status: 400 }
    );
  }

  try {
    const codigo = requiredText(body.codigo, "código", 60);
    /* 0 = não informado; a coluna aceita NULL para esse caso. */
    const totalPaginas = optionalInteger(body.totalPaginas, "total de páginas", 0);

    const usuario = await getUsuarioAutenticado();

    if (!usuario) {
      return NextResponse.json(
        { ok: false, message: "Entre no portal para imprimir o desenho." },
        { status: 401 }
      );
    }

    if (!(await podeImprimirDesenho(usuario.id))) {
      return NextResponse.json(
        { ok: false, message: "Seu usuário não tem permissão para imprimir desenhos." },
        { status: 403 }
      );
    }

    await registrarImpressaoDesenho({
      usuarioId: usuario.id,
      codigoItem: codigo,
      totalPaginas: totalPaginas > 0 ? totalPaginas : null,
      ipOrigem: extrairIpOrigem(request),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao registrar impressão do terminal de fábrica:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível registrar a impressão." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("terminal-fabrica/registrar-impressao", handlePOST);
