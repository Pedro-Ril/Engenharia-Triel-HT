"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Autocomplete, type AutocompleteOption } from "@/components/ui/Autocomplete";
import { Dropdown } from "@/components/ui/Dropdown";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";

import { buscarFuncionariosRh } from "../services/aprovacoes.service";
import type { FuncionarioRh } from "../types/aprovacoes.types";

interface AdicionarColaboradorFieldProps {
  codigosJaAdicionados: string[];
  onAdicionar: (funcionario: FuncionarioRh) => void;
  disabled?: boolean;
}

/*
 * Busca a lista inteira de colaboradores ativos uma vez (mesmo formato
 * do GET antigo -- sem parâmetro, filtra depois) e alimenta o
 * Autocomplete genérico já existente. Diferente do campo antigo (que
 * substituía um único selecionado), este ADICIONA cada escolha à
 * tabela do formulário -- por isso remonta o Autocomplete (via `key`)
 * a cada adição, pra limpar o texto digitado e ficar pronto pra
 * próxima busca, e sempre exclui quem já foi adicionado das opções.
 */
export function AdicionarColaboradorField({
  codigosJaAdicionados,
  onAdicionar,
  disabled,
}: AdicionarColaboradorFieldProps) {
  const [funcionarios, setFuncionarios] = useState<FuncionarioRh[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [setorFiltro, setSetorFiltro] = useState("");
  const [chaveCampo, setChaveCampo] = useState(0);

  useEffect(() => {
    buscarFuncionariosRh().then((resultado) => {
      if (resultado.ok && resultado.data) {
        setFuncionarios(resultado.data);
      } else {
        setErro(resultado.message ?? "Não foi possível carregar os colaboradores do RH.");
      }
      setCarregando(false);
    });
  }, []);

  const opcoesSetor = useMemo(() => {
    const unicos = new Set<string>();
    for (const funcionario of funcionarios) {
      if (funcionario.setor) unicos.add(funcionario.setor);
    }
    return [
      { value: "", label: "Todos os setores" },
      ...[...unicos].sort((a, b) => a.localeCompare(b, "pt-BR")).map((setor) => ({ value: setor, label: setor })),
    ];
  }, [funcionarios]);

  const opcoes = useMemo<AutocompleteOption[]>(() => {
    const jaAdicionados = new Set(codigosJaAdicionados);
    return funcionarios
      .filter((funcionario) => !jaAdicionados.has(funcionario.codigo))
      .filter((funcionario) => !setorFiltro || funcionario.setor === setorFiltro)
      .map((funcionario) => ({
        value: funcionario.codigo,
        label: `${funcionario.nome}${funcionario.departamento ? ` — ${funcionario.departamento}` : ""}`,
      }));
  }, [funcionarios, codigosJaAdicionados, setorFiltro]);

  function handleSelect(opcao: AutocompleteOption | null) {
    if (!opcao) return;

    const funcionario = funcionarios.find((item) => item.codigo === opcao.value);
    if (!funcionario) return;

    onAdicionar(funcionario);
    setChaveCampo((atual) => atual + 1);
  }

  if (erro) {
    return <p style={{ color: "var(--danger-text)" }}>{erro}</p>;
  }

  if (carregando) {
    return <Loader label="Carregando colaboradores..." />;
  }

  /*
   * Lista vazia depois de carregar (sem erro) significa que o escopo
   * do usuário nega tudo (nenhuma unidade liberada) -- não é "a busca
   * não achou nada", é "você não tem permissão pra ver ninguém". Mensagem
   * diferente da genérica do Autocomplete pra não parecer bug.
   */
  if (funcionarios.length === 0) {
    return (
      <Alert variant="warning">
        Você não tem permissão para ver nenhum colaborador. Peça a um administrador para liberar seu
        acesso em Administração → Diretoria → Reajuste Salarial.
      </Alert>
    );
  }

  return (
    <Stack direction="row" gap={12} wrap>
      <div style={{ minWidth: 200 }}>
        <Dropdown value={setorFiltro} options={opcoesSetor} onValueChange={setSetorFiltro} disabled={disabled} />
      </div>
      <div style={{ flex: 1, minWidth: 260 }}>
        <Autocomplete
          key={chaveCampo}
          options={opcoes}
          onSelect={handleSelect}
          placeholder="Digite o nome do colaborador para adicionar"
          disabled={disabled}
          maxOptions={30}
        />
      </div>
    </Stack>
  );
}
