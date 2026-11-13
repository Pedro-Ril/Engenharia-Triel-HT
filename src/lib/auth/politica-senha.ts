/*
 * Política de senha do domínio, como lida do AD (ver lerPoliticaSenha
 * em ldap.ts). Sem "server-only": a tela de login usa o mesmo texto
 * para mostrar as regras antes de a pessoa digitar a senha nova.
 */
export interface PoliticaSenhaAd {
  tamanhoMinimo: number;
  exigeComplexidade: boolean;
  /* Quantas senhas anteriores não podem ser repetidas. */
  historico: number;
  /* 0 = senha nunca vence. */
  validadeDias: number;
}

export function regrasPoliticaSenha(politica: PoliticaSenhaAd): string[] {
  const regras: string[] = [];

  if (politica.tamanhoMinimo > 0) {
    regras.push(`Pelo menos ${politica.tamanhoMinimo} caracteres`);
  }

  if (politica.exigeComplexidade) {
    regras.push(
      "Misturar 3 destes 4 tipos: letra maiúscula, letra minúscula, número e símbolo"
    );
    regras.push("Não conter o seu nome de usuário");
  }

  if (politica.historico > 0) {
    regras.push(
      politica.historico === 1
        ? "Diferente da senha anterior"
        : `Diferente das suas últimas ${politica.historico} senhas`
    );
  }

  return regras;
}

export function descreverPoliticaSenha(politica: PoliticaSenhaAd | null): string {
  const regras = politica ? regrasPoliticaSenha(politica) : [];

  if (regras.length === 0) {
    return "Confira se ela atende às regras de senha da rede e se não é uma senha que você já usou.";
  }

  return `Regras da senha: ${regras.map((regra) => regra.toLowerCase()).join("; ")}.`;
}
