"use client";

import { useSyncExternalStore } from "react";

import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import styles from "./RotasAvulsas.module.css";

/* Endereço do Portal visto pelo navegador (no servidor, um marcador). */
function useOrigem(): string {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "http://portal"
  );
}

const CAMPOS: [string, string, string][] = [
  ["arquivo", "Sim", "O PDF (multipart, um único arquivo)."],
  ["impressora", "Depende", "Código cadastrado (ex.: EXPEDICAO). Pode omitir se o token só tem uma impressora liberada."],
  ["copias", "Não", "1 até o máximo configurado. Padrão: 1."],
  ["frente_verso", "Não", "sim ou nao. Padrão: o da impressora."],
];

const CODIGOS: [string, string][] = [
  ["201", "Aceito: o PDF foi entregue à impressora. Guarde data.id para consultar depois."],
  ["200", "Idempotency-Key repetida: devolve o trabalho já existente, sem imprimir de novo."],
  ["400", "Dado inválido (campo, PDF corrompido/protegido, páginas ou cópias acima do limite, impressora não liberada). Não adianta repetir igual."],
  ["401", "Token ausente, inválido, revogado ou expirado."],
  ["413", "Arquivo acima do tamanho máximo."],
  ["415", "Não veio como multipart/form-data."],
  ["429", "Limite de requisições. Espere os segundos do cabeçalho Retry-After e tente de novo."],
  ["502", "A impressora recusou ou não respondeu. Pode tentar de novo mais tarde (com a mesma Idempotency-Key)."],
  ["503", "Rota desligada na administração do Portal."],
];

/*
 * Documentação da rota de impressão para quem vai integrar o outro
 * sistema: tudo o que precisa para chamar, sem ler o código do Portal.
 */
export function ComoUsarImpressao() {
  const origem = useOrigem();

  const curl = `curl -X POST "${origem}/api/externo/impressao/pdf" \\
  -H "Authorization: Bearer pta_SEU_TOKEN" \\
  -H "Idempotency-Key: pedido-12345-etiqueta" \\
  -F "arquivo=@documento.pdf;type=application/pdf" \\
  -F "impressora=EXPEDICAO" \\
  -F "copias=1" \\
  -F "frente_verso=nao"`;

  const resposta201 = `{
  "ok": true,
  "message": "PDF enviado para a impressora.",
  "data": {
    "id": "3f1c0b9e-6a2d-4c55-9a0e-1b2c3d4e5f60",
    "estado": "na_fila",
    "detalhe": null,
    "impressora": "EXPEDICAO",
    "paginas": 2,
    "copias": 1,
    "frenteVerso": false,
    "criadoEm": "2026-10-30T11:42:10.120Z",
    "atualizadoEm": "2026-10-30T11:42:10.480Z"
  }
}`;

  const consulta = `curl "${origem}/api/externo/impressao/trabalhos/3f1c0b9e-6a2d-4c55-9a0e-1b2c3d4e5f60" \\
  -H "Authorization: Bearer pta_SEU_TOKEN"`;

  const erro = `{ "ok": false, "message": "Token ausente ou inválido." }`;

  return (
    <Card title="Como usar" description="Contrato da rota para o desenvolvedor do sistema que vai enviar os PDFs.">
      <Stack gap={24}>
        <section className={styles.secao}>
          <h3>1. Autenticação</h3>
          <p>
            Todo pedido leva o token no cabeçalho <code>Authorization: Bearer pta_...</code>. O token é criado na aba Tokens e
            aparece uma única vez. Guarde-o como segredo (cofre/variável de ambiente), nunca no código-fonte.
          </p>
        </section>

        <section className={styles.secao}>
          <h3>2. Enviar um PDF</h3>
          <p>
            <code>POST {origem}/api/externo/impressao/pdf</code>, corpo <code>multipart/form-data</code>:
          </p>
          <div className={styles.tabela}>
            <Table minWidth={560}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Campo</TableHeaderCell>
                  <TableHeaderCell>Obrigatório</TableHeaderCell>
                  <TableHeaderCell>Descrição</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {CAMPOS.map(([campo, obrigatorio, descricao]) => (
                  <TableRow key={campo}>
                    <TableCell>
                      <code className={styles.mono}>{campo}</code>
                    </TableCell>
                    <TableCell>{obrigatorio}</TableCell>
                    <TableCell>{descricao}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p>
            Cabeçalho opcional, mas recomendado: <code>Idempotency-Key</code> (até 100 caracteres: letras, números e{" "}
            <code>. _ : -</code>), único por impressão. Se a conexão cair e o sistema reenviar com a mesma chave, o Portal
            devolve o trabalho anterior em vez de imprimir duas vezes.
          </p>
          <pre className={styles.codigo}>{curl}</pre>
          <p>Resposta de sucesso (HTTP 201):</p>
          <pre className={styles.codigo}>{resposta201}</pre>
        </section>

        <section className={styles.secao}>
          <h3>3. Consultar a situação</h3>
          <p>
            <code>GET {origem}/api/externo/impressao/trabalhos/{"{id}"}</code>, com o mesmo token. O campo{" "}
            <code>estado</code> é um de: <code>na_fila</code>, <code>imprimindo</code>, <code>impresso</code>,{" "}
            <code>cancelado</code>, <code>erro</code> (com o motivo em <code>detalhe</code>). Cada token só enxerga os próprios
            trabalhos. A consulta conta no limite de requisições: consulte a cada poucos segundos, não em laço.
          </p>
          <pre className={styles.codigo}>{consulta}</pre>
        </section>

        <section className={styles.secao}>
          <h3>4. Respostas</h3>
          <p>
            Sempre JSON no formato <code>{"{ ok, message?, data? }"}</code>. Exemplo de erro:
          </p>
          <pre className={styles.codigo}>{erro}</pre>
          <div className={styles.tabela}>
            <Table minWidth={560}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>HTTP</TableHeaderCell>
                  <TableHeaderCell>Significado</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {CODIGOS.map(([codigo, significado]) => (
                  <TableRow key={codigo}>
                    <TableCell>
                      <strong>{codigo}</strong>
                    </TableCell>
                    <TableCell>{significado}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <Alert variant="warning" title="O Portal está em HTTP">
          O token viaja sem criptografia entre o sistema e o Portal. Use esta rota só dentro da rede interna, um token por
          sistema, e revogue na hora se suspeitar de vazamento. Com o Portal em HTTPS, esse risco some.
        </Alert>
      </Stack>
    </Card>
  );
}
