const API_BASE = "http://localhost:3334/api";

export async function buscarPdfDetalhamentoItem(
    codigo: string,
    onProgress?: (percentual: number) => void
): Promise<string> {
    const codigoLimpo = String(codigo || "").trim();

    if (!codigoLimpo) {
        throw new Error("Código do item inválido.");
    }

    const url = `${API_BASE}/item-pdf/${encodeURIComponent(codigoLimpo)}`;

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.open("GET", url, true);
        xhr.responseType = "blob";

        xhr.onprogress = (event) => {
            if (event.lengthComputable) {
                const percentual = Math.round((event.loaded / event.total) * 100);
                onProgress?.(percentual);
            } else {
                onProgress?.(50);
            }
        };

        xhr.onload = () => {
            if (xhr.status === 404) {
                reject(new Error("Não localizou PDFs para abrir."));
                return;
            }

            if (xhr.status < 200 || xhr.status >= 300) {
                reject(new Error("Erro ao abrir PDF do item."));
                return;
            }

            onProgress?.(100);

            const blob = xhr.response;
            const pdfUrl = window.URL.createObjectURL(blob);

            resolve(pdfUrl);
        };

        xhr.onerror = () => {
            reject(new Error("Erro de comunicação com o backend de PDFs."));
        };

        xhr.send();
    });
}