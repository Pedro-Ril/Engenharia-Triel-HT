"use client";

import { useEffect, useState } from "react";
import { KeyRound, Moon, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";

import styles from "./BoasVindasModal.module.css";

const CHAVE_BOAS_VINDAS_OCULTAR = "portal-boas-vindas-ocultar";

interface BoasVindasModalProps {
  /*
   * Só considera abrir quando true — visitante anônimo na home "pura"
   * (não em /login, onde o LoginModal já abre sozinho e os dois juntos
   * ficariam empilhados).
   */
  habilitado: boolean;
}

export function BoasVindasModal({ habilitado }: BoasVindasModalProps) {
  const [aberto, setAberto] = useState(false);
  const [naoMostrarNovamente, setNaoMostrarNovamente] = useState(false);

  useEffect(() => {
    if (!habilitado) return;

    try {
      if (localStorage.getItem(CHAVE_BOAS_VINDAS_OCULTAR) !== "1") {
        setAberto(true);
      }
    } catch {
      /* localStorage indisponível (ex: navegação privada restrita) — só não mostra o popup, não trava a página. */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez por sessão de página, com o valor de `habilitado` já disponível na primeira renderização
  }, []);

  function handleFechar() {
    if (naoMostrarNovamente) {
      try {
        localStorage.setItem(CHAVE_BOAS_VINDAS_OCULTAR, "1");
      } catch {
        /* ver comentário acima */
      }
    }

    setAberto(false);
  }

  return (
    <Modal
      open={aberto}
      onClose={handleFechar}
      title="Bem-vindo ao Portal Triel-HT!"
      description="Algumas coisas rápidas antes de começar:"
      size="medium"
      footer={
        <Stack direction="row" justify="between" align="center">
          <Checkbox
            id="boasVindasNaoMostrar"
            label="Não mostrar novamente"
            checked={naoMostrarNovamente}
            onChange={(event) => setNaoMostrarNovamente(event.target.checked)}
          />

          <Button onClick={handleFechar}>Entendi</Button>
        </Stack>
      }
    >
      {/*
       * Cada bloco abaixo é o lugar natural pra depois entrar uma
       * captura de tela ilustrando o passo (ex: print do botão de
       * login, ou do seletor de tema) — por ora só ícone + texto.
       */}
      <Stack gap={12}>
        <div className={styles.destaque}>
          <span className={styles.destaqueIcone}>
            <KeyRound size={18} />
          </span>

          <div>
            <h3 className={styles.destaqueTitulo}>Como entrar</h3>
            <p className={styles.destaqueTexto}>
              Use o mesmo usuário e senha do seu computador (login
              corporativo / Active Directory).
            </p>
          </div>
        </div>

        <div className={styles.destaque}>
          <span className={`${styles.destaqueIcone} ${styles.destaqueIconeNovidade}`}>
            <Moon size={18} />
          </span>

          <div>
            <h3 className={styles.destaqueTitulo}>
              Modo noturno <span className={styles.tagNovo}>NOVO</span>
            </h3>
            <p className={styles.destaqueTexto}>
              O portal agora tem tema escuro. Ative na tela inicial, ou em
              Minha conta.
            </p>
          </div>
        </div>

        <div className={styles.destaque}>
          <span className={styles.destaqueIcone}>
            <ShieldCheck size={18} />
          </span>

          <div>
            <h3 className={styles.destaqueTitulo}>Acesso por permissão</h3>
            <p className={styles.destaqueTexto}>
              Cada ferramenta é liberada individualmente por pessoa. Qualquer
              dúvida ou necessidade de acesso, entre em contato com o TI.
            </p>
          </div>
        </div>
      </Stack>
    </Modal>
  );
}
