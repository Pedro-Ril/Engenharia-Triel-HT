"use client";

import { useEffect, useState } from "react";
import { Boxes, Home, KeyRound, Layers, Users } from "lucide-react";

import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { FormGrid } from "@/components/ui/FormGrid";
import { Loader } from "@/components/ui/Loader";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Tabs } from "@/components/ui/Tabs";
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
import { ConfiguracaoAdPainel } from "./ConfiguracaoAdPainel";
import { PermissoesPainel } from "./PermissoesPainel";
import { SetoresModulosPainel } from "./SetoresModulosPainel";
import { UsuariosPainel } from "./UsuariosPainel";

const toastInicial: ToastState = {
  open: false,
  variant: "success",
  title: "",
  description: "",
};

export function AdminPermissoesPage() {
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState("permissoes");
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
        <Loader label="Carregando dados de permissões..." />
      </PageContainer>
    );
  }

  const setoresAtivos = setores.filter((setor) => setor.ativo).length;
  const modulosAtivos = modulos.filter((modulo) => modulo.ativo).length;

  return (
    <PageContainer>
      <PageHeader
        title="Gestão de permissões"
        description="Controle quem tem acesso a cada ferramenta do portal, organize setores e defina o código de empresa de cada usuário."
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

      <Tabs
        value={aba}
        onValueChange={setAba}
        items={[
          {
            value: "permissoes",
            label: "Permissões",
            content: (
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
            ),
          },
          {
            value: "usuarios",
            label: "Usuários",
            content: (
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
            ),
          },
          {
            value: "setores",
            label: "Setores e módulos",
            content: (
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
            ),
          },
          {
            value: "configuracoes",
            label: "Configurações",
            content: (
              <ConfiguracaoAdPainel
                configuracaoAd={configuracaoAd}
                onFeedback={mostrarFeedback}
                onConfiguracaoAtualizada={setConfiguracaoAd}
              />
            ),
          },
        ]}
      />

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
