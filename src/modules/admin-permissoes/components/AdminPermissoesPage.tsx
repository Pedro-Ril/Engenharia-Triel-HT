"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  BookOpen,
  Boxes,
  Download,
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
import { Stack } from "@/components/ui/Stack";
import { StatCard } from "@/components/ui/StatCard";
import { Toast } from "@/components/ui/Toast";

import type { DownloadAdmin } from "@/modules/downloads/types/downloads.types";
import type { WikiArtigo } from "@/modules/wiki/types/wiki.types";

import {
  buscarConfiguracaoAd,
  buscarConfiguracaoDb,
  listarDownloadsAdmin,
  listarModulos,
  listarPermissoes,
  listarSetores,
  listarUsuarios,
  listarWikiArtigosAdmin,
} from "../services/adminPermissoes.service";
import type {
  ConfiguracaoAd,
  ConfiguracaoDb,
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
import { ConfiguracaoDbPainel } from "./ConfiguracaoDbPainel";
import { DownloadsPainel } from "./DownloadsPainel";
import { MonitoramentoPainel } from "./MonitoramentoPainel";
import { PermissoesPainel } from "./PermissoesPainel";
import { SetoresModulosPainel } from "./SetoresModulosPainel";
import { TerminalFabricaPainel } from "./TerminalFabricaPainel";
import { UsuariosPainel } from "./UsuariosPainel";
import { WikiPainel } from "./WikiPainel";

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
        valor: "downloads",
        label: "Downloads",
        icon: <Download size={16} />,
      },
      {
        valor: "chamados",
        label: "Chamados",
        icon: <Headset size={16} />,
      },
      {
        valor: "monitoramento",
        label: "Monitoramento",
        icon: <Activity size={16} />,
      },
      {
        valor: "wiki",
        label: "Wiki",
        icon: <BookOpen size={16} />,
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
  const [configuracaoDb, setConfiguracaoDb] = useState<ConfiguracaoDb | null>(null);
  const [downloads, setDownloads] = useState<DownloadAdmin[]>([]);
  const [wikiArtigos, setWikiArtigos] = useState<WikiArtigo[]>([]);

  function mostrarFeedback(
    variant: ToastState["variant"],
    title: string,
    description: string
  ) {
    setToast({ open: true, variant, title, description });
  }

  useEffect(() => {
    async function carregar(mostrarLoader: boolean) {
      if (mostrarLoader) setCarregando(true);

      const [
        setoresData,
        modulosData,
        usuariosData,
        permissoesData,
        configuracaoAdData,
        configuracaoDbData,
        downloadsData,
        wikiArtigosData,
      ] = await Promise.all([
        listarSetores(),
        listarModulos(),
        listarUsuarios(),
        listarPermissoes(),
        buscarConfiguracaoAd(),
        buscarConfiguracaoDb(),
        listarDownloadsAdmin(),
        listarWikiArtigosAdmin(),
      ]);

      setSetores(setoresData);
      setModulos(modulosData);
      setUsuarios(usuariosData);
      setPermissoes(permissoesData);
      setConfiguracaoAd(configuracaoAdData);
      setConfiguracaoDb(configuracaoDbData);
      setDownloads(downloadsData);
      setWikiArtigos(wikiArtigosData);
      setCarregando(false);
    }

    carregar(true);

    /*
     * Não há controle de versão nas escritas — se outro admin
     * mexer nesses dados enquanto esta aba fica em segundo
     * plano, buscar de novo ao voltar reduz (sem eliminar) a
     * chance de sobrescrever uma mudança recente às cegas.
     */
    function aoFicarVisivel() {
      if (document.visibilityState === "visible") {
        carregar(false);
      }
    }

    document.addEventListener("visibilitychange", aoFicarVisivel);
    return () => document.removeEventListener("visibilitychange", aoFicarVisivel);
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
              permissoes={permissoes}
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
            <Stack gap={20}>
              <ConfiguracaoAdPainel
                configuracaoAd={configuracaoAd}
                onFeedback={mostrarFeedback}
                onConfiguracaoAtualizada={setConfiguracaoAd}
              />

              <ConfiguracaoDbPainel
                configuracaoDb={configuracaoDb}
                onFeedback={mostrarFeedback}
                onConfiguracaoAtualizada={setConfiguracaoDb}
              />
            </Stack>
          )}

          {secao === "terminal-fabrica" && <TerminalFabricaPainel />}

          {secao === "atualizacoes" && (
            <AtualizacoesPainel onFeedback={mostrarFeedback} />
          )}

          {secao === "downloads" && (
            <DownloadsPainel
              downloads={downloads}
              onFeedback={mostrarFeedback}
              onDownloadCriado={(download) =>
                setDownloads((atual) => [...atual, download])
              }
              onDownloadAtualizado={(download) =>
                setDownloads((atual) =>
                  atual.map((item) => (item.id === download.id ? download : item))
                )
              }
              onDownloadExcluido={(id) =>
                setDownloads((atual) => atual.filter((item) => item.id !== id))
              }
              onDownloadsRecarregados={setDownloads}
            />
          )}

          {secao === "chamados" && (
            <AtendentesChamadosPainel onFeedback={mostrarFeedback} />
          )}

          {secao === "monitoramento" && (
            <MonitoramentoPainel onFeedback={mostrarFeedback} />
          )}

          {secao === "wiki" && (
            <WikiPainel
              artigos={wikiArtigos}
              modulos={modulos}
              onFeedback={mostrarFeedback}
              onArtigoCriado={(artigo) => setWikiArtigos((atual) => [...atual, artigo])}
              onArtigoAtualizado={(artigo) =>
                setWikiArtigos((atual) =>
                  atual.map((item) => (item.id === artigo.id ? artigo : item))
                )
              }
              onArtigoExcluido={(id) =>
                setWikiArtigos((atual) => atual.filter((item) => item.id !== id))
              }
              onArtigosRecarregados={setWikiArtigos}
            />
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
