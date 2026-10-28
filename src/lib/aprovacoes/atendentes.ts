import "server-only";

import { listarTiposDasAlcadasDoUsuario } from "./alcadas/fluxo";
import { ehTipoAprovacao, type TipoAprovacao } from "./tipos-aprovacao";

/*
 * Quem decide o quê no painel de aprovações: estar em algum nível de
 * uma alçada ativa do tipo (Administração → Diretoria → Alçadas). É o
 * que monta as abas do painel e libera as rotas de decisão.
 *
 * Administrador NÃO decide tudo por padrão: sem estar numa alçada, não
 * vê fila nenhuma -- reajuste é dado sensível, nega por padrão.
 *
 * (A tabela portal_aprovacoes_atendentes, do antigo Sim/Não por tipo,
 * ficou no banco sem uso.)
 */
export async function listarTiposQueAtende(usuarioId: string): Promise<TipoAprovacao[]> {
  const tipos = await listarTiposDasAlcadasDoUsuario(usuarioId);
  return tipos.filter(ehTipoAprovacao);
}
