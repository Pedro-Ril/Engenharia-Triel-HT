import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/auth/errors";

import { analisarColeta } from "./coleta";
import { interpretarEstado, montarCaminhoEstado, type EstadoWorkstation } from "./estado";
import type { MaquinaParaColeta } from "./maquinas";
import { normalizarNomesComputadores } from "./maquinas";
import { calcularHashNip, decodificarNip, lerConfiguracoesNip, prepararNipParaPublicar } from "./nip";
import { calcularStatusMaquina } from "./status";

/*
 * Amostras reais: export -exportCustomized da ENGAGRO02 (RTX 2000 Ada,
 * driver 596.71) e o estado.json gravado pelo script rodando como
 * SYSTEM depois de reaplicar o perfil.
 */
const EXPORT_REAL = `<?xml version="1.0" encoding="utf-16"?>
<ArrayOfProfile>
  <Profile>
    <ProfileName>Base Profile</ProfileName>
    <Executeables />
    <Settings>
      <ProfileSetting>
        <SettingNameInfo>List of Universal GPU ids</SettingNameInfo>
        <SettingID>271929336</SettingID>
        <SettingValue>id,2.0:28B010DE,00000100,GL - (400,7,161,15356) @ (0);</SettingValue>
        <ValueType>String</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Application Profile Notification Popup Timeout</SettingNameInfo>
        <SettingID>272979126</SettingID>
        <SettingValue>9</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Power management mode</SettingNameInfo>
        <SettingID>274197361</SettingID>
        <SettingValue>1</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
    </Settings>
    <ExecutableFindFiles />
  </Profile>
  <Profile>
    <ProfileName>Dassault Systemes SolidWorks</ProfileName>
    <Executeables>
      <string>sldworks.exe</string>
    </Executeables>
    <Settings>
      <ProfileSetting>
        <SettingNameInfo>Power management mode</SettingNameInfo>
        <SettingID>274197361</SettingID>
        <SettingValue>1</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
    </Settings>
    <ExecutableFindFiles />
  </Profile>
</ArrayOfProfile>`.replace(/\n/g, "\r\n");

const BOM_UTF8 = Buffer.from([0xef, 0xbb, 0xbf]);

const ESTADO_REAL = `{
    "versaoScript":  1,
    "computador":  "ENGAGRO02",
    "executadoComo":  "AUTORIDADE NT\\\\SISTEMA",
    "verificadoEm":  "2026-11-17T23:16:22-03:00",
    "gpu":  {
                "nome":  "NVIDIA RTX 2000 Ada Generation",
                "driverWindows":  "32.0.15.9671",
                "driverNvidia":  "596.71",
                "dataDriver":  "2026-06-08"
            },
    "driverAnterior":  "596.71",
    "perfilOficial":  {
                          "arquivo":  "C:\\\\ProgramData\\\\TI\\\\NvidiaProfile\\\\perfil-padrao.nip",
                          "hash":  "8382D8D06D81356BBFBEDA951561B6582A7A2E10BD0B2AC6B9459DD421570A12",
                          "configuracoes":  2
                      },
    "conforme":  true,
    "acao":  "reaplicado",
    "divergenciasEncontradas":  [
                                    {
                                        "perfil":  "Dassault Systemes SolidWorks",
                                        "configuracaoId":  "274197361",
                                        "configuracao":  "Power management mode",
                                        "esperado":  "1",
                                        "encontrado":  "5"
                                    }
                                ],
    "divergenciasAposReaplicar":  [

                                  ],
    "ultimaReaplicacao":  {
                              "em":  "2026-11-17T23:16:52-03:00",
                              "driverNvidia":  "596.71",
                              "perfilHash":  "8382D8D06D81356BBFBEDA951561B6582A7A2E10BD0B2AC6B9459DD421570A12",
                              "sucesso":  true
                          },
    "erro":  null
}`;

function maquinaBase(parcial: Partial<MaquinaParaColeta> = {}): MaquinaParaColeta {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    computador: "ENGAGRO02",
    descricao: null,
    ativo: true,
    coletaEm: "2026-11-17T23:00:00",
    coletaOk: true,
    coletaErro: null,
    contatoEm: "2026-11-17T23:00:00",
    verificadoEm: "2026-11-17T22:46:22-03:00",
    executadoComo: "AUTORIDADE NT\\SISTEMA",
    gpu: "NVIDIA RTX 2000 Ada Generation",
    driverWindows: "32.0.15.9671",
    driverNvidia: "596.71",
    dataDriver: "2026-06-08",
    conforme: true,
    acao: "nenhuma",
    erroScript: null,
    perfilHash: "8382D8D06D81356BBFBEDA951561B6582A7A2E10BD0B2AC6B9459DD421570A12",
    divergencias: null,
    ultimaReaplicacaoEm: "2026-11-17T23:13:46-03:00",
    ultimaReaplicacaoSucesso: true,
    criadoEm: "2026-11-17T20:00:00",
    alertaSemContatoEnviado: false,
    minutosDesdeContato: 30,
    ...parcial,
  };
}

function estadoReal(parcial: Partial<EstadoWorkstation> = {}): EstadoWorkstation {
  return { ...interpretarEstado(ESTADO_REAL), ...parcial };
}

describe("nip", () => {
  it("lê o export real em UTF-8 com BOM apesar da declaração utf-16", () => {
    const bytes = Buffer.concat([BOM_UTF8, Buffer.from(EXPORT_REAL, "utf8")]);
    const configuracoes = lerConfiguracoesNip(decodificarNip(bytes));

    expect(configuracoes).toHaveLength(4);
    expect(configuracoes[3]).toEqual({
      perfil: "Dassault Systemes SolidWorks",
      executaveis: ["sldworks.exe"],
      configuracaoId: "274197361",
      configuracao: "Power management mode",
      valor: "1",
      tipo: "Dword",
    });
  });

  it("também lê um .nip salvo em UTF-16 LE", () => {
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(EXPORT_REAL, "utf16le")]);
    expect(lerConfiguracoesNip(decodificarNip(bytes))).toHaveLength(4);
  });

  it("ao publicar, tira o ID da GPU e grava UTF-8 com BOM e CRLF", () => {
    const bytes = Buffer.concat([BOM_UTF8, Buffer.from(EXPORT_REAL, "utf8")]);
    const { conteudo, configuracoes, removidas } = prepararNipParaPublicar(bytes);

    expect(removidas.map((cfg) => cfg.configuracaoId)).toEqual(["271929336"]);
    expect(configuracoes.map((cfg) => cfg.configuracaoId)).toEqual(["272979126", "274197361", "274197361"]);
    expect([...conteudo.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

    const texto = decodificarNip(conteudo);
    expect(texto).not.toContain("28B010DE");
    expect(texto).not.toMatch(/[^\r]\n/);
  });

  it("recusa arquivo que não é .nip", () => {
    expect(() => prepararNipParaPublicar(Buffer.from("<html></html>"))).toThrow(ValidationError);
  });

  it("calcula o mesmo hash que o Get-FileHash da workstation", () => {
    const bytes = readFileSync(path.join(process.cwd(), "workstations-nvidia", "perfil-padrao.nip"));
    expect(calcularHashNip(bytes)).toBe(
      "8382D8D06D81356BBFBEDA951561B6582A7A2E10BD0B2AC6B9459DD421570A12"
    );
  });
});

describe("estado.json", () => {
  it("interpreta o estado.json real gravado pelo PowerShell", () => {
    const estado = interpretarEstado(ESTADO_REAL);

    expect(estado.computador).toBe("ENGAGRO02");
    expect(estado.executadoComo).toBe("AUTORIDADE NT\\SISTEMA");
    expect(estado.gpu?.driverNvidia).toBe("596.71");
    expect(estado.conforme).toBe(true);
    expect(estado.acao).toBe("reaplicado");
    expect(estado.divergenciasEncontradas).toEqual([
      {
        perfil: "Dassault Systemes SolidWorks",
        configuracaoId: "274197361",
        configuracao: "Power management mode",
        esperado: "1",
        encontrado: "5",
      },
    ]);
    expect(estado.divergenciasAposReaplicar).toEqual([]);
    expect(estado.ultimaReaplicacao).toEqual({ em: "2026-11-17T23:16:52-03:00", sucesso: true });
  });

  it("aceita BOM no começo do arquivo", () => {
    expect(interpretarEstado(`\uFEFF${ESTADO_REAL}`).computador).toBe("ENGAGRO02");
  });

  it("monta o caminho UNC trocando o marcador", () => {
    expect(
      montarCaminhoEstado(String.raw`\\{computador}\C$\ProgramData\TI\NvidiaProfile\estado.json`, "ENGAGRO02")
    ).toBe(String.raw`\\ENGAGRO02\C$\ProgramData\TI\NvidiaProfile\estado.json`);
  });
});

describe("nomes de computador", () => {
  it("normaliza, remove duplicados e aceita vários separadores", () => {
    expect(normalizarNomesComputadores("engagro01\n\\\\ENGAGRO02, engagro01; engagro03.trielht.local")).toEqual([
      "ENGAGRO01",
      "ENGAGRO02",
      "ENGAGRO03.TRIELHT.LOCAL",
    ]);
  });

  it("recusa nomes que poderiam quebrar o caminho UNC", () => {
    expect(() => normalizarNomesComputadores(String.raw`ENG\..\SERVIDOR`)).toThrow(ValidationError);
  });
});

describe("status da máquina", () => {
  const contexto = {
    hashPerfilOficial: "8382D8D06D81356BBFBEDA951561B6582A7A2E10BD0B2AC6B9459DD421570A12",
    horasSemContato: 24,
    agora: Date.parse("2026-11-17T23:30:00-03:00"),
  };

  it("conforme com o perfil oficial atual", () => {
    expect(calcularStatusMaquina(maquinaBase(), contexto)).toBe("conforme");
  });

  it("perfil desatualizado quando o hash é de outro perfil", () => {
    expect(calcularStatusMaquina(maquinaBase({ perfilHash: "ABC" }), contexto)).toBe("perfil_desatualizado");
  });

  it("sem contato quando a última leitura falhou", () => {
    expect(calcularStatusMaquina(maquinaBase({ coletaOk: false }), contexto)).toBe("sem_contato");
  });

  it("script parado quando o estado.json é velho", () => {
    expect(
      calcularStatusMaquina(maquinaBase({ verificadoEm: "2026-11-15T10:00:00-03:00" }), contexto)
    ).toBe("estado_antigo");
  });

  it("falha e adiado vêm do que o script relatou", () => {
    expect(calcularStatusMaquina(maquinaBase({ acao: "falha_reaplicacao", conforme: false }), contexto)).toBe("falha");
    expect(calcularStatusMaquina(maquinaBase({ acao: "adiado", conforme: false }), contexto)).toBe("adiado");
  });

  it("aguardando coleta quando nunca foi lida", () => {
    expect(calcularStatusMaquina(maquinaBase({ coletaEm: null, coletaOk: null }), contexto)).toBe("nunca_coletada");
  });
});

describe("eventos de uma coleta", () => {
  it("registra a reaplicação nova com a divergência corrigida", () => {
    const { eventos } = analisarColeta(maquinaBase(), { ok: true, estado: estadoReal() }, 24);

    expect(eventos).toHaveLength(1);
    expect(eventos[0].tipo).toBe("reaplicado");
    expect(eventos[0].descricao).toContain("esperado 1, encontrado 5");
  });

  it("não repete a mesma reaplicação na coleta seguinte", () => {
    const anterior = maquinaBase({ ultimaReaplicacaoEm: "2026-11-17T23:16:52-03:00" });
    expect(analisarColeta(anterior, { ok: true, estado: estadoReal() }, 24).eventos).toEqual([]);
  });

  it("detecta troca de driver", () => {
    const anterior = maquinaBase({ driverNvidia: "581.15", ultimaReaplicacaoEm: "2026-11-17T23:16:52-03:00" });
    const { eventos } = analisarColeta(anterior, { ok: true, estado: estadoReal() }, 24);
    expect(eventos.map((e) => e.tipo)).toEqual(["driver_alterado"]);
    expect(eventos[0].descricao).toBe("Driver NVIDIA mudou de 581.15 para 596.71.");
  });

  it("registra falha quando a reaplicação não deu certo", () => {
    const estado = estadoReal({
      conforme: false,
      acao: "falha_reaplicacao",
      ultimaReaplicacao: { em: "2026-11-18T08:00:00-03:00", sucesso: false },
      erro: "O Profile Inspector não terminou em 60 s",
    });
    const { eventos } = analisarColeta(maquinaBase(), { ok: true, estado }, 24);
    expect(eventos.map((e) => e.tipo)).toEqual(["falha_reaplicacao"]);
  });

  it("só alerta sem contato depois do limite, e uma vez só", () => {
    const falha = { ok: false as const, erro: "Máquina inacessível" };

    expect(analisarColeta(maquinaBase({ minutosDesdeContato: 60 }), falha, 24)).toEqual({
      eventos: [],
      alertaSemContatoEnviado: false,
    });

    const primeira = analisarColeta(maquinaBase({ minutosDesdeContato: 25 * 60 }), falha, 24);
    expect(primeira.eventos.map((e) => e.tipo)).toEqual(["sem_contato"]);
    expect(primeira.alertaSemContatoEnviado).toBe(true);

    const segunda = analisarColeta(
      maquinaBase({ minutosDesdeContato: 26 * 60, alertaSemContatoEnviado: true }),
      falha,
      24
    );
    expect(segunda.eventos).toEqual([]);
    expect(segunda.alertaSemContatoEnviado).toBe(true);
  });

  it("avisa quando o contato volta", () => {
    const anterior = maquinaBase({
      alertaSemContatoEnviado: true,
      ultimaReaplicacaoEm: "2026-11-17T23:16:52-03:00",
    });
    const resultado = analisarColeta(anterior, { ok: true, estado: estadoReal() }, 24);
    expect(resultado.eventos.map((e) => e.tipo)).toEqual(["contato_restabelecido"]);
    expect(resultado.alertaSemContatoEnviado).toBe(false);
  });
});
