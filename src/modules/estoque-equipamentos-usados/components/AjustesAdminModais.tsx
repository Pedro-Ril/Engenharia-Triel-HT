"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";
import { Textarea } from "@/components/ui/Textarea";

import {
  ajustarStatusEquipamento,
  corrigirDadosErpEquipamento,
  corrigirNumeroSerieEquipamento,
} from "../services/estoque.service";
import type { Equipamento, MotivoBaixa, StatusEquipamento } from "../types/estoque.types";
import { STATUS_LABELS } from "../utils/rotulos";

/*
 * Correções do administrador pelo menu de ações da lista: número de série
 * e status final. Cada modal guarda o próprio estado; o pai só diz qual
 * equipamento abrir e recebe o aviso de que deu certo.
 */

const MOTIVOS_BAIXA: { value: MotivoBaixa; label: string }[] = [
  { value: "venda", label: "Venda" },
  { value: "perda", label: "Perda" },
  { value: "descarte", label: "Descarte" },
  { value: "outro", label: "Outro" },
];

const STATUS_COM_QUEM: StatusEquipamento[] = ["emprestado", "consignado", "em_reforma"];

interface ModalAjusteProps {
  equipamento: Equipamento;
  onFechar: () => void;
  onConcluido: () => void;
}

export function CorrigirNumeroSerieModal({ equipamento, onFechar, onConcluido }: ModalAjusteProps) {
  const [numeroSerie, setNumeroSerie] = useState(equipamento.numeroSerie ?? "");
  const [motivo, setMotivo] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function validar(): string | null {
    const novo = numeroSerie.trim();
    if (!novo) return "Informe o número de série.";
    if (novo === (equipamento.numeroSerie ?? "").trim()) return "O número de série novo é igual ao atual.";
    if (motivo.trim().length < 5) return "Explique o motivo da correção (pelo menos 5 caracteres).";
    return null;
  }

  async function salvar() {
    setSalvando(true);
    try {
      const resultado = await corrigirNumeroSerieEquipamento(equipamento.id, { numeroSerie: numeroSerie.trim(), motivo: motivo.trim() });
      setConfirmando(false);
      if (resultado.ok) onConcluido();
      else setErro(resultado.message ?? "Não foi possível corrigir o número de série.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Modal
        open={!confirmando}
        title={`Corrigir número de série do equipamento #${equipamento.numero}`}
        description="Muda só o número de série. Fica registrado no histórico do equipamento."
        onClose={() => {
          if (!salvando) onFechar();
        }}
        footer={
          <Stack direction="row" gap={8} justify="end">
            <Button variant="secondary" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const mensagem = validar();
                setErro(mensagem);
                if (!mensagem) setConfirmando(true);
              }}
            >
              Corrigir
            </Button>
          </Stack>
        }
      >
        <Stack gap={16}>
          {erro && <Alert variant="danger">{erro}</Alert>}
          <Field label="Número de série" htmlFor="corrigirNumeroSerie" required hint={`Hoje: ${equipamento.numeroSerie || "vazio"}.`}>
            <Input
              id="corrigirNumeroSerie"
              value={numeroSerie}
              maxLength={100}
              onChange={(event) => setNumeroSerie(event.target.value)}
              disabled={salvando}
            />
          </Field>
          <Field label="Motivo" htmlFor="motivoCorrecaoSerie" required hint="Fica registrado no histórico do equipamento.">
            <Textarea id="motivoCorrecaoSerie" rows={3} value={motivo} onChange={(event) => setMotivo(event.target.value)} disabled={salvando} />
          </Field>
        </Stack>
      </Modal>

      <ConfirmDialog
        open={confirmando}
        title={`Corrigir o número de série do #${equipamento.numero}?`}
        variant="warning"
        message={`De "${equipamento.numeroSerie || "vazio"}" para "${numeroSerie.trim()}".`}
        confirmLabel="Corrigir"
        loading={salvando}
        onConfirm={salvar}
        onClose={() => {
          if (!salvando) setConfirmando(false);
        }}
      />
    </>
  );
}

/* Equipamento novo: código do item e ID configurado foram digitados na entrada. */
export function CorrigirDadosErpModal({ equipamento, onFechar, onConcluido }: ModalAjusteProps) {
  const [codigo, setCodigo] = useState(equipamento.erpCodigoItem ?? "");
  const [idErp, setIdErp] = useState(equipamento.erpIdItem ?? "");
  const [motivo, setMotivo] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function validar(): string | null {
    if (!codigo.trim()) return "Informe o código do item no ERP.";
    if (!idErp.trim()) return "Informe o ID configurado.";
    if (codigo.trim() === (equipamento.erpCodigoItem ?? "").trim() && idErp.trim() === (equipamento.erpIdItem ?? "").trim()) {
      return "O código e o ID informados são iguais aos atuais.";
    }
    if (motivo.trim().length < 5) return "Explique o motivo da correção (pelo menos 5 caracteres).";
    return null;
  }

  async function salvar() {
    setSalvando(true);
    try {
      const resultado = await corrigirDadosErpEquipamento(equipamento.id, {
        erpCodigoItem: codigo.trim(),
        erpIdItem: idErp.trim(),
        motivo: motivo.trim(),
      });
      setConfirmando(false);
      if (resultado.ok) onConcluido();
      else setErro(resultado.message ?? "Não foi possível corrigir os dados do ERP.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Modal
        open={!confirmando}
        title={`Corrigir código e ID do ERP do equipamento #${equipamento.numero}`}
        description="O extrato do ERP é buscado por esses dois dados. Ao corrigir, o que veio do ERP com os valores antigos é apagado e o extrato é buscado de novo."
        onClose={() => {
          if (!salvando) onFechar();
        }}
        footer={
          <Stack direction="row" gap={8} justify="end">
            <Button variant="secondary" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const mensagem = validar();
                setErro(mensagem);
                if (!mensagem) setConfirmando(true);
              }}
            >
              Corrigir
            </Button>
          </Stack>
        }
      >
        <Stack gap={16}>
          {erro && <Alert variant="danger">{erro}</Alert>}
          <Field label="Código do item no ERP" htmlFor="corrigirErpCodigo" required hint={`Hoje: ${equipamento.erpCodigoItem || "vazio"}.`}>
            <Input id="corrigirErpCodigo" value={codigo} maxLength={50} onChange={(event) => setCodigo(event.target.value)} disabled={salvando} />
          </Field>
          <Field
            label="ID configurado"
            htmlFor="corrigirErpId"
            required
            hint={`Hoje: ${equipamento.erpIdItem || "vazio"}. Não se repete entre equipamentos.`}
          >
            <Input id="corrigirErpId" value={idErp} maxLength={50} onChange={(event) => setIdErp(event.target.value)} disabled={salvando} />
          </Field>
          <Field label="Motivo" htmlFor="motivoCorrecaoErp" required hint="Fica registrado no histórico do equipamento.">
            <Textarea id="motivoCorrecaoErp" rows={3} value={motivo} onChange={(event) => setMotivo(event.target.value)} disabled={salvando} />
          </Field>
        </Stack>
      </Modal>

      <ConfirmDialog
        open={confirmando}
        title={`Corrigir os dados do ERP do #${equipamento.numero}?`}
        variant="warning"
        message="Os movimentos que vieram do ERP com o código e o ID antigos são apagados, o status volta ao do último movimento do Portal e o extrato é buscado de novo."
        confirmLabel="Corrigir"
        loading={salvando}
        onConfirm={salvar}
        onClose={() => {
          if (!salvando) setConfirmando(false);
        }}
      />
    </>
  );
}

export function AjustarStatusModal({ equipamento, onFechar, onConcluido }: ModalAjusteProps) {
  const [status, setStatus] = useState<StatusEquipamento | "">("");
  const [motivoBaixa, setMotivoBaixa] = useState<MotivoBaixa | "">("");
  const [comQuem, setComQuem] = useState("");
  const [motivo, setMotivo] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const opcoesStatus = (Object.keys(STATUS_LABELS) as StatusEquipamento[])
    .filter((valor) => valor !== equipamento.status)
    .map((valor) => ({ value: valor, label: STATUS_LABELS[valor] }));

  function validar(): string | null {
    if (!status) return "Escolha o status final.";
    if (status === "baixado" && !motivoBaixa) return "Informe o motivo da baixa.";
    if (motivo.trim().length < 5) return "Explique o motivo do ajuste (pelo menos 5 caracteres).";
    return null;
  }

  async function salvar() {
    if (!status) return;
    setSalvando(true);
    try {
      const resultado = await ajustarStatusEquipamento(equipamento.id, {
        status,
        motivoBaixa: status === "baixado" && motivoBaixa ? motivoBaixa : null,
        comQuem: STATUS_COM_QUEM.includes(status) ? comQuem.trim() || null : null,
        motivo: motivo.trim(),
      });
      setConfirmando(false);
      if (resultado.ok) onConcluido();
      else setErro(resultado.message ?? "Não foi possível ajustar o status.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Modal
        open={!confirmando}
        title={`Ajustar status do equipamento #${equipamento.numero}`}
        description="Para quando o status ficou errado, por exemplo por um lançamento equivocado no ERP. Grava um movimento de ajuste com a data de hoje, que passa a ser o último do extrato."
        onClose={() => {
          if (!salvando) onFechar();
        }}
        footer={
          <Stack direction="row" gap={8} justify="end">
            <Button variant="secondary" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const mensagem = validar();
                setErro(mensagem);
                if (!mensagem) setConfirmando(true);
              }}
            >
              Ajustar status
            </Button>
          </Stack>
        }
      >
        <Stack gap={16}>
          {erro && <Alert variant="danger">{erro}</Alert>}
          <Alert variant="info">
            O ajuste vale até o ERP ter um movimento mais novo que ele. Equipamento baixado deixa de ser consultado no ERP.
          </Alert>
          <Field label="Status final" required hint={`Hoje: ${STATUS_LABELS[equipamento.status]}.`}>
            <Dropdown
              value={status}
              options={opcoesStatus}
              placeholder="Escolha o status"
              onValueChange={(valor) => setStatus(valor as StatusEquipamento)}
              disabled={salvando}
            />
          </Field>
          {status === "baixado" && (
            <Field label="Motivo da baixa" required hint={'Só "Venda" conta como venda no painel gerencial.'}>
              <Dropdown
                value={motivoBaixa}
                options={MOTIVOS_BAIXA}
                placeholder="Escolha o motivo"
                onValueChange={(valor) => setMotivoBaixa(valor as MotivoBaixa)}
                disabled={salvando}
              />
            </Field>
          )}
          {status && STATUS_COM_QUEM.includes(status) && (
            <Field label="Com quem está" htmlFor="ajusteComQuem">
              <Input id="ajusteComQuem" value={comQuem} maxLength={200} onChange={(event) => setComQuem(event.target.value)} disabled={salvando} />
            </Field>
          )}
          <Field label="Motivo do ajuste" htmlFor="motivoAjusteStatus" required hint="Aparece no extrato e no histórico do equipamento.">
            <Textarea id="motivoAjusteStatus" rows={3} value={motivo} onChange={(event) => setMotivo(event.target.value)} disabled={salvando} />
          </Field>
        </Stack>
      </Modal>

      <ConfirmDialog
        open={confirmando}
        title={`Ajustar o status do #${equipamento.numero}?`}
        variant="warning"
        message={
          status
            ? `De "${STATUS_LABELS[equipamento.status]}" para "${STATUS_LABELS[status]}". O ajuste entra no extrato com a data de hoje e fica registrado no histórico.`
            : ""
        }
        confirmLabel="Ajustar status"
        loading={salvando}
        onConfirm={salvar}
        onClose={() => {
          if (!salvando) setConfirmando(false);
        }}
      />
    </>
  );
}
