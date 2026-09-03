function convertFile() {
    const fileInput = document.getElementById('excel-file');
    const messageDiv = document.getElementById('message');

    if (!fileInput.files[0]) {
        messageDiv.innerHTML = 'Por favor, selecione um arquivo de Excel.';
        messageDiv.style.color = 'red';
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = function (e) {
        const data = e.target.result;
        try {
            const wb = XLSX.read(data, { type: 'binary' });
            const ws = wb.Sheets[wb.SheetNames[0]]; // Pega a primeira aba do arquivo
            const json = XLSX.utils.sheet_to_json(ws);

            if (!json[0].COD_FUNCIONARIO || !json[0].COD_EVENTO || !json[0].VALOR_EVENTO) {
                throw new Error('O arquivo precisa das colunas: COD_FUNCIONARIO, COD_EVENTO, VALOR_EVENTO');
            }

            let txtContent = '';
            json.forEach(row => {
                try {
                    const line = [
                        '0', // Valor fixo Coluna A
                        '0034', // Valor fixo Coluna B
                        '000', // Valor fixo Coluna C
                        String(row.COD_FUNCIONARIO).padStart(9, '0'), // COD_FUNCIONARIO
                        String(row.COD_EVENTO).padStart(4, '0'), // COD_EVENTO
                        '0000', // Valor fixo Coluna F
                        '00000000000', // Valor fixo Coluna G
                        Number(row.VALOR_EVENTO).toFixed(2).replace('.', '').padStart(11, '0') // VALOR_EVENTO
                    ].join(';');
                    txtContent += line + ';\n';
                } catch (error) {
                    console.error(`Erro ao processar linha: ${error}`);
                }
            });

            // Criar o Blob para salvar como arquivo TXT
            const blob = new Blob([txtContent], { type: 'text/plain' });
            const link = document.createElement('a');
            const defaultFileName = 'saida.txt';  // Nome sugerido para o arquivo

            // Definindo o nome do arquivo
            link.href = URL.createObjectURL(blob);
            link.download = defaultFileName; // Aqui você pode alterar o nome do arquivo, se quiser

            // Simulando o clique para baixar o arquivo
            link.click();

            messageDiv.innerHTML = 'Conversão completa!';
            messageDiv.style.color = 'green';

        } catch (error) {
            messageDiv.innerHTML = `Erro: ${error.message}`;
            messageDiv.style.color = 'red';
        }
    };

    reader.readAsBinaryString(file);
}

function convertFile2() {
    const fileInput = document.getElementById('excel-file');
    const messageDiv = document.getElementById('message');

    if (!fileInput.files[0]) {
        messageDiv.innerHTML = 'Por favor, selecione um arquivo de Excel.';
        messageDiv.style.color = 'red';
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = function (e) {
        const data = e.target.result;
        try {
            const wb = XLSX.read(data, { type: 'binary' });
            const ws = wb.Sheets[wb.SheetNames[0]]; // primeira aba
            const json = XLSX.utils.sheet_to_json(ws);

            if (!json[0].COD_FUNCIONARIO || !json[0].COD_EVENTO || !json[0].VALOR_EVENTO) {
                throw new Error('O arquivo precisa das colunas: COD_FUNCIONARIO, COD_EVENTO, VALOR_EVENTO');
            }

            let txtContent = '';
            json.forEach(row => {
                try {
                    const line = [
                        '0',                                      // Coluna A fixa
                        '0034',                                   // Coluna B fixa
                        '000',                                    // Coluna C fixa
                        String(row.COD_FUNCIONARIO).padStart(9, '0'), // COD_FUNCIONARIO
                        String(row.COD_EVENTO).padStart(4, '0'),      // COD_EVENTO
                        '0000',                                   // Coluna F fixa
                        '00000000000',                            // Coluna G fixa
                        Number(row.VALOR_EVENTO).toFixed(2)
                            .replace('.', '')
                            .padStart(11, '0')                   // VALOR_EVENTO
                    ].join(';');

                    txtContent += line + '\n'; // apenas quebra de linha
                } catch (err) {
                    console.error(`Erro ao processar linha: ${err}`);
                }
            });

            const blob = new Blob([txtContent], { type: 'text/plain' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'saida.txt';
            link.click();

            messageDiv.innerHTML = 'Conversão completa!';
            messageDiv.style.color = 'green';
        } catch (err) {
            messageDiv.innerHTML = `Erro: ${err.message}`;
            messageDiv.style.color = 'red';
        }
    };

    reader.readAsBinaryString(file);
}

