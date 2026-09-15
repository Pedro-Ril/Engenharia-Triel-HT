export interface ConfigSemaforo {
  modoLegado: boolean;
  mediamtxApiUrl: string | null;
  mediamtxWhepBaseUrl: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

/* Nunca inclui a senha (nem sinalizador de "configurada") -- toda câmera sempre tem uma, a própria existência da linha já garante isso. */
export interface Camera {
  id: string;
  nome: string;
  host: string;
  portaOnvif: number;
  usuario: string;
  mediamtxPath: string;
  streamUriRtsp: string | null;
  perfilOnvif: string | null;
  ultimaVerificacaoEm: string | null;
  ultimoErroVerificacao: string | null;
  ativo: boolean;
  ordem: number;
  criadoEm: string;
  atualizadoEm: string;
  atualizadoPor: string | null;
}

export interface ResultadoTesteCamera {
  sucesso: boolean;
  mensagem: string;
  perfilOnvif?: string | null;
  /* Presente quando a câmera não está em H264 -- MediaMTX não transcodifica, então a maioria dos navegadores não decodifica o vídeo via WebRTC nesse caso. */
  avisoCodec?: string | null;
}

/* Só o essencial pro menu flutuante montar a conexão WHEP -- nunca host/usuário/senha/stream_uri_rtsp. */
export interface CameraParaVisualizacao {
  id: string;
  nome: string;
  ordem: number;
  whepUrl: string;
}
