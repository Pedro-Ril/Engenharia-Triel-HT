# Workstations NVIDIA — perfil do driver monitorado pelo portal

Criado em 17/11/2026. Garante que as configurações do **Painel de Controle
da NVIDIA** definidas pela TI continuem aplicadas nas workstations Dell da
engenharia, mesmo depois de atualizações de driver (que costumam voltar
tudo ao padrão), e mostra a situação de cada máquina no portal.

```
 Pasta central (NETLOGON)          Workstation (GPO, tarefa como SYSTEM)            Portal
 ┌──────────────────────┐  GPO    ┌───────────────────────────────────────┐  lê   ┌────────────────────────┐
 │ perfil-padrao.nip    │ ──────► │ Verificar-PerfilNvidia.ps1            │ ◄──── │ coleta (a cada 30 min) │
 │ Verificar-...ps1     │  copia  │  1. exporta o estado real do driver   │  UNC  │  status + histórico    │
 │ nvidiaProfileInsp.\  │         │  2. compara com o perfil oficial      │       │  alertas por e-mail    │
 └──────────▲───────────┘         │  3. reaplica se divergir e confere    │       └───────────┬────────────┘
            │                     │  4. grava estado.json                 │                   │
            └─────────────────────┴───────────────────────────────────────┴── publica .nip ───┘
```

- A **workstation se corrige sozinha**: não depende do portal estar no ar.
- O **portal só observa**: lê o `estado.json` de cada máquina pela rede e
  publica o perfil oficial na pasta central.

---

## 1. Onde está cada coisa

| O quê | Onde |
|---|---|
| Script da workstation | `workstations-nvidia/Verificar-PerfilNvidia.ps1` |
| Perfil oficial de referência | `workstations-nvidia/perfil-padrao.nip` |
| Pasta central (distribuída pelo GPO) | `\\trielht.ad\NETLOGON\NvidiaProfile\` |
| Pasta local em cada máquina | `C:\ProgramData\TI\NvidiaProfile\` |
| Tela no portal | Administração → Sistema → **Workstations NVIDIA** |
| Código do servidor | `src/lib/workstations-nvidia/` |
| Tela (componentes, serviço, tipos) | `src/modules/workstations-nvidia/` |
| Rotas de API (só administradores) | `src/app/api/admin/workstations-nvidia/` |
| Migração do banco | `db/schema/0171_workstations_nvidia.sql` |
| Agendador da coleta | `src/instrumentation.ts` → `iniciarAgendadorWorkstationsNvidia()` |
| Testes | `src/lib/workstations-nvidia/workstations-nvidia.test.ts` |

`workstations-nvidia/.gitattributes` impede o git de converter as quebras
de linha do `.nip`: o hash do perfil depende dos bytes exatos.

---

## 2. Perfil oficial

### 2.1 O que está aplicado hoje

| Perfil NVIDIA | Programas | Configuração | Valor |
|---|---|---|---|
| Base Profile (global) | — | Power management mode (`274197361`) | `1` — Preferir desempenho máximo |
| Dassault Systemes SolidWorks | `sldworks.exe` | Power management mode (`274197361`) | `1` — Preferir desempenho máximo |

Hash SHA-256 do arquivo: `8382D8D06D81356BBFBEDA951561B6582A7A2E10BD0B2AC6B9459DD421570A12`.

Valores do modo de energia vistos na prática: `1` = Preferir desempenho
máximo, `5` = Normal (o que o driver volta depois de uma atualização).

### 2.2 Como gerar um perfil novo

1. Numa workstation, configure o Painel de Controle da NVIDIA do jeito certo.
2. Com o **NVIDIA Profile Inspector 3.x** (o 2.x não exporta por linha de
   comando), num PowerShell como administrador, na pasta do `.exe`:
   ```powershell
   .\nvidiaProfileInspector.exe -exportCustomized
   ```
   Gera `CustomProfiles_<data-hora>.nip` ao lado do `.exe`, só com o que
   difere do padrão NVIDIA.
3. No portal, aba **Perfil oficial → Enviar novo perfil**.

Ao publicar, o portal:
- remove configurações que o próprio driver grava e que mudam de máquina
  para máquina — hoje o `271929336` (*List of Universal GPU ids*, que leva
  o ID da GPU local). Espalhar esse valor para outras máquinas seria errado;
- grava no formato do Profile Inspector (UTF-8 com BOM, CRLF);
- registra o evento *Perfil publicado* no histórico.

Na próxima atualização do GPO as máquinas recebem o arquivo novo. Até lá
aparecem como **Perfil desatualizado** (conformes com o perfil antigo).

> Não use o "Export current profile" da interface para gerar o perfil
> oficial: ele exporta também os **padrões da NVIDIA** daquele perfil
> (33 configurações no perfil do SolidWorks 2019+, nenhuma alterada pela TI).

---

## 3. Na workstation: `Verificar-PerfilNvidia.ps1`

### 3.1 Fluxo

1. Lê GPU e driver (`Win32_VideoController`). A versão do Windows vira a
   versão NVIDIA pelos últimos 5 dígitos: `32.0.15.9671` → **596.71**.
2. Se o Profile Inspector já estiver aberto na máquina, **adia** (com uma
   instância aberta ele repassa os comandos para ela e o resultado não é
   confiável).
3. Roda `-exportCustomized` e compara com `perfil-padrao.nip`, configuração
   por configuração (perfil + `SettingID` + valor). Configurações extras na
   máquina são ignoradas.
4. Se divergir: importa com `-silentImport -mergeImport`, exporta de novo e
   confere. **É essa segunda conferência que diz se deu certo.**
5. Grava `estado.json` (troca atômica) e, se houve evento, uma linha em
   `historico.log`. Apaga os `CustomProfiles_*.nip` gerados.

Arquivos que ele mantém na pasta local: `estado.json`, `historico.log`,
`ultimo-export.nip` (o último estado real lido, útil para diagnóstico).

### 3.2 Parâmetros

| Parâmetro | Padrão | Uso |
|---|---|---|
| `-Pasta` | pasta do script | Onde gravar o estado; o `.exe` é procurado nela e nas subpastas. |
| `-PerfilOficial` | `<Pasta>\perfil-padrao.nip` | Outro `.nip` (aceita caminho UNC). |
| `-SomenteVerificar` | — | Confere sem reaplicar. |
| `-UsarExport <arquivo>` | — | Usa um export pronto em vez de rodar o Profile Inspector (teste). |
| `-TimeoutSegundos` | 60 | Tempo máximo de cada chamada ao Profile Inspector. |

Código de saída: `0` = conforme, `1` = qualquer outra coisa (é o
"Resultado da última execução" `0x1` na tarefa agendada — o motivo aparece
no portal).

### 3.3 `estado.json`

```json
{
  "versaoScript": 1,
  "computador": "ENGAGRO02",
  "executadoComo": "AUTORIDADE NT\\SISTEMA",
  "verificadoEm": "2026-11-17T23:16:22-03:00",
  "gpu": { "nome": "NVIDIA RTX 2000 Ada Generation", "driverWindows": "32.0.15.9671",
           "driverNvidia": "596.71", "dataDriver": "2026-06-08" },
  "driverAnterior": "596.71",
  "perfilOficial": { "arquivo": "C:\\ProgramData\\TI\\NvidiaProfile\\perfil-padrao.nip",
                     "hash": "8382D8D0...", "configuracoes": 2 },
  "conforme": true,
  "acao": "reaplicado",
  "divergenciasEncontradas": [ { "perfil": "Dassault Systemes SolidWorks", "configuracaoId": "274197361",
                                 "configuracao": "Power management mode", "esperado": "1", "encontrado": "5" } ],
  "divergenciasAposReaplicar": [],
  "ultimaReaplicacao": { "em": "2026-11-17T23:16:52-03:00", "driverNvidia": "596.71",
                         "perfilHash": "8382D8D0...", "sucesso": true },
  "erro": null
}
```

Valores de `acao`: `nenhuma` (já estava conforme), `reaplicado`,
`falha_reaplicacao`, `somente_verificacao`, `adiado`, `erro`.

### 3.4 Particularidades que o script trata (descobertas nos testes)

| Comportamento | Consequência / tratamento |
|---|---|
| O Profile Inspector grava o `.nip` em **UTF-8 com BOM**, mas declara `encoding="utf-16"`. | O leitor padrão do .NET recusa. O script (e o portal) decidem a codificação pelo BOM e ignoram a declaração. |
| Sai **sempre com código 0**, mesmo se a importação falhar. | O sucesso é conferido exportando de novo depois de importar. |
| Em erro, abre uma **janela de erro** mesmo com `-silentImport`. Como SYSTEM ninguém a vê e o processo trava. | Cada chamada tem tempo limite (60 s); passou, o processo é encerrado e a execução vira falha. |
| Uma instância aberta recebe os comandos de outra. | Script adia se houver `nvidiaProfileInspector` em execução. |
| `-silentImport` sem `-mergeImport` usa *Replace* (substitui o perfil inteiro). | Sempre `-mergeImport`, para não apagar o que o driver grava no Base Profile. |
| PowerShell 5.1 deixa `$PSScriptRoot` vazio como valor padrão de `param()` com `-File`. | A pasta é resolvida no corpo do script. |
| PowerShell 5.1 lê `.ps1` sem BOM como ANSI (acentos quebrados). | O script é salvo em UTF-8 **com BOM** (e a rota de download serve os bytes intactos). |
| Rodando sem elevação, o Profile Inspector grava os exports como administrador e o script não consegue apagá-los. | Cada execução limpa também as sobras de execuções anteriores. Em produção (SYSTEM) não acontece. |

---

## 4. Pasta central e GPO

### 4.1 Pasta central — `\\trielht.ad\NETLOGON\NvidiaProfile\`

```
NvidiaProfile\
├── Verificar-PerfilNvidia.ps1
├── perfil-padrao.nip                 (publicado pelo portal)
└── nvidiaProfileInspector\
    ├── nvidiaProfileInspector.exe
    ├── nvidiaProfileInspector.exe.config
    ├── nvidiaProfileInspector.pdb
    └── Reference.xml
```

NETLOGON já é replicada entre os DCs e lida por todas as máquinas; só
administradores do domínio gravam (o portal roda como `TRIELHT\administrador`).
**Não deixe nenhum outro arquivo aqui** — o GPO copia tudo para todas as
workstations.

### 4.2 GPO — `TI - Perfil NVIDIA Workstations`

Vinculado à OU das workstations de engenharia. Opcional: filtro WMI
`SELECT * FROM Win32_VideoController WHERE Name LIKE '%NVIDIA%'` (namespace
`root\CIMv2`). Tudo em **Configuração do Computador**:

| Onde | Item |
|---|---|
| Preferências → Config. do Windows → **Pastas** | Criar `C:\ProgramData\TI\NvidiaProfile\nvidiaProfileInspector` |
| Preferências → Config. do Windows → **Arquivos** | Atualizar: `\\trielht.ad\NETLOGON\NvidiaProfile\*` → `C:\ProgramData\TI\NvidiaProfile` |
| Preferências → Config. do Windows → **Arquivos** | Atualizar: `\\trielht.ad\NETLOGON\NvidiaProfile\nvidiaProfileInspector\*` → `C:\ProgramData\TI\NvidiaProfile\nvidiaProfileInspector` |
| Preferências → Painel de Controle → **Tarefas Agendadas** | Tarefa `TI - Perfil NVIDIA` (abaixo) |
| Políticas → Modelos Adm. → Componentes do Windows → Windows Update | **Não incluir drivers com atualizações do Windows**: Habilitado |

Nos itens de Pastas e Arquivos: *Arquivo morto* pode ficar marcado;
**não** marcar *Somente leitura*.

Tarefa agendada (no mínimo Windows 7):

| Aba | Configuração |
|---|---|
| Geral | Ação **Substituir**; conta `NT AUTHORITY\System`; privilégios mais altos; configurar para Windows 7 / 2008 R2. Com System as opções de "usuário conectado" ficam desabilitadas — é normal, roda sempre em segundo plano. |
| Disparadores | Na inicialização, atraso de 2 min · Diariamente às 00:00, repetindo a cada 30 min por 1 dia, interromper após 1 h |
| Ações | `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` com `-NoProfile -ExecutionPolicy Bypass -File "C:\ProgramData\TI\NvidiaProfile\Verificar-PerfilNvidia.ps1"`, iniciar em `C:\ProgramData\TI\NvidiaProfile` |
| Condições | Desmarcar "somente na rede elétrica" e "parar se for para bateria" |
| Configurações | Executar por demanda; executar assim que possível se perder o horário; parar após 1 h; não iniciar nova instância |
| Comum | Remover este item quando não for mais aplicado |

No **Dell Command | Update**, tirar a categoria *Vídeo* das atualizações
automáticas (interface, ADMX do DCU ou
`dcu-cli.exe /configure -updateDeviceCategory=audio,network,storage,input,chipset,others`).

---

## 5. No portal

### 5.1 Tela (Administração → Workstations NVIDIA)

| Aba | O que faz |
|---|---|
| Máquinas | Indicadores, tabela com status por máquina, inclusão em lote (um nome por linha), ativar/desativar, remover, coletar uma ou todas, detalhes (divergências, mensagens do script, histórico recente, descrição). |
| Histórico | Eventos, com filtro por máquina e paginação. |
| Perfil oficial | Configurações do `.nip` publicado, hash, data; envio de perfil novo (com confirmação). |
| Configurações | Caminho do `estado.json`, pasta central, intervalo, horas sem contato, e-mails de alerta, coleta automática; roteiro do GPO e download do script. |

### 5.2 Status de cada máquina (a primeira regra que se aplica vence)

| Status | Quando |
|---|---|
| Aguardando coleta | Ainda não foi lida. |
| Sem contato | A última leitura do `estado.json` falhou (máquina desligada, porta 445 fechada, arquivo inexistente — o motivo aparece no detalhe). |
| Erro no script / Adiado / Falha | O que o script relatou (`acao` = `erro`, `adiado`, `falha_reaplicacao`). |
| Divergente | Script encontrou divergência e não reaplicou (`-SomenteVerificar`). |
| Script parado | Arquivo lido, mas o script não roda há mais que *horas sem contato* (tarefa parada?). |
| Perfil desatualizado | Conforme, mas com hash diferente do perfil oficial publicado. |
| Conforme | Tudo certo. |

### 5.3 Coleta

- Automática a cada **30 min** (configurável de 5 a 1440); o agendador
  confere a cada minuto. **Só começa depois de reiniciar o portal** (sobe em
  `instrumentation.ts`). Também pelo botão *Coletar agora*.
- Para cada máquina ativa: testa a **porta 445** (3 s) e só então lê
  `\\{computador}\C$\ProgramData\TI\NvidiaProfile\estado.json` (limite de
  15 s). Máquina desligada é descartada sem prender o pool de threads do
  Node. 6 máquinas em paralelo; uma coleta por vez no processo.
- A conta que roda o portal precisa **ler o C$** das workstations e
  **gravar na pasta central**. Hoje é `TRIELHT\administrador`.

### 5.4 Histórico e alertas

Eventos gerados comparando cada coleta com a anterior (sem repetir):

| Evento | Quando | E-mail |
|---|---|---|
| Driver alterado | Versão NVIDIA diferente da coleta anterior | sim |
| Reaplicado | Nova reaplicação com sucesso (descreve o que estava divergente) | não |
| Falha ao reaplicar | Nova reaplicação sem sucesso | sim |
| Erro no script | Script passou a relatar erro (ou o erro mudou) | sim |
| Sem contato | Sem leitura há mais que *horas sem contato* (padrão 24 h); uma vez só | sim |
| Contato restabelecido | Voltou a ler depois de um *Sem contato* | sim |
| Perfil publicado / Máquina adicionada / Máquina removida | Ações no portal | não |

Um único e-mail por coleta, para os endereços da aba Configurações, pelo
SMTP do portal. Sem e-mails configurados, nada é enviado.

### 5.5 Banco (migração 0171)

| Tabela | Conteúdo |
|---|---|
| `portal_ws_nvidia_config` | Linha única (`id = 1`): caminho do estado, pasta central, coleta ativa, intervalo, horas sem contato, e-mails. |
| `portal_ws_nvidia_maquinas` | Uma linha por máquina: cadastro, última tentativa de coleta e a última foto do `estado.json`. Datas vindas do script ficam como texto ISO com fuso. |
| `portal_ws_nvidia_eventos` | Histórico. `maquina_id` nulo = evento geral. Apagar a máquina apaga o histórico dela (`ON DELETE CASCADE`). |

### 5.6 Rotas (`/api/admin/workstations-nvidia`, só administradores)

| Método e caminho | Uso |
|---|---|
| `GET /maquinas` | Máquinas com status, perfil oficial, se há coleta em andamento |
| `POST /maquinas` | `{ computadores: "NOME1\nNOME2" }` |
| `PATCH /maquinas/[id]` | `{ ativo?, descricao? }` |
| `DELETE /maquinas/[id]` | Remove do monitoramento |
| `POST /coletar` | Todas as ativas, ou `{ maquinaId }` |
| `GET /eventos?maquinaId=&pagina=` | Histórico (25 por página) |
| `GET` / `PUT /config` | Configuração |
| `GET` / `POST /perfil` | Perfil oficial / upload `multipart` (campo `arquivo`) |
| `GET /script` | Download do `.ps1` |

---

## 6. Operação e problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Sem contato — "O estado.json não existe" | GPO ainda não chegou ou a tarefa não rodou | `gpupdate /force` e `schtasks /run /tn "TI - Perfil NVIDIA"` na máquina |
| Sem contato — "Máquina inacessível pela rede" | Desligada, fora da rede ou firewall bloqueando 445 | Ligar / conferir firewall |
| Sem contato — "Sem permissão" | Conta do portal sem acesso ao `C$` | Conferir a conta que roda o portal |
| Adiado | Profile Inspector aberto na máquina | Fechar; o script tenta de novo em 30 min |
| Falha ao reaplicar | Importação travou (janela de erro) ou não pegou | Ver *Mensagem do script* no detalhe e `historico.log` / `ultimo-export.nip` na máquina |
| Script parado | Tarefa agendada desabilitada/removida | Conferir a tarefa na máquina e o vínculo do GPO |
| Perfil desatualizado | Perfil novo publicado, GPO ainda não copiou | Aguardar (até ~90 min) ou `gpupdate /force` |
| Coleta automática não roda | Portal não foi reiniciado depois do deploy, ou coleta desligada | Reiniciar o portal / conferir a aba Configurações |

Comandos úteis na workstation (PowerShell como administrador):

```powershell
# Rodar a verificação agora, pela tarefa (como SYSTEM)
schtasks /run /tn "TI - Perfil NVIDIA"

# Ver o resultado
Get-Content C:\ProgramData\TI\NvidiaProfile\estado.json
Get-Content C:\ProgramData\TI\NvidiaProfile\historico.log -Tail 20

# Só conferir, sem reaplicar
powershell -NoProfile -ExecutionPolicy Bypass -File C:\ProgramData\TI\NvidiaProfile\Verificar-PerfilNvidia.ps1 -SomenteVerificar
```

---

## 7. Validação (17/11/2026)

| Teste | Resultado |
|---|---|
| Comparação com os exports reais (`-UsarExport`) | Máquina configurada: conforme · sem o modo de energia: 2 divergências · SolidWorks em `0`: 1 divergência |
| ENGAGRO02, manual, `-SomenteVerificar` | Conforme; hash igual ao do repositório |
| ENGAGRO02, SolidWorks mudado para *Normal* | Detectou `esperado 1, encontrado 5` |
| ENGAGRO02, reaplicação manual | Reaplicado e conferido em ~12 s |
| ENGAGRO02, tarefa como SYSTEM | Reaplicado em ~15 s, sem janela travando |
| Leitura pela rede (Node, TI01) | Porta 445 em ~20 ms, leitura em ~33 ms; máquina inexistente descartada em ~1 s |
| Rotas no portal (dev) | 401 sem login, validações, coleta de 8 máquinas em ~3 s, histórico sem duplicar |
| ENGAGRO05 via GPO | Recebeu os arquivos, encontrou divergência, reaplicou e ficou conforme |
| Testes automatizados | 22 testes (leitura do `.nip`, `estado.json`, status, eventos, hash igual ao `Get-FileHash`) |

---

## 8. Limites conhecidos

- Só garante o que está **no perfil oficial**; o resto do Painel da NVIDIA
  não é verificado.
- Configurações de **tela** (cor, resolução, múltiplos monitores) não
  fazem parte do `.nip` e não são cobertas.
- Exige o **Profile Inspector 3.x** (`-exportCustomized`).
- Se um driver futuro **renomear** o perfil "Dassault Systemes SolidWorks",
  a importação pode não casar com o perfil existente — aparece como
  *Falha ao reaplicar* com a divergência no detalhe; gerar o perfil oficial
  de novo a partir de uma máquina com o driver novo.
- O portal roda como administrador do domínio, o que dá ao monitoramento
  acesso ao `C$` de todas as máquinas. Se a conta do portal mudar para uma
  com menos permissão, trocar o caminho do `estado.json` por um
  compartilhamento só de leitura (criado pelo GPO) — o caminho é
  configurável e o resto não muda.
