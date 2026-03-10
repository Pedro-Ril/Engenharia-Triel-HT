"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";
import {
  buscarClientes,
  buscarNomes,
  enviarEmail,
} from "../../modules/liberacao-projeto/liberacaoProjeto.service";
import type {
  ClienteItem,
  EmailPayload,
  NomeItem,
} from "../../modules/liberacao-projeto/liberacaoProjeto.types";

type StatusType = "idle" | "success" | "error";
type ModalStep = "confirmar-consulta" | "confirmar-envio";

export default function LiberacaoProjetoPage() {
  const [nomes, setNomes] = useState<NomeItem[]>([]);
  const [clientes, setClientes] = useState<ClienteItem[]>([]);

  const [carregandoDados, setCarregandoDados] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const [nome, setNome] = useState("");
  const [cliente, setCliente] = useState("");
  const [clienteInput, setClienteInput] = useState("");
  const [mostrarListaClientes, setMostrarListaClientes] = useState(false);

  const [ordem, setOrdem] = useState("");
  const [numOf, setNumOf] = useState("");
  const [codFocco, setCodFocco] = useState("");
  const [idMasc, setIdMasc] = useState("");
  const [numPed, setNumPed] = useState("");
  const [codCjGeral, setCodCjGeral] = useState("");

  const [statusType, setStatusType] = useState<StatusType>("idle");
  const [statusMessage, setStatusMessage] = useState("");

  const [modalAberto, setModalAberto] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>("confirmar-consulta");

  const clienteWrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const carregarDados = async () => {
      try {
        setCarregandoDados(true);
        setStatusType("idle");
        setStatusMessage("");

        const [nomesData, clientesData] = await Promise.all([
          buscarNomes(),
          buscarClientes(),
        ]);

        setNomes(Array.isArray(nomesData) ? nomesData : []);
        setClientes(Array.isArray(clientesData) ? clientesData : []);
      } catch (error) {
        console.error("Erro ao carregar dados iniciais:", error);

        const message =
          error instanceof Error
            ? error.message
            : "Erro ao carregar os dados iniciais.";

        setStatusType("error");
        setStatusMessage(`Erro ao carregar dados: ${message}`);
      } finally {
        setCarregandoDados(false);
      }
    };

    carregarDados();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      window.location.reload();
    }, 300000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickFora = (event: MouseEvent) => {
      if (
        clienteWrapperRef.current &&
        !clienteWrapperRef.current.contains(event.target as Node)
      ) {
        setMostrarListaClientes(false);
      }
    };

    document.addEventListener("mousedown", handleClickFora);

    return () => {
      document.removeEventListener("mousedown", handleClickFora);
    };
  }, []);

  const clientesFiltrados = useMemo(() => {
    if (!Array.isArray(clientes)) return [];

    const termo = clienteInput.trim().toLowerCase();

    if (!termo) {
      return clientes.slice(0, 30);
    }

    return clientes
      .filter((item) => {
        const codigo = String(item.cod_cli ?? "").toLowerCase();
        const descricao = String(item.descricao ?? "").toLowerCase();

        return codigo.includes(termo) || descricao.includes(termo);
      })
      .slice(0, 30);
  }, [clientes, clienteInput]);

  const limparStatus = () => {
    if (statusType !== "idle") {
      setStatusType("idle");
      setStatusMessage("");
    }
  };

  const limparFormulario = () => {
    setNome("");
    setCliente("");
    setClienteInput("");
    setMostrarListaClientes(false);
    setOrdem("");
    setNumOf("");
    setCodFocco("");
    setIdMasc("");
    setNumPed("");
    setCodCjGeral("");
  };

  const selecionarCliente = (item: ClienteItem) => {
    setCliente(item.descricao);
    setClienteInput(`${item.cod_cli} | ${item.descricao}`);
    setMostrarListaClientes(false);
    limparStatus();
  };

  const montarPayload = (): EmailPayload | null => {
    if (!nome || !cliente || !ordem.trim()) {
      setStatusType("error");
      setStatusMessage(
        "Por favor, preencha os campos obrigatórios: Nome, Cliente e Ordem."
      );
      return null;
    }

    return {
      nome,
      cliente,
      ordem: ordem.trim(),
      numOf: numOf.trim(),
      codFocco: codFocco.trim(),
      idMasc: idMasc.trim(),
      numPed: numPed.trim(),
      codCjGeral: codCjGeral.trim(),
    };
  };

  const fecharModal = () => {
    setModalAberto(false);
    setModalStep("confirmar-consulta");
  };

  const executarEnvio = async () => {
    limparStatus();

    const payload = montarPayload();
    if (!payload) {
      fecharModal();
      return;
    }

    try {
      setEnviando(true);
      await enviarEmail(payload);

      setStatusType("success");
      setStatusMessage("E-mail enviado com sucesso!");
      limparFormulario();
      fecharModal();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro inesperado ao enviar o e-mail.";

      setStatusType("error");
      setStatusMessage(`Erro ao enviar e-mail: ${message}`);
      fecharModal();
    } finally {
      setEnviando(false);
    }
  };

  const handleAbrirFluxoEnvio = () => {
    limparStatus();

    const payload = montarPayload();
    if (!payload) return;

    setModalStep("confirmar-consulta");
    setModalAberto(true);
  };

  const handleConsultarEstrutura = () => {
    const codigo = codCjGeral.trim();

    if (!codigo) {
      setStatusType("error");
      setStatusMessage(
        'Informe o campo "Código CJ Geral" para consultar a estrutura antes do envio.'
      );
      fecharModal();
      return;
    }

    const url = `/consulta-estrutura?itemPai=${encodeURIComponent(codigo)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setModalStep("confirmar-envio");
  };

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Liberação de Projeto</h1>
          <p className={styles.subtitle}>
            Preencha os dados para realizar o envio do e-mail de liberação de
            projeto.
          </p>
        </div>
      </div>

      <div className={styles.searchCard}>
        <div className={styles.summary}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Responsáveis carregados</span>
            <strong>{nomes.length}</strong>
          </div>

          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Clientes disponíveis</span>
            <strong>{clientes.length}</strong>
          </div>

          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Campos obrigatórios</span>
            <strong>Nome, Cliente e Ordem</strong>
          </div>
        </div>
      </div>

      <section className={styles.mainPanel}>
        <div className={styles.panelHeader}>
          <h2>Dados para envio</h2>
        </div>

        {carregandoDados ? (
          <div className={styles.loadingBox}>Carregando dados...</div>
        ) : (
          <div className={styles.formContent}>
            {statusMessage && (
              <div
                className={`${styles.statusMessage} ${
                  statusType === "success"
                    ? styles.statusSuccess
                    : styles.statusError
                }`}
              >
                {statusMessage}
              </div>
            )}

            <div className={styles.sectionBlock}>
              <h3 className={styles.sectionTitle}>Informações principais</h3>

              <div className={styles.gridTwo}>
                <div className={styles.fieldGroup}>
                  <label htmlFor="nomeSelect" className={styles.label}>
                    Nome <span className={styles.required}>*</span>
                  </label>
                  <select
                    id="nomeSelect"
                    className={styles.input}
                    value={nome}
                    onChange={(e) => {
                      setNome(e.target.value);
                      limparStatus();
                    }}
                    disabled={enviando}
                  >
                    <option value="">Selecione um nome</option>
                    {nomes.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.fieldGroup}>
                  <label htmlFor="ordem" className={styles.label}>
                    Ordem <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="ordem"
                    type="text"
                    className={styles.input}
                    placeholder="Digite o número da ordem"
                    value={ordem}
                    onChange={(e) => {
                      setOrdem(e.target.value);
                      limparStatus();
                    }}
                    disabled={enviando}
                  />
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="clienteInput" className={styles.label}>
                  Cliente <span className={styles.required}>*</span>
                </label>

                <div
                  className={styles.autocompleteWrapper}
                  ref={clienteWrapperRef}
                >
                  <input
                    id="clienteInput"
                    type="text"
                    className={styles.input}
                    placeholder="Digite código ou descrição do cliente"
                    value={clienteInput}
                    onChange={(e) => {
                      const valor = e.target.value;
                      setClienteInput(valor);
                      setCliente("");
                      setMostrarListaClientes(true);
                      limparStatus();
                    }}
                    onFocus={() => setMostrarListaClientes(true)}
                    disabled={enviando}
                    autoComplete="off"
                  />

                  {mostrarListaClientes && clientesFiltrados.length > 0 && (
                    <div className={styles.autocompleteList}>
                      {clientesFiltrados.map((item) => (
                        <button
                          type="button"
                          key={`${item.cod_cli}-${item.descricao}`}
                          className={styles.autocompleteItem}
                          onClick={() => selecionarCliente(item)}
                        >
                          {item.cod_cli} | {item.descricao}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.sectionBlock}>
              <h3 className={styles.sectionTitle}>Dados complementares</h3>

              <div className={styles.grid}>
                <div className={styles.fieldGroup}>
                  <label htmlFor="numOf" className={styles.label}>
                    Nº OP
                  </label>
                  <input
                    id="numOf"
                    type="text"
                    className={styles.input}
                    placeholder="Digite o Nº OP"
                    value={numOf}
                    onChange={(e) => setNumOf(e.target.value)}
                    disabled={enviando}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label htmlFor="codFocco" className={styles.label}>
                    Código FOCCO
                  </label>
                  <input
                    id="codFocco"
                    type="text"
                    className={styles.input}
                    placeholder="Digite o código FOCCO"
                    value={codFocco}
                    onChange={(e) => setCodFocco(e.target.value)}
                    disabled={enviando}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label htmlFor="idMasc" className={styles.label}>
                    ID - Máscara
                  </label>
                  <input
                    id="idMasc"
                    type="text"
                    className={styles.input}
                    placeholder="Digite o ID da máscara"
                    value={idMasc}
                    onChange={(e) => setIdMasc(e.target.value)}
                    disabled={enviando}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label htmlFor="numPed" className={styles.label}>
                    N° Pedido
                  </label>
                  <input
                    id="numPed"
                    type="text"
                    className={styles.input}
                    placeholder="Digite o número do pedido"
                    value={numPed}
                    onChange={(e) => setNumPed(e.target.value)}
                    disabled={enviando}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label htmlFor="codCjGeral" className={styles.label}>
                    Código CJ Geral
                  </label>
                  <input
                    id="codCjGeral"
                    type="text"
                    className={styles.input}
                    placeholder="Digite o código CJ Geral"
                    value={codCjGeral}
                    onChange={(e) => setCodCjGeral(e.target.value)}
                    disabled={enviando}
                  />
                </div>
              </div>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  limparFormulario();
                  limparStatus();
                }}
                disabled={enviando || carregandoDados}
              >
                Limpar
              </button>

              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleAbrirFluxoEnvio}
                disabled={enviando || carregandoDados}
              >
                {enviando ? "Enviando..." : "Enviar E-mail"}
              </button>
            </div>
          </div>
        )}
      </section>

      {modalAberto && (
        <div className={styles.modalOverlay} onClick={fecharModal}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            {modalStep === "confirmar-consulta" ? (
              <>
                <h3 className={styles.modalTitle}>Consultar estrutura?</h3>
                <p className={styles.modalText}>
                  Deseja consultar a estrutura do item liberado antes de realizar
                  o envio do e-mail?
                </p>

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={fecharModal}
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={executarEnvio}
                  >
                    Enviar sem consultar
                  </button>

                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={handleConsultarEstrutura}
                  >
                    Consultar estrutura
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className={styles.modalTitle}>Realizar envio?</h3>
                <p className={styles.modalText}>
                  A tela de consulta da estrutura foi aberta em uma nova guia com
                  o item pai preenchido. Deseja realizar o envio do e-mail agora?
                </p>

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={fecharModal}
                  >
                    Não
                  </button>

                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={executarEnvio}
                  >
                    Sim, enviar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </main>
  );
}