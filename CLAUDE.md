# Portal Triel-HT — instruções para trabalhar neste projeto

Portal corporativo interno (Next.js 16 App Router, React 19, TypeScript,
CSS Modules, SQL Server via `mssql`, autenticação via Active Directory).
Este arquivo reúne os padrões já estabelecidos no projeto — sempre que
for tocar em algo novo, comece checando se um padrão parecido já existe
aqui ou em código já pronto, em vez de inventar um novo jeito de fazer.

## Stack e configuração

- Next.js 16 (App Router), React 19, TypeScript, CSS Modules, Turbopack.
- `next.config.ts`: `reactCompiler: true`, `serverExternalPackages: ["mssql", "tedious"]`
  (esses dois quebram sob o bundling do Turbopack se não forem externos).
- Banco: SQL Server via `mssql`, pool singleton lazy em
  `src/lib/database/sql-server.ts` (`getSqlServerPool()`).
- Autenticação: Active Directory via `ldapts`, sessão em JWT (`jose`) num
  cookie httpOnly. `sub` do JWT é o `sam_account_name`, nunca o `id`.

## Modo escuro — obrigatório em tudo que for novo

Todo componente, página ou módulo novo **tem que** usar os tokens de cor
definidos em `src/app/globals.css`, nunca hexadecimais soltos para cor
estrutural (fundo, texto, borda). O sistema de temas resolve em 3
estados: sem atributo no `<html>` → decide por `prefers-color-scheme`
(preferência "sistema"); `data-theme="light"`/`"dark"` força um lado,
setado no layout raiz a partir da preferência salva em
`portal_usuarios.tema` (ver `src/lib/preferencias/preferencias.ts`).

Tokens disponíveis (todos com par claro/escuro já definidos):
- Superfícies: `--bg-page`, `--bg-surface`, `--bg-surface-soft`, `--bg-surface-muted`, `--bg-hover-brand`, `--bg-hover-neutral`.
- Bordas: `--border`, `--border-soft`, `--border-strong`, `--border-input`, `--border-input-hover`.
- Texto: `--text`, `--text-soft`, `--text-muted`, `--text-faint`, `--text-inverse` (sempre branco — usar em texto/ícone sobre fundo colorido, ex: botão vermelho).
- Marca: `--primary`, `--primary-hover`, `--primary-active`, `--primary-soft`, `--primary-soft-strong`, `--primary-soft-border`, `--primary-ring`.
- Status (cada um com `-border`, `-bg`, `-bg-strong`, `-text`): `--neutral-*`, `--info-*`, `--success-*`, `--warning-*`, `--danger-*` — é o que Badge/Alert/StatCard/Toast já usam por variant.
- Paleta de tags decorativas (10 cores, com `-dot`/`-bg`/`-text`/`-border` cada): `--tag-emerald-*`, `--tag-blue-*`, `--tag-purple-*`, `--tag-orange-*`, `--tag-cyan-*`, `--tag-rose-*`, `--tag-red-*`, `--tag-amber-*`, `--tag-slate-*`, `--tag-teal-*` (ver `src/lib/atualizacoes/cores-tag.ts` — aplicados via inline `style`, funciona porque CSS var resolve em qualquer contexto de propriedade CSS).
- `--overlay` (fundo de Modal/Drawer), `--tooltip-bg`/`--tooltip-text`, `--sidebar-gradient`.

Exceções deliberadas (não precisam de par claro/escuro):
- Elementos de marca sempre-vermelhos e fixos (gradiente da Sidebar,
  barra de loading do topo) — são identidade visual, não superfície de
  conteúdo.
- Cores de série de gráfico (recharts `<Cell fill="#hex">`) — já são
  saturadas o bastante para funcionar nos dois temas; não vale o esforço
  de tokenizar caso a caso.
- `box-shadow` com preto/cinza translúcido — funciona razoavelmente em
  ambos os temas sem ajuste.

Antes de publicar uma tela nova, teste visualmente em modo claro E
escuro (ou pelo menos revise o CSS procurando hex soltos com
`grep -rn "#[0-9a-fA-F]\{3,8\}"` no arquivo).

## Transição de tema

Troca de tema anima com efeito de "gota d'água" (círculo crescendo a
partir do ponto clicado) via View Transitions API nativa — ver
`src/lib/tema/aplicar-tema.ts`. Reaproveite `aplicarTemaComTransicao`
para qualquer novo controle que troque o tema; não implemente a troca
direto via `setAttribute` fora dali.

## Convenções de API

- Toda rota em `src/app/api/**/route.ts` começa com
  `export const runtime = "nodejs";` e `export const dynamic = "force-dynamic";`.
- Resposta sempre no formato `{ ok: boolean; message?: string; data?: T }`.
- Autenticação/autorização via helpers em `src/lib/auth/autorizacao.ts`:
  `requireAdminApi()`, `requireModuloAccess()`/`requireModuloAccessApi()`,
  ou o equivalente específico do módulo (ex:
  `requireAtendenteChamadosApi()` em `src/lib/chamados/`). Padrão:
  `const acesso = await requireAdminApi(); if (acesso.negado) return acesso.negado;`.
- Erros de validação lançam `ValidationError` (`src/lib/auth/errors.ts`)
  e a rota captura e devolve `{ ok:false, message }` com status 400.
  Nunca deixe uma validação de negócio virar um 500.
- Validação de entrada usa os helpers de `src/lib/auth/validation.ts`
  (`requiredText`, `optionalText`, `optionalBoolean`, `optionalInteger`,
  `isObject`) — não escreva checagem de tipo solta.
- Erros realmente não tratados (bugs, falhas de infra) são capturados
  automaticamente por `src/instrumentation.ts` (`onRequestError`) e
  gravados em `portal_logs`, sem precisar de try/catch manual extra
  para isso — só logue com `console.error` antes de devolver 500.

## Convenções de banco de dados

- Migrações em `db/schema/NNNN_descricao.sql`, numeradas
  sequencialmente, sempre:
  ```sql
  SET XACT_ABORT ON;
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'dbo.tabela', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.tabela (...);
  END;
  COMMIT TRANSACTION;
  ```
  Para `ALTER TABLE ADD coluna`, guarde com
  `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.tabela') AND name = 'coluna')`.
- `DEFAULT` vai **inline**, logo depois do tipo da coluna, dentro do
  `CREATE TABLE` (`CONSTRAINT DF_x_coluna DEFAULT valor`) — a sintaxe
  `DEFAULT valor FOR [coluna]` só é válida em `ALTER TABLE`, nunca
  dentro de `CREATE TABLE` (erro clássico: "Incorrect syntax near 'for'").
- IDs são `UNIQUEIDENTIFIER DEFAULT NEWID()`; datas são
  `DATETIME2 DEFAULT SYSDATETIME()`.
- Aplique a migração no banco real com
  `sqlcmd -S pdmserver -U sa -d PortalTrielHT -C -i db/schema/NNNN_arquivo.sql`
  (senha via `SQLCMDPASSWORD`, lida de `.env` — nunca exiba a senha no
  chat) e confirme com uma consulta em `INFORMATION_SCHEMA.COLUMNS`/
  `sys.indexes` logo em seguida. Nunca assuma que rodou certo sem
  conferir.
- **`db/schema/` é untracked pelo git e já sumiu (arquivos antigos,
  0001–0016) mais de uma vez nesta sessão** — o banco real em si nunca
  foi afetado, só os arquivos locais. Se notar arquivos de schema
  faltando, avise e confirme com o usuário antes de tentar reconstruir
  ou assumir que uma tabela não existe — sempre confira contra o banco
  de verdade via `sqlcmd`, não só pelos arquivos locais.
- Snapshot no momento da criação: quando um dado é "uma foto de como
  as coisas eram quando X aconteceu" (ex: `empresa` e
  `solicitante_departamento` em `portal_chamados`, copiados de
  `portal_usuarios` na hora de abrir o chamado), grave o valor na
  própria linha em vez de fazer JOIN ao vivo — preserva o histórico
  mesmo que o dado de origem mude depois.
- Teste qualquer query nova direto no banco com `sqlcmd` antes de (e
  depois de) confiar nela — insira dado de teste com um marcador óbvio
  no nome (ex: `'TESTE - ...'`), rode a consulta real, confirme o
  resultado, e sempre limpe com `DELETE ... WHERE` filtrado (nunca sem
  `WHERE`) verificando a contagem antes/depois.

## Convenções de UI (componentes em `src/components/ui/`)

- Cada componente vive em sua própria pasta com `Nome.tsx`,
  `Nome.module.css` e um `index.ts` reexportando (`export { Nome } from "./Nome";`).
- Reaproveite o que já existe antes de criar algo novo: `Card`, `Stack`,
  `FormGrid`, `Field`, `Input`/`Textarea`/`NumberInput`/`Dropdown`,
  `Table`/`TableHead`/`TableBody`/`TableRow`/`TableCell`/`TableHeaderCell`,
  `Modal`/`Drawer`, `ConfirmDialog`, `Toast`, `Badge`, `StatCard`,
  `EmptyState`, `Loader`, `Pagination`, `IconButton`, `Switch`,
  `Checkbox`, `RadioGroup`, `Breadcrumb`, `PageContainer`/`PageHeader`,
  `RichTextEditor`/`RichTextViewer`.
- `Card` com mais de uma seção de conteúdo **precisa** de um `<Stack gap={16}>`
  (ou 20) envolvendo os filhos — o `.content` do Card não tem gap
  próprio, então uma tabela seguida de paginação, ou um filtro seguido
  de um checkbox, ficam grudados sem isso.
- Ações destrutivas ou de impacto (excluir, revogar, importar em massa,
  marcar como público sem exigir login) sempre passam por
  `ConfirmDialog` antes de executar — nunca disparo direto no clique.
- Toggle de lista (ativo/inativo) usa `Switch` com `compact` quando
  está dentro de uma célula de tabela — sem `compact` o card do switch
  fica enorme dentro da célula.
- Busca em lista usa debounce de 400ms (estado "digitado" separado do
  estado "aplicado", `useEffect` com `setTimeout`) — nunca dispara uma
  requisição por tecla.
- Reordenação por arrasto usa `@dnd-kit` (`DndContext` + `SortableContext`
  + `useSortable`, ícone `GripVertical` como alça) com resync em caso de
  falha: aplica a ordem otimista na UI, salva em paralelo
  (`Promise.all`), e se qualquer chamada falhar, busca a lista real do
  servidor de novo em vez de deixar o estado local mentir.
- Menus/sidebars com "fecha ao clicar fora" usam
  `document.addEventListener("mousedown", ...)` num `ref` do contêiner,
  removido no cleanup do `useEffect`.
- `PageHeader` (título + subtítulo) sempre vem **antes** do `Breadcrumb`
  dentro do `PageContainer` — o título/contexto da página tem
  prioridade visual sobre a trilha de navegação, nunca o contrário.
  Vale para toda tela nova.
- Exceção deliberada: páginas mais antigas com hero totalmente
  customizado (BI, Atualizações, Downloads, Liberação de Projeto,
  Cadastro de Roteiro, Consulta de Estrutura, Revisão de Projeto,
  Terminal de Fábrica) não usam `PageContainer`/`PageHeader`/
  `Breadcrumb` — têm título/subtítulo próprios (`h1`/`p` dentro de um
  `.hero` com CSS module da própria página) e nenhuma trilha de
  navegação. Não retroalimente essas telas para o padrão novo sem
  pedido explícito — envolve redesenhar o topo de cada uma, não só
  reordenar componentes.

## Padrão de módulo (uma tela nova ligada a `portal_modulos`)

- `db/schema/` (tabela), `src/lib/<dominio>/<dominio>.ts` (acesso a
  dados, `import "server-only"`), tipos espelhados em
  `src/modules/<dominio>/types/`, serviço cliente em
  `src/modules/<dominio>/services/` (`fetch` + `parseResponse`),
  componente de página em `src/modules/<dominio>/components/`.
- Rotas de API em `src/app/api/<dominio>/**` (pública/autenticada) e
  `src/app/api/admin/<dominio>/**` (CRUD administrativo).
- Painel de administração fica em
  `src/modules/admin-permissoes/components/<Dominio>Painel.tsx`, com
  suas próprias funções em `adminPermissoes.service.ts` e uma entrada
  em `GRUPOS_NAVEGACAO`/`AdminPermissoesPage.tsx`.
- Nem toda tela nova precisa virar uma linha "visível" em
  `portal_modulos`: telas utilitárias de portal inteiro (Atualizações,
  Downloads, Wiki) ficam fora do sistema de permissão por módulo (não
  usam `requireModuloAccess`) e aparecem sempre no rodapé da Sidebar
  (ou condicionadas só a estar logado) — reserve o *card no catálogo*
  de `portal_modulos` para ferramentas de negócio ligadas a um setor.
- **Toda página registra acesso, sem exceção** — chame
  `registrarAcessoModuloSemFalhar(usuario.id, "<chave>")`
  (`src/lib/auth/acesso-modulo.ts`) no server component da página,
  logo após resolver o usuário autenticado. Esse registro depende de
  existir uma linha em `portal_modulos` com aquela `chave` (é um
  `INSERT...SELECT` que junta pela chave — sem a linha, o registro
  falha silenciosamente e nada é contado). Módulos de negócio ligados
  a um setor já têm essa linha de graça. Para tela utilitária de
  portal inteiro (Wiki e futuras), crie a linha só como âncora de
  contagem, **sem** vínculo em `portal_modulos_setores` — insira
  direto via `sqlcmd`, sem passar por `criarModulo`/admin UI, porque
  essa função exige pelo menos um setor e faria a tela virar um card
  duplicado no catálogo. Exemplo real: `chamados-abrir/consultar/
  atender/dashboard/meus` são linhas de `portal_modulos` ligadas ao
  setor "TI" (por isso aparecem como cards lá — Chamados quis
  aparecer no catálogo além do link fixo na Sidebar); já `wiki` é uma
  linha solta, sem setor, que existe só para a contagem de acesso.

## Verificação — sempre, antes de considerar algo pronto

1. `npx tsc --noEmit`
2. `npx eslint <arquivos tocados>`
3. `npx next build`
4. Se mexeu em banco: aplique a migração via `sqlcmd` e confirme against
   o banco real (nunca contra os arquivos locais só).
5. Teste ao vivo quando der: o servidor de dev do usuário costuma estar
   rodando na porta 3000 — o lock de `.next/dev/lock` é por projeto, não
   por porta, então **não adianta** tentar subir uma segunda instância
   em outra porta enquanto a dele estiver de pé. Nessas horas, confie em
   typecheck/lint/build + revisão cuidadosa do código, e seja
   transparente que não deu pra confirmar visualmente. Quando a porta
   3000 estiver livre, suba uma instância própria em 3001 e valide de
   verdade (Playwright com JWT forjado via `jose`, screenshot).
6. Nunca deixe dado de teste no banco — sempre limpe e confirme a
   contagem antes/depois.

## Coisas para nunca fazer

- Nunca commitar/mostrar segredos (`SQLCMDPASSWORD`, senha do AD) no
  chat além do necessário.
- Nunca usar `git push --force`, `reset --hard` ou similar sem
  confirmação explícita.
- Nunca usar `DELETE`/`UPDATE` sem `WHERE` contra o banco real.
- Nunca competir pelo lock do dev server do usuário.
- Nunca inventar uma abstração nova quando já existe um componente ou
  padrão pronto que resolve o mesmo problema — procure primeiro.
