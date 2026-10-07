/*
 * Mesmo espírito de registrarBusca.service.ts: o registro acompanha a
 * ação, nunca a atrapalha. Se o POST falhar, o papel já está saindo --
 * não faz sentido mostrar erro a quem clicou em imprimir. Fica no
 * console para aparecer no diagnóstico.
 */
export function registrarImpressaoTerminal(codigo: string, totalPaginas: number): void {
  fetch("/api/terminal-fabrica/registrar-impressao", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo, totalPaginas }),
  }).catch((error) => {
    console.error("Erro ao registrar impressão do terminal de fábrica:", error);
  });
}
