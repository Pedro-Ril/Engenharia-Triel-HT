/*
 * Catálogo das rotas avulsas: endpoints chamados por outros sistemas, sem
 * login no Portal, com token próprio de cada rota. Fica em código (não no
 * banco) porque cada rota nova exige código novo de qualquer forma; o banco
 * guarda só o liga/desliga, os limites e a configuração de cada uma
 * (portal_rotas_avulsas). Sem "server-only": a administração usa este
 * catálogo para montar o submenu de cada rota.
 */
export interface RotaAvulsaCatalogo {
  chave: string;
  nome: string;
  descricao: string;
  /* Endpoints que a rota expõe, para a aba "Como usar" e os logs. */
  endpoints: { metodo: "GET" | "POST"; caminho: string; resumo: string }[];
}

export const ROTAS_AVULSAS: RotaAvulsaCatalogo[] = [
  {
    chave: "impressao-pdf",
    nome: "Impressão de PDF",
    descricao:
      "Recebe um PDF de outro sistema e manda imprimir direto na impressora pela rede (IPP), sem passar pelo Windows.",
    endpoints: [
      { metodo: "POST", caminho: "/api/externo/impressao/pdf", resumo: "Envia um PDF para imprimir." },
      { metodo: "GET", caminho: "/api/externo/impressao/trabalhos/{id}", resumo: "Consulta a situação de uma impressão." },
    ],
  },
];

export function buscarRotaCatalogo(chave: string): RotaAvulsaCatalogo | null {
  return ROTAS_AVULSAS.find((rota) => rota.chave === chave) ?? null;
}
