import { ValidationError } from "@/lib/auth/errors";
import { autenticarRotaAvulsa, responder } from "@/lib/rotas-avulsas/autenticacao";
import { lerConfigImpressao } from "@/lib/rotas-avulsas/impressao/config";
import {
  buscarImpressoraPorCodigo,
  buscarTrabalhoPorChave,
  enviarParaImpressora,
  listarImpressoras,
  registrarTrabalho,
  ROTA_IMPRESSAO,
  trabalhoPublico,
  type Impressora,
} from "@/lib/rotas-avulsas/impressao/impressao";
import { ErroMultipart, lerMultipart } from "@/lib/rotas-avulsas/impressao/multipart";
import { conferirPdf } from "@/lib/rotas-avulsas/impressao/pdf";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Rota avulsa de impressão: outro sistema manda um PDF e o Portal imprime
 * direto na impressora (IPP), sem Windows no caminho. Pública no proxy
 * (prefixo /api/externo); a autenticação é o token da rota, conferido em
 * autenticarRotaAvulsa ANTES de ler o corpo.
 *
 *   POST /api/externo/impressao/pdf
 *   Authorization: Bearer pta_...
 *   Idempotency-Key: <opcional, até 100 caracteres [A-Za-z0-9._:-]>
 *   multipart/form-data:
 *     arquivo       o PDF (obrigatório)
 *     impressora    código cadastrado (opcional se o token só pode usar uma)
 *     copias        1..N (opcional, padrão 1)
 *     frente_verso  sim | nao (opcional, padrão da impressora)
 *
 * Toda resposta, aceita ou recusada, vai para o log da rota.
 */

const FORMATO_IDEMPOTENCIA = /^[A-Za-z0-9._:-]{1,100}$/;
const FOLGA_MULTIPART = 64 * 1024;

function lerCopias(valor: string | undefined, maximo: number): number {
  if (valor === undefined || valor.trim() === "") return 1;
  if (!/^\d{1,4}$/.test(valor.trim())) throw new ValidationError("O campo copias deve ser um número inteiro.");
  const copias = Number(valor.trim());
  if (copias < 1 || copias > maximo) throw new ValidationError(`O campo copias deve ficar entre 1 e ${maximo}.`);
  return copias;
}

function lerFrenteVerso(valor: string | undefined, padrao: boolean): boolean {
  if (valor === undefined || valor.trim() === "") return padrao;
  const v = valor.trim().toLowerCase();
  if (["sim", "s", "true", "1"].includes(v)) return true;
  if (["nao", "não", "n", "false", "0"].includes(v)) return false;
  throw new ValidationError("O campo frente_verso deve ser sim ou nao.");
}

/* Impressora pedida, dentro do que o token pode usar (escopo vazio = todas as ativas). */
async function escolherImpressora(codigoPedido: string | undefined, permitidas: string[]): Promise<Impressora> {
  const codigo = codigoPedido?.trim().toUpperCase() ?? "";

  if (!codigo) {
    const candidatas = permitidas.length
      ? permitidas
      : (await listarImpressoras()).filter((i) => i.ativo).map((i) => i.codigo);
    if (candidatas.length !== 1) {
      throw new ValidationError("Informe o campo impressora (código cadastrado no Portal).");
    }
    return escolherImpressora(candidatas[0], permitidas);
  }

  if (permitidas.length && !permitidas.includes(codigo)) {
    throw new ValidationError(`Este token não pode imprimir na impressora ${codigo}.`);
  }
  const impressora = await buscarImpressoraPorCodigo(codigo);
  if (!impressora || !impressora.ativo) {
    throw new ValidationError(`Impressora ${codigo} não encontrada ou desativada.`);
  }
  return impressora;
}

async function handlePOST(request: Request) {
  const autenticacao = await autenticarRotaAvulsa(request, ROTA_IMPRESSAO);
  if (!autenticacao.ok) return autenticacao.resposta;

  const { ctx, rota } = autenticacao;
  const config = lerConfigImpressao(rota.config);
  const maxBytes = config.tamanhoMaxMb * 1024 * 1024;
  const recusar = (status: number, message: string, detalhes?: unknown) =>
    responder(ctx, { status, resultado: "recusado", motivo: message, corpo: { ok: false, message }, detalhes });

  try {
    if (!/^multipart\/form-data/i.test(request.headers.get("content-type") ?? "")) {
      return recusar(415, "Envie o PDF como multipart/form-data, no campo arquivo.");
    }

    const tamanhoDeclarado = Number(request.headers.get("content-length"));
    if (Number.isFinite(tamanhoDeclarado) && tamanhoDeclarado > maxBytes + FOLGA_MULTIPART) {
      return recusar(413, `O arquivo passa do tamanho máximo de ${config.tamanhoMaxMb} MB.`, { tamanhoDeclarado });
    }

    const chaveIdempotencia = request.headers.get("idempotency-key")?.trim() || null;
    if (chaveIdempotencia && !FORMATO_IDEMPOTENCIA.test(chaveIdempotencia)) {
      return recusar(400, "Idempotency-Key inválida: até 100 caracteres entre letras, números e . _ : -");
    }

    if (chaveIdempotencia) {
      const existente = await buscarTrabalhoPorChave(ctx.token.id, chaveIdempotencia);
      if (existente) {
        return responder(ctx, {
          status: 200,
          resultado: "aceito",
          motivo: "Idempotency-Key repetida: devolvido o trabalho já existente, sem imprimir de novo.",
          corpo: { ok: true, message: "Este envio já tinha sido recebido; nada foi impresso de novo.", data: trabalhoPublico(existente) },
          detalhes: { trabalhoId: existente.id, chaveIdempotencia, repetido: true },
        });
      }
    }

    let formulario;
    try {
      formulario = await lerMultipart(request, maxBytes);
    } catch (erro) {
      if (erro instanceof ErroMultipart) return recusar(erro.status, erro.message);
      throw erro;
    }

    if (!formulario.arquivo || formulario.arquivo.dados.length === 0) {
      return recusar(400, "Nenhum arquivo recebido no campo arquivo.");
    }

    const { arquivo, campos } = formulario;
    const impressora = await escolherImpressora(campos.impressora, ctx.token.escopo.impressoras ?? []);
    const copias = lerCopias(campos.copias, config.copiasMax);
    const frenteVerso = lerFrenteVerso(campos.frente_verso, impressora.frenteVersoPadrao);
    const pdf = await conferirPdf(arquivo.dados, config.paginasMax);

    const detalhesBase = {
      impressora: impressora.codigo,
      copias,
      frenteVerso,
      paginas: pdf.paginas,
      tamanhoBytes: arquivo.dados.length,
      sha256: pdf.sha256,
      nomeArquivo: arquivo.nome,
      chaveIdempotencia,
    };

    const { trabalho, repetido } = await registrarTrabalho({
      tokenId: ctx.token.id,
      chaveIdempotencia,
      impressora,
      nomeArquivo: arquivo.nome,
      copias,
      frenteVerso,
      paginas: pdf.paginas,
      tamanhoBytes: arquivo.dados.length,
      sha256: pdf.sha256,
    });

    if (repetido) {
      return responder(ctx, {
        status: 200,
        resultado: "aceito",
        motivo: "Idempotency-Key repetida (envio simultâneo): devolvido o trabalho já existente.",
        corpo: { ok: true, message: "Este envio já tinha sido recebido; nada foi impresso de novo.", data: trabalhoPublico(trabalho) },
        detalhes: { ...detalhesBase, trabalhoId: trabalho.id, repetido: true },
      });
    }

    const envio = await enviarParaImpressora({ trabalho, impressora, pdf: arquivo.dados, usuario: ctx.token.nome });
    const detalhes = {
      ...detalhesBase,
      trabalhoId: envio.trabalho.id,
      jobId: envio.trabalho.ippJobId,
      estado: envio.trabalho.estado,
      statusIpp: envio.statusIpp,
    };

    if (!envio.ok) {
      return responder(ctx, {
        status: 502,
        resultado: "erro",
        motivo: envio.trabalho.estadoDetalhe,
        corpo: {
          ok: false,
          message: "A impressora não aceitou o trabalho. Tente de novo mais tarde.",
          data: trabalhoPublico(envio.trabalho),
        },
        detalhes,
      });
    }

    return responder(ctx, {
      status: 201,
      resultado: "aceito",
      motivo: null,
      corpo: { ok: true, message: "PDF enviado para a impressora.", data: trabalhoPublico(envio.trabalho) },
      detalhes,
    });
  } catch (erro) {
    if (erro instanceof ValidationError) return recusar(400, erro.message);
    console.error("Erro na rota avulsa de impressão:", erro);
    return responder(ctx, {
      status: 500,
      resultado: "erro",
      motivo: erro instanceof Error ? erro.message : "Erro inesperado.",
      corpo: { ok: false, message: "Não foi possível processar a impressão." },
    });
  }
}

export const POST = comMetricasApi("externo/impressao/pdf", handlePOST);
