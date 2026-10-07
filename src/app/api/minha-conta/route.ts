import { NextResponse } from "next/server";

import { getResumoAcessosModulos } from "@/lib/auth/acesso-modulo";
import {
  getSetoresComModulosPermitidos,
  getUsuarioAutenticado,
  podeAcessarModulo,
} from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { listarHistoricoDoUsuario } from "@/lib/auth/login-historico";
import { isObject, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { buscarTemaUsuario, definirTemaUsuario, ehTemaValido } from "@/lib/preferencias/preferencias";
import {
  buscarModoGestos,
  definirModoGestos,
} from "@/lib/visualizador-cad/preferencias";
import { ehModoGestos } from "@/modules/visualizador-cad/constants/gestos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_VISUALIZADOR = "visualizador-cad";

/*
 * A preferência de gestos só faz sentido para quem abre o Visualizador
 * CAD -- sem isto, o cartão apareceria em Minha conta para o portal
 * inteiro, oferecendo ajuste de uma tela que a pessoa não acessa.
 * Mesma regra que governa o acesso ao módulo: administrador passa
 * sempre.
 */
async function temVisualizadorCad(usuario: {
  id: string;
  ehAdministrador: boolean;
}): Promise<boolean> {
  if (usuario.ehAdministrador) return true;
  return podeAcessarModulo(usuario.id, MODULO_VISUALIZADOR);
}

async function handleGET() {
  const usuario = await getUsuarioAutenticado();

  if (!usuario) {
    return NextResponse.json(
      { ok: false, message: "É necessário estar autenticado." },
      { status: 401 }
    );
  }

  try {
    const [historico, setores, resumoAcessos, tema, gestosCad, podeVisualizadorCad] =
      await Promise.all([
        listarHistoricoDoUsuario(usuario.id, usuario.samAccountName),
        getSetoresComModulosPermitidos(usuario),
        getResumoAcessosModulos(usuario.id),
        buscarTemaUsuario(usuario.id),
        buscarModoGestos(usuario.id),
        temVisualizadorCad(usuario),
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
          gestosCad,
          /* Governa a exibição do cartão de gestos em Minha conta. */
          podeVisualizadorCad,
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

export const GET = comMetricasApi("minha-conta", handleGET);

async function handlePATCH(request: Request) {
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

    /*
     * Cada campo é opcional, mas ao menos um precisa vir: a rota atende
     * tanto o tema quanto o modo de gestos do visualizador, e quem
     * salva um não deveria ser obrigado a reenviar o outro.
     */
    let alterou = false;

    if (body.tema !== undefined) {
      const tema = requiredText(body.tema, "tema", 10);

      if (!ehTemaValido(tema)) {
        throw new ValidationError("Tema inválido.");
      }

      await definirTemaUsuario(usuario.id, tema);
      alterou = true;
    }

    if (body.gestosCad !== undefined) {
      const gestos = requiredText(body.gestosCad, "modo de gestos", 20);

      if (!ehModoGestos(gestos)) {
        throw new ValidationError("Modo de gestos inválido.");
      }

      /* A API não aceita o que a tela não oferece. */
      if (!(await temVisualizadorCad(usuario))) {
        return NextResponse.json(
          { ok: false, message: "Você não tem acesso ao Visualizador CAD." },
          { status: 403 }
        );
      }

      await definirModoGestos(usuario.id, gestos);
      alterou = true;
    }

    if (!alterou) {
      throw new ValidationError("Nenhuma preferência foi informada.");
    }

    return NextResponse.json({ ok: true, message: "Preferência salva." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar preferência da conta:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a preferência." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("minha-conta", handlePATCH);
