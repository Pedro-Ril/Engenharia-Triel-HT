# API de Pedidos de Compra para aprovação — Portal Triel-HT

Integração entre o **SupriConnect** (legado de suprimentos) e o **Painel de
Aprovações** do Portal Triel-HT.

O comprador escolhe no SupriConnect quais pedidos do Focco vão para
aprovação. O SupriConnect manda ao portal só a **chave de cada pedido**
(empresa + número). O portal busca o restante (fornecedor, itens, valores)
direto no ERP, a direção decide no portal, e o SupriConnect consulta as
decisões de volta.

```
Comprador ──► Frontend Envio E-mail ──► Backend SupriConnect ──► Portal (/api/externo/...)
                                              ▲                        │
                                              └──── decisões (GET) ────┘
```

> O frontend **nunca** chama o portal direto: a chave de API não pode ir
> para o navegador. O backend do SupriConnect é quem repassa.

---

## 1. Acesso

| Item | Valor |
|---|---|
| Base | `PORTAL_TRIEL_URL` (ex.: `http://<host-do-portal>`). O endereço é informado pelo Pedro. |
| Autenticação | Cabeçalho `X-Api-Key: <chave>` em **todas** as chamadas. |
| Onde nasce a chave | Portal → Administração → Diretoria → Configurações → Pedidos de Compra → **Gerar chave**. Ela aparece uma única vez; no portal fica só o hash. Gerar uma nova invalida a anterior na hora. |
| Onde guardar | `.env` do backend do SupriConnect, em `PORTAL_TRIEL_API_KEY`. Nunca no frontend nem no git. |
| Formato | JSON (`Content-Type: application/json`), UTF-8. |

Toda resposta tem o mesmo envelope:

```json
{ "ok": true,  "data": { ... } }
{ "ok": false, "message": "texto legível para mostrar ao usuário" }
```

| HTTP | Quando |
|---|---|
| 200 / 201 | Sucesso (201 = pelo menos um pedido entrou para aprovação). |
| 400 | Dado inválido. A `message` diz o quê; pode ser mostrada ao comprador. |
| 401 | `X-Api-Key` ausente ou errada. |
| 503 | Integração desligada no portal (nenhuma chave gerada, ou a chave foi revogada). |
| 500 | Falha interna do portal. Tente de novo mais tarde. |

### Identificação do pedido

| Campo | Significado | Valores |
|---|---|---|
| `empresa` | `empr_id` do Focco | `2` = Triel-HT, `30` = Usitec, `40` = Versátil |
| `numero` | `cod_pedc` do Focco | inteiro positivo |

Os dois campos aceitam número ou texto numérico (`2` ou `"2"`).

### Diretores (aprovadores) e escopo por empresa

Um diretor só recebe pedidos se, no portal:

1. estiver como **Sim** em *Pedidos de Compra* na aba Aprovadores; **e**
2. tiver a **empresa do pedido** marcada em Diretoria → Pedidos de Compra.

Diretor sem empresa marcada não aparece na lista e não recebe pedidos. O
diretor é identificado pelo **login do AD** (ex.: `fulano.silva`),
comparado sem diferenciar maiúsculas de minúsculas.

---

## 2. Endpoints

### 2.1 Listar diretores — `GET /api/externo/aprovacoes/pedidos-compra/aprovadores`

Monta a escolha do diretor na tela do comprador.

| Query | Obrigatório | Descrição |
|---|---|---|
| `empresa` | não | Traz só quem aprova aquela empresa. |

```bash
curl -H "X-Api-Key: $PORTAL_TRIEL_API_KEY" \
  "$PORTAL_TRIEL_URL/api/externo/aprovacoes/pedidos-compra/aprovadores?empresa=2"
```

```json
{
  "ok": true,
  "data": [
    {
      "login": "fulano.silva",
      "nome": "Fulano da Silva",
      "email": "fulano@trielht.com.br",
      "empresas": [{ "codigo": 2, "nome": "Triel-HT" }, { "codigo": 30, "nome": "Usitec" }]
    }
  ]
}
```

A lista pode vir **vazia** (ninguém cadastrado ainda). Nesse caso, esconda a
escolha ou envie sem diretor.

---

### 2.2 Enviar para aprovação — `POST /api/externo/aprovacoes/pedidos-compra`

```json
{
  "enviadoPor": "Nome do comprador",
  "observacao": "Texto livre opcional",
  "aprovador": "fulano.silva",
  "pedidos": [
    { "empresa": 2,  "numero": 123456 },
    { "empresa": 30, "numero": 789, "aprovador": "outro.diretor" }
  ]
}
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `pedidos` | sim | De 1 a **200** itens. Duplicatas na lista contam uma vez só. |
| `pedidos[].empresa` / `numero` | sim | Ver *Identificação do pedido*. |
| `pedidos[].aprovador` | não | Login do diretor só para este pedido; vale sobre o `aprovador` do envio. |
| `aprovador` | não | Login do diretor para todos os pedidos. Sem diretor, qualquer aprovador da empresa decide. |
| `enviadoPor` | não | Até 200 caracteres. Sem ele, aparece "SupriConnect" como solicitante. |
| `observacao` | não | Até 2000 caracteres. |

O envio é **tudo ou nada**: a resposta é 400 e **nada** é gravado quando:
- um diretor informado não é aprovador ou não aprova a empresa de um dos pedidos;
- um pedido **não existe no Focco**;
- um pedido está **cancelado no Focco**.

O portal consulta cada pedido no ERP no momento do envio e guarda uma foto
(fornecedor, comprador, emissão, valor total, situação), que a diretoria
usa para ver se o pedido mudou depois de enviado. Se o ERP estiver fora do
ar, o envio **segue sem a foto** (não trava o comprador). Conte com até
cerca de 1 s por pedido no envio; lotes grandes levam mais.

Exemplos de mensagens 400:
- `Não é aprovador de pedidos de compra no portal: fulano.x.`
- `O diretor escolhido não aprova pedidos desta empresa: 789 (Usitec) → Fulano da Silva.`
- `Envie no máximo 200 pedidos por vez.`
- `Pedido(s) não encontrado(s) no Focco: 104999 (Triel-HT).`
- `Pedido(s) cancelado(s) no Focco não podem ir para aprovação: 104718 (Triel-HT).`

Resposta **201** (entrou pelo menos um pedido) ou **200** (todos já estavam pendentes):

```json
{
  "ok": true,
  "data": {
    "numeroAprovacao": 12,
    "pedidos": [
      {
        "empresa": 2, "numero": 123456,
        "situacao": "criado",
        "aprovador": { "login": "fulano.silva", "nome": "Fulano da Silva", "email": "fulano@trielht.com.br" },
        "numeroAprovacao": 12
      },
      {
        "empresa": 30, "numero": 789,
        "situacao": "ja_pendente",
        "aprovador": null,
        "numeroAprovacao": 9
      }
    ]
  }
}
```

- `situacao: "criado"`: o pedido entrou agora, na aprovação `numeroAprovacao`.
- `situacao: "ja_pendente"`: o pedido já estava aguardando decisão (em
  `numeroAprovacao`). Não duplica e mantém o diretor do primeiro envio.
- `data.numeroAprovacao` é o lote criado neste envio, ou `null` se nada novo entrou.
- Os pedidos voltam na **mesma ordem** em que foram enviados.
- Um pedido já **decidido** que é reenviado abre uma pendência nova; o histórico da anterior é mantido.

---

### 2.3 Situação de um pedido — `GET /api/externo/aprovacoes/pedidos-compra/{empresa}/{numero}`

Mostra a situação do envio mais recente do pedido.

```json
{
  "ok": true,
  "data": {
    "empresa": 2,
    "numero": 123456,
    "situacao": "aprovado",
    "numeroAprovacao": 12,
    "aprovador": { "login": "fulano.silva", "nome": "Fulano da Silva", "email": "fulano@trielht.com.br" },
    "enviadoEm": "2026-10-26T08:45:40.2502968",
    "enviadoPor": "Nome do comprador",
    "decididoPor": "Fulano da Silva",
    "decididoEm": "2026-10-26T10:12:03.1187420",
    "comentario": "Ok, pode seguir.",
    "envios": 1
  }
}
```

| `situacao` | Significado |
|---|---|
| `nao_enviado` | O pedido nunca foi mandado ao portal (os demais campos vêm `null`, `envios` = 0). |
| `pendente` | Aguardando decisão. |
| `aprovado` / `reprovado` | Decidido. Veja `decididoPor`, `decididoEm` e `comentario`. |

`envios` é quantas vezes o pedido já foi mandado para aprovação.

---

### 2.4 Decisões desde a última consulta — `GET /api/externo/aprovacoes/pedidos-compra?desde=…&limite=…`

Para o backend do SupriConnect consultar de tempos em tempos (por exemplo,
junto da sincronização de 5 min) e atualizar o próprio banco.

| Query | Obrigatório | Descrição |
|---|---|---|
| `desde` | não | O `proximoDesde` da consulta anterior. Sem ele, começa das decisões mais antigas. |
| `limite` | não | De 1 a 500 (padrão 500). |

```json
{
  "ok": true,
  "data": {
    "pedidos": [ /* mesmo formato do 2.3, só aprovados/reprovados, do mais antigo para o mais novo */ ],
    "proximoDesde": "2026-10-26T10:12:03.1187420"
  }
}
```

Como usar:
1. Guarde o `proximoDesde` **exatamente como veio** (7 casas decimais) e mande-o como `desde` na próxima consulta.
2. Se `proximoDesde` vier `null`, nada mudou: mantenha o valor que já estava guardado.
3. Decisões tomadas no mesmo instante (aprovação em lote) vêm sempre juntas, mesmo que passem do `limite`. Por isso, nenhuma decisão se perde nem se repete.
4. As datas vêm sem fuso, no horário local do servidor de banco do portal.

---

## 3. Fluxo recomendado no SupriConnect

1. **Tela de pedidos:** o comprador marca os pedidos e clica em "Enviar para aprovação".
2. Opcionalmente escolhe o diretor, com a lista do 2.1 filtrada pela empresa.
3. O backend faz o POST do 2.2 e mostra o resultado de cada pedido: enviado (nº da aprovação), já pendente ou o erro da `message`.
4. **Sincronização:** a cada ciclo, o backend chama o 2.4 com o `desde` guardado e grava situação, decisor, data e comentário ao lado do pedido no Postgres.
5. A tela mostra uma coluna de situação com o que está no Postgres. O 2.3 serve para consulta pontual (por exemplo, botão "atualizar").

O SupriConnect **não grava nada no Focco** nesta etapa. Se a decisão
precisar voltar ao ERP, isso será definido depois.

---

## 4. Teste rápido

```bash
export PORTAL_TRIEL_URL=http://<host-do-portal>
export PORTAL_TRIEL_API_KEY=<chave gerada na administração>

# diretores
curl -s -H "X-Api-Key: $PORTAL_TRIEL_API_KEY" "$PORTAL_TRIEL_URL/api/externo/aprovacoes/pedidos-compra/aprovadores"

# enviar
curl -s -X POST -H "X-Api-Key: $PORTAL_TRIEL_API_KEY" -H "Content-Type: application/json" \
  -d '{"enviadoPor":"Teste","pedidos":[{"empresa":2,"numero":123456}]}' \
  "$PORTAL_TRIEL_URL/api/externo/aprovacoes/pedidos-compra"

# situação
curl -s -H "X-Api-Key: $PORTAL_TRIEL_API_KEY" "$PORTAL_TRIEL_URL/api/externo/aprovacoes/pedidos-compra/2/123456"

# decisões
curl -s -H "X-Api-Key: $PORTAL_TRIEL_API_KEY" "$PORTAL_TRIEL_URL/api/externo/aprovacoes/pedidos-compra?desde=2026-10-26T00:00:00"
```

Os testes com dados reais devem ser combinados com o Pedro. Pedidos enviados
aparecem para a diretoria no Painel de Aprovações.
