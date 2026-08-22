"use client";

import { useEffect, useState } from "react";
import {
  Boxes,
  Factory,
  Headset,
  Home,
  KeyRound,
  Layers,
  Megaphone,
  Settings,
  Users,
} from "lucide-react";

import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { FormGrid } from "@/components/ui/FormGrid";
import { Loader } from "@/components/ui/Loader";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Toast } from "@/components/ui/Toast";

import {
  buscarConfiguracaoAd,
  listarModulos,
  listarPermissoes,
  listarSetores,
  listarUsuarios,
} from "../services/adminPermissoes.service";
import type {
  ConfiguracaoAd,
  PortalModulo,
  PortalPermissao,
  PortalSetor,
  PortalUsuarioAdmin,
} from "../types/adminPermissoes.types";
import type { ToastState } from "../types/toast.types";
import { AdminNavegacao } from "./AdminNavegacao";
import type { GrupoNavegacaoAdmin } from "./AdminNavegacao";
import styles from "./AdminPermissoes.module.css";
import { AtendentesChamadosPainel } from "./AtendentesChamadosPainel";
import { AtualizacoesPainel } from "./AtualizacoesPainel";
import { ConfiguracaoAdPainel } from "./ConfiguracaoAdPainel";
import { PermissoesPainel } from "./PermissoesPainel";
import { SetoresModulosPainel } from "./SetoresModulosPainel";
import { TerminalFabricaPainel } from "./TerminalFabricaPainel";
import { UsuariosPainel } from "./UsuariosPainel";

const toastInicial: ToastState = {
  open: false,
  variant: "success",
  title: "",
  description: "",
};

const GRUPOS_NAVEGACAO: GrupoNavegacaoAdmin[] = [
  {
    titulo: "Acessos",
    itens: [
      { valor: "permissoes", label: "Permissões", icon: <KeyRound size={16} /> },
      { valor: "usuarios", label: "Usuários", icon: <Users size={16} /> },
      {
        valor: "setores",
        label: "Setores e módulos",
        icon: <Layers size={16} />,
      },
    ],
  },
  {
    titulo: "Sistema",
    itens: [
      {
        valor: "configuracoes",
        label: "Configurações",
        icon: <Settings size={16} />,
      },
      {
        valor: "terminal-fabrica",
        label: "Terminal de Fábrica",
        icon: <Factory size={16} />,
      },
      {
        valor: "atualizacoes",
        label: "Atualizações",
        icon: <Megaphone size={16} />,
      },
      {
        valor: "chamados",
        label: "Chamados",
        icon: <Headset size={16} />,
      },
    ],
  },
];

export function AdminPermissoesPage() {
  const [carregando, setCarregando] = useState(true);
  const [secao, setSecao] = useState("permissoes");
  const [toast, setToast] = useState<ToastState>(toastInicial);

  const [setores, setSetores] = useState<PortalSetor[]>([]);
  const [modulos, setModulos] = useState<PortalModulo[]>([]);
  const [usuarios, setUsuarios] = useState<PortalUsuarioAdmin[]>([]);
  const [permissoes, setPermissoes] = useState<PortalPermissao[]>([]);
  const [configuracaoAd, setConfiguracaoAd] = useState<ConfiguracaoAd | null>(
    null
  );

  function mostrarFeedback(
    variant: ToastState["variant"],
    title: string,
    description: string
  ) {
    setToast({ open: true, variant, title, description });
  }

  useEffect(() => {
    async function carregar() {
      const [
        setoresData,
        modulosData,
        usuariosData,
        permissoesData,
        configuracaoAdData,
      ] = await Promise.all([
        listarSetores(),
        listarModulos(),
        listarUsuarios(),
        listarPermissoes(),
        buscarConfiguracaoAd(),
      ]);

      setSetores(setoresData);
      setModulos(modulosData);
      setUsuarios(usuariosData);
      setPermissoes(permissoesData);
      setConfiguracaoAd(configuracaoAdData);
      setCarregando(false);
    }

    carregar();
  }, []);

  if (carregando) {
    return (
      <PageContainer>
        <Loader label="Carregando dados de administração..." />
      </PageContainer>
    );
  }

  const setoresAtivos = setores.filter((setor) => setor.ativo).length;
  const modulosAtivos = modulos.filter((modulo) => modulo.ativo).length;

  return (
    <PageContainer>
      <PageHeader
        title="Administração"
        description="Acessos, usuários, setores, integrações e as demais configurações do portal, tudo num só lugar."
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home /> },
          { label: "Administração" },
        ]}
      />

      <FormGrid columns={4}>
        <StatCard
          label="Setores ativos"
          value={setoresAtivos}
          description={`${setores.length} cadastrado(s) no total.`}
          icon={<Layers />}
        />

        <StatCard
          label="Módulos ativos"
          value={modulosAtivos}
          description={`${modulos.length} cadastrado(s) no total.`}
          icon={<Boxes />}
        />

        <StatCard
          label="Usuários"
          value={usuarios.length}
          description="Já logaram no portal ao menos uma vez."
          icon={<Users />}
        />

        <StatCard
          label="Permissões concedidas"
          value={permissoes.length}
          description="Acessos individuais liberados."
          icon={<KeyRound />}
        />
      </FormGrid>

      <div className={styles.paginaAdminGrid}>
        <AdminNavegacao
          grupos={GRUPOS_NAVEGACAO}
          ativo={secao}
          onSelecionar={setSecao}
        />

        <div className={styles.paginaAdminConteudo}>
          {secao === "permissoes" && (
            <PermissoesPainel
              setores={setores}
              modulos={modulos}
              usuarios={usuarios}
              permissoes={permissoes}
              onFeedback={mostrarFeedback}
              onPermissaoCriada={(permissao) =>
                setPermissoes((atual) => [...atual, permissao])
              }
              onPermissaoRemovida={(permissaoId) =>
                setPermissoes((atual) =>
                  atual.filter((item) => item.id !== permissaoId)
                )
              }
            />
          )}

          {secao === "usuarios" && (
            <UsuariosPainel
              usuarios={usuarios}
              onFeedback={mostrarFeedback}
              onUsuarioAtualizado={(usuario) =>
                setUsuarios((atual) =>
                  atual.map((item) =>
                    item.id === usuario.id ? usuario : item
                  )
                )
              }
              onUsuarioExcluido={(usuarioId) => {
                setUsuarios((atual) =>
                  atual.filter((item) => item.id !== usuarioId)
                );
                setPermissoes((atual) =>
                  atual.filter((item) => item.usuarioId !== usuarioId)
                );
              }}
              onUsuariosImportados={setUsuarios}
            />
          )}

          {secao === "setores" && (
            <SetoresModulosPainel
              setores={setores}
              modulos={modulos}
              onFeedback={mostrarFeedback}
              onSetorCriado={(setor) =>
                setSetores((atual) => [...atual, setor])
              }
              onSetorAtualizado={(setor) =>
                setSetores((atual) =>
                  atual.map((item) => (item.id === setor.id ? setor : item))
                )
              }
              onSetorExcluido={(setorId) =>
                setSetores((atual) =>
                  atual.filter((item) => item.id !== setorId)
                )
              }
              onModuloCriado={(modulo) =>
                setModulos((atual) => [...atual, modulo])
              }
              onModuloAtualizado={(modulo) =>
                setModulos((atual) =>
                  atual.map((item) =>
                    item.id === modulo.id ? modulo : item
                  )
                )
              }
              onModuloExcluido={(moduloId) =>
                setModulos((atual) =>
                  atual.filter((item) => item.id !== moduloId)
                )
              }
            />
          )}

          {secao === "configuracoes" && (
            <ConfiguracaoAdPainel
              configuracaoAd={configuracaoAd}
              onFeedback={mostrarFeedback}
              onConfiguracaoAtualizada={setConfiguracaoAd}
            />
          )}

          {secao === "terminal-fabrica" && <TerminalFabricaPainel />}

          {secao === "atualizacoes" && (
            <AtualizacoesPainel onFeedback={mostrarFeedback} />
          )}

          {secao === "chamados" && (
            <AtendentesChamadosPainel onFeedback={mostrarFeedback} />
          )}
        </div>
      </div>

      <Toast
        open={toast.open}
        variant={toast.variant}
        title={toast.title}
        description={toast.description}
        onClose={() => setToast((atual) => ({ ...atual, open: false }))}
      />
    </PageContainer>
  );
}
