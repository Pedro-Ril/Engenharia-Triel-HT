# API de Pedidos de Compra para aprovação — Portal Triel-HT

Integração entre o **SupriConnect** (legado de suprimentos) e o **Painel de
Aprovações** do Portal Triel-HT.

O comprador escolhe no SupriConnect quais pedidos do Focco vão para
aprovação. O SupriConnect manda ao portal só a **chave de cada pedido**
(empresa + número). O portal confere o pedido no ERP, passa-o pela **alçada
de aprovação** da empresa, e o SupriConnect consulta as decisões de volta.

```
Comprador ──► Frontend Envio E-mail ──► Backend SupriConnect ──► Portal (/api/externo/...)
                                              ▲                        │
                                              └──── decisões (GET) ────┘
```

> O frontend **nunca** chama o portal direto: a chave de API não pode ir
> para o navegador. O backend do SupriConnect é quem repassa.

> **Mudança (alçadas):** quem aprova não é mais um diretor escolhido no
> envio, e sim a **alçada da empresa**: uma cadeia de níveis configurada no
> portal (Administração → Diretoria → Alçadas). O pedido passa por todos os
> níveis, em ordem; em cada nível basta uma pessoa aprovar. Qualquer nível
> pode **devolver** o pedido ao comprador, que ajusta e reenvia — recomeça
> do nível 1. A situação `reprovado` deixou de existir para pedidos novos:
> a negativa agora é `devolvido`.

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
| 400 | Dado inválido ou envio recusado. A `message` diz o quê; pode ser mostrada ao comprador. |
| 401 | `X-Api-Key` ausente ou errada. |
| 503 | Integração desligada no portal (nenhuma chave gerada, ou a chave foi revogada). |
| 500 | Falha interna do portal. Tente de novo mais tarde. |

### Identificação do pedido

| Campo | Significado | Valores |
|---|---|---|
| `empresa` | `empr_id` do Focco | `2` = Triel-HT, `30` = Usitec, `40` = Versátil |
| `numero` | `cod_pedc` do Focco | inteiro positivo |

Os dois campos aceitam número ou texto numérico (`2` ou `"2"`).

---

## 2. Endpoints

### 2.1 Enviar para aprovação — `POST /api/externo/aprovacoes/pedidos-compra`

```json
{
  "enviadoPor": "Nome do comprador",
  "observacao": "Texto livre opcional",
  "pedidos": [
    { "empresa": 2,  "numero": 123456 },
    { "empresa": 30, "numero": 789 }
  ]
}
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `pedidos` | sim | De 1 a **200** itens. Duplicatas na lista contam uma vez só. |
| `pedidos[].empresa` / `numero` | sim | Ver *Identificação do pedido*. |
| `enviadoPor` | não | Até 200 caracteres. Sem ele, aparece "SupriConnect" como solicitante. |
| `observacao` | não | Até 2000 caracteres. |
| `aprovador`, `pedidos[].aprovador` | — | **Descontinuados.** Ainda são aceitos, mas não têm efeito: quem decide é a alçada. |

O envio é **tudo ou nada**: a resposta é 400 e **nada** é gravado quando:
- um pedido **não existe no Focco**;
- um pedido está **cancelado no Focco**;
- **não há alçada** de aprovação configurada para a empresa de algum pedido (ou um nível dela está sem aprovador).

Exemplos de mensagens 400:
- `Pedido(s) não encontrado(s) no Focco: 104999 (Triel-HT).`
- `Pedido(s) cancelado(s) no Focco não podem ir para aprovação: 104718 (Triel-HT).`
- `Não há alçada de aprovação configurada para esta solicitação (Usitec).`
- `Envie no máximo 200 pedidos por vez.`

O portal consulta cada pedido no ERP no momento do envio e guarda uma foto
(fornecedor, comprador, emissão, valor total, situação), que a aprovação
usa para ver se o pedido mudou depois de enviado. Se o ERP estiver fora do
ar, o envio **segue sem a foto** (não trava o comprador). Conte com até
cerca de 1 s por pedido no envio; use **60 s** de tempo limite.

Resposta **201** (entrou pelo menos um pedido) ou **200** (todos já estavam pendentes):

```json
{
  "ok": true,
  "data": {
    "numeroAprovacao": 12,
    "pedidos": [
      { "empresa": 2, "numero": 123456, "situacao": "criado", "aprovador": null, "numeroAprovacao": 12 },
      { "empresa": 30, "numero": 789, "situacao": "ja_pendente", "aprovador": null, "numeroAprovacao": 9 }
    ]
  }
}
```

- `situacao: "criado"`: o pedido entrou agora, no nível 1 da alçada, na aprovação `numeroAprovacao`.
- `situacao: "ja_pendente"`: o pedido já estava em aprovação (em `numeroAprovacao`). Não duplica.
- **Reenvio de pedido devolvido** (ou já decidido): é o mesmo POST. Abre uma **aprovação nova** (`numeroAprovacao` maior) e recomeça do nível 1. O histórico da anterior fica no portal.
- `data.numeroAprovacao` é o lote criado neste envio, ou `null` se nada novo entrou.
- Os pedidos voltam na **mesma ordem** em que foram enviados.
- `aprovador` vem sempre `null` (campo mantido só para não quebrar quem lê).

---

### 2.2 Situação de um pedido — `GET /api/externo/aprovacoes/pedidos-compra/{empresa}/{numero}`

Mostra a situação do envio mais recente do pedido.

```json
{
  "ok": true,
  "data": {
    "empresa": 2,
    "numero": 123456,
    "situacao": "pendente",
    "numeroAprovacao": 12,
    "nivelAtual": { "ordem": 2, "total": 3, "nome": "Diretoria", "direcionadoPara": "Darlan Dalla Roza" },
    "aprovador": null,
    "enviadoEm": "2026-10-26T08:45:40.2502968",
    "enviadoPor": "Nome do comprador",
    "decididoPor": null,
    "decididoEm": null,
    "comentario": null,
    "envios": 1
  }
}
```

| `situacao` | Significado |
|---|---|
| `nao_enviado` | O pedido nunca foi mandado ao portal (os demais campos vêm `null`, `envios` = 0). |
| `pendente` | Em aprovação. `nivelAtual` diz em que nível está ("Nível 2 de 3 · Diretoria"). |
| `aprovado` | Aprovado por **todos** os níveis. `decididoPor`/`decididoEm` = quem aprovou o último nível. |
| `devolvido` | Algum nível devolveu ao comprador. `decididoPor` = quem devolveu, `comentario` = **o motivo** (sempre preenchido). O comprador ajusta e reenvia pelo 2.1. |
| `reprovado` | Só em pedidos decididos antes das alçadas. |

`nivelAtual` só vem preenchido quando `situacao` é `pendente`; nos demais casos é `null`.

`nivelAtual.direcionadoPara`: quando quem aprovou o nível anterior direcionou o
pedido a uma pessoa do nível atual (só ela vê e decide), o nome dela; `null` =
qualquer pessoa do nível pode decidir. Campo informativo — o legado não precisa
fazer nada com ele.
`envios` é quantas vezes o pedido já foi mandado para aprovação.

---

### 2.3 Decisões desde a última consulta — `GET /api/externo/aprovacoes/pedidos-compra?desde=…&limite=…`

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
    "pedidos": [ /* mesmo formato do 2.2: aprovados e devolvidos, do mais antigo para o mais novo */ ],
    "proximoDesde": "2026-10-26T10:12:03.1187420"
  }
}
```

Entram aqui só as decisões que **terminam a cadeia**: `aprovado` (último
nível aprovou) e `devolvido` (algum nível devolveu). Subir de um nível para
o outro não é decisão final — acompanhe pelo 2.2 (`nivelAtual`) se quiser
mostrar o andamento.

Como usar:
1. Guarde o `proximoDesde` **exatamente como veio** (7 casas decimais) e mande-o como `desde` na próxima consulta.
2. Se `proximoDesde` vier `null`, nada mudou: mantenha o valor que já estava guardado.
3. Decisões tomadas no mesmo instante (decisão em lote) vêm sempre juntas, mesmo que passem do `limite`. Por isso, nenhuma decisão se perde nem se repete.
4. Aplique a decisão só se `numeroAprovacao` for **maior ou igual** ao que você tem gravado para o pedido — um reenvio cria aprovação nova, com número maior.
5. As datas vêm sem fuso, no horário local do servidor de banco do portal.

---

### 2.4 Listar diretores — `GET /api/externo/aprovacoes/pedidos-compra/aprovadores` (descontinuado)

Responde sempre `{ "ok": true, "data": [] }`. Mantido só para a tela antiga
esconder a escolha de diretor sem quebrar. **Pode remover a chamada.**

---

## 3. Fluxo recomendado no SupriConnect

1. **Tela de pedidos:** o comprador marca os pedidos e clica em "Enviar para aprovação". **Não há mais escolha de diretor.**
2. O backend faz o POST do 2.1 e mostra o resultado de cada pedido: enviado (nº da aprovação), já em aprovação, ou o erro da `message`.
3. **Sincronização:** a cada ciclo, o backend chama o 2.3 com o `desde` guardado e grava situação, decisor, data e comentário ao lado do pedido no Postgres.
4. A coluna de situação mostra: **Em aprovação** (com o nível, se buscar pelo 2.2), **Aprovado** e **Devolvido**.
5. **Devolvido:** mostre o **motivo** (`comentario`) e quem devolveu, e ofereça **"Reenviar"** — que é o mesmo POST do 2.1. O pedido volta como `criado`, com aprovação nova, no nível 1.

O SupriConnect **não grava nada no Focco** nesta etapa. Se a decisão
precisar voltar ao ERP, isso será definido depois.

---

## 4. Teste rápido

```bash
export PORTAL_TRIEL_URL=http://<host-do-portal>
export PORTAL_TRIEL_API_KEY=<chave gerada na administração>

# enviar (ou reenviar um devolvido)
curl -s -X POST -H "X-Api-Key: $PORTAL_TRIEL_API_KEY" -H "Content-Type: application/json" \
  -d '{"enviadoPor":"Teste","pedidos":[{"empresa":2,"numero":123456}]}' \
  "$PORTAL_TRIEL_URL/api/externo/aprovacoes/pedidos-compra"

# situação (com o nível atual)
curl -s -H "X-Api-Key: $PORTAL_TRIEL_API_KEY" "$PORTAL_TRIEL_URL/api/externo/aprovacoes/pedidos-compra/2/123456"

# decisões finais (aprovados e devolvidos)
curl -s -H "X-Api-Key: $PORTAL_TRIEL_API_KEY" "$PORTAL_TRIEL_URL/api/externo/aprovacoes/pedidos-compra?desde=2026-10-26T00:00:00"
```

Os testes com dados reais devem ser combinados com o Pedro. Pedidos enviados
aparecem para o nível 1 da alçada da empresa no Painel de Aprovações.
