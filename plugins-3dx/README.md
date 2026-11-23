# Plugins 3DX (3DSpace)

Plugins Triel que rodam **dentro do 3DSpace** (TomEE) e registram tudo no banco do Portal. A tela para
administrar fica em **Administração → Plugins 3DX**.

| Jar | Pasta | O que faz |
|---|---|---|
| `triel-3dx-core.jar` | `triel-3dx-core/` | Núcleo comum: entrada única no Collaborative Lifecycle (`LifecycleDispatcher`), configuração vinda do Portal, fila persistente, registro assíncrono no banco (com spool em arquivo), heartbeat dos nós, contexto de sistema e utilitários de MQL |
| `TrielDuplicateTitle.jar` | `triel-duplicate-title/` | `duplicate-title`: título automático na Duplicação |
| `TrielReplaceRevision.jar` | `triel-replace-revision/` | `replace-revision`: atualização da revisão nos conjuntos liberados e obsolescência das revisões anteriores |
| `TrielDrawingConfigLink.jar` | `triel-drawing-config-link/` | `drawing-config-link`: desenho ligado a todas as configurações da peça SOLIDWORKS (liberação, rotina noturna e ação manual) |

`triel-visualizacao/` é outra coisa: o script que aplica o padrão de visualização do "Abrir com" (3DPlay/3D Navigate). Não é plugin.

## Como funciona

- **Entrada:** o 3DSpace chama `LifecycleDispatcher.Postprocess` (registrado em `META-INF/services` do núcleo). O núcleo repassa a cada plugin que **não está DESLIGADO**. Os plugins são descobertos por `META-INF/services/br.com.trielht.plm.core.PluginModule` de cada jar. Um erro de plugin nunca chega ao usuário.
- **Modo e parâmetros:** vêm de `dbo.portal_3dx_plugins`, relidos a cada 30 s e mudados pela tela, sem reiniciar.
  - `DESLIGADO`: não faz nada.
  - `SIMULACAO`: registra o que faria (itens `seria_*`), sem alterar o 3DX.
  - `ATIVO`: altera o 3DX e registra.
- **Fila:** `dbo.portal_3dx_plugins_execucoes`, status `pendente`.
  - Sobrevive a reinício.
  - Com 2 nós, cada trabalho é pego por um só (`READPAST`/`UPDLOCK`).
  - Trabalho órfão (nó parou no meio) volta à fila depois de 10 min, até 3 tentativas.
  - A `chave_dedup` impede o mesmo trabalho duas vezes.
  - As ações manuais do Portal entram nessa mesma fila.
- **Registro:**
  - uma execução por trabalho;
  - um item por objeto afetado (de → para, foto da hora);
  - eventos técnicos.

  A gravação é feita por uma thread do núcleo: a liberação ou duplicação do usuário nunca espera o banco. Se o banco cair:
  - o registro vai para `spool.dir` e é regravado depois;
  - um trabalho novo roda direto no nó (`Job.local`).
- **Avisos:** o Portal (agendador em `src/lib/plugins-3dx/notificacoes.ts`) envia e-mail para a lista configurada na tela quando:
  - o plugin de revisão troca revisões;
  - qualquer plugin termina em falha ou parcial.

## Banco

- Migração `db/schema/0172_plugins_3dx.sql`: tabelas `portal_3dx_plugins*`.
- Migração `db/schema/0173_plugins_3dx_ambientes.sql`: modo e parâmetros por plugin **e por ambiente** (`portal_3dx_plugins_ambientes`), e o ambiente em execuções, nós, eventos e destinatários. A fila é por ambiente. TESTE herdou o modo de antes; PRODUCAO começa `DESLIGADO`.
- Aplicar as migrações com `sqlcmd ... -f 65001`, senão os acentos do seed ficam corrompidos.
- Login `triel_3dx_plugins`, com permissões mínimas: `sql/criar_login_plugins.sql`. A senha fica só no SQL Server e no arquivo abaixo.

## Arquivo local em cada servidor do 3DSpace

`/App/triel/triel-plugins.properties` (dono `admintriel`, `chmod 600`):

```properties
# OBRIGATÓRIO: TESTE (dev-plm) ou PRODUCAO. Sem ele o nó deixa todos os plugins DESLIGADOS
# (dev e produção usam o mesmo banco e a mesma fila; o ambiente separa config, fila e registros).
ambiente=TESTE
db.url=jdbc:sqlserver://192.168.0.22:1433;databaseName=PortalTrielHT;encrypt=true;trustServerCertificate=true
db.usuario=triel_3dx_plugins
db.senha=<senha>
spool.dir=/App/triel/spool
```

Sem esse arquivo os plugins funcionam no modo `plugin.<chave>.modo` do próprio arquivo (padrão `SIMULACAO`) e só registram no `catalina.out`.

## Versões

Toda mudança em um jar sobe a versão **dele**: a constante `VERSION` do módulo, ou `Core.VERSION` no núcleo. O build grava essa versão no manifesto do jar, e a tela mostra versão e md5 por nó. Correção que não muda o comportamento sobe o último número (1.1.**1**); funcionalidade nova sobe o do meio (1.**1**.0).

**Nota de cada versão:** fica no próprio código, ao lado da versão: `Core.RELEASES` no núcleo e `releases()` em cada módulo (o mais novo primeiro). Na subida do nó, o núcleo grava as notas que ainda não estão em `dbo.portal_3dx_plugins_versoes` (migração 0174; uma linha por componente + versão, nunca sobrescreve). No log aparece `[TRIEL-CORE] N nota(s) de versao registrada(s) no Portal`. O Portal lê em `GET /api/admin/plugins-3dx/versoes[?componente=core|<chave>]`.

Ao mudar um jar: suba `VERSION` **e** acrescente a linha correspondente em `releases()`/`RELEASES`. Texto com acento, uma ou duas frases, do ponto de vista de quem usa.

Versões atuais: núcleo 1.2.0, título (`duplicate-title`) 6.0.2, revisão (`replace-revision`) 7.0.2, desenho (`drawing-config-link`) 3.0.2.

## Compilar

No servidor (precisa do JDK do 3DSpace):

```sh
sh build.sh /App/Tomee/Tomee3DSpace/webapps/3dspace/WEB-INF/lib /App/Tomee/Tomee3DSpace/lib
```

Gera `out/` com os 4 jars.

## Instalar (por nó)

1. Copiar para `webapps/3dspace/WEB-INF/lib`:
   - os 4 jars;
   - o driver `mssql-jdbc-12.x.jre11.jar` (o 3DSpace não tem driver JDBC de SQL Server).
2. Remover os jars antigos com o mesmo nome. As versões anteriores tinham uma classe de entrada própria cada uma; agora a entrada é só o núcleo.
3. Reiniciar o nó pelo `systemctl`.
4. Em Plugins 3DX → Visão geral, o nó deve aparecer com versão, md5 e "ok" em até 1 min.

**Na atualização (hotfix/upgrade) da plataforma:**
- confira se os 5 jars continuam no `WEB-INF/lib`, porque a Dassault pode recriar a pasta;
- refaça os testes de cada plugin no `dev-plm` antes da produção.
