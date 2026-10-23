/*
 * Tabelas do grupo de veículo novo da NF-e (veicProd, layout 4.00 /
 * tabelas do DENATRAN). Só para a tela mostrar "14 – Caminhão" em vez
 * de "14"; código fora da tabela aparece como veio.
 */

export const TIPO_OPERACAO: Record<string, string> = {
  "0": "Outros",
  "1": "Venda concessionária",
  "2": "Faturamento direto para consumidor final",
  "3": "Venda direta para grandes consumidores",
};

export const TIPO_COMBUSTIVEL: Record<string, string> = {
  "01": "Álcool",
  "02": "Gasolina",
  "03": "Diesel",
  "04": "Gasogênio",
  "05": "Gás metano",
  "06": "Elétrico / fonte interna",
  "07": "Elétrico / fonte externa",
  "08": "Gasolina / gás natural combustível",
  "09": "Álcool / gás natural combustível",
  "10": "Diesel / gás natural combustível",
  "11": "Ver observação",
  "12": "Álcool / gás natural veicular",
  "13": "Gasolina / gás natural veicular",
  "14": "Diesel / gás natural veicular",
  "15": "Gás natural veicular",
  "16": "Álcool / gasolina",
  "17": "Gasolina / álcool / gás natural veicular",
  "18": "Gasolina / elétrico",
};

export const TIPO_VEICULO: Record<string, string> = {
  "02": "Ciclomotor",
  "03": "Motoneta",
  "04": "Motociclo",
  "05": "Triciclo",
  "06": "Automóvel",
  "07": "Micro-ônibus",
  "08": "Ônibus",
  "10": "Reboque",
  "11": "Semirreboque",
  "13": "Camioneta",
  "14": "Caminhão",
  "17": "Caminhão trator",
  "18": "Trator de rodas",
  "19": "Trator de esteiras",
  "20": "Trator misto",
  "21": "Quadriciclo",
  "22": "Especial / ônibus",
  "23": "Caminhonete",
  "24": "Carga / camioneta",
  "25": "Utilitário",
  "26": "Motor-casa",
};

export const ESPECIE_VEICULO: Record<string, string> = {
  "1": "Passageiro",
  "2": "Carga",
  "3": "Misto",
  "4": "Corrida",
  "5": "Tração",
  "6": "Especial",
};

export const CONDICAO_VEICULO: Record<string, string> = {
  "1": "Acabado",
  "2": "Inacabado",
  "3": "Semiacabado",
};

export const CONDICAO_VIN: Record<string, string> = {
  R: "Remarcado",
  N: "Normal",
};

export const RESTRICAO: Record<string, string> = {
  "0": "Não há",
  "1": "Alienação fiduciária",
  "2": "Arrendamento mercantil",
  "3": "Reserva de domínio",
  "4": "Penhor de veículos",
  "9": "Outras",
};

export const COR_DENATRAN: Record<string, string> = {
  "01": "Amarela",
  "02": "Azul",
  "03": "Bege",
  "04": "Branca",
  "05": "Cinza",
  "06": "Dourada",
  "07": "Grená",
  "08": "Laranja",
  "09": "Marrom",
  "10": "Prata",
  "11": "Preta",
  "12": "Rosa",
  "13": "Roxa",
  "14": "Verde",
  "15": "Vermelha",
  "16": "Fantasia",
};

/* Campos do veicProd, na ordem do layout -- todos obrigatórios. */
export const CAMPOS_VEICULO: { tag: string; rotulo: string; tabela?: Record<string, string> }[] = [
  { tag: "tpOp", rotulo: "Tipo de operação", tabela: TIPO_OPERACAO },
  { tag: "chassi", rotulo: "Chassi" },
  { tag: "cCor", rotulo: "Código da cor" },
  { tag: "xCor", rotulo: "Cor" },
  { tag: "pot", rotulo: "Potência (cv)" },
  { tag: "cilin", rotulo: "Cilindradas" },
  { tag: "pesoL", rotulo: "Peso líquido" },
  { tag: "pesoB", rotulo: "Peso bruto" },
  { tag: "nSerie", rotulo: "Número de série" },
  { tag: "tpComb", rotulo: "Combustível", tabela: TIPO_COMBUSTIVEL },
  { tag: "nMotor", rotulo: "Número do motor" },
  { tag: "CMT", rotulo: "Capacidade máx. de tração" },
  { tag: "dist", rotulo: "Distância entre eixos" },
  { tag: "anoMod", rotulo: "Ano modelo" },
  { tag: "anoFab", rotulo: "Ano fabricação" },
  { tag: "tpPint", rotulo: "Tipo de pintura" },
  { tag: "tpVeic", rotulo: "Tipo de veículo", tabela: TIPO_VEICULO },
  { tag: "espVeic", rotulo: "Espécie", tabela: ESPECIE_VEICULO },
  { tag: "VIN", rotulo: "Condição do VIN", tabela: CONDICAO_VIN },
  { tag: "condVeic", rotulo: "Condição do veículo", tabela: CONDICAO_VEICULO },
  { tag: "cMod", rotulo: "Código marca/modelo" },
  { tag: "cCorDENATRAN", rotulo: "Cor DENATRAN", tabela: COR_DENATRAN },
  { tag: "lota", rotulo: "Lotação" },
  { tag: "tpRest", rotulo: "Restrição", tabela: RESTRICAO },
];
