# -*- coding: utf-8 -*-
"""
Padrao de visualizacao do "Abrir com" (3DPlay e 3D Navigate) - Triel-HT.

Aplica (ou confere) as 4 alteracoes nos arquivos estaticos do 3DSpace:
  1. PADUtils/assets/PADSharedSettings.json               qualidade 3D Navigate = HIGH
  2. ENOCockpitV2/assets/json/ENO3DViewerInfraOptions.json qualidade HIGH + padrao da vista (3D Navigate)
  3. 3DPlayAppV2/assets/json/X3DPLAW_AP_DefaultExperience.json padrao da vista (3DPlay)
  4. 3DPlayExperienceModule/3DPlayExperienceModule.js      qualidade "Alta", todas as arestas e geometria completa (3DPlay)

Uso (como root, no servidor do 3DSpace):
  python3 aplicar_padrao_visualizacao.py <pasta webapps> --conferir   # so mostra a situacao, nao altera nada
  python3 aplicar_padrao_visualizacao.py <pasta webapps> --aplicar    # faz backup (.orig-AAAAMMDD) e aplica

Exemplos de <pasta webapps>:
  /App/Tomee/Tomee3DSpace/webapps/3dspace/webapps                     (dev-plm)
  /App/Tomee/Tomee3DSpaceNode1/webapps/3dspace/webapps                (producao, no 1)
  /App/Tomee/Tomee3DSpaceNode2/webapps/3dspace/webapps                (producao, no 2)
  /App/DassaultSystemes/R2026x/3DSpace/STAGING/ematrix/webapps        (area de customizacao)
  /App/DassaultSystemes/R2026x/3DSpace/distrib_CAS/3dspace/webapps    (resultado do ultimo build)

E idempotente: o que ja estiver aplicado e mantido. Se um trecho esperado nao for encontrado
exatamente uma vez (ex.: hotfix mudou o arquivo), NADA e gravado naquele arquivo e o script
termina com codigo 2 - nesse caso, analisar o arquivo novo no dev-plm antes de seguir.
"""
import json, os, re, shutil, sys, time

PADRAO_VISTA = {
    "linesState": False,             # Fios desligados
    "projectionMode": 1,             # Perspectiva desligada (projecao paralela)
    "visuShadingMode": "ShadingEdges",
    "visuShadingFaceMode": "Shaded",
    "visuShadingEdgeMode": "WithEdges",  # "Todas as arestas"
}

JS_TROCAS = [
    # qualidade preferida do 3DPlay: "Baixa qualidade" -> "Alta qualidade"
    ('name:prefName,defaultValue:"index",type:"list"',
     'name:prefName,defaultValue:"base",type:"list"'),
    # padrao forcado numa janela nova: Sombreado sem arestas -> Sombreado com todas as arestas
    ('e.setVisuShadingMode("Shading"),e.setVisuShadingEdgeMode("NoEdges"),e.setMaterialMode("FILE"===this.currentProvider)',
     'e.setVisuShadingMode("ShadingEdges"),e.setVisuShadingEdgeMode("WithEdges"),e.setMaterialMode("FILE"===this.currentProvider)'),
    # carregar a geometria completa (com dados de aresta) ja na abertura, sem "Recarregar Modelo"
    ('e.setVisuShadingEdgeMode("WithEdges"),e.setMaterialMode("FILE"===this.currentProvider),this.dontrecordVisuChange=!1,logger.warn(',
     'e.setVisuShadingEdgeMode("WithEdges"),e.setMaterialMode("FILE"===this.currentProvider),this.dontrecordVisuChange=!1,'
     '"ENOPAD"===this.currentProvider&&this.configureController&&this.configureController({needCGR:!0,needMaterial:!1,needMeshInRam:!1}),logger.warn('),
    # perspectiva desligada (projecao paralela) numa janela nova: o 3DPlay ignora o projectionMode do JSON
    ('this.dontrecordVisuChange=!0,e.setVisuShadingMode("ShadingEdges")',
     'this.dontrecordVisuChange=!0,e.currentViewpoint&&e.currentViewpoint.setProjectionType(1),e.setVisuShadingMode("ShadingEdges")'),
]

VIEW_PANEL = ["layout_options", "frmWindow_opts", "viewerOptions", "viewPanelConfig"]


class Falha(Exception):
    pass


def _ler(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def _caminho(o, chaves, arq):
    for k in chaves:
        if not isinstance(o, dict) or k not in o:
            raise Falha(f"{arq}: chave '{'/'.join(chaves)}' nao encontrada")
        o = o[k]
    return o


def pad_shared(txt):
    rx = re.compile(r'("enopad3dviewer_CGRorTHB"\s*:\s*\{[^{}]*?"value"\s*:\s*)"([A-Z]+)"')
    m = rx.findall(txt)
    if len(m) != 1:
        raise Falha("PADSharedSettings.json: bloco enopad3dviewer_CGRorTHB encontrado %d vez(es)" % len(m))
    return rx.sub(r'\1"HIGH"', txt)


def eno3d_infra(txt):
    o = json.loads(txt)
    _caminho(o, ["eno3dviewerinfra", "run_options", "enopad3dviewer_CGRorTHB"], "ENO3DViewerInfraOptions.json")["value"] = "HIGH"
    _caminho(o, ["eno3dviewerinfra"] + VIEW_PANEL, "ENO3DViewerInfraOptions.json")["defaultSettings"] = dict(PADRAO_VISTA)
    return json.dumps(o, indent=2, ensure_ascii=False)


def x3dplay(txt):
    o = json.loads(txt)
    for raiz in ("enopad3dviewer", "eno3dviewerinfra"):
        _caminho(o, [raiz] + VIEW_PANEL, "X3DPLAW_AP_DefaultExperience.json")["defaultSettings"] = dict(PADRAO_VISTA)
    return json.dumps(o, indent=2, ensure_ascii=False)


def js_3dplay(txt):
    for antigo, novo in JS_TROCAS:
        if txt.count(novo) == 1:
            continue                      # ja aplicado
        n = txt.count(antigo)
        if n != 1:
            raise Falha("3DPlayExperienceModule.js: trecho esperado encontrado %d vez(es): %s..." % (n, antigo[:60]))
        txt = txt.replace(antigo, novo)
    return txt


def _json_igual(a, b):
    try:
        return json.loads(a) == json.loads(b)
    except ValueError:
        return False


ARQUIVOS = [
    ("PADUtils/assets/PADSharedSettings.json", pad_shared, False),
    ("ENOCockpitV2/assets/json/ENO3DViewerInfraOptions.json", eno3d_infra, True),
    ("3DPlayAppV2/assets/json/X3DPLAW_AP_DefaultExperience.json", x3dplay, True),
    ("3DPlayExperienceModule/3DPlayExperienceModule.js", js_3dplay, False),
]


def main():
    if len(sys.argv) != 3 or sys.argv[2] not in ("--conferir", "--aplicar"):
        print(__doc__)
        return 1
    base, aplicar = sys.argv[1], sys.argv[2] == "--aplicar"
    sufixo = ".orig-" + time.strftime("%Y%m%d")
    erros = 0
    for rel, func, eh_json in ARQUIVOS:
        p = os.path.join(base, rel)
        if not os.path.isfile(p):
            print(f"[FALTA]     {rel}")
            erros += 1
            continue
        atual = _ler(p)
        try:
            novo = func(atual)
        except (Falha, ValueError) as e:
            print(f"[ERRO]      {rel}: {e}")
            erros += 1
            continue
        ja = (novo == atual) or (eh_json and _json_igual(novo, atual))
        if ja:
            print(f"[OK]        {rel} (ja aplicado)")
            continue
        if not aplicar:
            print(f"[PENDENTE]  {rel}")
            continue
        st = os.stat(p)
        bkp = p + sufixo
        if not os.path.exists(bkp):
            shutil.copy2(p, bkp)
        with open(p, "w", encoding="utf-8", newline="") as f:
            f.write(novo)
        if hasattr(os, "chown"):
            os.chown(p, st.st_uid, st.st_gid)
        os.chmod(p, st.st_mode & 0o7777)
        print(f"[APLICADO]  {rel} (backup: {os.path.basename(bkp)})")
    return 2 if erros else 0


if __name__ == "__main__":
    sys.exit(main())
