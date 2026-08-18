/*
 * "Fire and forget" — contar a busca nunca pode atrapalhar a
 * consulta em si, então falhas aqui são só logadas no console,
 * nunca mostradas para quem está usando o terminal.
 */
export function registrarBuscaTerminal(codigo: string, encontrado: boolean): void {
  fetch("/api/terminal-fabrica/registrar-busca", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo, encontrado }),
  }).catch((error) => {
    console.error("Erro ao registrar busca do terminal de fábrica:", error);
  });
}
