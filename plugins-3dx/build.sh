#!/bin/sh
# Compila o nucleo (triel-3dx-core) e os plugins contra as bibliotecas do 3DSpace instalado.
# Uso: ./build.sh <pasta WEB-INF/lib do 3dspace> [pasta lib do TomEE]
# Ex.: ./build.sh /App/Tomee/Tomee3DSpace/webapps/3dspace/WEB-INF/lib /App/Tomee/Tomee3DSpace/lib
# Saida: out/*.jar (nucleo + plugins) -- copiar para o WEB-INF/lib de cada no, junto com o mssql-jdbc (ver README.md).
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
