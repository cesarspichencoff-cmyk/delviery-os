# Inventário do computador do ensaio (CAIXA_MOOCA) — somente leitura (01/11/2026)

> **Isto não é observação ao vivo.** Esta sessão roda na nuvem, e nenhum computador do César estava conectado
> a ela (`list_computer_folders` vazio). O que segue é o que o repositório registra do host, com data e
> fonte. O estado atual se confirma com `tools/windows-local-lab/inventario-somente-leitura.ps1`, que **só
> lê**:
>
> - usa apenas `Get-*`, `netbird status` e GETs locais de saúde;
> - não abre arquivo privado (só existência, tamanho e data) e não grava nada;
> - uma guarda no CI Windows reprova o script se ele ganhar qualquer comando de escrita.
>
> Para rodá-lo, abra uma sessão do Claude no próprio computador (app Desktop ou `claude remote-control` na
> pasta do ensaio) ou execute o script e cole a saída.

## 1. Ambiente

| Item | Registrado | Fonte |
|---|---|---|
| Máquina | Windows; pasta `C:\Users\Tata\DeliveryOS-Ensaio` (`app\`, `logs\`, arquivos privados ao lado) | `MOOCA_ACESSO_REMOTO_2026-10-26.md` |
| Unidade | Ambiente de teste do aplicativo **ITAIM**; fonte TATÁ Comandas "Do Itaim somente" (nativa `0001/01`) | `PLANO_V1_OPERACIONAL_2026-10-26.md` |
| Node | `C:\Program Files\nodejs\node.exe` | idem |
| Modo | `test` + `simulated`; GPS desligado; termo não publicável em 26/10 (os campos legais foram decididos em 01/11 e o arquivo fica só no host; **o estado no host não está observado**) | `MOOCA_POSTGRES_CONVERGENCIA_2026-10-26.md`; `LIBERACAO_V1` §8 |

## 2. Processos e rotas

| Processo | Endereço | Como sobe |
|---|---|---|
| Piloto (Entregas) | `100.107.78.202:5193` (modo Remote) ou `127.0.0.1:5193` (modo Local) | `local-control.cjs start`; `switch-pilot.ps1 -Mode Remote|Local` |
| Crítico (plataforma) | `127.0.0.1:8080` | `local-control.cjs`, papel `deliveryos_critical` |
| Assíncrono | interno | `local-control.cjs`, papel `deliveryos_async` |
| PostgreSQL | `127.0.0.1:55436`, banco `deliveryos_lab`, dono `deliveryos_owner` | `pg-backup-restore.cjs`; `local-control.cjs migrate` |
| Console legado em PostgreSQL | papel `deliveryos_entregas_pilot`, escopo `isolated_legacy_console_only` | `pilot-storage.json`; `MOOCA_POSTGRES_CONVERGENCIA` |
| **Servidor de apresentação (Copiloto)** | **não instalado** | `MOOCA_ACESSO_REMOTO` |
| **source-ingest** | **não instalado** | `local-control.cjs` não o sobe |

## 3. HTTPS e NetBird

| Item | Registrado |
|---|---|
| NetBird | 0.81.4; interface `wt0` = `100.107.78.202`; DNS, rotas e SSH de servidor desligados |
| URL pública | `https://deliveryos-piloto.eu1.netbird.services`: TLS verificado; sem login do proxy responde 401 (barreira de autenticação do proxy) |
| Proxies | 2 peers gerenciados `proxy-*.netbird.cloud` (`100.107.51.21`, `100.107.100.135`), os únicos que alcançam `5193` |
| Firewall | três perfis ligados com a Ethernet excluída; grupo `DeliveryOS isolated lab mesh 20261026`, 258 regras só em `wt0`: bloqueia tudo que não é TCP, bloqueia as outras portas, bloqueia origens não confiáveis em `5193`; o guard exige exatamente esses dois peers e três escutas |
| HTTPS próprio | o piloto serve HTTP atrás do proxy (o TLS é do proxy); o crítico não tem TLS e só escuta em loopback |

## 4. Banco, serviços e reversão

| Item | Registrado |
|---|---|
| Migrations | 0001–0010 pelo `local-control.cjs migrate` (papéis mínimos sem superusuário, conferidos) |
| Backup | prova local de `pg_dump` + restauração em cluster descartável (`55438`): só local, sem cifra, sem agenda, sem cópia fora do host |
| Tarefas | serviço semanal do leitor TATA (`install-weekly-service.ps1`); a tarefa de reversão do guard só existe durante uma aplicação (nenhuma pendente em 26/10) |
| Reverter rede | `netbird-guard.ps1 -Mode Rollback`: desconecta o NetBird, piloto em loopback, remove as regras próprias, restaura perfis e exclusões |
| Reverter piloto | `switch-pilot.ps1 -Mode Local` (plataforma e banco intocados) |
| Parar processos | `runtime-pids.json` registra os PIDs; o lançador **não tem comando de parada** (encerrar pelos PIDs registrados) |

## 5. O que só o script responde

Ele responde, sem alterar nada:

- versão do Windows e último boot;
- **commit do build instalado** (`dist\build-stamp.json`) e hash dos binários;
- processos e escutas nas portas do ensaio, e se o piloto está em Remote ou Local;
- peers do NetBird e regras do firewall;
- serviço PostgreSQL;
- presença dos arquivos privados (sem abri-los);
- WSL presente ou não;
- `openssl` presente ou não, no PATH ou no Git para Windows (o certificado de laboratório do ensaio físico
  depende dele);
- saúde local (`/ready`, `/api/health`).
