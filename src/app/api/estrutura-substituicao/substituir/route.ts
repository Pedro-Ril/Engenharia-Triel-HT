import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import { buscarEmpresaPorId } from "@/lib/empresas/empresas";
import {
  buscarEstruturaCompleta,
  substituirItemNaEstrutura,
} from "@/lib/estrutura-substituicao/estrutura-substituicao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SubstituirBody {
  empresaId?: unknown;
  codPai?: unknown;
  codigoAntigo?: unknown;
  codigoNovo?: unknown;
}

/*
 * Rebusca a estrutura no ERP na hora de aplicar (em vez de confiar
 * numa cópia que o cliente guardou desde a tela de confirmação) —
 * evita agir sobre um estado desatualizado se alguém mais mexeu na
 * estrutura enquanto o usuário estava decidindo o que trocar.
 */
async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("substituicao-estrutura");
  if (acesso.negado) return acesso.negado;

  let body: SubstituirBody;

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
    const empresaId = requiredText(body.empresaId, "empresaId", 36);
    const codPai = requiredText(body.codPai, "codPai", 60);
    const codigoAntigo = requiredText(body.codigoAntigo, "codigoAntigo", 60);
    const codigoNovo = requiredText(body.codigoNovo, "codigoNovo", 60);

    const empresa = await buscarEmpresaPorId(empresaId);
    if (!empresa) {
      throw new ValidationError("Empresa não encontrada.");
    }
    if (!empresa.cnpj) {
      throw new ValidationError(
        `A empresa "${empresa.nome}" não tem CNPJ cadastrado — configure em Administração → Empresas.`
      );
    }

    const estrutura = await buscarEstruturaCompleta(codPai);

    const resultados = await substituirItemNaEstrutura({
      cnpj: empresa.cnpj,
      estrutura,
      codigoAntigo,
      codigoNovo,
      usuarioNome: acesso.usuario.nomeExibicao,
      empresaNome: empresa.nome,
    });

    const todosComSucesso = resultados.every((resultado) => resultado.sucesso);
    const totalComSucesso = resultados.filter((resultado) => resultado.sucesso).length;

    const mensagem = todosComSucesso
      ? `Item substituído em ${resultados.length} nível(is) da estrutura.`
      : `Aplicado em ${totalComSucesso} de ${resultados.length} nível(is). Falhou no(s) pai(s): ${resultados
          .filter((resultado) => !resultado.sucesso)
          .map((resultado) => `${resultado.codigoPai} (${resultado.mensagemErro ?? "erro desconhecido"})`)
          .join("; ")}`;

    return NextResponse.json({ ok: todosComSucesso, message: mensagem, data: { niveis: resultados } });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao substituir item na estrutura:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível aplicar a substituição." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("estrutura-substituicao/substituir", handlePOST);
