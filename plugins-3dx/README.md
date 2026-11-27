# Plugins 3DX (3DSpace)

Plugins Triel que rodam **dentro do 3DSpace** (TomEE) e registram tudo no banco do Portal. A tela para
administrar fica em **Administração → Plugins 3DX**.

| Jar | Pasta | O que faz |
|---|---|---|
| `triel-3dx-core.jar` | `triel-3dx-core/` | Núcleo comum: entrada única no Collaborative Lifecycle (`LifecycleDispatcher`), configuração vinda do Portal, fila persistente, registro assíncrono no banco (com spool em arquivo), heartbeat dos nós, contexto de sistema e utilitários de MQL |
| `TrielDuplicateTitle.jar` | `triel-duplicate-title/` | `duplicate-title`: título automático na Duplicação |
| `TrielReplaceRevision.jar` | `triel-replace-revision/` | `replace-revision`: atualização da revisão nos conjuntos liberados e obsolescência das revisões anteriores |
| `TrielDrawingConfigLink.jar` | `triel-drawing-config-link/` | `drawing-config-link`: desenho ligado a todas as configurações da peça SOLIDWORKS (liberação, rotina noturna e ação manual) |
| `TrielMaturityState.jar` | `triel-maturity-state/` | `maturity-state`: filtro web (próprio `web-fragment.xml`) na busca `dseng:EngItem/search` e na estrutura `cvservlet/zonequeries` que o integrador do SOLIDWORKS lê: o estado de maturidade de cada objeto é conferido no **banco** (o índice de busca atrasa até ~1,5 min) e, em Ativo, só esse campo é trocado. Em Simulação só registra divergências e custo; qualquer problema devolve a resposta como veio |
| `TrielIefCheckin.jar` + `WEB-INF/classes` | `triel-ief-checkin/` | `ief-checkin`: correção do salvamento pelo conector CAD. A classe da Dassault `ENOIEFCheckinHandler` corrigida (gerada do `ENOIEFCmdHandlers.jar` pelo `build.sh`) e o `IefCheckinGuard` ficam em `WEB-INF/classes`; o jar só traz o modo do Portal, o resumo, o registro dos salvamentos com erro e o autoteste. Ver a seção própria abaixo |
| `TrielAdvancedDuplicate.jar` | `triel-advanced-duplicate/` | `advanced-duplicate`: janela de Duplicação avançada. Filtro web na estrutura (`lifecycle/expand/federated`): o item principal já vem como "Duplicar com Desenhos" e os demais como "Reutilizar". Miniatura do item ao passar o mouse no título (0.3.0). Ver a seção própria abaixo |

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

Versões atuais: núcleo 1.4.0, título (`duplicate-title`) 6.2.1, revisão (`replace-revision`) 7.2.1, desenho (`drawing-config-link`) 3.2.1, estado pelo banco (`maturity-state`) 1.3.0, salvamento do conector (`ief-checkin`) 1.3.1. Documentação completa: "Documentação Técnica - Plugins e melhorias do 3DEXPERIENCE" (pasta Portal Triel-HT).

## Depois de um hotfix ou atualização do 3DEXPERIENCE

O Portal confere o ambiente a cada 15 minutos (Administração > Plugins 3DX; migração 0175), só lendo pela rede, sem login e sem instalar nada no 3DSpace:

- **Versão do 3DSpace** em cada nó de `dbo.portal_3dx_servidores` (build lido de `webapps/3DPlayExperienceModule/.3DPlayExperienceModule.mkversion.mk`). Build mudou = a Dassault foi atualizada.
- **Padrão de visualização** do "Abrir com" (os 4 arquivos de `triel-visualizacao/`), com a mesma regra do `aplicar_padrao_visualizacao.py --conferir`: *aplicado*, *perdido* (voltou ao original da Dassault: reaplicar o script) ou *mudou* (a Dassault alterou o arquivo: analisar no dev-plm antes). Mudou a regra no script? Mude também `src/lib/plugins-3dx/padrao-visualizacao.ts`.
- **Nós dos plugins:** heartbeat parado há 10 min (3DSpace parado, jar apagado por redeploy, sem banco) ou **autoteste** com falha.

**Autoteste** (núcleo 1.3.0+): na subida, o núcleo confere se as classes e métodos internos da Dassault que ele e cada plugin usam (`SelfTest.CORE_REQUIRES` e `requires()` de cada módulo) existem neste 3DSpace e grava `ok`/`falha` no heartbeat. Ao usar uma API nova da Dassault num plugin, acrescente-a em `requires()`.

Toda **mudança** de estado (inclusive a volta ao normal) vira evento e um e-mail por ambiente para a lista do evento **Ambiente 3DX** (destinatário sem plugin). O nó sem resposta só vira erro na segunda verificação seguida, para um reinício não gerar aviso.

## Compilar

No servidor (precisa do JDK do 3DSpace):

```sh
sh build.sh /App/Tomee/Tomee3DSpace/webapps/3dspace/WEB-INF/lib /App/Tomee/Tomee3DSpace/lib
```

Gera `out/` com os jars e `TrielIefCheckin-classes.tar.gz` (classe corrigida para `WEB-INF/classes`). O ief-checkin só é gerado se o `ENOIEFCmdHandlers.jar` tiver o md5 conhecido.

## Instalar (por nó)

1. Copiar para `webapps/3dspace/WEB-INF/lib`:
   - os jars (o ief-checkin tem também a parte de `WEB-INF/classes`, ver a seção dele);
   - o driver `mssql-jdbc-12.x.jre11.jar` (o 3DSpace não tem driver JDBC de SQL Server).
2. Remover os jars antigos com o mesmo nome. As versões anteriores tinham uma classe de entrada própria cada uma; agora a entrada é só o núcleo.
3. Reiniciar o nó pelo `systemctl`.
4. Em Plugins 3DX → Visão geral, o nó deve aparecer com versão, md5 e "ok" em até 1 min.

**Na atualização (hotfix/upgrade) da plataforma:**
- confira se os 5 jars continuam no `WEB-INF/lib`, porque a Dassault pode recriar a pasta;
- refaça os testes de cada plugin no `dev-plm` antes da produção.

## ief-checkin: correção do salvamento pelo conector CAD

**O defeito (Dassault, `ENOIEFCmdHandlers.jar`):** a cada salvamento pelo conector do SOLIDWORKS, o `ENOIEFCheckinHandler.execute()` liga um timer
(`Executors.newScheduledThreadPool(1)`, conferência de cancelamento a cada 2 s), guarda num campo **estático** e só o encerra no cancelamento, e aí
encerra o do último salvamento de qualquer pessoa. Cada salvamento deixa uma thread viva até o reinício; o timer de um salvamento cancelado fica limpando
o cache da sessão do usuário e quebra os salvamentos seguintes (NPE em `ENOIEFCommitHandler.run:143`, o erro "null"/`Map.get` ao salvar).

**A correção:** o `build.sh` gera a classe corrigida a partir do jar instalado (`tool/PatchCheckinHandler.java`, ASM interno do JDK 21): o
`execute()` original vira `triel$execute()` sem nenhuma outra mudança, e o novo `execute()` chama `IefCheckinGuard.enter()`, o original e
`exit()` (ou `failed()` no erro); a 1.1.0 passa o handler em `enter(this)`. O `newScheduledThreadPool` vira `IefCheckinGuard.newScheduler` (threads `triel-ief-checkin-N`). O
`IefCheckinGuard` (`classes-src/`) não depende do núcleo: sem o jar do plugin, o salvamento segue o original.

| Modo | Comportamento |
|---|---|
| `DESLIGADO` | Exatamente o original da Dassault, sem contar nada |
| `SIMULACAO` | Original, mas conta salvamentos, timers deixados vivos e cancelamentos (resumo no registro de eventos) |
| `ATIVO` | Encerra o timer de cada salvamento no fim dele |

- **Timer órfão (1.1.0):** cada timer sabe de qual salvamento é e se ele já terminou. Quando a Dassault desliga um timer a partir do timer ou do salvamento de **outro** usuário/salvamento, o guard avisa: *órfão nasceu* (cancelamento durante o salvamento desligou o timer de outro; vira evento) ou *órfão agiu* (o timer de um salvamento cancelado e já terminado detectou o cancelamento de novo: limpou o cache da sessão, abortou o salvamento em andamento e desligou o timer de outro; vira **execução em falha** com o usuário afetado). Reproduzido no dev-plm em 26/11/2026: cancelar um salvamento e salvar de novo em seguida, sem fechar o SOLIDWORKS, leva ao erro "Map.get … null" (`ENOIEFCommitHandler.run:143`) nos salvamentos seguintes.
- **Ativo (1.2.0):** ao entrar em Ativo (e a cada 15 s), os timers de salvamentos já terminados que sobraram da Simulação, órfãos inclusive, são encerrados na hora, sem reinício. E quando a Dassault manda desligar o timer de um salvamento em andamento por causa do cancelamento de **outro**, a correção desliga o timer do salvamento cancelado (o que ela pretendia) e mantém o do outro.
- **Verificação de cliente antiga (1.3.0):** a Dassault cria, a cada operação, uma verificação "o SOLIDWORKS ainda existe?" (`ENOIEFClientExistanceVerifier`, um `java.util.Timer` de 30 s, guardado na sessão em `MCAD_CLIENT_CHECK_TIMER`) e o cliente só avisa a mais recente. A de um salvamento cancelado não é encerrada: ~60 s depois ela conclui que o cliente sumiu, aborta o salvamento em andamento (caixa de erro em branco), limpa o cache da sessão e marca a operação como cancelada (o que reativa os timers órfãos). A classe interna `ENOIEFClientExistanceVerifier$ENOIEFExistanceVerifier` corrigida (gerada do `ENOIEFCmdManagers.jar` por `tool/PatchVerifier.java`, md5 em `IefCheckinModule.DASSAULT_MANAGERS_JAR_MD5`) chama `IefCheckinGuard.verifierTick` no início de `run()`: verificação que já não é a atual da sessão (outra a substituiu, ou a chave foi removida no fim normal de um salvamento posterior), em Ativo, se encerra sem agir; em Simulação, registra quando vai agir. A externa continua no jar (mesmo carregador: o autoteste confere o *nest host*).
- **Aviso próprio (1.2.0):** as execuções com gatilho `salvamento` não entram em "Falha do plugin": vão para o evento `salvamento_conector` ("Salvamento derrubado ou com erro"), num e-mail-resumo por ambiente a cada rodada do agendador.
- **Resumo:** evento a cada `resumoMinutos`.
- **Salvamento com erro no servidor:** vira execução em falha (gatilho `salvamento`, até `maxFalhasPorHora`), que entra no aviso "Falha do plugin".
- **Autoteste:** confere se a classe corrigida está carregada (`triel$execute`) e se o `ENOIEFCmdHandlers.jar` é o mesmo de onde ela foi gerada
  (md5 em `IefCheckinModule.DASSAULT_JAR_MD5`). Se um hotfix trocar o jar, o autoteste falha e o Portal avisa: nossa classe estaria por cima da
  nova. Nesse caso, remover a classe corrigida (abaixo) ou refazer a análise e gerar de novo no dev-plm.
- **Testes:** `tool/GuardTest.java` (modos, erro, cancelamento, aninhamento) e `tool/VerifyLoad.java` (verificação completa do bytecode, rodada pelo `build.sh`).

**Instalar (por nó, com reinício):**

```sh
W=/App/Tomee/Tomee3DSpace/webapps/3dspace/WEB-INF    # em produção: Tomee3DSpaceNode1 / Node2
tar xzf out/TrielIefCheckin-classes.tar.gz -C $W/classes --no-same-owner --no-overwrite-dir
cp out/TrielIefCheckin.jar $W/lib/
chown -R admintriel:admintriel $W/classes/br $W/classes/com/dassault_systems/MCADIntegration/server/handler/ENOIEFCheckinHandler.class \
  "$W/classes/com/dassault_systems/MCADIntegration/server/manager/ENOIEFClientExistanceVerifier\$ENOIEFExistanceVerifier.class" $W/lib/TrielIefCheckin.jar
```

**Remover (volta ao original da Dassault, com reinício):** apagar `$W/classes/com/dassault_systems/MCADIntegration/server/handler/ENOIEFCheckinHandler.class`, `$W/classes/com/dassault_systems/MCADIntegration/server/manager/ENOIEFClientExistanceVerifier$ENOIEFExistanceVerifier.class`,
`$W/classes/br/com/trielht/plm/ief/` e `$W/lib/TrielIefCheckin.jar`. Trocar o modo pelo Portal não precisa de reinício.

Migração `db/schema/0180_plugins_3dx_ief_checkin.sql` (TESTE nasce em Simulação, PRODUCAO em Desligado; gatilho `salvamento`).

## advanced-duplicate: Duplicação avançada

**Ação inicial (0.2.0).** O filtro lê a resposta de `POST /resources/lifecycle/expand/federated` só quando o pedido é de duplicação
(`"command":"duplicate"`) e ajusta o atributo `expand::defaultAction` de cada objeto, que a janela (`AdvancedView.js`) usa como ação inicial
da linha: principal → `acaoPrincipal` (padrão `duplicar_com_desenhos`, só para SOLIDWORKS/CATIA V5 com Duplicar entre as capacidades), demais →
`acaoFilhos` (padrão `reutilizar`, só se a capacidade existir e o objeto não "seguir o pai"). Simulação registra o que mudaria. Resposta
assíncrona, comprimida, acima de `maxBytes` ou fora do formato: sai como veio. Teste: `tool/RewriterTest.java`.

**Miniatura (0.3.0).** Passando o mouse no **Título** de uma linha aparece a imagem do item, a mesma do Comparador
(`/resources/compare/thumbnailUrl/{physicalId}`, da Dassault). Três endereços no filtro (`ThumbnailUi`), todos parados em Desligado:

| Endereço | O que o filtro faz |
|---|---|
| `GET /webapps/AdvancedView/AdvancedView.js` | Sai como veio + um carregador fixo de ~400 bytes no fim (ETag com `-trielN`, sem 304/Range para emendar) |
| `GET /webapps/TrielAdvancedDuplicate/miniatura.js` | Sem cache. Em Ativo com `miniatura` marcado: o código do balão (`resources/META-INF/triel-advanced-duplicate/miniatura.js`); senão, script vazio |
| `GET /webapps/TrielAdvancedDuplicate/evento?v=&m=` | Falha vista no navegador → evento "aviso" no Portal (até 3 por janela, 50 por dia por nó) |

- Em `/webapps/*` o `BypassAuthFilter` da Dassault repassa o pedido com `forward`; por isso o mapeamento do `web-fragment.xml` tem `FORWARD`.
- O `AdvancedView.js` fica em cache por 7 dias (`StaticContentCachingFilter2` no web.xml, navegador e proxy do 3DDashboard). O carregador
  não decide nada: quem decide é o `miniatura.js`, sem cache. Então ligar/desligar pelo Portal vale na hora, mas o carregador só chega a
  cada navegador quando o cache dele renovar (até 7 dias, ou Ctrl+F5). Para todos de uma vez: trocar `uwp.widgetCompiler.cache.version`
  no `uwp-config.properties` do 3DDashboard (reinício do 3DDashboard; vale para todos os widgets).
- O balão roda dentro de try/catch: qualquer erro esconde o balão e a janela segue a da Dassault. Só age na grade
  `.assemblyTreeListContainer` com `wux-identifier="duplicate"`, coluna 0 (Título), e acha o item por `getCellInfosFromHtmlElement`
  (`nodeModel.options.physicalId`). Endereço do 3DSpace via `i3DXCompassServices`.
- Parâmetros: `miniatura` (padrão **desmarcado**), `miniaturaAtrasoMs` (350), `miniaturaLargura` (200 px), `miniaturaTimeoutMs` (5000).
- Autoteste: `ExpandResponse#fromResultAsJSON`, `INode#getDefaultAction`, `CompareWebService#fetchThumbnailUrl` e os trechos do
  `AdvancedView.js` (`UI_MARKERS` para a ação inicial, `THUMB_MARKERS` para a miniatura; faltando, só a parte afetada fica de fora).

Migração `db/schema/0181_plugins_3dx_advanced_duplicate.sql` (TESTE nasce em Simulação, PRODUCAO em Desligado).
