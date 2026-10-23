/*
 * Confere o XML de uma NF-e de veículo e devolve o que encontrou.
 *
 * Roda no navegador (DOMParser nativo). O resultado e o XML vão depois
 * para o histórico (lib/validacao-xml-nfe/validacoes.ts), menos os
 * exemplos.
 *
 * O foco é o grupo de veículo novo (det/prod/veicProd): a nota de
 * veículo precisa trazer chassi, motor, cor, anos etc. nas tags
 * próprias, e não só no texto livre do item. Foi o caso da NF-e 77138,
 * que saiu autorizada com tudo isso apenas no infAdProd.
 */
import {
  GRUPOS_EXCLUSIVOS_COM_VEICPROD,
  motivoRecusa,
  NAMESPACE_NFE,
  REGRAS_VEICPROD,
} from "../constants/schema-veicprod";
import { CAMPOS_VEICULO } from "../constants/tabelas-veiculo";
import type {
  Apontamento,
  CampoVeiculo,
  ItemNota,
  NotaValidada,
  ResultadoArquivo,
  SituacaoNota,
} from "../types/validacaoXmlNfe.types";

/* NCM de veículos automóveis (tratores, ônibus, carros, caminhões, veículos especiais). */
const NCM_VEICULO = /^870[1-5]/;
/* ISO 3779: VIN não usa I, O nem Q. O schema da SEFAZ aceita -- é só conferência. */
const LETRAS_PROIBIDAS_VIN = /[IOQ]/;

/* Busca pelo nome local da tag, ignorando o namespace da NF-e. */
function primeiro(raiz: Element | Document | null | undefined, tag: string): Element | null {
  if (!raiz) return null;
  return raiz.getElementsByTagNameNS("*", tag)[0] ?? null;
}

function todos(raiz: Element | Document, tag: string): Element[] {
  return Array.from(raiz.getElementsByTagNameNS("*", tag));
}

function texto(raiz: Element | Document | null | undefined, tag: string): string {
  return (primeiro(raiz, tag)?.textContent ?? "").trim();
}

/* Filho direto (não neto): evita pegar o pesoL do veicProd ao procurar o do volume. */
function filho(raiz: Element | null, tag: string): Element | null {
  if (!raiz) return null;
  return Array.from(raiz.children).find((el) => el.localName === tag) ?? null;
}

function textoFilho(raiz: Element | null, tag: string): string {
  return (filho(raiz, tag)?.textContent ?? "").trim();
}

function numero(valor: string): number | null {
  if (!valor) return null;
  const n = Number(valor.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/* Só letras e dígitos, em maiúsculas: "D13*8147761*K5*E" -> "D138147761K5E". */
function normalizarIdentificador(valor: string): string {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/* O texto livre do item segue um padrão ("N.CHASSI : ...", "N.MOTOR : ..."). */
function lerDoTexto(textoItem: string) {
  const achar = (regex: RegExp) => regex.exec(textoItem)?.[1]?.trim() ?? "";

  return {
    chassi: achar(/N\.\s*CHASSI\s*:\s*([A-Z0-9]{5,})/i),
    motor: achar(/N\.\s*MOTOR\s*:\s*([A-Z0-9*]+)/i),
    carroceria: achar(/N\.\s*CARROCERIA\s*:\s*(\d+)/i),
  };
}

function formatarPeso(valor: number): string {
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg`;
}

/*
 * Valida o veicProd como o schema da SEFAZ (ver constants/schema-veicprod):
 * a sequência dos 24 campos -- todos obrigatórios, uma vez cada, nessa
 * ordem, no namespace da NF-e, só texto -- e o valor de cada um. Devolve
 * os campos com o resultado e os problemas de estrutura.
 */
function validarSchemaVeicProd(veicProd: Element): { campos: CampoVeiculo[]; problemas: string[] } {
  const problemas: string[] = [];
  const filhos = Array.from(veicProd.children);
  const ordemEsperada = REGRAS_VEICPROD.map((r) => r.tag);

  for (const el of filhos) {
    if (!ordemEsperada.includes(el.localName)) {
      problemas.push(`veicProd: o elemento <${el.localName}> não existe no schema.`);
    } else if (el.namespaceURI !== NAMESPACE_NFE) {
      problemas.push(`veicProd/${el.localName}: fora do namespace da NF-e (${NAMESPACE_NFE}).`);
    }

    if (el.children.length > 0) {
      problemas.push(`veicProd/${el.localName}: só pode conter texto, não outros elementos.`);
    }
  }

  const conhecidos = filhos.filter((el) => ordemEsperada.includes(el.localName));

  for (const tag of ordemEsperada) {
    const vezes = conhecidos.filter((el) => el.localName === tag).length;
    if (vezes > 1) problemas.push(`veicProd/${tag}: aparece ${vezes} vezes; o schema aceita uma só.`);
  }

  /* Ordem: cada campo presente tem de vir depois do anterior na sequência. */
  for (let i = 1; i < conhecidos.length; i++) {
    const anterior = ordemEsperada.indexOf(conhecidos[i - 1].localName);
    const atual = ordemEsperada.indexOf(conhecidos[i].localName);

    if (atual < anterior) {
      problemas.push(
        `veicProd: <${conhecidos[i].localName}> está fora da ordem do schema (veio depois de <${conhecidos[i - 1].localName}>).`
      );
      break;
    }
  }

  const campos = REGRAS_VEICPROD.map((regra): CampoVeiculo => {
    const el = conhecidos.find((c) => c.localName === regra.tag);
    const tabela = CAMPOS_VEICULO.find((c) => c.tag === regra.tag)?.tabela;
    const valor = el?.textContent ?? "";

    return {
      tag: regra.tag,
      rotulo: regra.rotulo,
      valor,
      presente: Boolean(el),
      significado: tabela && valor ? tabela[valor] : undefined,
      regra: regra.descricao,
      motivoRecusa: el ? motivoRecusa(regra, valor) : "obrigatório e não veio",
    };
  });

  return { campos, problemas };
}

function validarItem(
  det: Element,
  pesoVolumes: { liquido: number | null; bruto: number | null },
  apontamentos: Apontamento[]
): ItemNota {
  const prod = filho(det, "prod");
  const numeroItem = Number(det.getAttribute("nItem") ?? "0");
  const textoAdicional = textoFilho(det, "infAdProd");
  const ncm = textoFilho(prod, "NCM");
  const veicProd = filho(prod, "veicProd");
  const noTexto = lerDoTexto(textoAdicional);

  const ehVeiculo = Boolean(veicProd) || NCM_VEICULO.test(ncm) || Boolean(noTexto.chassi);
  const schema = veicProd ? validarSchemaVeicProd(veicProd) : null;
  const veiculo = schema?.campos ?? null;

  const apontar = (
    severidade: Apontamento["severidade"],
    mensagem: string,
    origem: Apontamento["origem"] = "conferencia"
  ) => apontamentos.push({ severidade, origem, mensagem, item: numeroItem });

  if (ehVeiculo && !veiculo) {
    apontar(
      "erro",
      "Grupo de veículo novo (veicProd) ausente: a nota não traz chassi, motor, cor, anos e demais dados do veículo nas tags próprias" +
        (noTexto.chassi ? ` — o chassi ${noTexto.chassi} aparece só no texto do item.` : ".")
    );
  }

  /* --- Schema da SEFAZ --- */
  if (prod && veicProd) {
    if (prod.getElementsByTagNameNS("*", "veicProd").length > 1) {
      apontar("erro", "prod: o grupo veicProd aparece mais de uma vez; o schema aceita um só.", "sefaz");
    }

    const exclusivos = GRUPOS_EXCLUSIVOS_COM_VEICPROD.filter((tag) => filho(prod, tag));
    if (exclusivos.length > 0) {
      apontar(
        "erro",
        `prod: o veicProd não pode vir junto de ${exclusivos.map((t) => `<${t}>`).join(", ")} — o schema aceita só um desses grupos por produto.`,
        "sefaz"
      );
    }
  }

  for (const problema of schema?.problemas ?? []) {
    apontar("erro", problema, "sefaz");
  }

  for (const campo of veiculo ?? []) {
    if (campo.motivoRecusa) {
      apontar(
        "erro",
        `veicProd/${campo.tag} (${campo.rotulo})${campo.presente ? ` = "${campo.valor}"` : ""}: ${campo.motivoRecusa}.`,
        "sefaz"
      );
    }
  }

  /* --- Conferência interna (a SEFAZ não faz) --- */
  if (veiculo) {
    const valorDe = (tag: string) => veiculo.find((c) => c.tag === tag)?.valor.trim() ?? "";

    const chassi = valorDe("chassi").toUpperCase();
    if (chassi && LETRAS_PROIBIDAS_VIN.test(chassi)) {
      apontar(
        "aviso",
        `Chassi "${chassi}" tem I, O ou Q, letras que o VIN não usa (ISO 3779) — a SEFAZ aceita, mas confira com o documento do veículo.`
      );
    }

    if (noTexto.chassi && chassi && normalizarIdentificador(noTexto.chassi) !== normalizarIdentificador(chassi)) {
      apontar("erro", `Chassi diferente: tag ${chassi}, texto do item ${noTexto.chassi}.`);
    }

    const motor = valorDe("nMotor");
    if (noTexto.motor && motor && normalizarIdentificador(noTexto.motor) !== normalizarIdentificador(motor)) {
      apontar("erro", `Motor diferente: tag ${motor}, texto do item ${noTexto.motor}.`);
    }

    const anoFab = Number(valorDe("anoFab"));
    const anoMod = Number(valorDe("anoMod"));
    if (anoFab && anoMod) {
      if (anoFab > anoMod) {
        apontar("erro", `Ano de fabricação (${anoFab}) maior que o ano modelo (${anoMod}).`);
      } else if (anoMod - anoFab > 1) {
        apontar("aviso", `Ano modelo (${anoMod}) mais de um ano à frente da fabricação (${anoFab}).`);
      }
    }

    if (valorDe("CMT").includes(",")) {
      apontar(
        "aviso",
        `Capacidade máxima de tração com vírgula ("${valorDe("CMT")}"): a SEFAZ aceita (o campo é texto), mas o layout pede o valor em toneladas com 4 casas decimais.`
      );
    }

    const pesoVeiculo = numero(valorDe("pesoL"));
    const pesoVolume = pesoVolumes.liquido;
    if (pesoVeiculo !== null && pesoVolume !== null && Math.abs(pesoVeiculo - pesoVolume) > 0.001) {
      apontar(
        "aviso",
        `Peso líquido do veículo (${formatarPeso(pesoVeiculo)}) diferente do peso do volume transportado (${formatarPeso(pesoVolume)}) — diferença de ${formatarPeso(Math.abs(pesoVolume - pesoVeiculo))}.`
      );
    }
  }

  if (ehVeiculo && /CAPACIDADE\s*:\s*(?=N\.|$)/i.test(textoAdicional)) {
    apontar("aviso", 'Campo "CAPACIDADE" em branco no texto do item.');
  }

  return {
    numeroItem,
    codigo: textoFilho(prod, "cProd"),
    descricao: textoFilho(prod, "xProd"),
    ncm,
    cfop: textoFilho(prod, "CFOP"),
    quantidade: textoFilho(prod, "qCom"),
    valor: numero(textoFilho(prod, "vProd")),
    pedido: textoFilho(prod, "xPed"),
    textoAdicional,
    ehVeiculo,
    veiculo,
    noTexto,
  };
}

/* Ver SituacaoNota: decide pelo bloco do veículo e pela SEFAZ, não pelos avisos. */
function situacaoDe(
  itens: ItemNota[],
  apontamentos: Apontamento[],
  protocolo: NotaValidada["protocolo"]
): SituacaoNota {
  const veiculos = itens.filter((item) => item.ehVeiculo);
  const blocoEmTodos = veiculos.length > 0 && veiculos.every((item) => item.veiculo);
  const autorizada = protocolo?.status === "100";
  const schemaAceito = !apontamentos.some((a) => a.origem === "sefaz");

  return blocoEmTodos && autorizada && schemaAceito ? "valido" : "invalido";
}

export function validarXmlNfe(arquivo: string, conteudo: string): ResultadoArquivo {
  const documento = new DOMParser().parseFromString(conteudo.trim(), "application/xml");

  if (documento.getElementsByTagName("parsererror").length > 0) {
    return { tipo: "falha", falha: { arquivo, mensagem: "O conteúdo não é um XML válido." } };
  }

  const infNFe = primeiro(documento, "infNFe");

  if (!infNFe) {
    return {
      tipo: "falha",
      falha: { arquivo, mensagem: "O XML não é de uma NF-e (não tem o grupo infNFe)." },
    };
  }

  const apontamentos: Apontamento[] = [];
  const ide = filho(infNFe, "ide");
  const emit = filho(infNFe, "emit");
  const dest = filho(infNFe, "dest");
  const infProt = primeiro(documento, "infProt");

  /* Soma dos volumes da nota (transp/vol). */
  const volumes = todos(infNFe, "vol");
  const somar = (tag: string) => {
    const valores = volumes.map((vol) => numero(textoFilho(vol, tag))).filter((v): v is number => v !== null);
    return valores.length ? valores.reduce((a, b) => a + b, 0) : null;
  };
  const pesoVolumes = { liquido: somar("pesoL"), bruto: somar("pesoB") };

  const protocolo = infProt
    ? {
        status: texto(infProt, "cStat"),
        motivo: texto(infProt, "xMotivo"),
        numero: texto(infProt, "nProt"),
        data: texto(infProt, "dhRecbto"),
      }
    : null;

  if (!protocolo) {
    apontamentos.push({
      severidade: "aviso",
      origem: "conferencia",
      mensagem: "XML sem protocolo de autorização (protNFe): pode ser o XML de envio, não o autorizado.",
    });
  } else if (protocolo.status !== "100") {
    apontamentos.push({
      severidade: "erro",
      origem: "sefaz",
      mensagem: `Nota não autorizada pela SEFAZ: ${protocolo.status} — ${protocolo.motivo}.`,
    });
  }

  const itens = todos(infNFe, "det").map((det) => validarItem(det, pesoVolumes, apontamentos));

  if (itens.length === 0) {
    apontamentos.push({ severidade: "erro", origem: "conferencia", mensagem: "A nota não tem nenhum item (det)." });
  }

  const informacoesComplementares = texto(filho(infNFe, "infAdic"), "infCpl");

  /*
   * NIEV (no texto da nota) termina com o número da carroceria
   * ("RS0HT12011.T03074" = carroceria 3074). Na 77138 ele veio com a
   * carroceria da nota anterior -- texto copiado.
   */
  const niev = /NIEV\s*:\s*([A-Z0-9.]+)/i.exec(informacoesComplementares)?.[1] ?? "";
  const carroceriaDoNiev = /T0*(\d+)$/i.exec(niev)?.[1] ?? "";
  const carrocerias = itens.map((i) => i.noTexto.carroceria).filter(Boolean);

  if (carroceriaDoNiev && carrocerias.length > 0 && !carrocerias.some((c) => Number(c) === Number(carroceriaDoNiev))) {
    apontamentos.push({
      severidade: "aviso",
      origem: "conferencia",
      mensagem: `NIEV ${niev} aponta a carroceria ${carroceriaDoNiev}, mas o item traz a carroceria ${carrocerias.join(", ")} — o texto da nota pode ter sido copiado de outra.`,
    });
  }

  const nota: NotaValidada = {
    arquivo,
    situacao: situacaoDe(itens, apontamentos, protocolo),
    apontamentos,
    numero: textoFilho(ide, "nNF"),
    serie: textoFilho(ide, "serie"),
    chave: (infNFe.getAttribute("Id") ?? "").replace(/^NFe/, "") || texto(infProt, "chNFe"),
    emissao: textoFilho(ide, "dhEmi"),
    naturezaOperacao: textoFilho(ide, "natOp"),
    emitente: { nome: textoFilho(emit, "xNome"), cnpj: textoFilho(emit, "CNPJ") },
    destinatario: {
      nome: textoFilho(dest, "xNome"),
      documento: textoFilho(dest, "CNPJ") || textoFilho(dest, "CPF"),
      uf: texto(dest, "UF"),
    },
    valorTotal: numero(texto(filho(infNFe, "total"), "vNF")),
    protocolo,
    pesoVolumes,
    informacoesComplementares,
    itens,
  };

  return { tipo: "nota", nota };
}
