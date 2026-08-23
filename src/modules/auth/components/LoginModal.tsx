"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { proximaRotaSegura } from "@/lib/auth/next-redirect";

import { login } from "../services/auth.service";
import styles from "./LoginModal.module.css";

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export function LoginModal({ open, onClose }: LoginModalProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

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
      title="Entrar no Portal Triel-HT"
      description="Use o seu usuário e senha de rede."
    >
      <form className={styles.form} onSubmit={handleSubmit}>
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
