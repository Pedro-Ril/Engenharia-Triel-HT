import "server-only";

/*
 * Layout de e-mail com tabelas + estilo inline de propósito — é o
 * único jeito de ter uma aparência consistente entre clientes de
 * e-mail (Outlook em particular ignora boa parte do CSS moderno,
 * incluindo flexbox/grid e `<style>` em muitos casos).
 *
 * Design deliberadamente "sempre claro", sem tentar oferecer uma
 * variante escura: a primeira tentativa usava `prefers-color-scheme`
 * num bloco `<style>`, mas o cliente de e-mail do usuário não respeitou
 * essa regra — em vez disso aplicou a própria inversão automática de
 * cor por cima das cores originais, resultando num vermelho lavado
 * (rosa) ilegível. Diferente de CSS num navegador, não dá pra
 * confirmar com certeza como cada cliente de e-mail vai se comportar
 * sem testar no cliente real — a prática padrão do mercado (Stripe,
 * GitHub, etc. fazem isso) é declarar `color-scheme: light` (sem
 * "dark") pra pedir que o cliente NÃO tente reprocessar as cores, e
 * evitar tons "quase brancos"/"quase pretos" puros, que são o gatilho
 * mais comum desse tipo de inversão automática indesejada.
 */
const COR = {
  fundoPagina: "#eef0f3",
  cartaoFundo: "#fefefe",
  boxFundo: "#f3f4f6",
  citacaoFundo: "#fdf2f2",
  borda: "#e5e7eb",
  texto: "#1f2023",
  textoMuted: "#6b7280",
  primaria: "#b71c1c",
  textoInverso: "#ffffff",
};

const FONTE = "Arial, Helvetica, sans-serif";

/*
 * `margin` em `<table>` não é confiável entre clientes de e-mail
 * (Outlook em particular costuma ignorar) — o espaçamento vertical
 * entre blocos é feito com uma linha extra vazia de altura fixa
 * dentro da própria tabela, técnica padrão de e-mail HTML.
 *
 * `bgcolor`/`background-color` explícitos (mesma cor do cartão em
 * volta) são necessários aqui mesmo essa célula não tendo conteúdo
 * visível: sem cor explícita, o modo escuro automático de alguns
 * clientes de e-mail (que ignora `color-scheme: light`, ver comentário
 * no topo do arquivo) escolhe uma cor própria pra essa célula "vazia",
 * diferente da do cartão — aparecendo como uma linha divisória visível
 * grudada no bloco seguinte, em vez de um espaço em branco de verdade.
 */
function espacadorHtml(altura: number): string {
  return `<tr><td bgcolor="${COR.cartaoFundo}" style="background-color: ${COR.cartaoFundo}; font-size: 1px; line-height: ${altura}px; height: ${altura}px;">&nbsp;</td></tr>`;
}

/*
 * Botão de ação principal do e-mail (ex: "Baixar arquivo") — tabela
 * de uma célula só, é o padrão pra garantir que o botão renderize
 * como um bloco clicável com fundo colorido também no Outlook
 * (um <a> com padding sozinho não é confiável nesse cliente).
 */
export function montarBotaoEmailHtml(texto: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td bgcolor="${COR.primaria}" style="background-color: ${COR.primaria}; border-radius: 8px;">
          <a
            href="${url}"
            style="display: inline-block; padding: 13px 30px; font-family: ${FONTE}; font-size: 15px; font-weight: 700; color: ${COR.textoInverso}; text-decoration: none; border-radius: 8px;"
          >
            ${texto}
          </a>
        </td>
      </tr>
      ${espacadorHtml(26)}
    </table>
  `;
}

/*
 * Cartão com nome + tamanho de cada arquivo do lote — um só cartão
 * mesmo quando há vários arquivos, cada um em sua própria linha
 * separada por uma borda fina (em vez de um cartão por arquivo, que
 * ficaria repetitivo em lotes maiores).
 */
export function montarCartaoArquivosEmailHtml(arquivos: { nome: string; tamanho: string }[]): string {
  const linhas = arquivos
    .map(
      (arquivo, index) => `
        <tr>
          <td style="padding-top: ${index === 0 ? "0" : "12px"}; ${index > 0 ? `border-top: 1px solid ${COR.borda};` : ""}">
            <p style="margin: ${index === 0 ? "0" : "12px 0 0"}; font-size: 15px; font-weight: 700; color: ${COR.texto};">
              ${arquivo.nome}
            </p>
            <p style="margin: 4px 0 0; font-size: 13px; color: ${COR.textoMuted};">
              ${arquivo.tamanho}
            </p>
          </td>
        </tr>
      `
    )
    .join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td bgcolor="${COR.boxFundo}" style="background-color: ${COR.boxFundo}; border: 1px solid ${COR.borda}; border-radius: 10px; padding: 16px 18px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            ${linhas}
          </table>
        </td>
      </tr>
      ${espacadorHtml(18)}
    </table>
  `;
}

/* Bloco de citação (mensagem opcional anexada ao compartilhamento). */
export function montarCitacaoEmailHtml(texto: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td bgcolor="${COR.citacaoFundo}" style="background-color: ${COR.citacaoFundo}; border-radius: 0 8px 8px 0; padding: 12px 16px; border-left: 3px solid ${COR.primaria}; font-size: 14px; font-style: italic; color: ${COR.texto};">
          ${texto}
        </td>
      </tr>
      ${espacadorHtml(26)}
    </table>
  `;
}

/*
 * Link de fallback (URL por extenso, pra quando o botão não for
 * clicável ou o destinatário quiser copiar/colar).
 */
export function montarLinkEmailHtml(url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td style="font-size: 13px; color: ${COR.textoMuted}; word-break: break-all;">
          Ou copie e cole este link no navegador:<br />
          <a href="${url}" style="color: ${COR.primaria};">${url}</a>
        </td>
      </tr>
      ${espacadorHtml(16)}
    </table>
  `;
}

/*
 * Envolve o conteúdo (parágrafos/botão já montados pelo chamador) no
 * cartão com cabeçalho de marca (badge "HT" + nome do portal) e
 * rodapé padrão — mesmo espírito visual do resto do portal (cartão
 * claro, borda sutil, vermelho de marca), sem depender de nenhuma
 * folha de estilo externa.
 */
export function montarEmailHtml(conteudoHtml: string): string {
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="x-apple-disable-message-reformatting" />
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-scheme" content="light" />
      </head>
      <body bgcolor="${COR.fundoPagina}" style="margin: 0; padding: 0; background-color: ${COR.fundoPagina};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${COR.fundoPagina}" style="background-color: ${COR.fundoPagina};">
          <tr>
            <td align="center" style="padding: 36px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px;">
                <tr>
                  <td style="padding-bottom: 22px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td bgcolor="${COR.primaria}" style="width: 36px; height: 36px; background-color: ${COR.primaria}; border-radius: 8px; text-align: center; vertical-align: middle;">
                          <span style="font-family: ${FONTE}; font-size: 14px; font-weight: 700; color: ${COR.textoInverso};">HT</span>
                        </td>
                        <td style="padding-left: 10px; font-family: ${FONTE}; font-size: 15px; font-weight: 700; color: ${COR.texto};">
                          Portal Triel-HT
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td bgcolor="${COR.cartaoFundo}" style="background-color: ${COR.cartaoFundo}; border: 1px solid ${COR.borda}; border-radius: 12px; padding: 34px 32px; font-family: ${FONTE}; font-size: 14px; line-height: 1.6; color: ${COR.texto};">
                    ${conteudoHtml}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 22px; text-align: center; font-family: ${FONTE}; font-size: 12px; color: ${COR.textoMuted};">
                    Este é um e-mail automático do Portal Triel-HT — não responda.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}
