import { NextResponse, after } from "next/server";

import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { extrairIpOrigem } from "@/lib/auth/login-historico";
import { ValidationError } from "@/lib/auth/errors";
import { optionalText, requiredText } from "@/lib/auth/validation";
import { buscarUsuarioPorId } from "@/lib/auth/usuarios";
import { getSetoresQueAtende } from "@/lib/chamados/autorizacao-chamados";
import { criarChamado } from "@/lib/chamados/chamados";
import { origemPublicaEfetivaChamados } from "@/lib/chamados/chamados-config";
import { lerMensagemFormData } from "@/lib/chamados/mensagem-html";
import {
  notificarAtendentesDoSetor,
  notificarSolicitanteChamado,
} from "@/lib/chamados/notificacoes-email";
import { optionalUuid, parseAnexosFormData, requiredPrioridade } from "@/lib/chamados/validacao";
import { resolverUnidadeParaChamado } from "@/lib/empresas/unidades";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Pública: qualquer pessoa abre um chamado, logada ou não. Se
 * houver sessão, o solicitante é identificado por ela (nome/
 * usuário não podem ser forjados pelo corpo da requisição); sem
 * sessão, o nome é obrigatório no formulário.
 *
 * "solicitanteAlvoId" (opcional) permite abrir EM NOME de outra
 * pessoa -- só honrado se quem está logado for atendente de algum
 * setor ou admin (getSetoresQueAtende); nesse caso o alvo vira o
 * solicitante de verdade (aparece no "Meus chamados" dele, recebe
 * e-mail como solicitante) e quem de fato abriu fica só registrado
 * em criado_por_usuario_id.
 */
async function handlePOST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, message: "O corpo da requisição deve ser multipart/form-data." },
      { status: 400 }
    );
  }

  try {
    const usuario = await getUsuarioAutenticado();

    const setorId = requiredText(formData.get("setorId"), "setor", 60);
    const categoriaId = requiredText(formData.get("categoriaId"), "categoria", 60);
    const prioridade = requiredPrioridade(formData.get("prioridade"));
    const titulo = requiredText(formData.get("titulo"), "título", 200);
    const descricao = await lerMensagemFormData(formData, "descricao", "descrição");

    let solicitante = usuario;
    let criadoPorUsuarioId: string | null = null;

    const solicitanteAlvoId = optionalText(formData.get("solicitanteAlvoId"), "usuário alvo", 36);

    if (solicitanteAlvoId && usuario) {
      const setoresAtendidos = await getSetoresQueAtende(usuario);
      const podeAbrirEmNomeDe = setoresAtendidos === null || setoresAtendidos.length > 0;

      if (!podeAbrirEmNomeDe) {
        throw new ValidationError("Você não tem permissão para abrir um chamado em nome de outra pessoa.");
      }

      const alvo = await buscarUsuarioPorId(solicitanteAlvoId);
      if (!alvo) {
        throw new ValidationError("Usuário selecionado não encontrado.");
      }

      solicitante = alvo;
      criadoPorUsuarioId = usuario.id;
    }

    const solicitanteNome = solicitante
      ? solicitante.nomeExibicao
      : requiredText(formData.get("nome"), "nome", 200);

    const solicitanteContato = solicitante
      ? optionalText(formData.get("contato"), "contato", 200) ?? solicitante.email
      : optionalText(formData.get("contato"), "contato", 200);

    /*
     * Unidade do SOLICITANTE (no "em nome de", a do alvo): a tela só
     * sugere -- aqui confere que a escolhida está entre as permitidas, e
     * que não ficou vazia quando a empresa tem unidade.
     */
    const unidade = await resolverUnidadeParaChamado(
      solicitante ? { id: solicitante.id, codigoEmpresa: solicitante.codigoEmpresa } : null,
      optionalUuid(formData.get("unidadeId"), "unidade")
    );

    const anexos = await parseAnexosFormData(formData, "anexos");

    const { id, numero } = await criarChamado({
      setorId,
      categoriaId,
      prioridade,
      titulo,
      descricao: descricao.texto,
      descricaoFormato: descricao.formato,
      solicitanteUsuarioId: solicitante?.id ?? null,
      solicitanteNome,
      solicitanteContato,
      empresa: solicitante?.codigoEmpresa ?? null,
      unidade,
      solicitanteDepartamento: solicitante?.departamento ?? null,
      ipOrigem: extrairIpOrigem(request),
      anexos: [...anexos, ...descricao.imagens],
      criadoPorUsuarioId,
    });

    const origem = await origemPublicaEfetivaChamados(request);

    await notificarSolicitanteChamado({
      chamado: {
        id,
        numero,
        titulo,
        solicitanteNome,
        solicitanteContato,
        solicitanteUsuarioId: solicitante?.id ?? null,
      },
      evento: "aberto",
      origem,
    });

    /*
     * Os atendentes do setor saem DEPOIS da resposta (after do Next):
     * são N e-mails, e quem abriu o chamado não precisa esperar por
     * eles. Falha de envio nunca derruba a abertura -- cada tentativa
     * fica registrada em portal_chamados_notificacoes_email.
     */
    after(() =>
      notificarAtendentesDoSetor({
        chamado: {
          numero,
          titulo,
          prioridade,
          solicitanteNome,
          solicitanteDepartamento: solicitante?.departamento ?? null,
        },
        setorId,
        origem,
        excluirUsuarioId: solicitante?.id ?? null,
      })
    );

    return NextResponse.json(
      {
        ok: true,
        message: "Chamado aberto com sucesso.",
        data: { numero },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao abrir chamado:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível abrir o chamado." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("chamados", handlePOST);
