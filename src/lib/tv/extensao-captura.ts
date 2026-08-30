import "server-only";

import crypto from "node:crypto";
import zlib from "node:zlib";

/*
 * Extensão Chrome dedicada só a captura de tela (chrome.desktopCapture)
 * pro agente nativo da TV Corporativa. Existe porque getDisplayMedia()
 * + --auto-select-desktop-capture-source mostrou-se pouco confiável
 * nesse tipo de X11 mínimo sem ambiente de desktop: o atalho de "fake
 * UI" fabrica um device.id ("screen:0:0") que não bate com o ID real
 * que o capturador X11/XRandR espera (visto ao vivo:
 * "DesktopCaptureDevice::Create fails ... SelectSource() is false").
 * chrome.desktopCapture, chamado de dentro de uma extensão, passa pela
 * mesma enumeração REAL de telas usada pelo capturador, evitando esse
 * descompasso — ver TvPlayer.tsx (EXTENSAO_CAPTURA_ID).
 *
 * Distribuição: Google Chrome oficial (diferente do Chromium
 * open-source) ignora silenciosamente --load-extension/
 * --disable-extensions-except fora do modo desenvolvedor (confirmado
 * ao vivo — nenhum traço da extensão aparecia em nenhum log mesmo com
 * as flags presentes). A forma sancionada pela própria Google pra
 * instalar uma extensão fora da Web Store sem interação humana é via
 * política empresarial (`ExtensionInstallForcelist`, ver instalar.sh),
 * que exige um pacote .crx assinado (formato CRX3) e um manifesto de
 * atualização no protocolo Omaha — ambos gerados aqui.
 */

/*
 * Chave RSA fixa (só identidade, não protege nada sensível) — o
 * Chrome deriva o ID da extensão a partir do SHA-256 dela, então
 * precisa ser SEMPRE esta mesma chave, em qualquer instalação, pra
 * TvPlayer.tsx (EXTENSAO_CAPTURA_ID) continuar endereçando a extensão
 * certa via chrome.runtime.sendMessage. Gerada uma única vez.
 */
const CHAVE_PUBLICA_B64 =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlDttbuTaJs2eX4d7nnQr0WeaCPq6ouTPKGInFGYPAMOQ1QxRwvEXq1p1esnxelDunJvKW3fvIjMuFkXlZH1TnZjlRQIeJUeeOuBrj56p1HzIBVHBOQwnOxgWuSD69IUOYecfojIKchiCTqjqVlYSg9JOLlUbL4bTDIG863T/+ewrogdyJkihRHnXmUumsjLN1/nHeexZ6nLGZb+I5XeBY82QWvMwGwqDIwdaTCN81CTOG+RJ1FX+YgdAO2eJmnaKmgaomYVhM+S2wV1RCR2TNMTg+Kf/bK8RnSO1XUSaQGtf0tU1/wBH9/HkaFHxW41IdUChaK9nvwWw5tinC3pKPwIDAQAB";

const CHAVE_PRIVADA_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCUO21u5NomzZ5f
h3uedCvRZ5oI+rqi5M8oYicUZg8Aw5DVDFHC8RerWnV6yfF6UO6cm8pbd+8iMy4W
ReVkfVOdmOVFAh4lR5464GuPnqnUfMgFUcE5DCc7GBa5IPr0hQ5h5x+iMgpyGIJO
qOpWVhKD0k4uVRsvhtMMgbzrdP/57CuiB3ImSKFEedeZS6ayMs3X+cd57FnqcsZl
v4jld4FjzZBa8zAbCoMjB1pMI3zUJM4b5EnUVf5iB0A7Z4madoqaBqiZhWEz5LbB
XVEJHZM0xOD4p/9srxGdI7VdRJpAa1/S1TX/AEf38eRoUfFbjUh1QKFor2e/BbDm
2KcLeko/AgMBAAECggEAOuBBzpaSeXAZNAtdk+nDj7iNK3zfDZ1BFOKrcAQ7eEu1
JpHulbXp91MGL3+vbKxhog2U+fCwqE5Yw1r+yoOm5wVYJyk4rQj9tZf20QQto2ru
jYJT82M639NpDx4k32NL+6Hv5B3pHTlT5IdeEG2+i+JH0EpYcm+kOyb60TDXDT5g
eAakRAlcaZzx8UUjeFaK/ugZ9PKVD8LAuPdI/txMutCYrHwh0eTKOjara8EKW8aX
WBwGoB5Gr8UOQ1Q1CPNpRZ7isKkKeU6fgFI4Hgi2JoI051NaaENCG4r6wsuM1IEA
E97bN8p5JnKo7Ig9+eQyinEmk7cmVa8TWxo/X2FIUQKBgQDN59gSSbNl/tZcBxbt
IWND2G4bR7tE/pj1hADgCmTxMzzZK59ckOkN4E932hLjJMIIRQYOe/SjJQ0I2TJk
aBcxpMBZUK4PEPOkbKEEIdDBviqaOIar1HH1i8B/7O3C4KTAS5dYa02pnTlrsHUV
t7s2+2IP3Fh7l274/utVupTfLwKBgQC4S5Q1+WlwQFlWxxc/hzPAIiSQHOJ3956q
civD5QRvV0kwQg8zySoiytrhNQgWXYIazvZb1l9fKWi3wEfqf08nERhhBVQ/qKMu
7jysGaFiX8wtlpxevHU98zvWeRqNyn4zQqBN5EkeSKqFvMN+kZclEzf9V4K69CUN
7XfCgZsB8QKBgAmThtES7G0J9R5CliZhLySwpC5Qn70Nuj9w7Dl/QkKVh3byOG8t
rikfDZMdaVN3Gi8YRrfVvAL6bijDMTzKOonsh6WfwvigaTR0eOigSf04wvJ5Poov
Tz2ESmeotUYi/IaU/Wz3UJ1a2pjPlCJ2cRaVinICZXsaB+c8s+VA0DuxAoGBAIut
xLQvx4krTErn9CfTChb6CaosKjzwsRHQHHmJbxYQGsl3l9wRAF2ET+ZWcj25O22k
JLYwQPJ4CQUTt630NYKPg2GtT1A8OQnNyLBLcLSFlNOMjhGDVnzQiC6idMy4h3PE
cIj4l65bNtrL2YNpRxvzeAEMPWoCtr7al2UVI+2RAoGBAKdNUn/+4Ni6ZDY5JSXd
Pm04/92FTYBgVGcY+VkpnVUvnlaeaf7vdMqdskLMmepb7fNH7F8zn4OMneVbvOzw
xr4bg4ewg8lkvSXno99IY4oA0ZSD12VgrTF8KHPwPy1gskVmFx6bb/JX0haCPt72
FERBnBNSrCN2LCh4QbwfdPq5
-----END PRIVATE KEY-----
`;

const PUBLIC_KEY_DER = Buffer.from(CHAVE_PUBLICA_B64, "base64");

/* ID exposto pro TvPlayer.tsx via chrome.runtime.sendMessage — SHA-256 da chave pública, primeiros 16 bytes, mapeados de hex (0-9a-f) pra a-p. */
export const EXTENSAO_CAPTURA_ID = crypto
  .createHash("sha256")
  .update(PUBLIC_KEY_DER)
  .digest()
  .subarray(0, 16)
  .toString("hex")
  .split("")
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");

export const EXTENSAO_CAPTURA_VERSAO = "1.0";

const BACKGROUND_JS = `chrome.runtime.onMessageExternal.addListener((mensagem, remetente, enviarResposta) => {
  if (mensagem !== "capturar-tela" || !remetente.tab) return;

  chrome.desktopCapture.chooseDesktopMedia(["screen"], remetente.tab, (streamId) => {
    enviarResposta({ streamId: streamId || null });
  });

  return true;
});
`;

function gerarManifesto(portalUrl: string): string {
  return JSON.stringify(
    {
      manifest_version: 3,
      name: "Captura de tela - TV Corporativa",
      version: EXTENSAO_CAPTURA_VERSAO,
      key: CHAVE_PUBLICA_B64,
      background: { service_worker: "background.js" },
      permissions: ["desktopCapture"],
      externally_connectable: { matches: [`${portalUrl}/*`] },
    },
    null,
    2
  );
}

/* ZIP mínimo (entradas sem compressão) — só 2 arquivos pequenos, não vale puxar uma lib de compressão pra isso. */
function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}
function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

function construirZip(arquivos: { nome: string; conteudo: Buffer }[]): Buffer {
  const DATA_DOS_FIXA = 0x21; // 1980-01-01, valor fixo válido (data exata não importa aqui)
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let offset = 0;

  for (const { nome, conteudo } of arquivos) {
    const nomeBuf = Buffer.from(nome, "utf8");
    const crc = zlib.crc32(conteudo) >>> 0;

    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0), // método = sem compressão (stored)
      u16(0),
      u16(DATA_DOS_FIXA),
      u32(crc),
      u32(conteudo.length),
      u32(conteudo.length),
      u16(nomeBuf.length),
      u16(0),
      nomeBuf,
    ]);
    locais.push(localHeader, conteudo);

    centrais.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(DATA_DOS_FIXA),
        u32(crc),
        u32(conteudo.length),
        u32(conteudo.length),
        u16(nomeBuf.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nomeBuf,
      ])
    );

    offset += localHeader.length + conteudo.length;
  }

  const centralDir = Buffer.concat(centrais);
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(arquivos.length),
    u16(arquivos.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  return Buffer.concat([...locais, centralDir, eocd]);
}

/* Protobuf mínimo do formato CRX3 (chromium: components/crx_file/crx3.proto) — só os 3 campos que usamos, sem lib de protobuf. */
function varint(valor: number): Buffer {
  const bytes: number[] = [];
  let n = valor;
  while (n > 0x7f) {
    bytes.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  bytes.push(n);
  return Buffer.from(bytes);
}

function campoBytes(numeroCampo: number, conteudo: Buffer): Buffer {
  const tag = varint((numeroCampo << 3) | 2);
  return Buffer.concat([tag, varint(conteudo.length), conteudo]);
}

function construirCrx3(payloadZip: Buffer): Buffer {
  const crxId = crypto.createHash("sha256").update(PUBLIC_KEY_DER).digest().subarray(0, 16);
  const signedData = campoBytes(1, crxId); // SignedData.crx_id

  const assinador = crypto.createSign("sha256");
  assinador.update("CRX3 SignedData\x00");
  assinador.update(u32(signedData.length));
  assinador.update(signedData);
  assinador.update(payloadZip);
  const assinatura = assinador.sign(CHAVE_PRIVADA_PEM);

  const asymmetricKeyProof = Buffer.concat([
    campoBytes(1, PUBLIC_KEY_DER),
    campoBytes(2, assinatura),
  ]);

  const header = Buffer.concat([
    campoBytes(2, asymmetricKeyProof), // CrxFileHeader.sha256_with_rsa
    campoBytes(10000, signedData), // CrxFileHeader.signed_header_data
  ]);

  return Buffer.concat([Buffer.from("Cr24"), u32(3), u32(header.length), header, payloadZip]);
}

export function gerarCrxAssinado(portalUrl: string): Buffer {
  const zip = construirZip([
    { nome: "manifest.json", conteudo: Buffer.from(gerarManifesto(portalUrl), "utf8") },
    { nome: "background.js", conteudo: Buffer.from(BACKGROUND_JS, "utf8") },
  ]);
  return construirCrx3(zip);
}

/* Protocolo Omaha, formato mínimo que o "extension updater" do Chrome aceita pra update_url fora da Web Store (self-hosted). */
export function gerarManifestoAtualizacaoXml(portalUrl: string): string {
  const codebase = `${portalUrl}/api/tv/agente/extensao-captura/extensao.crx`;
  return `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${EXTENSAO_CAPTURA_ID}'>
    <updatecheck codebase='${codebase}' version='${EXTENSAO_CAPTURA_VERSAO}' />
  </app>
</gupdate>
`;
}
