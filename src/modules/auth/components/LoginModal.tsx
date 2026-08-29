"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { proximaRotaSegura } from "@/lib/auth/next-redirect";

import { login } from "../services/auth.service";
import styles from "./LoginModal.module.css";

/*
 * Não é SSO de verdade (isso exigiria Windows Integrated Auth via
 * IIS/proxy reverso, infra que este portal não tem hoje) — só
 * lembra o último usuário que logou com sucesso NESTE navegador,
 * pra poupar de digitar o usuário de novo. Nunca guarda senha.
 */
const CHAVE_ULTIMO_USUARIO = "portal-ultimo-usuario";

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export function LoginModal({ open, onClose }: LoginModalProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const senhaRef = useRef<HTMLInputElement>(null);

  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [usuarioLembrado, setUsuarioLembrado] = useState(false);

  useEffect(() => {
    try {
      const ultimoUsuario = localStorage.getItem(CHAVE_ULTIMO_USUARIO);
      if (ultimoUsuario) {
        setUsuario(ultimoUsuario);
        setUsuarioLembrado(true);
      }
    } catch {
      /* localStorage indisponível (modo privado etc.) — segue sem pré-preencher. */
    }
  }, []);

  /*
   * Precisa depender de `open` (não só rodar uma vez no mount): o
   * próprio Modal foca o primeiro campo focável assim que abre —
   * sem isso, esse foco automático do Modal vence e cai no campo
   * Usuário mesmo com ele já preenchido.
   */
  useEffect(() => {
    if (open && usuarioLembrado) {
      senhaRef.current?.focus();
    }
  }, [open, usuarioLembrado]);

  const motivo = searchParams.get("motivo");
  const bannerMotivo =
    motivo === "sessao_expirada"
      ? {
          variant: "warning" as const,
          title: "Sua sessão expirou",
          texto: "Faça login novamente para continuar de onde parou.",
        }
      : motivo === "logout"
        ? {
            variant: "info" as const,
            title: "Você saiu do portal",
            texto: "Entre novamente quando quiser.",
          }
        : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      const resultado = await login(usuario, senha);

      if (!resultado.ok) {
        setErro(resultado.message ?? "Não foi possível entrar.");
        return;
      }

      try {
        localStorage.setItem(CHAVE_ULTIMO_USUARIO, usuario.trim());
      } catch {
        /* localStorage indisponível — não impede o login. */
      }

      router.push(proximaRotaSegura(searchParams.get("next")));
      router.refresh();
      onClose();
    } catch {
      setErro("Não foi possível entrar. Verifique sua conexão e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Entrar no Portal Grupo Triel-HT"
      description="Use o seu usuário e senha de rede."
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        {bannerMotivo && (
          <Alert variant={bannerMotivo.variant} title={bannerMotivo.title}>
            {bannerMotivo.texto}
          </Alert>
        )}

        <Field label="Usuário" htmlFor="login-usuario" required>
          <Input
            id="login-usuario"
            name="usuario"
            autoComplete="username"
            autoFocus
            value={usuario}
            onChange={(event) => setUsuario(event.target.value)}
            placeholder="joao.silva"
            disabled={enviando}
          />
        </Field>

        <Field label="Senha" htmlFor="login-senha" required>
          <Input
            ref={senhaRef}
            id="login-senha"
            name="senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
            disabled={enviando}
          />
        </Field>

        {erro && <Alert variant="danger">{erro}</Alert>}

        <Button type="submit" fullWidth loading={enviando} loadingLabel="Entrando...">
          Entrar
        </Button>
      </form>
    </Modal>
  );
}
