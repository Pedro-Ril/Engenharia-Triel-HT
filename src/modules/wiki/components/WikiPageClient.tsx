"use client";

import { useMemo, useState } from "react";
import { BookOpen, Home, Lock, Search } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { RichTextViewer } from "@/components/ui/RichTextEditor";
import { Stack } from "@/components/ui/Stack";

import type { SetorComModulos } from "@/lib/auth/autorizacao";

import type { WikiArtigo } from "../types/wiki.types";
import styles from "./Wiki.module.css";

interface WikiPageClientProps {
  artigos: WikiArtigo[];
  setoresComModulos: SetorComModulos[];
}

interface ModuloComArtigos {
  moduloId: string;
  moduloNome: string;
  artigos: WikiArtigo[];
}

interface SetorComArtigos {
  setorId: string;
  setorNome: string;
  modulos: ModuloComArtigos[];
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function construirArvore(
  artigos: WikiArtigo[],
  setoresComModulos: SetorComModulos[]
): { geral: WikiArtigo[]; setores: SetorComArtigos[]; outros: WikiArtigo[] } {
  const geral = artigos.filter((artigo) => artigo.moduloId === null);

  const idsModulosConhecidos = new Set(
    setoresComModulos.flatMap((setor) => setor.modulos.map((modulo) => modulo.id))
  );
  const outros = artigos.filter(
    (artigo) => artigo.moduloId !== null && !idsModulosConhecidos.has(artigo.moduloId)
  );

  const setores = setoresComModulos
    .map((setor) => {
      const modulos: ModuloComArtigos[] = setor.modulos
        .map((modulo) => ({
          moduloId: modulo.id,
          moduloNome: modulo.nome,
          artigos: artigos.filter((artigo) => artigo.moduloId === modulo.id),
        }))
        .filter((grupo) => grupo.artigos.length > 0);

      return { setorId: setor.id, setorNome: setor.nome, modulos };
    })
    .filter((setor) => setor.modulos.length > 0);

  return { geral, setores, outros };
}

export function WikiPageClient({ artigos, setoresComModulos }: WikiPageClientProps) {
  const [selecionado, setSelecionado] = useState<WikiArtigo | null>(null);
  const [busca, setBusca] = useState("");
  const [topicoFiltro, setTopicoFiltro] = useState("");

  const opcoesTopico = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const artigo of artigos) {
      if (artigo.topicoId && artigo.topicoNome) {
        mapa.set(artigo.topicoId, artigo.topicoNome);
      }
    }
    return [
      { value: "", label: "Todos os tópicos" },
      ...Array.from(mapa.entries())
        .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [artigos]);

  const artigosFiltrados = useMemo(() => {
    const buscaNormalizada = normalizar(busca.trim());

    return artigos.filter((artigo) => {
      if (topicoFiltro && artigo.topicoId !== topicoFiltro) return false;
      if (buscaNormalizada && !normalizar(artigo.titulo).includes(buscaNormalizada)) return false;
      return true;
    });
  }, [artigos, busca, topicoFiltro]);

  const arvore = useMemo(
    () => construirArvore(artigosFiltrados, setoresComModulos),
    [artigosFiltrados, setoresComModulos]
  );

  const nenhumResultado =
    arvore.geral.length === 0 && arvore.setores.length === 0 && arvore.outros.length === 0;

  function renderItem(artigo: WikiArtigo) {
    return (
      <button
        key={artigo.id}
        type="button"
        className={styles.item}
        onClick={() => setSelecionado(artigo)}
      >
        <span className={styles.itemTitulo}>{artigo.titulo}</span>

        <Stack direction="row" gap={6} align="center">
          {artigo.topicoNome && <Badge variant="info">{artigo.topicoNome}</Badge>}

          {artigo.privadoAdmin && (
            <Badge variant="warning">
              <Stack direction="row" gap={5} align="center">
                <Lock size={11} />
                Somente admin
              </Stack>
            </Badge>
          )}
        </Stack>
      </button>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Wiki"
        description="Informações e boas práticas dos módulos que você tem acesso."
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Wiki", current: true, icon: <BookOpen size={14} /> },
        ]}
      />

      {artigos.length > 0 && (
        <Card>
          <div className={styles.filtros}>
            <div className={styles.filtroBusca}>
              <Input
                placeholder="Buscar por título..."
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
              />
            </div>

            {opcoesTopico.length > 1 && (
              <div className={styles.filtroTopico}>
                <Dropdown
                  value={topicoFiltro}
                  options={opcoesTopico}
                  onValueChange={setTopicoFiltro}
                />
              </div>
            )}
          </div>
        </Card>
      )}

      {artigos.length === 0 && (
        <Card>
          <EmptyState
            icon={<BookOpen size={28} />}
            title="Nenhum artigo disponível"
            description="Ainda não há conteúdo publicado para o seu perfil."
          />
        </Card>
      )}

      {artigos.length > 0 && nenhumResultado && (
        <Card>
          <EmptyState
            icon={<Search size={28} />}
            title="Nenhum artigo encontrado"
            description="Tente ajustar a busca ou o filtro de tópico."
          />
        </Card>
      )}

      {arvore.geral.length > 0 && (
        <Card title="Geral">
          <div className={styles.lista}>{arvore.geral.map(renderItem)}</div>
        </Card>
      )}

      {arvore.setores.map((setor) => (
        <Card key={setor.setorId} title={setor.setorNome}>
          <Stack gap={16}>
            {setor.modulos.map((modulo) => (
              <div key={modulo.moduloId} className={styles.moduloGrupo}>
                <span className={styles.moduloSubtitulo}>{modulo.moduloNome}</span>
                <div className={styles.lista}>{modulo.artigos.map(renderItem)}</div>
              </div>
            ))}
          </Stack>
        </Card>
      ))}

      {arvore.outros.length > 0 && (
        <Card title="Outros">
          <div className={styles.lista}>{arvore.outros.map(renderItem)}</div>
        </Card>
      )}

      <Modal
        open={selecionado !== null}
        onClose={() => setSelecionado(null)}
        title={selecionado?.titulo ?? ""}
        description={selecionado?.moduloNome ?? "Geral"}
        size="large"
      >
        {selecionado && <RichTextViewer html={selecionado.conteudo} />}
      </Modal>
    </PageContainer>
  );
}
