import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredText } from "@/lib/auth/validation";
import type { CamposAssinaturaConfig, FonteAssinatura } from "./modelos";
import { lerDimensoesPng } from "./imagem-png";

export const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dataUrlPngPattern = /^data:image\/png;base64,([a-zA-Z0-9+/=]+)$/;

/* Só letras/números/espaço/hífen -- sem isso, um nome com acento vira mojibake no nome do arquivo em alguns clientes de e-mail, e caracteres tipo / ou \ quebrariam o nome do arquivo servido no Content-Disposition. */
export function sanitizarNomeArquivo(texto: string): string {
  const semAcentos = texto.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return semAcentos
    .replace(/[^a-zA-Z0-9 -]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

export interface CamposFormularioAssinaturaBody {
  modeloId?: unknown;
  nome?: unknown;
  sobrenome?: unknown;
  setor?: unknown;
  email?: unknown;
  celular?: unknown;
  imagemBase64?: unknown;
}

export interface CamposFormularioAssinaturaValidados {
  modeloId: string;
  nome: string;
  sobrenome: string;
  setor: string;
  email: string;
  celular: string | null;
  imagemConteudo: Buffer;
}

/* Compartilhado entre POST /gerar e PATCH /geradas/[id] -- os dois recebem exatamente a mesma forma de corpo (formulário completo + PNG já composto no canvas do cliente). */
export function validarCorpoFormularioAssinatura(parsedBody: unknown): CamposFormularioAssinaturaValidados {
  if (!isObject(parsedBody)) {
    throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
  }
  const body: CamposFormularioAssinaturaBody = parsedBody;

  const modeloId = requiredText(body.modeloId, "modelo", 36);
  if (!uniqueIdentifierPattern.test(modeloId)) {
    throw new ValidationError("O modelo selecionado é inválido.");
  }
  const nome = requiredText(body.nome, "nome", 150);
  const sobrenome = requiredText(body.sobrenome, "sobrenome", 150);
  const setor = requiredText(body.setor, "setor", 150);
  const email = requiredText(body.email, "e-mail", 200);
  const celular = optionalText(body.celular, "celular", 40);

  if (typeof body.imagemBase64 !== "string") {
    throw new ValidationError("A imagem da assinatura é obrigatória.");
  }

  const match = dataUrlPngPattern.exec(body.imagemBase64);
  if (!match) {
    throw new ValidationError("A imagem da assinatura deve ser um PNG válido.");
  }

  return { modeloId, nome, sobrenome, setor, email, celular, imagemConteudo: Buffer.from(match[1], "base64") };
}

export const TAMANHO_MAXIMO_IMAGEM_BYTES = 10 * 1024 * 1024;

export interface NovaImagemModelo {
  conteudo: Buffer;
  tipoMime: string;
  largura: number;
  altura: number;
}

/* Mesmo padrão de parseArquivoFormData (src/lib/downloads/validacao.ts), restrito a PNG e com um teto bem menor -- imagem de fundo de assinatura, não um instalador. */
export async function parseImagemModeloFormData(
  formData: FormData,
  fieldName: string
): Promise<NovaImagemModelo | null> {
  const arquivo = formData.get(fieldName);

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return null;
  }

  if (arquivo.size > TAMANHO_MAXIMO_IMAGEM_BYTES) {
    throw new ValidationError(
      `A imagem excede o limite de ${TAMANHO_MAXIMO_IMAGEM_BYTES / (1024 * 1024)} MB.`
    );
  }

  const conteudo = Buffer.from(await arquivo.arrayBuffer());
  const { largura, altura } = lerDimensoesPng(conteudo);

  return { conteudo, tipoMime: "image/png", largura, altura };
}

const fontesValidas: FonteAssinatura[] = ["Metropolis", "Metropolis Bold", "Montserrat", "Montserrat Bold"];

function validarCampo(valor: unknown, nomeCampo: string): void {
  if (typeof valor !== "object" || valor === null) {
    throw new ValidationError(`Configuração do campo "${nomeCampo}" inválida.`);
  }

  const campo = valor as Record<string, unknown>;

  if (
    typeof campo.x !== "number" ||
    typeof campo.y !== "number" ||
    typeof campo.tamanhoPx !== "number" ||
    typeof campo.cor !== "string" ||
    !fontesValidas.includes(campo.fonte as FonteAssinatura)
  ) {
    throw new ValidationError(`Configuração do campo "${nomeCampo}" inválida.`);
  }
}

/* camposConfig chega como um campo de texto (JSON.stringify de CamposAssinaturaConfig) dentro do FormData -- mesmo espírito de parseListaTextoFormData, mas validando a forma esperada em vez de só "é uma lista de strings". */
export function parseCamposConfigFormData(formData: FormData, fieldName: string): CamposAssinaturaConfig {
  const valor = formData.get(fieldName);

  if (typeof valor !== "string" || !valor.trim()) {
    throw new ValidationError("A configuração de posição dos campos é obrigatória.");
  }

  let dados: unknown;

  try {
    dados = JSON.parse(valor);
  } catch {
    throw new ValidationError("A configuração de posição dos campos contém um JSON inválido.");
  }

  if (typeof dados !== "object" || dados === null) {
    throw new ValidationError("A configuração de posição dos campos é inválida.");
  }

  const campos = dados as Record<string, unknown>;
  ["nome", "sobrenome", "setor", "email", "celular"].forEach((chave) => validarCampo(campos[chave], chave));

  const sobrenome = campos.sobrenome as Record<string, unknown>;
  if (
    typeof sobrenome.seguirNome !== "boolean" ||
    typeof sobrenome.espacamentoAposNomePx !== "number"
  ) {
    throw new ValidationError('Configuração do campo "sobrenome" inválida.');
  }

  return dados as CamposAssinaturaConfig;
}
