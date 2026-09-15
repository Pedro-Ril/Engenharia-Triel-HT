"use client";

import { useEffect, useState } from "react";
import { Expand, Maximize2, Shrink } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";

import { listarCamerasParaVisualizacao } from "../services/semaforo.service";
import type { CameraParaVisualizacao } from "../types/semaforo.types";
import { CameraPreview } from "./CameraPreview";
import styles from "./CamerasGrid.module.css";

/*
 * Um Card por câmera, em grade responsiva de cards médios -- cada um
 * tem dois controles independentes: "Ampliar card" alterna esse card
 * pra ocupar a linha toda da grade (mesmo tamanho de antes, só que
 * dentro do fluxo normal, sem sair da página), e "Ver em tela cheia"
 * abre num Modal por cima de tudo.
 */
export function CamerasGrid() {
  const [cameras, setCameras] = useState<CameraParaVisualizacao[]>([]);
  const [buscou, setBuscou] = useState(false);
  const [idsAmpliados, setIdsAmpliados] = useState<Set<string>>(new Set());
  const [cameraNoModal, setCameraNoModal] = useState<CameraParaVisualizacao | null>(null);

  useEffect(() => {
    let cancelado = false;

    listarCamerasParaVisualizacao().then((dados) => {
      if (cancelado) return;
      setCameras(dados);
      setBuscou(true);
    });

    return () => {
      cancelado = true;
    };
  }, []);

  function alternarAmpliado(id: string) {
    setIdsAmpliados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) {
        novo.delete(id);
      } else {
        novo.add(id);
      }
      return novo;
    });
  }

  if (buscou && cameras.length === 0) {
    return <p className={styles.mensagemVazia}>Nenhuma câmera cadastrada.</p>;
  }

  return (
    <>
      <div className={styles.grade}>
        {cameras.map((camera) => {
          const ampliado = idsAmpliados.has(camera.id);

          return (
            <div key={camera.id} className={ampliado ? styles.itemAmpliado : undefined}>
              <Card
                title={camera.nome}
                actions={
                  <Stack direction="row" gap={6}>
                    <IconButton
                      size="small"
                      variant="neutral"
                      icon={ampliado ? <Shrink size={15} /> : <Expand size={15} />}
                      label={ampliado ? "Reduzir card" : "Ampliar card"}
                      onClick={() => alternarAmpliado(camera.id)}
                    />
                    <IconButton
                      size="small"
                      variant="neutral"
                      icon={<Maximize2 size={15} />}
                      label="Ver em tela cheia"
                      onClick={() => setCameraNoModal(camera)}
                    />
                  </Stack>
                }
              >
                <div className={styles.caixaVideo}>
                  <CameraPreview whepUrl={camera.whepUrl} ativo />
                </div>
              </Card>
            </div>
          );
        })}
      </div>

      <Modal
        open={cameraNoModal !== null}
        title={cameraNoModal?.nome ?? ""}
        size="large"
        onClose={() => setCameraNoModal(null)}
      >
        {cameraNoModal && (
          <div className={styles.caixaVideoExpandida}>
            <CameraPreview whepUrl={cameraNoModal.whepUrl} ativo={cameraNoModal !== null} />
          </div>
        )}
      </Modal>
    </>
  );
}
