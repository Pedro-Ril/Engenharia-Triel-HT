import { describe, expect, it } from "vitest";

import { montarUrl3D } from "./threeDPlay.service";

/* Link real do 3D Navigate enviado pelo usuário (223847, 16/11/2026). */
const LINK_REAL =
  "https://dashboard-prd.trielht.com.br/3ddashboard/#dashboard:3ea76c30-e6a4-4288-ab68-1214e947068c/tabId:ALtXQt70g02ipB6XdW0N/app:ENXDISC_AP/content:X3DContentId=%7B%22protocol%22%3A%223DXContent%22%2C%22version%22%3A%222.1%22%2C%22source%22%3A%22ENOLCMI_AP%22%2C%22widgetId%22%3A%22ALtXQt70g02ipB6XdW0V%22%2C%22data%22%3A%7B%22items%22%3A%5B%7B%22envId%22%3A%22OnPremise%22%2C%22serviceId%22%3A%223DSpace%22%2C%22objectId%22%3A%22BD11FE11314300006A1596FF000C3395%22%2C%22objectType%22%3A%22VPMReference%22%2C%22objectTaxonomies%22%3A%5B%22PHYSICALAbstractReference%22%2C%22LPAbstractReference%22%2C%22PLMCoreReference%22%2C%22PLMReference%22%2C%22PLMEntity%22%2C%22VPMReference%22%2C%22VPMReference%22%5D%2C%22displayName%22%3A%22223847%22%2C%22i3dx%22%3A%22%22%7D%5D%7D%7D";

function partes(url: string) {
  const [base, conteudo] = url.split("X3DContentId=");
  const json = JSON.parse(decodeURIComponent(conteudo));
  delete json.widgetId;
  return { base, json };
}

describe("abertura do 3D", () => {
  const modelo = { physicalId: "BD11FE11314300006A1596FF000C3395", codigo: "223847", titulo: "223847", tipo: "VPMReference" };

  it("o padrão é o 3D Navigate, igual ao link real (menos o widgetId)", () => {
    expect(partes(montarUrl3D(modelo))).toEqual(partes(LINK_REAL));
  });

  it("3D Play e Product Explorer continuam disponíveis", () => {
    expect(montarUrl3D(modelo, "3dplay")).toContain("/app:X3DPLAW_AP/");
    expect(montarUrl3D(modelo, "product-explorer")).toContain("/app:ENOSCEN_AP/");
  });
});
