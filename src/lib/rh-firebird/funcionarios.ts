import "server-only";

import { fbQuery } from "@/lib/database/firebird";
import { ValidationError } from "@/lib/auth/errors";
import { registrarChamadaExternaSemFalhar } from "@/lib/monitoramento/chamadas-externas";

export interface FuncionarioRh {
  codigo: string;
  nome: string;
  departamento: string | null;
  setor: string | null;
}

interface FuncionarioRhRow {
  /* FUN_COD é coluna numérica no Firebird -- o driver devolve number, não string, apesar do resto do sistema tratar "código" como texto (VARCHAR(30) no SQL Server). Sempre converter com String() antes de expor. */
  FUN_COD: number;
  FUN_DESC: string;
  DEPARTAMENTO: string | null;
  SETOR: string | null;
}

function formatarCpf(cpf: string | number | null): string | null {
  if (!cpf) return null;

  const digitos = String(cpf).padStart(11, "0").replace(/\D/g, "");
  if (digitos.length !== 11) return String(cpf);

  return `${digitos.substring(0, 3)}.${digitos.substring(3, 6)}.${digitos.substring(6, 9)}-${digitos.substring(9)}`;
}

/*
 * Qualquer erro de conexão/consulta contra o Firebird vira um
 * ValidationError com mensagem amigável — a integração com o RH é
 * "melhor esforço" do ponto de vista da tela (o formulário mostra um
 * aviso claro em vez de quebrar), nunca um 500 cru.
 */
function tratarErroFirebird(error: unknown): never {
  console.error("Erro na integração com o RH (Firebird):", error);
  throw new ValidationError(
    "Não foi possível consultar o sistema do RH agora. Tente novamente em instantes ou avise o administrador."
  );
}

/*
 * Adaptado da consulta antiga (GER_FUNCIONARIO + SP_GER_MOVFUNC +
 * SAU_DADOSFNC + GER_DPTO/GER_SET) -- removido o JOIN com
 * SP_RH_SALFUNC, que ali só servia de filtro de existência
 * (SL.MVSAL_CDEMP IS NOT NULL), nunca selecionava salário. Salário é
 * buscado à parte, só para o colaborador selecionado (ver
 * buscarDetalheAtualFuncionario) -- não faz sentido trazer salário de
 * todo mundo só para popular uma lista de busca.
 *
 * Pelo mesmo motivo, o CPF TAMBÉM não vem aqui: essa lista completa
 * de ativos (450+ pessoas) fica na memória do navegador de qualquer
 * usuário com permissão de criar solicitação, só para alimentar o
 * autocomplete -- expor o CPF de todo mundo nesse payload seria um
 * vazamento de dado sensível desnecessário, já que só o CPF do
 * colaborador efetivamente selecionado importa. Ele é buscado junto
 * com o salário (ver buscarDetalheAtualFuncionario), no mesmo momento.
 *
 * `codigoEmpresa` vem do cadastro do usuário que está pesquisando
 * (`portal_usuarios.codigo_empresa`) -- nunca fixo no código nem
 * global via .env, já que cada usuário só deve buscar dentro da
 * própria empresa. Quem chama (a rota) é responsável por barrar ANTES
 * de chegar aqui se o usuário não tiver empresa cadastrada.
 */
export async function listarFuncionariosAtivos(codigoEmpresa: string): Promise<FuncionarioRh[]> {
  const inicio = performance.now();
  let mensagemErro: string | null = null;

  try {
    const linhas = await fbQuery<FuncionarioRhRow>(`
      SELECT DISTINCT
          FUN.FUN_COD,
          FUN.FUN_DESC,
          DP.DEP_DESC AS DEPARTAMENTO,
          ST.SET_DESC AS SETOR
      FROM GER_FUNCIONARIO FUN
      LEFT JOIN SP_GER_MOVFUNC(FUN.FUN_CODEMP, FUN.FUN_COD, CURRENT_DATE) SP ON 1=1
      LEFT JOIN SAU_DADOSFNC FNC ON FNC.DDFNC_CODEMP = SP.MVFU_CODEMP AND FNC.DDFNC_SEQ = SP.MVFU_DDFNCSEQ
      LEFT JOIN GER_DPTO DP ON DP.DEP_CODEMP = FNC.DDFNC_CODEMP AND DP.DEP_COD = FNC.DDFNC_CODDEP
      LEFT JOIN GER_SET ST ON ST.SET_CODEMP = FNC.DDFNC_CODEMP AND ST.SET_CODDEP = FNC.DDFNC_CODDEP AND ST.SET_COD = FNC.DDFNC_CODSET
      WHERE FUN.FUN_SITU = 'A'
        AND FUN.FUN_CODEMP = ?
        AND SP.MVFU_CODEMP IS NOT NULL
      ORDER BY FUN.FUN_DESC
    `, [codigoEmpresa]);

    return linhas.map((linha) => ({
      codigo: String(linha.FUN_COD),
      nome: linha.FUN_DESC,
      departamento: linha.DEPARTAMENTO,
      setor: linha.SETOR,
    }));
  } catch (error) {
    mensagemErro = error instanceof Error ? error.message : "Erro desconhecido.";
    tratarErroFirebird(error);
  } finally {
    await registrarChamadaExternaSemFalhar({
      servico: "erp_rh_firebird",
      origem: "uso_real",
      sucesso: mensagemErro === null,
      duracaoMs: performance.now() - inicio,
      mensagemErro,
    });
  }
}

interface DetalheFuncionarioRow {
  /*
   * Confirmado ao vivo via `SELECT * FROM SP_RH_SALFUNC('2', <FUN_COD>,
   * CURRENT_DATE)`: a procedure devolve exatamente 1 linha por
   * colaborador para a data atual (testado com dois FUN_COD
   * diferentes), sempre com MVSAL_TPSAL=1 -- não há histórico
   * misturado para tratar aqui.
   */
  MVSAL_VLR: number | string | null;
  FUN_CPFNUM: string | number | null;
  DEPARTAMENTO: string | null;
  SETOR: string | null;
}

export interface DetalheAtualFuncionario {
  salarioAtual: number | null;
  cpf: string | null;
  /* Usados só server-side pra checar o escopo do usuário (ver escopo-colaboradores.ts) -- não precisa necessariamente ir pro cliente, já tem essa info na lista. */
  departamento: string | null;
  setor: string | null;
}

/*
 * Busca salário, cpf, depto e setor juntos, numa única consulta, só
 * para o colaborador já selecionado -- nunca para a lista inteira (ver
 * comentário em listarFuncionariosAtivos). Mesmo princípio de "dado
 * sensível só quando realmente precisa" aplicado às colunas. Depto/
 * setor aqui servem pra checar o escopo do usuário antes de devolver
 * salário/cpf -- ver uso em src/app/api/aprovacoes/rh/funcionarios/[codigo]/salario/route.ts.
 */
export async function buscarDetalheAtualFuncionario(
  codigo: string,
  codigoEmpresa: string
): Promise<DetalheAtualFuncionario> {
  const inicio = performance.now();
  let mensagemErro: string | null = null;

  try {
    const linhas = await fbQuery<DetalheFuncionarioRow>(`
      SELECT FIRST 1 SL.MVSAL_VLR, FUN.FUN_CPFNUM, DP.DEP_DESC AS DEPARTAMENTO, ST.SET_DESC AS SETOR
      FROM GER_FUNCIONARIO FUN
      LEFT JOIN SP_RH_SALFUNC(FUN.FUN_CODEMP, FUN.FUN_COD, CURRENT_DATE) SL ON 1=1
      LEFT JOIN SP_GER_MOVFUNC(FUN.FUN_CODEMP, FUN.FUN_COD, CURRENT_DATE) SP ON 1=1
      LEFT JOIN SAU_DADOSFNC FNC ON FNC.DDFNC_CODEMP = SP.MVFU_CODEMP AND FNC.DDFNC_SEQ = SP.MVFU_DDFNCSEQ
      LEFT JOIN GER_DPTO DP ON DP.DEP_CODEMP = FNC.DDFNC_CODEMP AND DP.DEP_COD = FNC.DDFNC_CODDEP
      LEFT JOIN GER_SET ST ON ST.SET_CODEMP = FNC.DDFNC_CODEMP AND ST.SET_CODDEP = FNC.DDFNC_CODDEP AND ST.SET_COD = FNC.DDFNC_CODSET
      WHERE FUN.FUN_COD = ?
        AND FUN.FUN_CODEMP = ?
        AND FUN.FUN_SITU = 'A'
    `, [codigo, codigoEmpresa]);

    const linha = linhas[0];
    const valor = linha?.MVSAL_VLR;
    return {
      salarioAtual: valor === null || valor === undefined ? null : Number(valor),
      cpf: formatarCpf(linha?.FUN_CPFNUM ?? null),
      departamento: linha?.DEPARTAMENTO ?? null,
      setor: linha?.SETOR ?? null,
    };
  } catch (error) {
    mensagemErro = error instanceof Error ? error.message : "Erro desconhecido.";
    tratarErroFirebird(error);
  } finally {
    await registrarChamadaExternaSemFalhar({
      servico: "erp_rh_firebird",
      origem: "uso_real",
      sucesso: mensagemErro === null,
      duracaoMs: performance.now() - inicio,
      mensagemErro,
    });
  }
}
