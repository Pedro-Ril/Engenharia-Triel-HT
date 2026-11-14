"use client";

import { useEffect, useState } from "react";
import { Search, UserMinus, UserPlus } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";

import {
  buscarPessoas,
  compartilharPagina,
  listarCompartilhamentos,
  removerCompartilhamento,
} from "../services/blocoNotas.service";
import type { Compartilhamento, PessoaParaCompartilhar } from "../types/blocoNotas.types";
import { tituloOuPadrao } from "../utils/arvore";
import styles from "./BlocoNotas.module.css";

const ESPERA_BUSCA_MS = 400;

const OPCOES_PERMISSAO = [
  { value: "editar", label: "Pode editar" },
  { value: "ver", label: "Só ver" },
];

interface CompartilharModalProps {
  paginaId: string;
  titulo: string;
  onFechar: () => void;
  /* A lista mudou (para o ícone na árvore e para ligar/desligar a edição ao vivo). */
  onMudou: (lista: Compartilhamento[]) => void;
}

export function CompartilharModal({ paginaId, titulo, onFechar, onMudou }: CompartilharModalProps) {
  const [lista, setLista] = useState<Compartilhamento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [permissaoNova, setPermissaoNova] = useState<"ver" | "editar">("editar");
  const [termoDigitado, setTermoDigitado] = useState("");
  const [termo, setTermo] = useState("");
  const [pessoas, setPessoas] = useState<PessoaParaCompartilhar[] | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [remover, setRemover] = useState<Compartilhamento | null>(null);
  const [removendo, setRemovendo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    listarCompartilhamentos(paginaId).then((resultado) => {
      if (cancelado) return;
      if (resultado.ok && resultado.data) setLista(resultado.data);
      else setErro(resultado.message ?? "Não foi possível carregar com quem a página está compartilhada.");
    });
    return () => {
      cancelado = true;
    };
  }, [paginaId]);

  /* Busca de pessoas com espera de 400 ms. */
  useEffect(() => {
    const temporizador = setTimeout(() => setTermo(termoDigitado.trim()), ESPERA_BUSCA_MS);
    return () => clearTimeout(temporizador);
  }, [termoDigitado]);

  useEffect(() => {
    if (termo.length < 2) return;
    let cancelado = false;
    buscarPessoas(termo).then((resultado) => {
      if (!cancelado) setPessoas(resultado.ok && resultado.data ? resultado.data : []);
    });
    return () => {
      cancelado = true;
    };
  }, [termo]);

  const resultadosVisiveis = termo.length >= 2 ? pessoas : null;

  async function salvar(usuarioId: string, permissao: "ver" | "editar") {
    setSalvandoId(usuarioId);
    setErro(null);
    const resultado = await compartilharPagina(paginaId, usuarioId, permissao);
    setSalvandoId(null);
    if (!resultado.ok || !resultado.data) {
      setErro(resultado.message ?? "Não foi possível compartilhar.");
      return;
    }
    setLista(resultado.data);
    onMudou(resultado.data);
  }

  async function adicionar(pessoa: PessoaParaCompartilhar) {
    await salvar(pessoa.id, permissaoNova);
    setTermoDigitado("");
    setTermo("");
    setPessoas(null);
  }

  async function confirmarRemocao() {
    if (!remover) return;
    setRemovendo(true);
    const resultado = await removerCompartilhamento(paginaId, remover.usuarioId);
    setRemovendo(false);
    if (!resultado.ok) {
      setErro(resultado.message ?? "Não foi possível remover.");
      setRemover(null);
      return;
    }
    const nova = (lista ?? []).filter((item) => item.usuarioId !== remover.usuarioId);
    setLista(nova);
    onMudou(nova);
    setRemover(null);
  }

  const jaNaLista = new Set((lista ?? []).map((item) => item.usuarioId));

  return (
    <>
      <Modal
        open
        size="medium"
        onClose={onFechar}
        title={`Compartilhar "${tituloOuPadrao(titulo)}"`}
        description="Vale para esta página e todas as subpáginas dela. Quem pode editar escreve junto com você, ao vivo."
        footer={
          <Stack direction="row" justify="end">
            <Button variant="secondary" onClick={onFechar}>
              Fechar
            </Button>
          </Stack>
        }
      >
        <Stack gap={18}>
          {erro && <Alert variant="danger">{erro}</Alert>}

          <Stack gap={10}>
            <div className={styles.compartilharLinhaBusca}>
              <div className={styles.busca}>
                <Search size={15} className={styles.buscaIcone} aria-hidden />
                <Input
                  value={termoDigitado}
                  onChange={(event) => setTermoDigitado(event.target.value)}
                  placeholder="Buscar pessoa por nome ou e-mail"
                  aria-label="Buscar pessoa"
                  className={styles.buscaInput}
                  autoFocus
                />
              </div>
              <Dropdown
                value={permissaoNova}
                options={OPCOES_PERMISSAO}
                onValueChange={(valor) => setPermissaoNova(valor === "ver" ? "ver" : "editar")}
              />
            </div>

            {resultadosVisiveis && (
              <ul className={styles.pessoas}>
                {resultadosVisiveis.length === 0 ? (
                  <li className={styles.vazioLateral}>Ninguém encontrado.</li>
                ) : (
                  resultadosVisiveis.map((pessoa) => (
                    <li key={pessoa.id}>
                      <button
                        type="button"
                        className={styles.pessoa}
                        disabled={jaNaLista.has(pessoa.id) || salvandoId !== null}
                        onClick={() => void adicionar(pessoa)}
                      >
                        <span className={styles.pessoaTextos}>
                          <strong>{pessoa.nome}</strong>
                          <span>{[pessoa.departamento, pessoa.email].filter(Boolean).join(" · ")}</span>
                        </span>
                        {jaNaLista.has(pessoa.id) ? (
                          <span className={styles.pessoaJa}>Já tem acesso</span>
                        ) : (
                          <UserPlus size={16} aria-hidden />
                        )}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </Stack>

          <Stack gap={8}>
            <span className={styles.secaoTitulo}>Com acesso</span>
            {lista === null ? (
              <Loader label="Carregando..." />
            ) : lista.length === 0 ? (
              <p className={styles.vazioLateral}>Só você. Busque alguém acima para compartilhar.</p>
            ) : (
              <ul className={styles.pessoas}>
                {lista.map((item) => (
                  <li key={item.usuarioId} className={styles.pessoaComAcesso}>
                    <span className={styles.pessoaTextos}>
                      <strong>{item.nome}</strong>
                      {item.email && <span>{item.email}</span>}
                    </span>
                    <div className={styles.pessoaAcoes}>
                      <Dropdown
                        value={item.permissao}
                        options={OPCOES_PERMISSAO}
                        disabled={salvandoId !== null}
                        onValueChange={(valor) => {
                          const permissao = valor === "ver" ? "ver" : "editar";
                          if (permissao !== item.permissao) void salvar(item.usuarioId, permissao);
                        }}
                      />
                      <IconButton
                        icon={<UserMinus size={16} />}
                        label={`Tirar o acesso de ${item.nome}`}
                        size="small"
                        variant="danger"
                        onClick={() => setRemover(item)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Stack>
        </Stack>
      </Modal>

      <ConfirmDialog
        open={remover !== null}
        title="Tirar o acesso?"
        message={
          <>
            <strong>{remover?.nome}</strong> deixa de ver esta página e as subpáginas dela. Se estiver com ela aberta
            agora, perde o acesso na hora.
          </>
        }
        confirmLabel="Tirar o acesso"
        variant="danger"
        loading={removendo}
        onClose={() => setRemover(null)}
        onConfirm={() => void confirmarRemocao()}
      />
    </>
  );
}
