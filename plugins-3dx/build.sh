#!/bin/sh
# Compila o nucleo (triel-3dx-core) e os plugins contra as bibliotecas do 3DSpace instalado.
# Uso: ./build.sh <pasta WEB-INF/lib do 3dspace> [pasta lib do TomEE]
# Ex.: ./build.sh /App/Tomee/Tomee3DSpace/webapps/3dspace/WEB-INF/lib /App/Tomee/Tomee3DSpace/lib
# Saida: out/*.jar (nucleo + plugins) e out/TrielIefCheckin-classes.tar.gz (WEB-INF/classes) -- copiar para o WEB-INF/lib de cada no, junto com o mssql-jdbc (ver README.md).
set -e
LIB="${1:?informe a pasta WEB-INF/lib do 3dspace}"
TLIB="${2:-$(dirname "$(dirname "$(dirname "$(dirname "$LIB")")")")/lib}"
JDK="${JDK:-/App/Java_2026/jdk/bin}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/out"

CP="$LIB/ENOLifecycleWebItf.jar:$LIB/eMatrixServletRMI.jar:$LIB/slf4j-api.jar"
CP="$CP:$LIB/i3DxMdCommonServicesItf.jar:$LIB/xerinfra.jar"
CP="$CP:$LIB/dsxcadER.jar:$LIB/ENOCorpusRESTEnabler.jar:$LIB/ENOCorpusRESTEnablerER.jar"
for j in "$TLIB"/jakartaee-api-*.jar "$TLIB"/servlet-api.jar; do CP="$CP:$j"; done
# ContextUtil (com.matrixone.apps.domain.util) fica no framework do 3DSpace
for j in "$LIB"/*.jar; do unzip -l "$j" 2>/dev/null | grep -q "com/matrixone/apps/domain/util/ContextUtil.class" && CP="$CP:$j"; done

rm -rf "$OUT" && mkdir -p "$OUT"

build() { # <pasta> <jar> <classpath extra>
  d="$HERE/$1"
  rm -rf "$d/out" && mkdir -p "$d/out/classes"
  "$JDK/javac" --release 21 -encoding UTF-8 -Xlint:unchecked -cp "$CP$3" -d "$d/out/classes" $(find "$d/src" -name "*.java")
  cp -r "$d/resources/META-INF" "$d/out/classes/"
  # a versao vem da constante VERSION do proprio fonte (a mesma que aparece em Plugins 3DX > Visao geral)
  ver=$(grep -rhoE 'VERSION = "[0-9.]+"' "$d/src" | head -1 | grep -oE '[0-9.]+')
  printf 'Implementation-Title: %s\nImplementation-Version: %s\nImplementation-Vendor: Triel-HT\n' "$2" "$ver" > "$d/out/manifest.txt"
  "$JDK/jar" cfm "$OUT/$2.jar" "$d/out/manifest.txt" -C "$d/out/classes" .
  rm -rf "$d/out"
  echo "Gerado: $OUT/$2.jar v$ver ($(md5sum "$OUT/$2.jar" | cut -c1-32))"
}

build triel-3dx-core triel-3dx-core ""
build triel-duplicate-title TrielDuplicateTitle ":$OUT/triel-3dx-core.jar"
build triel-replace-revision TrielReplaceRevision ":$OUT/triel-3dx-core.jar"
build triel-drawing-config-link TrielDrawingConfigLink ":$OUT/triel-3dx-core.jar"
build triel-maturity-state TrielMaturityState ":$OUT/triel-3dx-core.jar"

# ---------------------------------------------------------------------------------------------------------------
# ief-checkin: correcao do salvamento pelo conector CAD. Alem do jar (modulo do plugin), gera a classe da Dassault
# corrigida + IefCheckinGuard para WEB-INF/classes (out/TrielIefCheckin-classes.tar.gz). A classe corrigida so e
# gerada do ENOIEFCmdHandlers.jar/ENOIEFCmdManagers.jar com o md5 conhecido: outro md5 = hotfix da Dassault, analisar no dev-plm antes.
IEF="$HERE/triel-ief-checkin"
MOD="$IEF/src/br/com/trielht/plm/ief/IefCheckinModule.java"
md5_de() { grep -oE "$1 = \"[0-9a-f]{32}\"" "$MOD" | grep -oE '[0-9a-f]{32}'; }
CMD_JAR="$LIB/ENOIEFCmdHandlers.jar"
MGR_JAR="$LIB/ENOIEFCmdManagers.jar"
for par in "$CMD_JAR:DASSAULT_JAR_MD5" "$MGR_JAR:DASSAULT_MANAGERS_JAR_MD5"; do
  jar="${par%%:*}"; esperado="$(md5_de "${par##*:}")"
  if [ "$(md5sum "$jar" | cut -c1-32)" != "$esperado" ]; then
    echo "ATENCAO: $jar com md5 diferente de $esperado -- ief-checkin NAO gerado (refazer a analise da correcao)"
    exit 0
  fi
done
W="$OUT/ief-work"
rm -rf "$W" && mkdir -p "$W/classes" "$W/orig" "$W/vl"
H=com/dassault_systems/MCADIntegration/server/handler/ENOIEFCheckinHandler.class
V='com/dassault_systems/MCADIntegration/server/manager/ENOIEFClientExistanceVerifier$ENOIEFExistanceVerifier.class'
"$JDK/javac" --release 21 -encoding UTF-8 -d "$W/classes" $(find "$IEF/classes-src" -name "*.java")
(cd "$W/orig" && unzip -q "$CMD_JAR" "$H" && unzip -q "$MGR_JAR" "$V")
mkdir -p "$W/classes/$(dirname "$H")" "$W/classes/$(dirname "$V")"
ASM="--add-exports java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED"
"$JDK/java" $ASM "$IEF/tool/PatchCheckinHandler.java" "$W/orig/$H" "$W/classes/$H"
"$JDK/java" $ASM "$IEF/tool/PatchVerifier.java" "$W/orig/$V" "$W/classes/$V"
# verificacao completa do bytecode contra as bibliotecas do 3DSpace (carrega as classes, nao executa nada)
"$JDK/javac" --release 21 -d "$W/vl" "$IEF/tool/VerifyLoad.java"
VL="$("$JDK/java" -Xverify:all -cp "$W/classes:$W/vl:$LIB/*:$TLIB/*" VerifyLoad   com.dassault_systems.MCADIntegration.server.handler.ENOIEFCheckinHandler   'com.dassault_systems.MCADIntegration.server.manager.ENOIEFClientExistanceVerifier$ENOIEFExistanceVerifier' 2>&1)"
echo "$VL" | grep -v Xverify
[ "$(echo "$VL" | grep -c "carregada e verificada: .*ief-work/classes/")" = "2" ]   || { echo "ERRO: classe corrigida nao passou na verificacao"; exit 1; }
tar czf "$OUT/TrielIefCheckin-classes.tar.gz" -C "$W/classes" br com
echo "Gerado: $OUT/TrielIefCheckin-classes.tar.gz (para WEB-INF/classes; md5 do ENOIEFCmdHandlers.jar e do ENOIEFCmdManagers.jar conferidos)"
build triel-ief-checkin TrielIefCheckin ":$OUT/triel-3dx-core.jar:$W/classes"
rm -rf "$W"
