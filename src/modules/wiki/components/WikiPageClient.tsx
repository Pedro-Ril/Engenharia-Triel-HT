"use client";

import { useMemo, useState } from "react";
import { BookOpen, Home, Lock } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { RichTextViewer } from "@/components/ui/RichTextEditor";
import { Stack } from "@/components/ui/Stack";

import type { WikiArtigo } from "../types/wiki.types";
import styles from "./Wiki.module.css";

interface WikiPageClientProps {
  artigos: WikiArtigo[];
}

interface GrupoWiki {
  chave: string;
  titulo: string;
  artigos: WikiArtigo[];
}

const GRUPO_GERAL = "geral";

function agruparPorModulo(artigos: WikiArtigo[]): GrupoWiki[] {
  const mapa = new Map<string, GrupoWiki>();

  for (const artigo of artigos) {
    const chave = artigo.moduloId ?? GRUPO_GERAL;
    const titulo = artigo.moduloNome ?? "Geral";

    if (!mapa.has(chave)) {
      mapa.set(chave, { chave, titulo, artigos: [] });
    }

    mapa.get(chave)?.artigos.push(artigo);
  }

  return Array.from(mapa.values()).sort((a, b) => {
    if (a.chave === GRUPO_GERAL) return -1;
    if (b.chave === GRUPO_GERAL) return 1;
    return a.titulo.localeCompare(b.titulo, "pt-BR");
  });
}

export function WikiPageClient({ artigos }: WikiPageClientProps) {
  const [selecionado, setSelecionado] = useState<WikiArtigo | null>(null);

  const grupos = useMemo(() => agruparPorModulo(artigos), [artigos]);

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

      {artigos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen size={28} />}
            title="Nenhum artigo disponível"
            description="Ainda não há conteúdo publicado para o seu perfil."
          />
        </Card>
      ) : (
        grupos.map((grupo) => (
          <Card key={grupo.chave} title={grupo.titulo}>
            <div className={styles.lista}>
              {grupo.artigos.map((artigo) => (
                <button
                  key={artigo.id}
                  type="button"
                  className={styles.item}
                  onClick={() => setSelecionado(artigo)}
                >
                  <span className={styles.itemTitulo}>{artigo.titulo}</span>

                  {artigo.privadoAdmin && (
                    <Badge variant="warning">
                      <Stack direction="row" gap={5} align="center">
                        <Lock size={11} />
                        Somente admin
                      </Stack>
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </Card>
        ))
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
