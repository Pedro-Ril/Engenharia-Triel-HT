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

const CONTEXT_ID = "VPLMProjectLeader.Company Name.Common Space";

export async function buscarModelos3DPlay(item: RoteiroTreeNode) {
    const codigo = String(item.codigoNormalizado || item.codigo || "").trim();
    const revisao = String(item.revisao || "").trim();

    if (!codigo) {
        throw new Error("Item sem código para pesquisar no 3DX.");
    }

    if (!revisao) {
        throw new Error("Item sem revisão para pesquisar no 3DX.");
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

export function abrirModeloNo3DPlay(modelo: Modelo3DPlay) {
    const url = montarUrl3DPlay(modelo);
    window.open(url, "_blank");
}