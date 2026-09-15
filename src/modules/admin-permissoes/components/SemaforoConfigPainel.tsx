"use client";

import { useEffect, useState } from "react";
import { Camera as CameraIcon, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { NumberInput } from "@/components/ui/NumberInput";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";

import type { FeedbackHandler } from "../types/toast.types";
import styles from "./AdminPermissoes.module.css";

import { CameraPreview } from "@/modules/semaforo/components/CameraPreview";
import {
  atualizarCameraAdmin,
  buscarConfigSemaforoAdmin,
  buscarStatusMediamtx,
  criarCameraAdmin,
  excluirCameraAdmin,
  iniciarMediamtx,
  listarCamerasAdmin,
  reverificarCameraAdmin,
  salvarConfigSemaforoAdmin,
  testarConexaoCameraAdmin,
} from "@/modules/semaforo/services/semaforo-admin.service";
import type { Camera, ConfigSemaforo } from "@/modules/semaforo/types/semaforo.types";

interface SemaforoConfigPainelProps {
  onFeedback: FeedbackHandler;
}

const WHEP_BASE_URL_PADRAO = "http://127.0.0.1:8889";

function montarWhepUrl(mediamtxPath: string, whepBaseUrl: string | null | undefined): string {
  return `${whepBaseUrl || WHEP_BASE_URL_PADRAO}/${mediamtxPath}/whep`;
}

function formCameraInicial() {
  return {
    nome: "",
    host: "",
    portaOnvif: "80",
    usuario: "",
    senha: "",
    ordem: "0",
  };
}

export function SemaforoConfigPainel({ onFeedback }: SemaforoConfigPainelProps) {
  const [carregando, setCarregando] = useState(true);

  const [config, setConfig] = useState<ConfigSemaforo | null>(null);
  const [modoLegado, setModoLegado] = useState(true);
  const [mediamtxApiUrl, setMediamtxApiUrl] = useState("");
  const [mediamtxWhepBaseUrl, setMediamtxWhepBaseUrl] = useState("");
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  const [statusOnline, setStatusOnline] = useState<boolean | null>(null);
  const [verificandoStatus, setVerificandoStatus] = useState(true);
  const [iniciandoMediamtx, setIniciandoMediamtx] = useState(false);

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [carregandoCameras, setCarregandoCameras] = useState(true);

  const [modalAberto, setModalAberto] = useState(false);
  const [cameraEditando, setCameraEditando] = useState<Camera | null>(null);
  const [formCamera, setFormCamera] = useState(formCameraInicial());
  const [salvandoCamera, setSalvandoCamera] = useState(false);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [testandoCamera, setTestandoCamera] = useState(false);
  const [resultadoTesteCamera, setResultadoTesteCamera] = useState<{
    sucesso: boolean;
    mensagem: string;
    avisoCodec?: string | null;
  } | null>(null);

  const [cameraExcluindo, setCameraExcluindo] = useState<Camera | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const [reverificandoId, setReverificandoId] = useState<string | null>(null);

  async function carregarStatusMediamtx() {
    setVerificandoStatus(true);
    try {
      const resultado = await buscarStatusMediamtx();
      setStatusOnline(resultado.ok ? (resultado.data?.online ?? false) : false);
    } finally {
      setVerificandoStatus(false);
    }
  }

  async function carregarCameras() {
    setCarregandoCameras(true);
    const dados = await listarCamerasAdmin();
    setCameras(dados);
    setCarregandoCameras(false);
  }

  useEffect(() => {
    buscarConfigSemaforoAdmin().then((dados) => {
      setConfig(dados);
      setModoLegado(dados?.modoLegado ?? true);
      setMediamtxApiUrl(dados?.mediamtxApiUrl ?? "");
      setMediamtxWhepBaseUrl(dados?.mediamtxWhepBaseUrl ?? "");
      setCarregando(false);
    });

    carregarStatusMediamtx();
    carregarCameras();
  }, []);

  async function handleSalvarConfig() {
    setSalvandoConfig(true);

    try {
      const resultado = await salvarConfigSemaforoAdmin({
        modoLegado,
        mediamtxApiUrl: mediamtxApiUrl.trim() || null,
        mediamtxWhepBaseUrl: mediamtxWhepBaseUrl.trim() || null,
      });

      if (resultado.ok && resultado.data) {
        setConfig(resultado.data);
        onFeedback("success", "Configuração salva", "As configurações do Semáforo foram atualizadas.");
        carregarStatusMediamtx();
      } else {
        onFeedback("danger", "Não foi possível salvar", resultado.message ?? "Tente novamente em instantes.");
      }
    } finally {
      setSalvandoConfig(false);
    }
  }

  async function handleIniciarMediamtx() {
    setIniciandoMediamtx(true);

    try {
      const resultado = await iniciarMediamtx();
      const ficouOnline = resultado.ok && Boolean(resultado.data?.online);

      onFeedback(
        ficouOnline ? "success" : "danger",
        ficouOnline ? "MediaMTX iniciado" : "Não foi possível iniciar",
        resultado.message ?? "Tente novamente em instantes."
      );

      setStatusOnline(ficouOnline);
    } finally {
      setIniciandoMediamtx(false);
    }
  }

  function abrirNovaCamera() {
    setCameraEditando(null);
    setFormCamera(formCameraInicial());
    setErroCamera(null);
    setResultadoTesteCamera(null);
    setModalAberto(true);
  }

  function abrirEdicaoCamera(camera: Camera) {
    setCameraEditando(camera);
    setFormCamera({
      nome: camera.nome,
      host: camera.host,
      portaOnvif: String(camera.portaOnvif),
      usuario: camera.usuario,
      senha: "",
      ordem: String(camera.ordem),
    });
    setErroCamera(null);
    setResultadoTesteCamera(null);
    setModalAberto(true);
  }

  function fecharModalCamera() {
    setModalAberto(false);
    setCameraEditando(null);
  }

  async function handleTestarCamera() {
    setResultadoTesteCamera(null);
    setTestandoCamera(true);

    try {
      const resultado = await testarConexaoCameraAdmin({
        host: formCamera.host,
        portaOnvif: Number(formCamera.portaOnvif) || 80,
        usuario: formCamera.usuario,
        senha: formCamera.senha,
      });

      if (resultado.ok && resultado.data) {
        setResultadoTesteCamera({
          sucesso: resultado.data.sucesso,
          mensagem: resultado.data.mensagem,
          avisoCodec: resultado.data.avisoCodec,
        });
      } else {
        setResultadoTesteCamera({
          sucesso: false,
          mensagem: resultado.message ?? "Não foi possível testar a conexão.",
        });
      }
    } finally {
      setTestandoCamera(false);
    }
  }

  async function handleSalvarCamera() {
    setErroCamera(null);
    setSalvandoCamera(true);

    try {
      const portaOnvif = Number(formCamera.portaOnvif) || 80;
      const ordem = Number(formCamera.ordem) || 0;

      const resultado = cameraEditando
        ? await atualizarCameraAdmin(cameraEditando.id, {
            nome: formCamera.nome,
            host: formCamera.host,
            portaOnvif,
            usuario: formCamera.usuario,
            senha: formCamera.senha.trim() || null,
            ordem,
          })
        : await criarCameraAdmin({
            nome: formCamera.nome,
            host: formCamera.host,
            portaOnvif,
            usuario: formCamera.usuario,
            senha: formCamera.senha,
          });

      if (resultado.ok && resultado.data) {
        await carregarCameras();

        const eraNova = !cameraEditando;
        /* Mantém o modal aberto (em vez de fechar) -- agora que a câmera está salva, ela já tem mediamtx_path e dá pra mostrar o preview ao vivo aqui mesmo, sem precisar reabrir pela tabela. */
        setCameraEditando(resultado.data);
        setFormCamera((atual) => ({ ...atual, senha: "" }));
        onFeedback(
          "success",
          eraNova ? "Câmera adicionada" : "Câmera atualizada",
          `"${resultado.data.nome}" foi salva.`
        );
      } else {
        setErroCamera(resultado.message ?? "Não foi possível salvar a câmera.");
      }
    } finally {
      setSalvandoCamera(false);
    }
  }

  async function alternarAtivoCamera(camera: Camera, ativo: boolean) {
    const resultado = await atualizarCameraAdmin(camera.id, { ativo });

    if (resultado.ok && resultado.data) {
      setCameras((atual) => atual.map((item) => (item.id === camera.id ? (resultado.data as Camera) : item)));
    } else {
      onFeedback("danger", "Não foi possível atualizar", resultado.message ?? "Tente novamente em instantes.");
    }
  }

  async function handleReverificarCamera(camera: Camera) {
    setReverificandoId(camera.id);

    try {
      const resultado = await reverificarCameraAdmin(camera.id);
      await carregarCameras();

      if (resultado.ok && resultado.data) {
        const mensagem = resultado.data.avisoCodec
          ? `${resultado.data.mensagem} ${resultado.data.avisoCodec}`
          : resultado.data.mensagem;

        onFeedback(
          resultado.data.sucesso ? "success" : "danger",
          resultado.data.sucesso ? "Conexão realizada com sucesso" : "Falha na conexão",
          mensagem
        );
      } else {
        onFeedback("danger", "Não foi possível reverificar", resultado.message ?? "Tente novamente em instantes.");
      }
    } finally {
      setReverificandoId(null);
    }
  }

  async function handleConfirmarExclusao() {
    if (!cameraExcluindo) return;

    const resultado = await excluirCameraAdmin(cameraExcluindo.id);

    if (resultado.ok) {
      setCameras((atual) => atual.filter((item) => item.id !== cameraExcluindo.id));
      onFeedback("success", "Câmera excluída", `"${cameraExcluindo.nome}" foi removida.`);
    } else {
      onFeedback("danger", "Não foi possível excluir", resultado.message ?? "Tente novamente em instantes.");
    }

    setCameraExcluindo(null);
    setConfirmandoExclusao(false);
  }

  if (carregando) {
    return <Loader label="Carregando configuração do Semáforo..." />;
  }

  return (
    <Stack gap={20}>
      <Card
        title="Modo de exibição e servidor de mídia"
        description='Enquanto "Modo legado" estiver ligado, a tela de Controle de Semáforo continua exatamente como é hoje. Desligue para mostrar a tela reformulada com o menu flutuante de câmeras.'
      >
        <Stack gap={16}>
          <Switch
            label="Modo legado"
            hint={
              modoLegado
                ? "Tela atual (sem câmeras), sem nenhuma mudança visível."
                : "Tela reformulada, com o menu flutuante de câmeras e controle do semáforo."
            }
            checked={modoLegado}
            onChange={(event) => setModoLegado(event.target.checked)}
          />

          <FormGrid columns={2}>
            <Field
              label="URL da API do MediaMTX"
              hint='Deixe em branco para usar "http://127.0.0.1:9997" (padrão local).'
            >
              <Input
                value={mediamtxApiUrl}
                onChange={(event) => setMediamtxApiUrl(event.target.value)}
                placeholder="http://127.0.0.1:9997"
              />
            </Field>

            <Field
              label="URL base WHEP (vídeo)"
              hint='Deixe em branco para usar "http://127.0.0.1:8889" (padrão local).'
            >
              <Input
                value={mediamtxWhepBaseUrl}
                onChange={(event) => setMediamtxWhepBaseUrl(event.target.value)}
                placeholder="http://127.0.0.1:8889"
              />
            </Field>
          </FormGrid>

          <Field label="Status do MediaMTX">
            <Stack direction="row" gap={10} align="center">
              {verificandoStatus ? (
                <Badge variant="neutral">Verificando...</Badge>
              ) : (
                <Badge variant={statusOnline ? "success" : "danger"}>
                  {statusOnline ? "Online" : "Offline"}
                </Badge>
              )}

              <Button variant="secondary" onClick={carregarStatusMediamtx} disabled={verificandoStatus}>
                <RefreshCw size={14} />
                Verificar
              </Button>

              {!statusOnline && !verificandoStatus && (
                <Button onClick={handleIniciarMediamtx} loading={iniciandoMediamtx}>
                  Iniciar agora
                </Button>
              )}
            </Stack>
          </Field>

          {config?.atualizadoEm && (
            <p>
              Última atualização em {new Date(config.atualizadoEm).toLocaleString("pt-BR")}
              {config.atualizadoPor ? ` por ${config.atualizadoPor}` : ""}.
            </p>
          )}

          <Stack direction="row" justify="end">
            <Button onClick={handleSalvarConfig} loading={salvandoConfig}>
              Salvar configuração
            </Button>
          </Stack>
        </Stack>
      </Card>

      <Card
        title="Câmeras"
        description="Câmeras IP (ONVIF) usadas no menu flutuante de visualização ao vivo do Semáforo."
        actions={
          <Button onClick={abrirNovaCamera}>
            <Plus size={16} />
            Adicionar câmera
          </Button>
        }
      >
        <Stack gap={16}>
          {carregandoCameras ? (
            <Loader label="Carregando câmeras..." />
          ) : cameras.length === 0 ? (
            <EmptyState icon={<CameraIcon size={28} />} title="Nenhuma câmera cadastrada" />
          ) : (
            <Table minWidth={720}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Nome</TableHeaderCell>
                  <TableHeaderCell>Host</TableHeaderCell>
                  <TableHeaderCell>Usuário</TableHeaderCell>
                  <TableHeaderCell>Última verificação</TableHeaderCell>
                  <TableHeaderCell align="center">Ativo</TableHeaderCell>
                  <TableHeaderCell align="center"> </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cameras.map((camera) => (
                  <TableRow key={camera.id}>
                    <TableCell>{camera.nome}</TableCell>
                    <TableCell>
                      {camera.host}:{camera.portaOnvif}
                    </TableCell>
                    <TableCell>{camera.usuario}</TableCell>
                    <TableCell>
                      {camera.ultimaVerificacaoEm ? (
                        <Stack direction="row" gap={6} align="center">
                          <Badge variant={camera.ultimoErroVerificacao ? "danger" : "success"}>
                            {camera.ultimoErroVerificacao ? "Falha" : "OK"}
                          </Badge>
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                            {new Date(camera.ultimaVerificacaoEm).toLocaleString("pt-BR")}
                          </span>
                        </Stack>
                      ) : (
                        <Badge variant="neutral">Nunca verificada</Badge>
                      )}
                      {camera.ultimoErroVerificacao && (
                        <p style={{ fontSize: 12, color: "var(--danger-text)", margin: "4px 0 0" }}>
                          {camera.ultimoErroVerificacao}
                        </p>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <div className={styles.checkboxCentro}>
                        <Switch
                          label=""
                          compact
                          checked={camera.ativo}
                          onChange={(event) => alternarAtivoCamera(camera, event.target.checked)}
                        />
                      </div>
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" gap={6} justify="center">
                        <IconButton
                          size="small"
                          variant="neutral"
                          icon={<RefreshCw size={13} />}
                          label="Reverificar conexão"
                          loading={reverificandoId === camera.id}
                          onClick={() => handleReverificarCamera(camera)}
                        />
                        <IconButton
                          size="small"
                          variant="neutral"
                          icon={<Pencil size={13} />}
                          label="Editar câmera"
                          onClick={() => abrirEdicaoCamera(camera)}
                        />
                        <IconButton
                          size="small"
                          variant="danger"
                          icon={<Trash2 size={13} />}
                          label="Excluir câmera"
                          onClick={() => {
                            setCameraExcluindo(camera);
                            setConfirmandoExclusao(true);
                          }}
                        />
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </Card>

      <Modal
        open={modalAberto}
        title={cameraEditando ? `Editar câmera "${cameraEditando.nome}"` : "Adicionar câmera"}
        onClose={fecharModalCamera}
        footer={
          <Stack direction="row" justify="end" gap={10}>
            <Button variant="secondary" onClick={fecharModalCamera}>
              {cameraEditando ? "Fechar" : "Cancelar"}
            </Button>
            <Button
              onClick={handleSalvarCamera}
              loading={salvandoCamera}
              disabled={
                !formCamera.nome.trim() ||
                !formCamera.host.trim() ||
                !formCamera.usuario.trim() ||
                (!cameraEditando && !formCamera.senha.trim())
              }
            >
              Salvar
            </Button>
          </Stack>
        }
      >
        <Stack gap={16}>
          <FormGrid columns={2}>
            <Field label="Nome">
              <Input
                value={formCamera.nome}
                onChange={(event) => setFormCamera((atual) => ({ ...atual, nome: event.target.value }))}
              />
            </Field>
            <Field label="Host/IP">
              <Input
                value={formCamera.host}
                onChange={(event) => setFormCamera((atual) => ({ ...atual, host: event.target.value }))}
                placeholder="192.168.0.50"
              />
            </Field>
          </FormGrid>

          <FormGrid columns={2}>
            <Field label="Porta ONVIF">
              <NumberInput
                value={formCamera.portaOnvif}
                onChange={(event) => setFormCamera((atual) => ({ ...atual, portaOnvif: event.target.value }))}
              />
            </Field>
            <Field label="Ordem">
              <NumberInput
                value={formCamera.ordem}
                onChange={(event) => setFormCamera((atual) => ({ ...atual, ordem: event.target.value }))}
              />
            </Field>
          </FormGrid>

          <FormGrid columns={2}>
            <Field label="Usuário">
              <Input
                value={formCamera.usuario}
                onChange={(event) => setFormCamera((atual) => ({ ...atual, usuario: event.target.value }))}
              />
            </Field>
            <Field
              label="Senha"
              hint={cameraEditando ? "deixe em branco para manter a senha já cadastrada" : "obrigatória"}
            >
              <Input
                type="password"
                autoComplete="new-password"
                placeholder={cameraEditando ? "••••••••" : ""}
                value={formCamera.senha}
                onChange={(event) => setFormCamera((atual) => ({ ...atual, senha: event.target.value }))}
              />
            </Field>
          </FormGrid>

          {cameraEditando && (
            <Field label="Pré-visualização">
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "16 / 9",
                  borderRadius: 12,
                  overflow: "hidden",
                  border: "1px solid var(--border-soft)",
                }}
              >
                <CameraPreview
                  whepUrl={montarWhepUrl(cameraEditando.mediamtxPath, config?.mediamtxWhepBaseUrl)}
                  ativo={modalAberto}
                />
              </div>
            </Field>
          )}

          {resultadoTesteCamera && (
            <Alert variant={resultadoTesteCamera.sucesso ? "success" : "danger"}>
              {resultadoTesteCamera.mensagem}
            </Alert>
          )}

          {resultadoTesteCamera?.avisoCodec && <Alert variant="warning">{resultadoTesteCamera.avisoCodec}</Alert>}

          {erroCamera && <Alert variant="danger">{erroCamera}</Alert>}

          <Stack direction="row" justify="end">
            <Button
              variant="secondary"
              onClick={handleTestarCamera}
              loading={testandoCamera}
              disabled={!formCamera.host.trim() || !formCamera.usuario.trim() || !formCamera.senha.trim()}
            >
              Testar conexão
            </Button>
          </Stack>
        </Stack>
      </Modal>

      <ConfirmDialog
        open={confirmandoExclusao}
        title="Excluir câmera?"
        variant="danger"
        message={
          cameraExcluindo
            ? `"${cameraExcluindo.nome}" será removida e deixa de ficar acessível no menu flutuante imediatamente.`
            : ""
        }
        confirmLabel="Excluir"
        onConfirm={handleConfirmarExclusao}
        onClose={() => setCameraExcluindo(null)}
      />
    </Stack>
  );
}
