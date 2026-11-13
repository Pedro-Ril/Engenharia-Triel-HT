"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { proximaRotaSegura } from "@/lib/auth/next-redirect";
import { regrasPoliticaSenha } from "@/lib/auth/politica-senha";

import { login, trocarSenhaPendente } from "../services/auth.service";
import type { LoginResponse, TrocaSenhaPendenteData } from "../types/auth.types";
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

interface TrocaPendente extends TrocaSenhaPendenteData {
  mensagem: string;
}

function ehTrocaPendente(
  data: LoginResponse["data"]
): data is TrocaSenhaPendenteData {
  return Boolean(data && "trocarSenha" in data);
}

export function LoginModal({ open, onClose }: LoginModalProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const senhaRef = useRef<HTMLInputElement>(null);
  const novaSenhaRef = useRef<HTMLInputElement>(null);

  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [usuarioLembrado, setUsuarioLembrado] = useState(false);

  /*
   * Passo extra quando o AD pede troca de senha (senha provisória do
   * "alterar no próximo logon", ou senha vencida): a senha digitada no
   * primeiro passo fica guardada aqui só para provar a identidade na
   * troca — some ao voltar, fechar ou concluir.
   */
  const [trocaPendente, setTrocaPendente] = useState<TrocaPendente | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");

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
    if (open && usuarioLembrado && !trocaPendente) {
      senhaRef.current?.focus();
    }
  }, [open, usuarioLembrado, trocaPendente]);

  useEffect(() => {
    if (trocaPendente) {
      novaSenhaRef.current?.focus();
    }
  }, [trocaPendente]);

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

  function voltarParaLogin() {
    setTrocaPendente(null);
    setSenha("");
    setNovaSenha("");
    setConfirmacao("");
    setErro(null);
  }

  function fechar() {
    voltarParaLogin();
    onClose();
  }

  function entrou() {
    try {
      localStorage.setItem(CHAVE_ULTIMO_USUARIO, usuario.trim());
    } catch {
      /* localStorage indisponível — não impede o login. */
    }

    router.push(proximaRotaSegura(searchParams.get("next")));
    router.refresh();
    fechar();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      const resultado = await login(usuario, senha);

      if (!resultado.ok) {
        if (ehTrocaPendente(resultado.data)) {
          setTrocaPendente({
            ...resultado.data,
            mensagem: resultado.message ?? "Crie uma nova senha para entrar.",
          });
          return;
        }

        setErro(resultado.message ?? "Não foi possível entrar.");
        return;
      }

      entrou();
    } catch {
      setErro("Não foi possível entrar. Verifique sua conexão e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  function validarNovaSenha(): string | null {
    if (!novaSenha) return "Informe a nova senha.";

    if (novaSenha !== novaSenha.trim()) {
      return "A nova senha não pode começar nem terminar com espaço.";
    }

    const tamanhoMinimo = trocaPendente?.politica?.tamanhoMinimo ?? 0;
    if (novaSenha.length < tamanhoMinimo) {
      return `A nova senha precisa ter pelo menos ${tamanhoMinimo} caracteres.`;
    }

    if (novaSenha === senha) return "A nova senha precisa ser diferente da atual.";
    if (novaSenha !== confirmacao) return "A confirmação não está igual à nova senha.";

    return null;
  }

  async function handleTrocarSenha(event: React.FormEvent) {
    event.preventDefault();

    const problema = validarNovaSenha();
    if (problema) {
      setErro(problema);
      return;
    }

    setErro(null);
    setEnviando(true);

    try {
      const resultado = await trocarSenhaPendente(usuario, senha, novaSenha);

      if (!resultado.ok) {
        setErro(resultado.message ?? "Não foi possível trocar a senha.");
        return;
      }

      entrou();
    } catch {
      setErro("Não foi possível trocar a senha. Verifique sua conexão e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (trocaPendente) {
    const regras = trocaPendente.politica ? regrasPoliticaSenha(trocaPendente.politica) : [];

    return (
      <Modal
        open={open}
        onClose={fechar}
        title={trocaPendente.trocarSenha === "expirada" ? "Sua senha venceu" : "Crie a sua senha"}
        description={`Usuário: ${usuario.trim()}`}
      >
        <form className={styles.form} onSubmit={handleTrocarSenha}>
          <Alert variant="warning">{trocaPendente.mensagem}</Alert>

          <p className={styles.aviso}>
            A nova senha vale para tudo que usa o seu login da rede — o computador, o e-mail e o
            portal.
          </p>

          {/* Campo oculto para o gerenciador de senhas do navegador associar a senha ao usuário. */}
          <input
            className={styles.oculto}
            type="text"
            name="usuario"
            autoComplete="username"
            value={usuario.trim()}
            readOnly
            tabIndex={-1}
            aria-hidden
          />

          <Field label="Nova senha" htmlFor="troca-nova-senha" required>
            <PasswordInput
              ref={novaSenhaRef}
              id="troca-nova-senha"
              name="nova-senha"
              autoComplete="new-password"
              value={novaSenha}
              onChange={(event) => setNovaSenha(event.target.value)}
              disabled={enviando}
            />
          </Field>

          <Field label="Confirme a nova senha" htmlFor="troca-confirmacao" required>
            <PasswordInput
              id="troca-confirmacao"
              name="confirmacao"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(event) => setConfirmacao(event.target.value)}
              disabled={enviando}
            />
          </Field>

          {regras.length > 0 && (
            <ul className={styles.regras}>
              {regras.map((regra) => (
                <li key={regra}>{regra}</li>
              ))}
            </ul>
          )}

          {erro && <Alert variant="danger">{erro}</Alert>}

          <div className={styles.acoes}>
            <Button
              type="button"
              variant="secondary"
              onClick={voltarParaLogin}
              disabled={enviando}
            >
              Voltar
            </Button>
            <Button type="submit" loading={enviando} loadingLabel="Trocando...">
              Trocar senha e entrar
            </Button>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
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
          <PasswordInput
            ref={senhaRef}
            id="login-senha"
            name="senha"
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
