"use client";

import { useEffect, useState } from "react";
import { ScanSearch } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import { atualizarMaquina, listarEventos } from "../services/workstationsNvidia.service";
import type {
  DivergenciaPerfil,
  EventoNvidia,
  MaquinaNvidia,
} from "../types/workstationsNvidia.types";
import {
  descreverValorConfiguracao,
  formatarDataHora,
  formatarTempoRelativo,
  STATUS_MAQUINA,
  TIPO_EVENTO,
} from "../utils/exibicao";
import styles from "./WorkstationsNvidia.module.css";

interface DetalheMaquinaNvidiaModalProps {
  maquina: MaquinaNvidia;
  hashPerfilOficial: string | null;
  coletando: boolean;
  onColetar: () => void;
  onDescricaoSalva: () => void;
  onFeedback: FeedbackHandler;
  onClose: () => void;
}

const EVENTOS_NO_DETALHE = 10;

function TabelaDivergencias({ divergencias }: { divergencias: DivergenciaPerfil[] }) {
  return (
    <Table minWidth={560}>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Perfil</TableHeaderCell>
          <TableHeaderCell>Configuração</TableHeaderCell>
          <TableHeaderCell>Esperado</TableHeaderCell>
          <TableHeaderCell>Encontrado</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {divergencias.map((divergencia) => (
          <TableRow key={`${divergencia.perfil}-${divergencia.configuracaoId}`}>
            <TableCell>{divergencia.perfil}</TableCell>
            <TableCell>{divergencia.configuracao || divergencia.configuracaoId}</TableCell>
            <TableCell>
              {descreverValorConfiguracao(divergencia.configuracaoId, divergencia.esperado)}
            </TableCell>
            <TableCell>
              {descreverValorConfiguracao(divergencia.configuracaoId, divergencia.encontrado)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function DetalheMaquinaNvidiaModal({
  maquina,
  hashPerfilOficial,
  coletando,
  onColetar,
  onDescricaoSalva,
  onFeedback,
  onClose,
}: DetalheMaquinaNvidiaModalProps) {
  const [eventos, setEventos] = useState<EventoNvidia[] | null>(null);
  const [descricao, setDescricao] = useState(maquina.descricao ?? "");
  const [salvandoDescricao, setSalvandoDescricao] = useState(false);

  /* Recarrega o histórico quando uma nova coleta muda a máquina. */
  useEffect(() => {
    let cancelado = false;

    listarEventos({ maquinaId: maquina.id, pagina: 1 }).then((resposta) => {
      if (cancelado) return;
      setEventos(resposta.ok && resposta.data ? resposta.data.eventos.slice(0, EVENTOS_NO_DETALHE) : []);
    });

    return () => {
      cancelado = true;
    };
  }, [maquina.id, maquina.coletaEm]);

  async function handleSalvarDescricao() {
    const valor = descricao.trim();
    if (valor === (maquina.descricao ?? "")) return;

    setSalvandoDescricao(true);
    try {
      const resposta = await atualizarMaquina(maquina.id, { descricao: valor || null });
      if (resposta.ok) {
        onDescricaoSalva();
      } else {
        onFeedback("danger", "Não foi possível salvar a descrição", resposta.message ?? "Tente novamente.");
      }
    } finally {
      setSalvandoDescricao(false);
    }
  }

  const status = STATUS_MAQUINA[maquina.status];
  const encontradas = maquina.divergencias?.encontradas ?? [];
  const aposReaplicar = maquina.divergencias?.aposReaplicar ?? [];
  const perfilEhOficial =
    hashPerfilOficial && maquina.perfilHash
      ? hashPerfilOficial.toUpperCase() === maquina.perfilHash.toUpperCase()
      : null;

  return (
    <Modal
      open
      size="large"
      title={maquina.computador}
      description={status.descricao}
      meta={<Badge variant={status.variante}>{status.label}</Badge>}
      onClose={onClose}
      footer={
        <Stack direction="row" gap={8} justify="end">
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={onColetar} loading={coletando} loadingLabel="Coletando...">
            <ScanSearch size={15} />
            Coletar esta máquina
          </Button>
        </Stack>
      }
    >
      <Stack gap={20}>
        {maquina.coletaOk === false && maquina.coletaErro && (
          <Alert variant="danger" title="A última leitura falhou">
            {maquina.coletaErro}
          </Alert>
        )}

        {maquina.erroScript && (
          <Alert variant={maquina.acao === "adiado" ? "info" : "danger"} title="Mensagem do script">
            {maquina.erroScript}
          </Alert>
        )}

        <div className={styles.detalhes}>
          <span className={styles.rotulo}>Descrição</span>
          <span className={styles.valor}>
            <Input
              value={descricao}
              placeholder="Ex: Engenharia Agro — mesa 2"
              maxLength={200}
              disabled={salvandoDescricao}
              onChange={(event) => setDescricao(event.target.value)}
              onBlur={handleSalvarDescricao}
            />
          </span>

          <span className={styles.rotulo}>GPU</span>
          <span className={styles.valor}>{maquina.gpu ?? "—"}</span>

          <span className={styles.rotulo}>Driver</span>
          <span className={styles.valor}>
            {maquina.driverNvidia ?? "—"}
            {maquina.driverWindows && (
              <span className={styles.textoSecundario}>
                {" "}
                · Windows {maquina.driverWindows}
                {maquina.dataDriver ? ` · de ${maquina.dataDriver.split("-").reverse().join("/")}` : ""}
              </span>
            )}
          </span>

          <span className={styles.rotulo}>Verificado pelo script</span>
          <span className={styles.valor}>
            {maquina.verificadoEm
              ? `${formatarDataHora(maquina.verificadoEm)} (${formatarTempoRelativo(maquina.verificadoEm)})`
              : "—"}
            {maquina.executadoComo && (
              <span className={styles.textoSecundario}> · como {maquina.executadoComo}</span>
            )}
          </span>

          <span className={styles.rotulo}>Última reaplicação</span>
          <span className={styles.valor}>
            {maquina.ultimaReaplicacaoEm ? (
              <>
                {formatarDataHora(maquina.ultimaReaplicacaoEm)}{" "}
                <Badge variant={maquina.ultimaReaplicacaoSucesso ? "success" : "danger"}>
                  {maquina.ultimaReaplicacaoSucesso ? "sucesso" : "falhou"}
                </Badge>
              </>
            ) : (
              "Nunca precisou reaplicar"
            )}
          </span>

          <span className={styles.rotulo}>Perfil aplicado</span>
          <span className={styles.valor}>
            {maquina.perfilHash ? (
              <>
                <code>{maquina.perfilHash.slice(0, 12)}…</code>{" "}
                {perfilEhOficial === true && <Badge variant="success">oficial atual</Badge>}
                {perfilEhOficial === false && <Badge variant="warning">diferente do oficial</Badge>}
              </>
            ) : (
              "—"
            )}
          </span>

          <span className={styles.rotulo}>Leitura pelo portal</span>
          <span className={styles.valor}>
            {maquina.coletaEm ? formatarDataHora(maquina.coletaEm) : "Nunca"}
            {maquina.coletaOk === false && maquina.contatoEm && (
              <span className={styles.textoSecundario}>
                {" "}
                · último contato {formatarDataHora(maquina.contatoEm)}
              </span>
            )}
          </span>
        </div>

        {encontradas.length > 0 && (
          <Stack gap={10}>
            <h4 className={styles.tituloSecao}>
              {maquina.acao === "reaplicado"
                ? "Divergências corrigidas na última execução"
                : "Divergências encontradas"}
            </h4>
            <TabelaDivergencias divergencias={encontradas} />
          </Stack>
        )}

        {aposReaplicar.length > 0 && (
          <Stack gap={10}>
            <h4 className={styles.tituloSecao}>Continuou divergente depois de reaplicar</h4>
            <TabelaDivergencias divergencias={aposReaplicar} />
          </Stack>
        )}

        <Stack gap={10}>
          <h4 className={styles.tituloSecao}>Histórico recente</h4>
          {eventos === null ? (
            <Loader label="Carregando histórico..." />
          ) : eventos.length === 0 ? (
            <span className={styles.textoSecundario}>Nenhum evento registrado ainda.</span>
          ) : (
            <ul className={styles.listaEventos}>
              {eventos.map((evento) => (
                <li key={evento.id} className={styles.itemEvento}>
                  <div className={styles.cabecalhoEvento}>
                    <Badge variant={TIPO_EVENTO[evento.tipo]?.variante ?? "neutral"}>
                      {TIPO_EVENTO[evento.tipo]?.label ?? evento.tipo}
                    </Badge>
                    <span className={styles.textoSecundario}>{formatarDataHora(evento.ocorridoEm)}</span>
                  </div>
                  <span className={styles.descricaoEvento}>{evento.descricao}</span>
                </li>
              ))}
            </ul>
          )}
        </Stack>
      </Stack>
    </Modal>
  );
}
