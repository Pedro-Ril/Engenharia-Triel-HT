import "server-only";

import onvifPromises from "onvif/promises";

import { ValidationError } from "@/lib/auth/errors";

const { Cam } = onvifPromises;

/*
 * O pacote "onvif" promisifica métodos do Cam callback-based de forma
 * genérica (colapsa sobrecargas pro último overload, "() => Promise<any>"),
 * perdendo a assinatura real de getProfiles/getStreamUri e a propriedade
 * "profiles" (populada como efeito colateral de getProfiles) -- reforça
 * aqui o formato de verdade, sem afetar o comportamento em runtime.
 *
 * "token" vem como ATRIBUTO XML do elemento <Profile>, não um elemento
 * filho -- o parser (xml2js, attrkey "$") bota atributos dentro de "$",
 * então o token de verdade é profile.$.token, nunca profile.token
 * direto (confirmado ao vivo contra uma câmera Intelbras real).
 */
type CamComTipos = InstanceType<typeof Cam> & {
  profiles?: Array<{
    $?: { token?: string };
    name?: string;
    videoEncoderConfiguration?: { encoding?: string };
  }>;
  getStreamUri(options: { protocol?: string; profileToken?: string }): Promise<{ uri?: string }>;
};

export interface ResolucaoOnvif {
  /* Sem credenciais embutidas -- quem injeta usuário/senha em tempo de execução é mediamtx.ts. */
  streamUriRtsp: string;
  perfilOnvif: string;
  /* "H264"/"H265"/... -- null quando a câmera não informou. Usado só pra avisar o admin (MediaMTX/WebRTC não decodifica H265 na maioria dos navegadores), nunca persistido. */
  codec: string | null;
}

/*
 * Conecta na câmera via ONVIF, pega o primeiro perfil de mídia (o stream
 * principal) e resolve a URI RTSP dele via GetStreamUri. Timeout curto
 * (5s) de propósito -- isso roda tanto no "testar conexão" (usuário
 * esperando na tela) quanto no salvar/editar uma câmera, nunca deve
 * travar a requisição por muito tempo se a câmera estiver fora do ar.
 */
export async function resolverStreamUriOnvif(params: {
  host: string;
  portaOnvif: number;
  usuario: string;
  senha: string;
}): Promise<ResolucaoOnvif> {
  const cam = new Cam({
    hostname: params.host,
    port: params.portaOnvif,
    username: params.usuario,
    password: params.senha,
    timeout: 5000,
    autoconnect: false,
  }) as CamComTipos;

  try {
    await cam.connect();
  } catch (error) {
    throw new ValidationError(mensagemErroConexao(error));
  }

  await cam.getProfiles();
  const perfis = cam.profiles ?? [];
  const perfil = perfis[0];
  const token = perfil?.$?.token;

  if (!token) {
    throw new ValidationError("A câmera não retornou nenhum perfil de mídia ONVIF.");
  }

  let streamUri: { uri?: string };
  try {
    streamUri = await cam.getStreamUri({ protocol: "RTSP", profileToken: token });
  } catch (error) {
    throw new ValidationError(mensagemErroConexao(error));
  }

  if (!streamUri?.uri) {
    throw new ValidationError("A câmera não retornou uma URI de stream RTSP.");
  }

  return {
    streamUriRtsp: streamUri.uri,
    perfilOnvif: perfil.name ?? token,
    codec: perfil.videoEncoderConfiguration?.encoding ?? null,
  };
}

/* MediaMTX não transcodifica por padrão -- H265 não decodifica via WebRTC na maioria dos navegadores, então isso vira um aviso visível na hora de testar a conexão, não um erro (a câmera continua sendo cadastrada normalmente). */
export function mensagemAvisoCodec(codec: string | null): string | null {
  if (!codec || codec.toUpperCase() === "H264") {
    return null;
  }

  return `Atenção: a câmera está configurada em ${codec} -- a maioria dos navegadores não decodifica esse formato via WebRTC. Troque para H264 nas configurações da própria câmera para a visualização ao vivo funcionar.`;
}

function mensagemErroConexao(error: unknown): string {
  const mensagem = error instanceof Error ? error.message : String(error);
  const mensagemBaixa = mensagem.toLowerCase();

  if (mensagemBaixa.includes("timeout") || mensagemBaixa.includes("etimedout")) {
    return "A câmera não respondeu a tempo (timeout) -- confira o host/porta e se ela está ligada na rede.";
  }
  if (mensagemBaixa.includes("econnrefused")) {
    return "Conexão recusada -- confira o host e a porta ONVIF configurados.";
  }
  if (mensagemBaixa.includes("ehostunreach") || mensagemBaixa.includes("enetunreach")) {
    return "Host inalcançável -- confira o IP da câmera e a rede.";
  }
  if (mensagemBaixa.includes("401") || mensagemBaixa.includes("unauthorized") || mensagemBaixa.includes("not authorized")) {
    return "Usuário ou senha ONVIF incorretos.";
  }

  return `Não foi possível conectar à câmera: ${mensagem}`;
}
