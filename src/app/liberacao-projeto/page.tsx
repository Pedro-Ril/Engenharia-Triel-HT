"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dropdown } from "@/components/ui/Dropdown";
import { NumberInput } from "@/components/ui/NumberInput";
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

/*
 * Campos elegíveis pros "campos que mudam" nos múltiplos envios — só os
 * de texto livre (Nome/Cliente usam widgets de seleção, não fazem
 * sentido como "uma lista de valores alternativos").
 */
type CampoMultiplo = "ordem" | "numOf" | "codFocco" | "idMasc" | "numPed" | "codCjGeral";

const CAMPOS_MULTIPLOS: { value: CampoMultiplo; label: string }[] = [
  { value: "ordem", label: "Ordem" },
  { value: "numOf", label: "Nº OP" },
  { value: "codFocco", label: "Código FOCCO" },
  { value: "idMasc", label: "ID - Máscara" },
  { value: "numPed", label: "N° Pedido" },
  { value: "codCjGeral", label: "Código CJ Geral" },
];

const QUANTIDADE_MAX_MULTIPLO = 20;

/* Valores de um envio adicional, por campo. Guarda também o que foi
   digitado em campos depois desmarcados -- remarcar devolve o valor. */
type ValoresEnvio = Partial<Record<CampoMultiplo, string>>;

function rotuloDoCampo(campo: CampoMultiplo): string {
  return CAMPOS_MULTIPLOS.find((c) => c.value === campo)?.label ?? campo;
}

function mensagemDeErro(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Erro inesperado ao enviar o e-mail.";
}

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
  const [modalErro, setModalErro] = useState("");

  const [multiploAtivo, setMultiploAtivo] = useState(false);
  /* Mais de um campo pode mudar entre os envios; a ordem segue a do
     formulário, não a dos cliques. */
  const [multiploCampos, setMultiploCampos] = useState<CampoMultiplo[]>([]);
  const [multiploEnvios, setMultiploEnvios] = useState<ValoresEnvio[]>([{}]);

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
    }, 600000);

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
    setModalErro("");
    setMultiploAtivo(false);
    setMultiploCampos([]);
    setMultiploEnvios([{}]);
  };

  const handleQuantidadeMultiploChange = (quantidadeTexto: string) => {
    const quantidade = Math.max(
      1,
      Math.min(QUANTIDADE_MAX_MULTIPLO, Number(quantidadeTexto) || 1)
    );

    setMultiploEnvios((atual) => {
      const novo = atual.slice(0, quantidade);
      while (novo.length < quantidade) novo.push({});
      return novo;
    });
  };

  const alternarCampoMultiplo = (campo: CampoMultiplo, marcado: boolean) => {
    setMultiploCampos((atuais) =>
      CAMPOS_MULTIPLOS.map((c) => c.value).filter((c) =>
        c === campo ? marcado : atuais.includes(c)
      )
    );
    setModalErro("");
  };

  const atualizarValorEnvio = (indice: number, campo: CampoMultiplo, valor: string) => {
    setMultiploEnvios((atual) =>
      atual.map((envio, i) => (i === indice ? { ...envio, [campo]: valor } : envio))
    );
    setModalErro("");
  };

  /*
   * Não muda nada no backend: reaproveita enviarEmail() chamando-a
   * várias vezes em sequência — o Envio 1 com os dados como o usuário
   * digitou, e mais um por linha preenchida, trocando só os campos
   * marcados (um ou vários) pelos valores daquela linha.
   *
   * Linha toda em branco é pulada. Linha preenchida pela metade barra o
   * envio inteiro, antes de mandar qualquer coisa: é e-mail, não tem
   * volta, e um campo esquecido sairia com o valor do formulário sem
   * ninguém perceber.
   */
  const executarEnvioMultiplo = async (payloadBase: EmailPayload) => {
    if (multiploCampos.length === 0) {
      setModalErro("Marque ao menos um campo que muda entre os envios.");
      return;
    }

    const campos = multiploCampos;
    const variantes: { numero: number; valores: ValoresEnvio }[] = [];

    for (const [indice, envio] of multiploEnvios.entries()) {
      const numero = indice + 2;
      const preenchidos = campos.filter((c) => (envio[c] ?? "").trim());

      if (preenchidos.length === 0) continue;

      const faltando = campos.filter((c) => !(envio[c] ?? "").trim());

      if (faltando.length > 0) {
        setModalErro(
          `Envio ${numero}: preencha ${faltando.map(rotuloDoCampo).join(", ")} — ou deixe a linha toda em branco para pular.`
        );
        return;
      }

      variantes.push({
        numero,
        valores: Object.fromEntries(campos.map((c) => [c, (envio[c] ?? "").trim()])),
      });
    }

    if (variantes.length === 0) {
      setModalErro("Preencha ao menos um envio adicional.");
      return;
    }

    setModalErro("");
    setEnviando(true);

    const descrever = (valores: ValoresEnvio) =>
      campos.map((c) => `${rotuloDoCampo(c)} ${valores[c] ?? ""}`).join(", ");

    const tentativas = [
      { descricao: `Envio 1 (${descrever(payloadBase)})`, payload: payloadBase },
      ...variantes.map((v) => ({
        descricao: `Envio ${v.numero} (${descrever(v.valores)})`,
        payload: { ...payloadBase, ...v.valores },
      })),
    ];

    const resultados: { descricao: string; ok: boolean; erro?: string }[] = [];

    for (const tentativa of tentativas) {
      try {
        await enviarEmail(tentativa.payload);
        resultados.push({ descricao: tentativa.descricao, ok: true });
      } catch (error) {
        resultados.push({
          descricao: tentativa.descricao,
          ok: false,
          erro: mensagemDeErro(error),
        });
      }
    }

    setEnviando(false);

    const sucessos = resultados.filter((r) => r.ok).length;
    const falhas = resultados.filter((r) => !r.ok);
    const rotulos = campos.map(rotuloDoCampo).join(", ");

    if (falhas.length === 0) {
      setStatusType("success");
      setStatusMessage(
        `${sucessos} e-mails enviados com sucesso (${rotulos} variando entre eles).`
      );
      limparFormulario();
    } else {
      setStatusType("error");
      setStatusMessage(
        `${sucessos} de ${resultados.length} e-mails enviados. Falha em ${falhas
          .map((f) => `${f.descricao}: ${f.erro}`)
          .join("; ")}.`
      );
    }

    fecharModal();
  };

  const executarEnvio = async () => {
    limparStatus();

    const payload = montarPayload();
    if (!payload) {
      fecharModal();
      return;
    }

    if (multiploAtivo) {
      await executarEnvioMultiplo(payload);
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

  /* O Envio 1 é o próprio formulário -- mostrado na grade como
     referência de onde os outros envios partem. */
  const valoresFormulario: Record<CampoMultiplo, string> = {
    ordem,
    numOf,
    codFocco,
    idMasc,
    numPed,
    codCjGeral,
  };

  const blocoMultiplosEnvios = (
    <div className={styles.multiploBox}>
      <Checkbox
        label="Múltiplos envios (mesmos dados, mudando um ou mais campos)"
        hint="Envia o e-mail com os dados preenchidos e mais um e-mail para cada linha abaixo, trocando só os campos marcados."
        checked={multiploAtivo}
        onChange={(e) => {
          setMultiploAtivo(e.target.checked);
          setModalErro("");
        }}
        disabled={enviando}
      />

      {multiploAtivo && (
        <div className={styles.multiploConfig}>
          <div className={styles.fieldGroup}>
            <span className={styles.label}>Campos que mudam entre os envios</span>
            <div className={styles.multiploCampos}>
              {CAMPOS_MULTIPLOS.map((c) => (
                <Checkbox
                  key={c.value}
                  label={c.label}
                  checked={multiploCampos.includes(c.value)}
                  onChange={(e) => alternarCampoMultiplo(c.value, e.target.checked)}
                  disabled={enviando}
                />
              ))}
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Quantidade de envios adicionais</label>
            <NumberInput
              min={1}
              max={QUANTIDADE_MAX_MULTIPLO}
              value={multiploEnvios.length}
              onChange={(e) => handleQuantidadeMultiploChange(e.target.value)}
              disabled={enviando}
            />
          </div>

          {multiploCampos.length > 0 && (
            <div className={styles.multiploGradeRolavel}>
              <div
                className={styles.multiploGrade}
                style={{
                  gridTemplateColumns: `auto repeat(${multiploCampos.length}, minmax(130px, 1fr))`,
                }}
              >
                <span />
                {multiploCampos.map((c) => (
                  <span key={c} className={styles.multiploCabecalho}>
                    {rotuloDoCampo(c)}
                  </span>
                ))}

                <span className={styles.multiploRotuloLinha}>
                  Envio 1<small>formulário</small>
                </span>
                {multiploCampos.map((c) => (
                  <span
                    key={c}
                    className={styles.multiploValorBase}
                    title={valoresFormulario[c] || "vazio no formulário"}
                  >
                    {valoresFormulario[c] || "—"}
                  </span>
                ))}

                {multiploEnvios.map((envio, indice) => (
                  <Fragment key={indice}>
                    <span className={styles.multiploRotuloLinha}>Envio {indice + 2}</span>
                    {multiploCampos.map((c) => (
                      <input
                        key={c}
                        type="text"
                        className={`${styles.input} ${styles.inputCompacto}`}
                        aria-label={`Envio ${indice + 2} — ${rotuloDoCampo(c)}`}
                        value={envio[c] ?? ""}
                        onChange={(e) => atualizarValorEnvio(indice, c, e.target.value)}
                        disabled={enviando}
                      />
                    ))}
                  </Fragment>
                ))}
              </div>
            </div>
          )}

          {modalErro && (
            <div className={`${styles.statusMessage} ${styles.statusError}`}>
              {modalErro}
            </div>
          )}
        </div>
      )}
    </div>
  );

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
                  <label className={styles.label}>
                    Nome <span className={styles.required}>*</span>
                  </label>
                  <Dropdown
                    value={nome}
                    onValueChange={(valor) => {
                      setNome(valor);
                      limparStatus();
                    }}
                    options={nomes.map((item) => ({
                      value: item.name,
                      label: item.name,
                    }))}
                    placeholder="Selecione um nome"
                    disabled={enviando}
                  />
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
            className={`${styles.modalContent} ${multiploAtivo ? styles.modalContentLargo : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            {modalStep === "confirmar-consulta" ? (
              <>
                <h3 className={styles.modalTitle}>Consultar estrutura?</h3>
                <p className={styles.modalText}>
                  Deseja consultar a estrutura do item liberado antes de realizar
                  o envio do e-mail?
                </p>

                {blocoMultiplosEnvios}

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={fecharModal}
                    disabled={enviando}
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={executarEnvio}
                    disabled={enviando}
                  >
                    {enviando
                      ? "Enviando..."
                      : multiploAtivo
                        ? "Enviar todos sem consultar"
                        : "Enviar sem consultar"}
                  </button>

                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={handleConsultarEstrutura}
                    disabled={enviando}
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

                {blocoMultiplosEnvios}

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={fecharModal}
                    disabled={enviando}
                  >
                    Não
                  </button>

                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={executarEnvio}
                    disabled={enviando}
                  >
                    {enviando ? "Enviando..." : multiploAtivo ? "Sim, enviar todos" : "Sim, enviar"}
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