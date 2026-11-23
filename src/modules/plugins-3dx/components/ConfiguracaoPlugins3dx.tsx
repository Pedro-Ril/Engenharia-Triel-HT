"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, Plus, Save, Trash2 } from "lucide-react";

import { Autocomplete } from "@/components/ui/Autocomplete";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import type { PortalUsuarioAdmin } from "@/modules/admin-permissoes/types/adminPermissoes.types";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import {
  adicionarDestinatario,
  alternarDestinatario,
  buscarVisaoGeral,
  listarDestinatarios,
  removerDestinatario,
  salvarPlugin,
} from "../services/plugins3dx.service";
import type { Ambiente3dx, Destinatario3dx, Plugin3dx } from "../types/plugins3dx.types";
import { AMBIENTES_3DX, EVENTOS_AVISO_3DX } from "../types/plugins3dx.types";
import { AMBIENTE, formatarDataHora, nomeCurtoPlugin } from "../utils/exibicao";
import styles from "./Plugins3dx.module.css";

interface ConfiguracaoProps {
  ambiente: Ambiente3dx | null;
  usuarios: PortalUsuarioAdmin[];
  onFeedback: FeedbackHandler;
}

/* Mesmo conjunto de parâmetros que o servidor aceita (PARAMETROS_PLUGIN em src/lib/plugins-3dx). */
type CampoParametro = {
  nome: string;
  tipo: "numero" | "booleano" | "texto";
  label: string;
  dica?: string;
  /* Ocupa a linha inteira (valor longo). */
  largo?: boolean;
};

const CAMPOS: Record<string, CampoParametro[]> = {
  "duplicate-title": [{ nome: "maxTitulo", tipo: "numero", label: "Tamanho máximo do título" }],
  "replace-revision": [
    { nome: "maxInstancias", tipo: "numero", label: "Limite de instâncias por liberação", dica: "Acima disso nada é trocado" },
    { nome: "esperaLiberacaoSeg", tipo: "numero", label: "Espera pela liberação (s)" },
    { nome: "obsoletarAnteriores", tipo: "booleano", label: "Obsoletar revisões anteriores liberadas" },
    { nome: "papel", tipo: "texto", label: "Contexto de segurança (ação manual)", dica: "ctx::papel.organização.projeto" },
  ],
  "drawing-config-link": [
    { nome: "maxVinculosPorDesenho", tipo: "numero", label: "Limite de vínculos por desenho" },
    { nome: "esperaLiberacaoSeg", tipo: "numero", label: "Espera pela liberação (s)" },
    { nome: "noturnoHora", tipo: "texto", label: "Hora da rotina noturna (HH:MM)" },
    { nome: "papel", tipo: "texto", label: "Contexto de segurança", dica: "ctx::papel.organização.projeto", largo: true },
    { nome: "noturnoAtivo", tipo: "booleano", label: "Rotina noturna ativa" },
  ],
};

export function ConfiguracaoPlugins3dx({ ambiente, usuarios, onFeedback }: ConfiguracaoProps) {
  const [plugins, setPlugins] = useState<Plugin3dx[] | null>(null);
  const [destinatarios, setDestinatarios] = useState<Destinatario3dx[]>([]);
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => {
    let cancelado = false;
    Promise.all([buscarVisaoGeral(), listarDestinatarios()]).then(([visao, dest]) => {
      if (cancelado) return;
      setPlugins(visao.ok && visao.data ? visao.data.plugins : []);
      setDestinatarios(dest.ok && dest.data ? dest.data : []);
    });
    return () => {
      cancelado = true;
    };
  }, [recarregar]);

  if (!plugins) return <Loader label="Carregando configuração..." />;

  /* Parâmetros são por ambiente: com filtro, só aquele; em "Ambos", os dois dentro do card do plugin. */
  const ambientesVisiveis = ambiente ? [ambiente] : AMBIENTES_3DX;
  /* Destinatário sem ambiente recebe dos dois, então aparece em qualquer filtro. */
  const destinatariosVisiveis = destinatarios.filter((d) => !ambiente || !d.ambiente || d.ambiente === ambiente);

  return (
    <Stack gap={20}>
      {plugins.map((plugin) => (
        <ParametrosPlugin
          key={plugin.chave}
          plugin={plugin}
          ambientes={ambientesVisiveis}
          onFeedback={onFeedback}
          onSalvo={() => setRecarregar((v) => v + 1)}
        />
      ))}
      <DestinatariosAvisos
        plugins={plugins}
        ambiente={ambiente}
        destinatarios={destinatariosVisiveis}
        usuarios={usuarios}
        onFeedback={onFeedback}
        onAlterado={() => setRecarregar((v) => v + 1)}
      />
    </Stack>
  );
}

function ParametrosPlugin({
  plugin,
  ambientes,
  onFeedback,
  onSalvo,
}: {
  plugin: Plugin3dx;
  ambientes: Ambiente3dx[];
  onFeedback: FeedbackHandler;
  onSalvo: () => void;
}) {
  const campos = CAMPOS[plugin.chave] ?? [];
  if (campos.length === 0) return null;

  return (
    <Card title={plugin.nome} description="Parâmetros lidos pelos nós do 3DSpace a cada minuto, separados por ambiente.">
      <div>
        {ambientes.map((amb) => (
          <ParametrosAmbiente
            /* Recria o formulário depois de salvar (volta a refletir o que está gravado). */
            key={`${amb}-${plugin.ambientes[amb].atualizadoEm ?? ""}`}
            plugin={plugin}
            ambiente={amb}
            campos={campos}
            onFeedback={onFeedback}
            onSalvo={onSalvo}
          />
        ))}
      </div>
    </Card>
  );
}

function ParametrosAmbiente({
  plugin,
  ambiente,
  campos,
  onFeedback,
  onSalvo,
}: {
  plugin: Plugin3dx;
  ambiente: Ambiente3dx;
  campos: CampoParametro[];
  onFeedback: FeedbackHandler;
  onSalvo: () => void;
}) {
  const config = plugin.ambientes[ambiente];
  const [valores, setValores] = useState<Record<string, unknown>>(config.parametros);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const parametros: Record<string, unknown> = {};
    for (const campo of campos) {
      const valor = valores[campo.nome];
      if (valor === undefined || valor === "") continue;
      parametros[campo.nome] = campo.tipo === "numero" ? Number(valor) : valor;
    }
    setSalvando(true);
    const resposta = await salvarPlugin(plugin.chave, { ambiente, parametros });
    setSalvando(false);
    if (resposta.ok) {
      onFeedback("success", `Parâmetros salvos (${AMBIENTE[ambiente].label})`, resposta.message ?? "");
      onSalvo();
    } else {
      onFeedback("danger", "Não foi possível salvar", resposta.message ?? "");
    }
  }

  const camposValor = campos.filter((campo) => campo.tipo !== "booleano");
  const camposLiga = campos.filter((campo) => campo.tipo === "booleano");

  return (
    <section className={styles.secaoAmbiente}>
      <div className={styles.linhaModoInfo}>
        <span className={styles.ambienteNome}>
          <span className={styles[`ponto_${ambiente}`]} aria-hidden="true" />
          {AMBIENTE[ambiente].label}
        </span>
        {config.atualizadoEm && (
          <span className={styles.textoSecundario}>
            alterado por {config.atualizadoPorNome ?? "—"} em {formatarDataHora(config.atualizadoEm)}
          </span>
        )}
      </div>

      {camposValor.length > 0 && (
        <FormGrid columns={camposValor.length === 1 ? 2 : 3}>
          {camposValor.map((campo) => (
            <Field
              key={campo.nome}
              label={campo.label}
              hint={campo.dica}
              className={campo.largo ? styles.campoLargo : undefined}
            >
              <Input
                type={campo.tipo === "numero" ? "number" : "text"}
                value={valores[campo.nome] === undefined ? "" : String(valores[campo.nome])}
                disabled={salvando}
                onChange={(e) => setValores((v) => ({ ...v, [campo.nome]: e.target.value }))}
              />
            </Field>
          ))}
        </FormGrid>
      )}

      {camposLiga.length > 0 && (
        <div className={styles.switches}>
          {camposLiga.map((campo) => (
            <Switch
              key={campo.nome}
              label={campo.label}
              hint={campo.dica}
              checked={valores[campo.nome] === true}
              disabled={salvando}
              onChange={(e) => setValores((v) => ({ ...v, [campo.nome]: e.target.checked }))}
            />
          ))}
        </div>
      )}

      <Stack direction="row" justify="end">
        <Button onClick={salvar} loading={salvando}>
          <Save size={15} />
          Salvar parâmetros de {AMBIENTE[ambiente].label.toLowerCase()}
        </Button>
      </Stack>
    </section>
  );
}

const OPCOES_AMBIENTE_AVISO = [
  { value: "", label: "Os dois" },
  ...AMBIENTES_3DX.map((valor) => ({ value: valor, label: AMBIENTE[valor].label })),
];

function DestinatariosAvisos({
  plugins,
  ambiente,
  destinatarios,
  usuarios,
  onFeedback,
  onAlterado,
}: {
  plugins: Plugin3dx[];
  ambiente: Ambiente3dx | null;
  destinatarios: Destinatario3dx[];
  usuarios: PortalUsuarioAdmin[];
  onFeedback: FeedbackHandler;
  onAlterado: () => void;
}) {
  const opcoesEvento = useMemo(
    () =>
      Object.entries(EVENTOS_AVISO_3DX)
        /* Avisos gerais (ambiente 3DX, sem plugin) primeiro: valor "|evento" = pluginChave vazio. */
        .sort(([, a], [, b]) => Number(Boolean(b.geral)) - Number(Boolean(a.geral)))
        .flatMap(([evento, info]) =>
          info.geral
            ? [{ value: `|${evento}`, label: info.label }]
            : info.plugins
                .filter((p) => plugins.some((pl) => pl.chave === p))
                .map((p) => ({
                  value: `${p}|${evento}`,
                  label: `${info.label} (${nomeCurtoPlugin(p)})`,
                }))
        ),
    [plugins]
  );
  /* Busca por nome ou e-mail (o label tem os dois). Nenhum usuário escolhido = e-mail livre ao lado. */
  const opcoesUsuario = useMemo(
    () =>
      usuarios
        .filter((u) => u.ativo && u.email)
        .sort((a, b) => a.nomeExibicao.localeCompare(b.nomeExibicao, "pt-BR"))
        .map((u) => ({ value: u.id, label: `${u.nomeExibicao} (${u.email})` })),
    [usuarios]
  );

  const [alvo, setAlvo] = useState(opcoesEvento[0]?.value ?? "");
  /* "" = os dois ambientes. Começa no ambiente do filtro do topo, se houver. */
  const [ambienteAviso, setAmbienteAviso] = useState<string>(ambiente ?? "");
  const [usuarioId, setUsuarioId] = useState("");
  const [email, setEmail] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [remover, setRemover] = useState<Destinatario3dx | null>(null);

  async function adicionar() {
    const [pluginChave, evento] = alvo.split("|");
    setAdicionando(true);
    const resposta = await adicionarDestinatario({
      pluginChave: pluginChave || null,
      evento,
      ambiente: (ambienteAviso || null) as Ambiente3dx | null,
      usuarioId: usuarioId || null,
      email: usuarioId ? null : email.trim() || null,
    });
    setAdicionando(false);
    if (resposta.ok) {
      onFeedback("success", "Destinatário adicionado", "");
      setEmail("");
      setUsuarioId("");
      onAlterado();
    } else {
      onFeedback("danger", "Não foi possível adicionar", resposta.message ?? "");
    }
  }

  async function alternar(destinatario: Destinatario3dx) {
    const resposta = await alternarDestinatario(destinatario.id, !destinatario.ativo);
    if (resposta.ok) onAlterado();
    else onFeedback("danger", "Não foi possível alterar", resposta.message ?? "");
  }

  async function confirmarRemocao() {
    if (!remover) return;
    const resposta = await removerDestinatario(remover.id);
    setRemover(null);
    if (resposta.ok) onAlterado();
    else onFeedback("danger", "Não foi possível remover", resposta.message ?? "");
  }

  return (
    <Card
      title="Quem recebe aviso"
      description="E-mail enviado pelo Portal quando o evento acontece: atualização do 3DEXPERIENCE e problemas no ambiente (hotfix, padrão de visualização perdido, nó sem resposta), revisão trocada em conjuntos liberados e falhas dos plugins. Revisão trocada só avisa no modo Ativo."
    >
      <Stack gap={16}>
        <div className={`${styles.formLinha} ${styles.formDestinatario}`}>
          <Field label="Evento">
            <Dropdown value={alvo} options={opcoesEvento} onValueChange={setAlvo} />
          </Field>
          <Field label="Ambiente">
            <Dropdown value={ambienteAviso} options={OPCOES_AMBIENTE_AVISO} onValueChange={setAmbienteAviso} />
          </Field>
          <Field label="Usuário do Portal">
            <Autocomplete
              options={opcoesUsuario}
              selectedOption={opcoesUsuario.find((opcao) => opcao.value === usuarioId) ?? null}
              onSelect={(opcao) => setUsuarioId(opcao?.value ?? "")}
              placeholder="Pesquise por nome ou e-mail"
              emptyMessage="Nenhum usuário ativo com e-mail encontrado."
            />
          </Field>
          {/* Fica sempre na tela (só desabilita) para a linha não pular quando escolhe um usuário. */}
          <Field label="E-mail">
            <Input
              value={usuarioId ? "" : email}
              placeholder={usuarioId ? "Usa o e-mail do usuário" : "ou digite um e-mail"}
              disabled={Boolean(usuarioId)}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Button onClick={adicionar} loading={adicionando} disabled={!alvo || (!usuarioId && !email.trim())}>
            <Plus size={15} />
            Adicionar
          </Button>
        </div>

        {destinatarios.length === 0 ? (
          <EmptyState icon={<Mail size={26} />} title="Ninguém na lista" description="Sem destinatário, nenhum aviso é enviado." />
        ) : (
          <Table minWidth={820}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Evento</TableHeaderCell>
                <TableHeaderCell>Ambiente</TableHeaderCell>
                <TableHeaderCell>Destinatário</TableHeaderCell>
                <TableHeaderCell align="center">Ativo</TableHeaderCell>
                <TableHeaderCell align="center">Ações</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {destinatarios.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    {d.pluginChave
                      ? (plugins.find((p) => p.chave === d.pluginChave)?.nome ?? d.pluginChave)
                      : "Ambiente 3DEXPERIENCE"}
                    <div className={styles.textoSecundario}>{EVENTOS_AVISO_3DX[d.evento]?.label ?? d.evento}</div>
                  </TableCell>
                  <TableCell>
                    {d.ambiente ? (
                      <Badge variant={AMBIENTE[d.ambiente].variante}>{AMBIENTE[d.ambiente].label}</Badge>
                    ) : (
                      <Badge variant="neutral">Os dois</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {d.usuarioNome ?? d.nome ?? d.email}
                    <div className={styles.textoSecundario}>{d.emailEfetivo ?? "sem e-mail no AD"}</div>
                  </TableCell>
                  <TableCell align="center">
                    <Switch compact label="" checked={d.ativo} onChange={() => alternar(d)} />
                  </TableCell>
                  <TableCell align="center">
                    <IconButton
                      icon={<Trash2 size={15} />}
                      label="Remover"
                      variant="danger"
                      size="small"
                      onClick={() => setRemover(d)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Stack>

      <ConfirmDialog
        open={remover !== null}
        title="Remover destinatário"
        variant="danger"
        message={`${remover?.usuarioNome ?? remover?.email ?? ""} deixa de receber este aviso.`}
        confirmLabel="Remover"
        onConfirm={confirmarRemocao}
        onClose={() => setRemover(null)}
      />
    </Card>
  );
}
