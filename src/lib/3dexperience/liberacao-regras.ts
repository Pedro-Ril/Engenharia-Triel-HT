/*
 * Regras da liberação de desenhos em trabalho -- puras, sem 3DX nem
 * banco (testadas em liberacao-regras.test.ts). Quem chama a API e
 * grava o registro é liberacao-desenhos.ts.
 */

/* O que a explosão do 3DX devolve em cada nó (só o que interessa aqui). */
export interface NoEstrutura3DX {
  physicalId?: string;
  codigo?: string;
  revisao?: string;
  status?: string;
  descricao?: string;
  nivel?: number;
  circular?: boolean;
  children?: NoEstrutura3DX[];
}

export interface ItemEstrutura {
  physicalId: string;
  codigo: string;
  revisao: string | null;
  status: string | null;
  descricao: string | null;
  /* O nível mais fundo em que o item aparece (o pai é 0). */
  nivel: number;
}

export interface Desenho3DX {
  physicalId: string;
  id3DX?: string | null;
  titulo?: string | null;
  revisao?: string | null;
  status?: string | null;
  tipo?: string | null;
  policy?: string | null;
}

export interface DesenhoNaFila {
  desenho: Desenho3DX;
  item: ItemEstrutura;
}

export const STATUS_EM_TRABALHO = "IN_WORK";

function texto(valor: unknown): string | null {
  const t = typeof valor === "string" ? valor.trim() : "";
  return t ? t : null;
}

/*
 * Todos os itens da estrutura (o pai incluído), um por physicalId. Item
 * que aparece em mais de um ponto fica com o nível MAIS FUNDO -- é o que
 * garante a ordem de baixo para cima na liberação. Nó circular não desce.
 */
export function achatarEstrutura(raiz: NoEstrutura3DX): ItemEstrutura[] {
  const porId = new Map<string, ItemEstrutura>();

  function visitar(no: NoEstrutura3DX, nivel: number) {
    const physicalId = texto(no.physicalId);
    if (physicalId) {
      const atual = porId.get(physicalId);
      if (!atual) {
        porId.set(physicalId, {
          physicalId,
          codigo: texto(no.codigo) ?? physicalId,
          revisao: texto(no.revisao),
          status: texto(no.status),
          descricao: texto(no.descricao),
          nivel,
        });
      } else if (nivel > atual.nivel) {
        atual.nivel = nivel;
      }
    }
    if (no.circular) return;
    for (const filho of no.children ?? []) visitar(filho, nivel + 1);
  }

  visitar(raiz, 0);
  return [...porId.values()];
}

/*
 * Os desenhos da estrutura, um por physicalId (o mesmo desenho pode
 * estar ligado a mais de um item: fica o do item mais fundo), em ordem
 * de liberação: nível mais fundo primeiro, depois código e título.
 */
export function montarFila(
  itens: ItemEstrutura[],
  desenhosPorItem: Map<string, Desenho3DX[]>
): DesenhoNaFila[] {
  const porDesenho = new Map<string, DesenhoNaFila>();

  for (const item of itens) {
    for (const desenho of desenhosPorItem.get(item.physicalId) ?? []) {
      const atual = porDesenho.get(desenho.physicalId);
      if (!atual || item.nivel > atual.item.nivel) porDesenho.set(desenho.physicalId, { desenho, item });
    }
  }

  return [...porDesenho.values()].sort(
    (a, b) =>
      b.item.nivel - a.item.nivel ||
      a.item.codigo.localeCompare(b.item.codigo, "pt-BR", { numeric: true }) ||
      (a.desenho.titulo ?? "").localeCompare(b.desenho.titulo ?? "", "pt-BR", { numeric: true })
  );
}

export function emTrabalho(desenho: Pick<Desenho3DX, "status">): boolean {
  return (desenho.status ?? "").toUpperCase() === STATUS_EM_TRABALHO;
}

/* Um desenho já gravado na rodada, só com o que as regras abaixo olham. */
export interface DesenhoParaEscolha {
  desenhoPhysicalId: string;
  desenhoTitulo: string | null;
  itemCodigo: string | null;
  acao: string;
}

/*
 * O título do desenho deveria ser o código do item; diferente disso, a
 * linha alerta (ex.: "F0298804_novo" no 307748). Na tela vem desmarcado;
 * na liberação agendada fica de fora.
 */
export function tituloDiferenteDoItem(d: Pick<DesenhoParaEscolha, "desenhoTitulo" | "itemCodigo">): boolean {
  const titulo = (d.desenhoTitulo ?? "").trim().toUpperCase();
  const item = (d.itemCodigo ?? "").trim().toUpperCase();
  return Boolean(titulo && item && titulo !== item);
}

export interface EscolhaAutomatica<T extends DesenhoParaEscolha> {
  /* physicalIds a liberar, na ordem da simulação (de baixo para cima). */
  liberar: string[];
  /* Liberáveis que ficaram de fora por título diferente do item. */
  deFora: T[];
  /* Motivo para NÃO liberar nada (o usuário revisa na tela); null = pode seguir. */
  bloqueio: string | null;
}

/*
 * Liberação agendada: o que sai de uma simulação concluída sem ninguém
 * revisar. Libera tudo o que "seria liberado", menos título diferente do
 * item. Qualquer erro na simulação (busca de desenhos ou desenho com
 * erro) trava tudo: sem revisão humana, na dúvida não libera.
 */
export function escolherDesenhosAutomaticos<T extends DesenhoParaEscolha>(
  desenhos: T[],
  erroNaBusca: string | null
): EscolhaAutomatica<T> {
  const liberaveis = desenhos.filter((d) => d.acao === "seria_liberado");
  const deFora = liberaveis.filter(tituloDiferenteDoItem);
  const liberar = liberaveis.filter((d) => !tituloDiferenteDoItem(d)).map((d) => d.desenhoPhysicalId);
  const comErro = desenhos.filter((d) => d.acao === "erro").length;

  let bloqueio: string | null = null;
  if (erroNaBusca) bloqueio = "A busca de desenhos deu erro em algum item da estrutura.";
  else if (comErro > 0) bloqueio = `A simulação apontou erro em ${comErro} desenho(s).`;

  return { liberar: bloqueio ? [] : liberar, deFora, bloqueio };
}
