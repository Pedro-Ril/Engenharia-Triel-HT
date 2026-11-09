# Cálculo automático de tempos no Roteiro de Fabricação

Análise feita em 09/11/2026 para a nova funcionalidade do Roteiro de
Fabricação: calcular o tempo da operação a partir de parâmetros por
máquina, cadastrados no painel admin. **Status: só análise e plano —
nada implementado ainda; os dados das planilhas aguardam atualização
pela equipe de Processos.**

Pedido original: cadastros de tempos no painel admin, ligados às
máquinas (recursos) do ERP; consulta desses dados pela tela do Roteiro;
na operação, "Calcular tempo automaticamente: Sim/Não" — Sim segue a
lógica nova, Não segue como é hoje (tempo digitado).

## 1. Fontes analisadas

| Fonte | Onde estava | Observação |
|---|---|---|
| `TEMPOS_PLASMA_CNC_CORRIGIDA.xls` | Área de Trabalho do Pedro | Criada em 2005, última alteração em 09/01/2025 (Rui Busnello). Abas de cálculo: **Laser** e **Plasma OXIPIRA**. As demais (Cronometragem Laser, Velocidades Laser, Tabela Laser REV.01, Instruções) são de onde os números saíram ou versões antigas. |
| `TEMPOS_CORTE_DOBRA.xls` | Área de Trabalho do Pedro | Última alteração em 18/03/2025 (Rui Busnello). Só a aba **Plan2** tem dados (Plan1 vazia). |
| App do PCP `app-pcp-v18-1.zip` (Flask + SQLite) | Área de Trabalho do Pedro | Aba **Roteirização** (`app.py`, por volta da linha 3270) reproduz as duas planilhas em Python. Lido, não executado. |

As tabelas completas das planilhas estão no **Anexo** (geradas direto
dos arquivos, sem digitação).

## 2. Método Laser (aba "Laser")

Entradas: máquina (BYSTAR, BYSPRINT, BYSPEED, TRUMPF), matéria-prima
(padrão ou especial), espessura, largura × comprimento **ou** perímetro
+ nº de entradas, furos (quantidade × diâmetro), oblongos (quantidade,
largura, comprimento, redondo ou retangular) e massa.

- **Nº de entradas (pierces)** `n` = 1 se não houver furo, oblongo nem
  entrada informada; senão `1 + furos + oblongos + entradas`.
- **Perímetro total** = `2·L + 2·C` (ou o perímetro informado)
  + Σ furos `π·d·q` + Σ oblongos `(π·w + 2·(c − w))·q`
  (retangular: `(2w + 2c)·q`).
- **Corte** = perímetro ÷ velocidade (máquina, material, espessura).
- **Perfuração** = `n × (pierce + espera antes do corte)`.
- **Movimento no vazio** = 0 se `n = 1`; senão comprimento ÷ velocidade
  no vazio (só perímetro: `(perímetro ÷ 4) ÷ vazio`).
- **Entrada/saída** = `n × 5 mm ÷ velocidade`.
- **Fração da chapa** = massa da peça ÷ massa da chapa padrão
  (4000 × 1500 mm × espessura × 7,85).
- **Tempos de processo** = fração × (trocar mesa + referenciar chapa
  + finalizar programa) + `(n ÷ pierces por limpeza) × limpeza de bico`.
- **Tempo** = soma de tudo, em minutos por peça.

A planilha também escolhe a máquina sozinha pela espessura e pelo
material (célula N7) e tem uma tabela de matérias-primas Randon
(LN RAND, SAC RAND, STAMP RAND) → padrão/especial → centro
C005/C007/C034/C035. Esses códigos de centro **não existem** no ERP de
hoje.

## 3. Método Plasma (aba "Plasma OXIPIRA")

Entradas: amperagem (80 A ou 260 A), espessura, medidas, furos,
oblongos e massa (como no laser).

- `n` e perímetro como no laser, **mas o oblongo usa
  `π·w + (2·c − w)`** (errado, ver seção 5).
- **Corte** = perímetro ÷ velocidade (amperagem, espessura).
- **Perfuração** = `n × (0,086 min de aproximação + pierce)`.
- **Movimento no vazio** = comprimento ÷ 16.000 mm/min (0 se `n = 1`).
- **Entrada/saída** = `n × 4,5 mm ÷ velocidade`.
- **Referenciar peça** = (massa da peça ÷ massa da chapa
  6000 × 1500 mm) × 2,475 min.
- **Regra do furo em 260 A**: nas espessuras de 4,75 a 12,7 mm, um furo
  ou oblongo com diâmetro/largura ≤ espessura ÷ 2,5 invalida o cálculo
  ("Amp. #" — usar 80 A).
- Instruções: uma tocha só.

## 4. Método Corte e dobra (TEMPOS_CORTE_DOBRA, aba "Plan2")

Tabela de consulta, sem fórmula de processo:

- Entradas escolhidas em listas: **largura** (100, 200, 500, 700, 1000,
  1200, 1400, 1500 mm), **comprimento** (100 a 3000 mm em 15 degraus),
  **faixa de espessura** (0,91–2,65; 3,0–4,75; 6,3–25,4 mm) e **tipo de
  perfil**.
- **Tempo base** = matriz da faixa [largura][comprimento] (nome
  definido `VETOR`).
- **Tempo de corte (guilhotina)** = tempo base.
- **Tempo de dobra** = tempo base × fator do perfil: Uma dobra 1,1 ·
  Duas 1,2 · Três 1,3 · Mais de três 1,7 · Lateral PRATZ 1,9 ·
  Assoalho Aves 3,0.
- Valores em múltiplos de 0,0498 min (~3 s).
- Conferência: 500 × 700 mm, faixa 0,91–2,65, mais de três dobras →
  corte 0,3486 min, dobra 0,5926 min.

## 5. Problemas encontrados nas planilhas

1. **Oblongo no plasma**: `π·w + (2·c − w)` em vez de `π·w + 2·(c − w)`
   (o laser está certo).
2. **Modo "só perímetro" dá zero**: a massa (células L30/S28) é
   calculada só de largura × comprimento; sem as medidas, a massa fica
   vazia e o tempo sai "0,000 min".
3. **Massa por aço 7,85 e retângulo envolvente**: a fração da chapa é,
   na prática, a razão de áreas do retângulo — não usa a massa real do
   desenho, nem densidade de inox/alumínio.
4. π como 3,1415 nos furos; rótulos "(seg)" em valores que são minutos.
5. Instrução do laser diz "(limpeza de bico ÷ nº pierces)" dentro do
   rateio; a fórmula usa `(n ÷ pierces por limpeza) × limpeza`, fora do
   rateio.
6. Corte e dobra: busca **exata** (só medidas da tabela; máximo
   1500 × 3000 mm), lacunas entre faixas (2,65–3,0 e 4,75–6,3 mm), não
   diferencia máquina nem nº de golpes; uma célula tem "1" digitado onde
   a sequência daria 0,996 (faixa 0,91–2,65, largura 700, comprimento
   2600).
7. Dados de 2006–2013, de máquinas e materiais de outra realidade
   (Bystar/Bysprint/Byspeed/Trumpf, aços Randon).

## 6. App do PCP (v18.1)

- Reproduz as duas planilhas fielmente. Conferido: as tabelas de laser
  e plasma e os 360 valores das matrizes de corte e dobra **batem** com
  as planilhas.
- Decisões de processo já tomadas lá: **LASER VE = tabela da BYSPEED
  (C007), material padrão**; plasma em 80 A, passando sozinho para
  260 A quando 80 A não corta; densidades INOX 7,93, ALUM 2,70,
  GALV/CARBONO/AÇO 7,85; espessura lida da descrição da chapa e
  ajustada para a mais próxima da tabela (aviso se diferença > 0,3 mm);
  medida de corte e dobra arredondada **para cima** no degrau da tabela.
- Operações do ERP usadas no Data Load: **1005 + LASERVE** (laser),
  **2001 + GUVE** (guilhotina), **2002 + DOB160VE** (dobra). Plasma
  ainda sem operação definida. Corte só → seq 40; corte + dobra → 30 e 40.
- **Divergência**: desde a V13.2 a dobra usa `1 + 0,1 × nº de dobras`
  (4 dobras = ×1,4; na planilha "mais de três" = ×1,7) e a grade não
  oferece PRATZ (1,9) nem Assoalho Aves (3,0).
- **Ponto fraco principal**: no modo em grade a área sai de
  peso ÷ (densidade × espessura) e, sem largura, a peça vira um
  **quadrado equivalente** — perímetro `4·√área`. Tira de 100 × 2000 mm:
  perímetro real 4.200 mm, estimado ~1.790 mm (−57%). A grade aceita só
  um tipo de furo.
- Outros: constantes no código Python; Data Load por macro de
  teclado/mouse com coordenadas de tela; oblongo do plasma com o mesmo
  erro da planilha; cobre só as máquinas VE.

## 7. Situação no ERP e no Portal (09/11/2026)

- Centros de trabalho (`/api/centro_trabalho?cod_emp=2`): 1000 CORTE
  PLASMA, 7000 CORTE LASER, 2000 CORTE E DOBRA, entre outros.
- Máquinas (`/api/v2/recursos?cod_emp=2`):
  - centro 1000: LASER3000, LASER6000, LASERVE (LASER 3000 VE CALFRAN),
    LASERTUBOS, LASERTB02, PLASMACNC (PLASMA CNC XPR 300);
  - centro 2000: DOB01 (165), DOB02 (200), DOB03 (110), DOB04 (400/60),
    DOB160VE, DOB70VE, GU01, GU02, GUVE.
- Roteiro do Portal: operação já tem centro, máquinas (`RECURSOS`,
  TROT_FAB_MAQ) e `TEMPO`; unidade padrão **MIN**
  (`CODIGO_UNIDADE_PADRAO` em `CadastroOperacaoModal.tsx`), até 6 casas
  (`utils/tempo.ts`). Grava direto no ERP pela API v2.
- O Portal já tem: peso do item (3DX), espessura e material lidos da
  descrição da matéria-prima (`integra-lantek-*/utils/espessura.ts`),
  localização do DXF de cada item (`lib/integra-lantek/dxf-indice.ts`).
  **Não tem** leitura de geometria do DXF (perímetro, furos).

## 8. Plano proposto

Três tipos de cálculo por máquina: **laser**, **plasma** e **tabela por
dimensão** (guilhotina/dobra).

1. **Motor de cálculo** (TypeScript puro, sem banco) com os três
   métodos e testes que reproduzem os resultados das planilhas para as
   mesmas entradas; correções da seção 5 documentadas.
2. **Leitura de geometria do DXF**: perímetro externo, furos, oblongos
   e retângulo envolvente da peça planificada — validar com DXFs reais.
3. **Banco + painel admin "Tempos de Máquina"**: perfil por máquina do
   ERP (`COD_RECURSO` → tipo de cálculo e parâmetros), tabelas por
   espessura/variante, matrizes de corte e dobra, fatores de dobra,
   materiais (densidade, variante), memória de cada cálculo; simulador.
   Carga inicial com os valores das planilhas, perfis **inativos** até
   Processos validar.
4. **Roteiro**: interruptor "Calcular tempo automaticamente" no
   cadastro da operação, só quando a máquina tem perfil ativo; mostra a
   composição do tempo e preenche o campo Tempo; botão "Consultar
   tempos" (somente leitura).
5. **Validação**: comparar com a planilha e com o tempo real de ~10
   peças antes de ativar cada perfil.

## 9. Pendências com a equipe de Processos

- Por máquina do ERP: chapa padrão, velocidade no vazio, espessuras
  mín./máx., nº de tochas/cabeçotes.
- Tabela por espessura e material/gás/amperagem: velocidade, pierce,
  espera antes do corte, pierces por limpeza de bico.
- Tempos de processo cronometrados (laser: trocar mesa, referenciar,
  limpeza, finalizar; plasma: referenciar chapa, aproximação), lead-in/
  lead-out, data da cronometragem e nº de operadores.
- Materiais usados hoje, densidade e qual tabela vale para cada um.
- Regras: furo mínimo por espessura, escolha de máquina, corte comum.
- Corte e dobra: a tabela ainda vale? É a mesma para todas as
  guilhotinas e dobradeiras? Regra de dobra — fatores por perfil
  (planilha) ou 10% por dobra (app do PCP)? Peças acima de
  1500 × 3000 mm e espessuras fora das faixas?
- Definição: o tempo do roteiro é só tempo de máquina por peça ou
  inclui homem-hora?
- ~10 peças reais com tempo medido, para validação.

## 10. Andamento

**09/11/2026: fases 1 (motor) e 2 (DXF), sem banco nem tela.**
Código em `src/lib/tempos-maquina/` (puro, sem `server-only`).

- `tipos.ts`, `calculo.ts`: dois métodos. **Corte CNC** cobre laser e
  plasma com a mesma fórmula; a diferença fica nos parâmetros do perfil
  (espera, aproximação, limpeza de bico, tempos por chapa). **Tabela por
  dimensão** cobre guilhotina e dobradeira.
- **Regras do motor:**
  - **Espessura:** usa a mais próxima da tabela, com aviso; mais de
    0,3 mm fora da faixa é erro.
  - **Variante automática:** sem variante informada, usa a primeira que
    corta, na ordem do perfil (80 A → 260 A).
  - **Tempos por chapa:** rateados pela área da peça; sem área ficam
    fora, com aviso, em vez de zerar o tempo como a planilha.
  - **Medidas da tabela de corte e dobra:** sobem para o próximo degrau.
  - **Dobra:** aceita as duas regras ("fator" e "por_dobra").
- `referencia-planilhas.ts`: perfis gerados direto das planilhas (4
  lasers, plasma, guilhotina e dobradeira), para carga inicial e testes.
- `dxf-geometria.ts`: lê LINE, ARC, CIRCLE, LWPOLYLINE, POLYLINE,
  SPLINE e ELLIPSE e liga as entidades em contornos. Separa o contorno
  externo dos internos e reconhece furos e oblongos. Calcula a área e o
  menor retângulo em qualquer ângulo. Avisa sobre linhas abertas e
  sobre mais de uma peça no mesmo DXF.
- **Testes:** 27 no total (`calculo.test.ts`, `dxf-geometria.test.ts`).
  - O laser e o plasma batem com as células da planilha.
  - Guilhotina e dobra batem com os valores que a própria planilha
    calcula (0,3486 e 0,5926).

**Prova com 30 DXFs reais** (pasta Triel-HT/DXF, códigos 30xxxx). A área
lida do DXF foi comparada com peso do 3DX ÷ (densidade × espessura da
chapa no ERP):

- **Leitura:** nenhum erro; furos, oblongos e recortes reconhecidos.
- **Dentro de ±2,5%:** 25 das 29 chapas.
- **Fora da comparação:** 300965 é tubo, não chapa.
- **Peso pequeno demais:** 301072 (0,04 kg) e 305142 (0,02 kg), em que
  o arredondamento do peso esconde a área.
- **Espessura diferente entre 3DX e ERP:**
  - 304981 bate com 25,4 mm, mas a chapa no ERP é de 19,05 mm.
  - 306132 bate com 3 mm, mas a chapa no ERP é de 4 mm.

  Vale um alerta desse tipo na tela do Roteiro.

**09/11/2026: fase 3 (banco + painel admin).**

- **Migrações** (aplicadas no PortalTrielHT e conferidas):
  - `0159_tempos_maquina.sql` cria três tabelas:
    - `eng_tempos_perfis`: parâmetros em JSON validado, com `CHECK ISJSON`; nasce inativo.
    - `eng_tempos_maquinas`: `COD_RECURSO` do ERP → perfil, um perfil por máquina.
    - `eng_tempos_materiais`: palavras da descrição, densidade e variante. Carga inicial: inox 7,93; alumínio 2,70; galvanizado e aço 7,85.
  - `0160_tempos_maquina_perfis_referencia.sql` carrega os 7 perfis das planilhas, todos **inativos**.
- **Código:**
  - `src/lib/tempos-maquina/validacao.ts`: valida os parâmetros antes de gravar.
  - `cadastro.ts`: acesso ao banco.
  - `materiais.ts`: reconhece o material pela descrição.
  - Rotas em `src/app/api/admin/tempos-maquina/**` (perfis, máquinas, materiais).
- **Painel:** item "Tempos de Máquina" no admin, com quatro abas:
  - **Perfis de cálculo:** criar, duplicar, editar (com pierce e espera em segundos e a matriz de corte e dobra editável), ativar com confirmação e excluir, que é bloqueado se o perfil tiver máquina ligada.
  - **Máquinas do ERP:** os recursos de `/api/v2/recursos` → perfil.
  - **Materiais:** cadastro e teste de uma descrição.
  - **Simulador:** qualquer perfil, com medidas digitadas ou DXF, sem gravar nada.
- **Verificado:**
  - 35 testes passam, incluindo a ida e volta dos 7 perfis pelo formulário do editor.
  - Teste temporário no banco real (criar, editar, ligar, impedir exclusão), limpo depois, com as contagens conferidas.
  - Tela testada com Playwright nos temas claro e escuro, sem erro de console. O simulador dá 0,7968 min no caso da planilha.

**Próximo:** fase 4, no Roteiro. Interruptor "Calcular tempo
automaticamente" na operação, para máquina com perfil ativo, com
geometria do DXF do item e espessura e material da matéria-prima, mais o
alerta de espessura 3DX × ERP e o registro de cada cálculo. Nenhum
perfil está ativo, então o Roteiro ainda não muda.

## Anexo: tabelas das planilhas

Pierce e espera estão em **segundos** (a planilha guarda em minutos, como `x/60`). Na tabela de corte e dobra, multiplique por 0,0498 para ter minutos; o valor em negrito é a célula digitada direto na planilha.

#### Laser: velocidade de corte (mm/min)

| Espessura (mm) | Padrão BYSTAR | Padrão BYSPRINT | Padrão BYSPEED | Padrão TRUMPF | Especial BYSTAR | Especial BYSPRINT | Especial BYSPEED | Especial TRUMPF |
|---|---|---|---|---|---|---|---|---|
| 1,5 | 7000 | 6300 | 6300 | 6000 | 6300 | 6300 | 6300 | 6000 |
| 2 | 5600 | 5600 | 5300 | 5400 | 5000 | 5000 | 5000 | 5400 |
| 2,65 | 5000 | 5000 | 4700 | 5000 | 4500 | 4500 | 4500 | 5000 |
| 3 | 4000 | 4000 | 4100 | 5000 | 3600 | 3600 | 4000 | 5000 |
| 3,35 | 3500 | 3500 | 4000 | 4000 | 3500 | 3500 | 3700 | 4000 |
| 3,75 | 3500 | 3500 | 3700 | 4000 | 3300 | 3300 | 3500 | 4000 |
| 4,25 | 3500 | 3500 | 3700 | 3500 | 3200 | 3200 | 3400 | 3500 |
| 4,75 | 2700 | 2700 | 3200 | 3500 | 2500 | 2500 | 3000 | 3500 |
| 6,35 | 2400 | 2400 | 2900 | 3000 | 2100 | 2100 | 2700 | 3000 |
| 8 | 1900 | 1900 | 2400 | 2000 | 1700 | 1700 | 2200 | 1900 |
| 9,5 | 1400 | 1400 | 2000 | 1900 | 1200 | 1200 | 1800 | 1500 |
| 11 | 1000 | 1000 | 1400 | 1600 | 900 | 900 | 1600 | 1600 |
| 12,7 | 1100 | 1100 | 1600 | 1500 | 1000 | 1000 | 1400 | 1100 |
| 16 | - | - | - | 1200 | - | - | - | 1200 |
| 19 | - | - | - | 950 | - | - | - | 900 |
| no vazio | 70000 | 110000 | 120000 | 125000 | 70000 | 110000 | 120000 | 125000 |

#### Laser: espera antes do corte, pierce (segundos) e nº de pierces por limpeza de bico

| Espessura (mm) | Espera BYSTAR | Espera BYSPRINT | Espera BYSPEED | Espera TRUMPF | Pierce BYSTAR | Pierce BYSPRINT | Pierce BYSPEED | Pierce TRUMPF | Pierces/limpeza (demais) | Pierces/limpeza (TRUMPF) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1,5 | 0,1 | 0,1 | 0,2 | 0,4 | 0,2 | 0,2 | 0,3 | 0,06 | 60 | 500 |
| 2 | 0,1 | 0,1 | 0,2 | 0,4 | 0,2 | 0,2 | 0,3 | 0,07 | 60 | 500 |
| 2,65 | 0,3 | 0,4 | 0,2 | 0,4 | 0,2 | 0,2 | 0,3 | 0,08 | 60 | 500 |
| 3 | 0,3 | 0,4 | 0,2 | 0,4 | 0,3 | 0,3 | 0,3 | 0,09 | 60 | 500 |
| 3,35 | 0,3 | 0,4 | 0,2 | 0,4 | 0,3 | 0,3 | 0,3 | 0,09 | 60 | 500 |
| 3,75 | 0,3 | 0,4 | 0,2 | 0,4 | 0,3 | 0,3 | 0,3 | 0,11 | 50 | 500 |
| 4,25 | 0,4 | 0,4 | 0,2 | 0,4 | 0,4 | 0,4 | 0,4 | 0,11 | 50 | 500 |
| 4,75 | 0,4 | 0,4 | 0,4 | 0,4 | 0,4 | 0,4 | 0,4 | 0,15 | 50 | 500 |
| 6,35 | 0,6 | 0,6 | 0,5 | 0,4 | 0,5 | 0,5 | 0,5 | 0,2 | 50 | 500 |
| 8 | 0,6 | 0,6 | 0,5 | 0,4 | 0,6 | 0,6 | 0,6 | 0,4 | 40 | 500 |
| 9,5 | 0,6 | 0,6 | 0,5 | 0,9 | 0,6 | 0,6 | 0,6 | 0,5 | 30 | 500 |
| 11 | 0,8 | 0,8 | 0,6 | 1,76 | 0,6 | 0,6 | 0,6 | 0,7 | 15 | 500 |
| 12,7 | 0,8 | 0,8 | 0,6 | 1,4 | 0,6 | 0,6 | 1,2 | 0,7 | 15 | 500 |
| 16 | - | - | - | 1,4 | - | - | - | 2,2 | - | 500 |
| 19 | - | - | - | 3,4 | - | - | - | 4,5 | - | 500 |

#### Laser: tempos de processo cronometrados (min por chapa)

| Máquina | Trocar mesa | Referenciar chapa | Limpeza de bico e referenciar | Finalizar programa |
|---|---|---|---|---|
| BYSTAR | 1,294 | 0,633 | 0,273 | 0,157 |
| BYSPRINT | 1,194 | 0,253 | 0,213 | 0,083 |
| BYSPEED | 1,431 | 0,343 | 0,276 | 0,171 |
| TRUMPF | 0,343 | 0,553 | 0,328 | 0 |

#### Plasma: velocidade (mm/min) e pierce (segundos)

| Espessura (mm) | Velocidade 80 A | Velocidade 260 A | Pierce 80 A | Pierce 260 A |
|---|---|---|---|---|
| 1,9 | 9800 | --- | 0,1 | --- |
| 2,65 | 7900 | --- | 0,1 | --- |
| 3 | 6145 | --- | 0,2 | --- |
| 3,35 | 5530 | --- | 0,2 | --- |
| 3,75 | 4915 | --- | 0,2 | --- |
| 4,25 | 4300 | --- | 0,2 | --- |
| 4,75 | 3675 | 6500 | 0,2 | 0,3 |
| 6,35 | 3045 | 6500 | 0,3 | 0,3 |
| 8 | 2430 | 5470 | 0,4 | 0,3 |
| 9,5 | 1810 | 4440 | 0,5 | 0,3 |
| 11 | 1450 | 3800 | 0,5 | 0,4 |
| 12,7 | 1410 | 3850 | 0,7 | 0,4 |
| 16 | 1000 | 3130 | 0,8 | 0,5 |
| 19 | 550 | 2170 | 0,9 | 0,6 |
| 22,4 | --- | 1930 | --- | 0,7 |
| 25 | --- | 1685 | --- | 0,8 |
| 31,5 | --- | 1135 | --- | 1 |
| 38 | --- | 895 | --- | 1,2 |
| 44,45 | --- | 580 | --- | 1,2 |
| 50 | --- | 405 | --- | 1,2 |
| 63,5 | --- | 192 | --- | 1,2 |
| no vazio | 16000 |  | --- | --- |

#### Corte e dobra: tempo base, faixa 0,91 à 2,65 mm (em unidades de 0,0498 min)

| Largura  Comprimento | 100 | 200 | 500 | 700 | 1000 | 1200 | 1400 | 1600 | 1800 | 2000 | 2200 | 2400 | 2600 | 2800 | 3000 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 3 | 3 | 4 | 5 | 6 | 7 | 7 | 8 | 9 | 10 | 10 | 11 | 12 | 13 | 14 |
| 200 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 16 |
| 500 | 4 | 5 | 6 | 7 | 8 | 10 | 11 | 12 | 12 | 13 | 14 | 15 | 16 | 17 | 18 |
| 700 | 5 | 6 | 7 | 9 | 10 | 12 | 14 | 15 | 16 | 17 | 18 | 19 | **1 min** | 22 | 23 |
| 1000 | 6 | 7 | 8 | 10 | 12 | 14 | 16 | 18 | 20 | 20 | 21 | 23 | 24 | 25 | 26 |
| 1200 | 7 | 8 | 10 | 12 | 14 | 18 | 19 | 21 | 22 | 25 | 26 | 28 | 29 | 30 | 33 |
| 1400 | 7 | 9 | 11 | 14 | 16 | 19 | 22 | 24 | 25 | 27 | 29 | 31 | 32 | 35 | 37 |
| 1500 | 8 | 10 | 12 | 15 | 18 | 21 | 24 | 27 | 28 | 33 | 33 | 34 | 37 | 39 | 40 |

#### Corte e dobra: tempo base, faixa 3,0 à 4,75 mm (em unidades de 0,0498 min)

| Largura  Comprimento | 100 | 200 | 500 | 700 | 1000 | 1200 | 1400 | 1600 | 1800 | 2000 | 2200 | 2400 | 2600 | 2800 | 3000 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 4 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 15 | 15 | 17 | 18 |
| 200 | 4 | 5 | 6 | 7 | 9 | 10 | 11 | 12 | 12 | 14 | 15 | 16 | 17 | 19 | 20 |
| 500 | 5 | 6 | 7 | 9 | 10 | 12 | 13 | 14 | 15 | 17 | 18 | 19 | 20 | 22 | 23 |
| 700 | 6 | 7 | 9 | 10 | 12 | 14 | 15 | 17 | 19 | 20 | 21 | 22 | 24 | 26 | 27 |
| 1000 | 7 | 9 | 10 | 12 | 14 | 15 | 17 | 20 | 22 | 23 | 24 | 25 | 27 | 30 | 32 |
| 1200 | 8 | 10 | 12 | 14 | 15 | 17 | 20 | 23 | 25 | 27 | 28 | 30 | 32 | 34 | 36 |
| 1400 | 9 | 11 | 13 | 15 | 17 | 20 | 22 | 25 | 28 | 29 | 30 | 31 | 33 | 37 | 39 |
| 1500 | 10 | 12 | 14 | 17 | 20 | 24 | 25 | 29 | 31 | 32 | 33 | 37 | 38 | 40 | 42 |

#### Corte e dobra: tempo base, faixa 6,3 à 25,4 mm (em unidades de 0,0498 min)

| Largura  Comprimento | 100 | 200 | 500 | 700 | 1000 | 1200 | 1400 | 1600 | 1800 | 2000 | 2200 | 2400 | 2600 | 2800 | 3000 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 5 | 6 | 7 | 8 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 18 | 18 | 19 | 20 |
| 200 | 6 | 7 | 8 | 9 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 20 | 21 | 22 |
| 500 | 7 | 8 | 9 | 11 | 13 | 14 | 16 | 17 | 18 | 20 | 21 | 23 | 24 | 25 | 26 |
| 700 | 8 | 9 | 11 | 12 | 14 | 16 | 18 | 19 | 20 | 22 | 25 | 27 | 28 | 30 | 33 |
| 1000 | 10 | 11 | 13 | 14 | 17 | 19 | 21 | 23 | 24 | 26 | 27 | 31 | 32 | 35 | 39 |
| 1200 | 11 | 12 | 14 | 16 | 19 | 20 | 23 | 25 | 28 | 30 | 32 | 34 | 37 | 40 | 44 |
| 1400 | 12 | 13 | 16 | 18 | 21 | 23 | 26 | 28 | 30 | 33 | 35 | 38 | 41 | 43 | 45 |
| 1500 | 13 | 14 | 17 | 19 | 23 | 25 | 28 | 30 | 32 | 35 | 38 | 41 | 43 | 46 | 49 |
