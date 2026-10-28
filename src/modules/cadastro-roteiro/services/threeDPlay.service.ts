import type { ModoAberturaArquivos } from "../constants/abertura-arquivos";
import { abrirArquivo } from "../utils/abrir-arquivo";
import { RoteiroTreeNode } from "../types/cadastroRoteiro.types";

export type Modelo3DPlay = {
    physicalId: string;
    codigo?: string;
    id3DX?: string;
    titulo?: string;
    revisao?: string;
    estado?: string;
    descricao?: string;
    tipo?: string;
    responsavel?: string;
};

const API_3DX = "http://proserver.trielht.com.br:1001/api/search";

const DASHBOARD_3DPLAY_URL =
    "https://dashboard-prd.trielht.com.br/3ddashboard/#dashboard:3ea76c30-e6a4-4288-ab68-1214e947068c/tabId:ALtXQt70g02ipB6XdW0L/app:X3DPLAW_AP/content:X3DContentId=";

/*
 * Product Explorer (ENOSCEN_AP), na mesma aba do dashboard: ao lado do
 * 3D Navigate, mostra a árvore do produto e o 3D juntos. Usado pelo
 * Terminal de Fábrica nos aparelhos configurados para ele
 * (Administração → Terminal de Fábrica → Visualização). Formato copiado
 * de uma abertura real pela busca do 3DEXPERIENCE (307592, 28/10/2026):
 * versão 2.1 e contextId vazio -- cada pessoa abre no seu contexto padrão.
 */
const DASHBOARD_PRODUCT_EXPLORER_URL =
    "https://dashboard-prd.trielht.com.br/3ddashboard/#dashboard:3ea76c30-e6a4-4288-ab68-1214e947068c/tabId:ALtXQt70g02ipB6XdW0L/app:ENOSCEN_AP/content:X3DContentId=";

const ICONES_3DSPACE = "https://space-prd.trielht.com.br/3dspace/snresources/images/icons";

const CONTEXT_ID = "VPLMProjectLeader.Company Name.Common Space";

/* O que a busca precisa: um nó da árvore serve, um pai do ERP também. */
export type ItemModelo3D = Pick<RoteiroTreeNode, "codigoNormalizado"> &
    Partial<Pick<RoteiroTreeNode, "codigo" | "revisao" | "origem">>;

/* Revisão "maior": mais longa primeiro (Z < AA), depois a ordem natural. */
function compararRevisao(a: string, b: string) {
    return a.length - b.length || a.localeCompare(b, "pt-BR", { numeric: true });
}

/*
 * Sem revisão -- pai que veio da implosão do ERP, que não informa
 * revisão. O /item do 3DX traz o código em todas as revisões; fica a
 * mais recente, que é a que o pessoal quer ver.
 */
async function buscarModelosDaRevisaoMaisRecente(codigo: string) {
    const response = await fetch(`${API_3DX}/item/${encodeURIComponent(codigo)}`, {
        method: "GET",
        cache: "no-store",
    });

    const json = await response.json().catch(() => null);

    if (!response.ok || !json?.success) {
        throw new Error(json?.message || json?.error || "Erro ao pesquisar o item no 3DX.");
    }

    const modelos = (Array.isArray(json.results) ? json.results : []) as Modelo3DPlay[];
    const revisoes = [
        ...new Set(modelos.map((m) => String(m.revisao ?? "").trim()).filter(Boolean)),
    ].sort(compararRevisao);
    const maisRecente = revisoes.at(-1);

    return maisRecente
        ? modelos.filter((m) => String(m.revisao ?? "").trim() === maisRecente)
        : modelos;
}

export async function buscarModelos3DPlay(item: ItemModelo3D) {
    const codigo = String(item.codigoNormalizado || item.codigo || "").trim();
    const revisao = String(item.revisao || "").trim();

    if (!codigo) {
        throw new Error("Item sem código para pesquisar no 3DX.");
    }

    if (!revisao) {
        return buscarModelosDaRevisaoMaisRecente(codigo);
    }

    const url = `${API_3DX}/xcad-model/${encodeURIComponent(
        codigo
    )}?revisao=${encodeURIComponent(revisao)}`;

    const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
    });

    const json = await response.json().catch(() => null);

    if (!response.ok || !json?.success) {
        throw new Error(
            json?.message || json?.error || "Erro ao pesquisar modelo 3D no 3DX."
        );
    }

    return Array.isArray(json.results) ? (json.results as Modelo3DPlay[]) : [];
}

export function montarUrl3DPlay(modelo: Modelo3DPlay) {
    const objectId = String(modelo.physicalId || "").trim();

    if (!objectId) {
        throw new Error("Modelo sem Physical ID para abrir no 3DPlay.");
    }

    const displayName =
        modelo.titulo ||
        modelo.codigo ||
        modelo.id3DX ||
        "Item 3DEXPERIENCE";

    const content = {
        protocol: "3DXContent",
        version: "2.0",
        source: "X3DSEAR_AP",
        widgetId: `preview-${Date.now()}`,
        data: {
            items: [
                {
                    objectId,
                    objectType: modelo.tipo || "VPMReference",
                    envId: "OnPremise",
                    serviceId: "3DSpace",
                    displayName,
                    displayType: "Physical Product",
                    contextId: CONTEXT_ID,
                    objectTaxonomies: [
                        "PLMEntity",
                        "PLMReference",
                        "PLMCoreReference",
                        "LPAbstractReference",
                        "PHYSICALAbstractReference",
                        "VPMReference",
                        "3DPart",
                    ],
                },
            ],
        },
    };

    return `${DASHBOARD_3DPLAY_URL}${encodeURIComponent(
        JSON.stringify(content)
    )}`;
}

export function montarUrlProductExplorer(modelo: Modelo3DPlay) {
    const objectId = String(modelo.physicalId || "").trim();

    if (!objectId) {
        throw new Error("Modelo sem Physical ID para abrir no Product Explorer.");
    }

    const revisao = String(modelo.revisao || "").trim();

    const content = {
        protocol: "3DXContent",
        version: "2.1",
        source: "X3DSEAR_AP",
        widgetId: `preview-${Date.now()}`,
        data: {
            items: [
                {
                    envId: "OnPremise",
                    objectId,
                    serviceId: "3DSpace",
                    objectType: modelo.tipo || "VPMReference",
                    displayName: modelo.titulo || modelo.codigo || modelo.id3DX || "Item 3DEXPERIENCE",
                    contextId: "",
                    displayPreview: `${ICONES_3DSPACE}/large/I_VPMNavProduct108x144.png`,
                    displayIcon: `${ICONES_3DSPACE}/small/I_VPMNavProduct.png`,
                    displayType: "Physical Product",
                    ...(revisao ? { "ds6wg:revision": revisao } : {}),
                },
            ],
        },
    };

    return `${DASHBOARD_PRODUCT_EXPLORER_URL}${encodeURIComponent(JSON.stringify(content))}`;
}

/* Devolve false se o navegador bloqueou a abertura. */
export function abrirModeloNo3DPlay(
    modelo: Modelo3DPlay,
    modo: ModoAberturaArquivos
): boolean {
    return abrirArquivo(montarUrl3DPlay(modelo), "3d", modo);
}