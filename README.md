# Engenharia Triel-HT

Sistema web interno desenvolvido para apoio às rotinas da engenharia, com foco em consulta visual de estrutura de produto e fluxo de liberação de projeto.

O projeto foi construído com **Next.js + React + TypeScript**, seguindo um padrão visual interno baseado em cards, painéis e módulos administrativos, buscando manter consistência entre as telas do sistema.

---

# Objetivo do projeto

Este projeto foi criado para centralizar funcionalidades importantes da engenharia em uma interface web moderna, organizada e de fácil manutenção.

Atualmente o sistema contempla dois módulos principais:

- Consulta de Estrutura de Produto
- Liberação de Projeto

A proposta é permitir que o usuário tenha uma experiência padronizada, com navegação simples, visualização clara dos dados e integração com APIs internas.

---

# Tecnologias utilizadas

O projeto foi desenvolvido com as seguintes tecnologias.

## Frontend

- Next.js
- React
- TypeScript
- CSS Modules

## Exportações

- xlsx → geração de arquivos Excel
- jspdf → geração de PDF
- jspdf-autotable → criação de tabelas em PDF

## Integração

- consumo de APIs REST internas
- comunicação com serviços backend já existentes

---

# Principais funcionalidades

## Consulta de Estrutura de Produto

Tela para consulta da estrutura de produto em formato de árvore, com navegação visual por níveis.

### Recursos implementados

- consulta por código do item pai
- montagem da estrutura em formato hierárquico
- exibição visual em árvore
- exibição de detalhes do nó selecionado
- destaque visual para itens inativos ou inválidos
- filtro para exibir somente itens inativos
- contador de:
  - total de filhos do próximo nível
  - quantidade de filhos inativos no próximo nível
- exportação da estrutura em:
  - Excel
  - PDF
- exportação da:
  - estrutura completa
  - somente itens inativos
- suporte a abertura automática via URL com parâmetro

```
?itemPai=CODIGO
```

- preenchimento automático do campo de consulta
- execução automática da busca quando o código vier pela URL

### API utilizada

```
http://proserver.trielht.com.br:1000/api/estrutura/COD_PAI
```

---

# Liberação de Projeto

Tela para preenchimento e envio de e-mail de liberação de projeto.

### Recursos implementados

- carregamento dinâmico de:
  - nomes
  - clientes
- autocomplete para busca de clientes
- validação de campos obrigatórios
- envio de e-mail via API
- limpeza do formulário
- mensagens de sucesso e erro
- modal de confirmação antes do envio
- fluxo opcional para consulta da estrutura antes do envio

---

# Fluxo de verificação da estrutura antes do envio

Ao clicar em **Enviar E-mail**, o sistema pergunta ao usuário se ele deseja consultar a estrutura do item liberado antes do envio.

## Se o usuário optar por consultar

O sistema:

1. lê o valor informado em **Código CJ Geral**
2. abre uma nova guia na tela de **Consulta de Estrutura de Produto**
3. preenche automaticamente o campo **Código do item pai**
4. dispara automaticamente a consulta
5. retorna ao fluxo de confirmação:

```
Realizar envio?
```

Se o usuário clicar:

- **Sim** → envia o e-mail
- **Não** → fecha o modal

## Se o usuário optar por não consultar

O envio do e-mail é realizado normalmente.

---

# Estrutura de pastas

A estrutura principal do projeto segue este padrão.

```
src/
  app/
    consulta-estrutura/
      page.tsx
      estrutura-produto.module.css

    liberacao-projeto/
      page.tsx
      page.module.css

  modules/
    consulta-estrutura/
      components/
        EstruturaTree.tsx
      services/
        estruturaProduto.service.ts
        exportEstrutura.ts
      types/
        estruturaProduto.types.ts

    liberacao-projeto/
      liberacaoProjeto.service.ts
      liberacaoProjeto.types.ts
```

### Organização

- **app/** → páginas e estilos das rotas
- **modules/** → regras de negócio, serviços, componentes e tipagens
- **services/** → consumo de APIs e exportações
- **types/** → contratos TypeScript
- **components/** → componentes reutilizáveis

---

# Como rodar o projeto

## 1. Clonar o repositório

```bash
git clone https://github.com/Pedro-Ril/Engenharia-Triel-HT.git
```

---

## 2. Acessar a pasta do projeto

```bash
cd Engenharia-Triel-HT
```

---

## 3. Instalar as dependências

```bash
npm install
```

---

## 4. Rodar em ambiente de desenvolvimento

```bash
npm run dev
```

---

## 5. Abrir no navegador

```
http://localhost:3000
```

---

# Scripts disponíveis

## Desenvolvimento

```bash
npm run dev
```

Inicia o projeto em modo de desenvolvimento.

---

## Build de produção

```bash
npm run build
```

Gera a build de produção do projeto.

---

## Executar produção

```bash
npm run start
```

Executa a aplicação já compilada.

---

## Lint

```bash
npm run lint
```

Executa a validação de código.

---

# Dependências importantes

Além das dependências padrão do Next.js, o projeto utiliza bibliotecas adicionais para exportação.

```bash
npm install xlsx jspdf jspdf-autotable
```

---

# Padrão visual adotado

O projeto segue um padrão visual com:

- fundo claro
- cards brancos com bordas suaves
- destaque em vermelho institucional
- cabeçalhos padronizados
- resumos em cards
- painéis principais bem organizados
- formulários consistentes
- feedback visual de sucesso e erro
- foco em legibilidade

A intenção é manter as telas com aparência uniforme, evitando que cada módulo pareça um sistema diferente.

---

# Fluxo da tela de Consulta de Estrutura

## Entrada

O usuário informa o código do item pai.

## Processamento

A aplicação:

1. chama a API de estrutura
2. recebe os dados em formato plano
3. reorganiza os dados em formato de árvore usando o campo `CAMINHO_ESTRUTURA`

## Saída

A tela exibe:

- árvore hierárquica
- contadores por nível
- destaque de itens inválidos
- detalhes do nó selecionado
- opções de exportação

---

# Fluxo da tela de Liberação de Projeto

## Entrada

O usuário preenche:

- nome
- cliente
- ordem
- dados complementares

## Antes do envio

O sistema abre um modal perguntando se deseja consultar a estrutura do item liberado.

## Saída

Dependendo da escolha:

- consulta a estrutura antes do envio
- ou envia diretamente

---

# Exportações

A tela de estrutura permite exportar os dados em dois formatos.

## Excel

Exporta:

- nível
- item
- descrição
- quantidade
- status
- data início
- data fim

---

## PDF

Exporta:

- nível
- item
- descrição
- quantidade
- status
- data início
- data fim

O PDF utiliza cabeçalho em vermelho e mantém a hierarquia visual por indentação do item.

---

# Integrações atuais

## Estrutura de Produto

API:

```
http://proserver.trielht.com.br:1000/api/estrutura/invalida/COD_PAI
```

---

## Liberação de Projeto

Utiliza serviços internos para:

- buscar nomes
- buscar clientes
- enviar e-mail

As URLs das APIs ficam centralizadas nos arquivos de **service**, facilitando manutenção futura.

---

# Observações importantes

- o projeto depende de APIs internas disponíveis na rede da empresa
- sem acesso às APIs, parte das funcionalidades não irá responder corretamente
- a tela de consulta de estrutura suporta abertura direta por parâmetro de URL
- a exportação reflete o estado atual da tela

estrutura completa ou somente itens inativos.

---

# Melhorias futuras sugeridas

- padronização de layout compartilhado entre módulos
- criação de componentes reutilizáveis
- loading mais visual
- filtros adicionais na estrutura
- destaque de registros repetidos
- logs de envio na liberação de projeto
- permissões por perfil de usuário

---

# Público-alvo

Sistema voltado para uso interno da equipe de engenharia e áreas relacionadas, com foco em agilidade operacional, validação de estrutura e apoio ao fluxo de liberação de projeto.

---

# Autor

Desenvolvido pela equipe de TI Triel-HT.