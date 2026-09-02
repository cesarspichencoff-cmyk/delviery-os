# Instalação do DeliveryOS AI Node

## Estado desta entrega

O pacote é instalável e auditável, mas não foi instalado no restaurante. O bridge hospedado real também não está conectado nesta branch. O procedimento abaixo pertence a homologação/piloto controlado; não libera produção nem cliente real.

## Requisitos do computador

- Windows 10 ou 11 x64;
- CPU com AVX2; mínimo de quatro threads;
- 8 GB de RAM para o modelo leve; 16 GB recomendados para o Qwen3 4B;
- pelo menos 8 GB livres para runtime, modelo, staging e rollback;
- permissão de administrador para ACL e tarefa agendada;
- saída HTTPS para o host canônico do DeliveryOS;
- nenhuma porta recebida da internet.

O comando de diagnóstico deve ser executado antes da instalação:

```powershell
.\Diagnose-DeliveryOS-AINode.ps1
```

A classificação pode ser `nao_compativel`, `basico`, `intermediario` ou `avancado`. O modelo avançado não é baixado automaticamente.

## Conteúdo do pacote

`DeliveryOS-AINode-Windows` contém aplicação, instalador, manifestos, scripts e avisos de terceiros. Não contém pesos GGUF, executáveis do llama.cpp, Node portátil, credenciais ou dados reais. O instalador baixa artefatos oficiais fixados por versão, tamanho e SHA-256, ou os recebe de um bundle offline previamente verificado.

## Instalação online controlada

```powershell
Set-Location .\DeliveryOS-AINode-Windows\installer
$code = Read-Host "Código temporário de instalação" -AsSecureString
$params = @{
  BridgeUrl = "https://<host-aprovado>/internal/ai-node/v1"
  UnitId = "<unidade-aprovada>"
  InstallationCode = $code
}
.\Install-DeliveryOS-AINode.ps1 @params
```

Não preencher os placeholders antes de o endpoint e a unidade serem aprovados. O código deve ser temporário, de uso único e informado como `SecureString`.

## Instalação offline/USB

Baixe previamente os três artefatos selecionados pelo Doctor, sem executá-los. Coloque-os em uma pasta externa e execute:

```powershell
$params.OfflineBundle = ".\artifacts"
.\Install-DeliveryOS-AINode.ps1 @params
```

Tamanho e SHA-256 continuam obrigatórios no modo offline. Arquivo parcial ou divergente é removido e não é promovido.

## Operação e manutenção

```powershell
.\Diagnose-DeliveryOS-AINode.ps1
.\Repair-DeliveryOS-AINode.ps1
.\Update-DeliveryOS-AINode.ps1 -ManifestPath ".\update-manifest.json"
.\Uninstall-DeliveryOS-AINode.ps1
```

A instalação canônica usa `%ProgramData%\DeliveryOS\AINode` e separa `bin`, `runtime`, `models`, `config`, `state`, `logs` e `updates`. A inicialização é uma tarefa agendada sob `SYSTEM`, sem exigir usuário logado. Atualizações são manuais, verificadas e possuem rollback.

## Verificação pós-instalação

1. Doctor sem bloqueio de hardware.
2. Runtime escutando somente em `127.0.0.1`.
3. Chave privada protegida por DPAPI e ACL.
4. Heartbeat autenticado e node associado à unidade correta.
5. Claim/lease sintético concluído uma vez.
6. Node desligado mantém fallback determinístico no DeliveryOS.
7. Nenhum log contém mensagem bruta, PII, token ou reasoning.

## Transferência e backup

Copie apenas o pacote redistribuível e, quando autorizado, o bundle offline de artefatos verificados. Não copie `config`, `state`, `logs`, credenciais DPAPI ou modelos de uma instalação para outra. Uma nova máquina deve receber novo código e nova identidade. Backup operacional do node é de configuração pública/manifestos; credenciais devem ser reemitidas, não clonadas.

## Limitações atuais

- hardware do restaurante ainda desconhecido;
- endpoint hospedado real ainda não conectado;
- nenhuma aceleração CUDA foi homologada nesta mudança;
- concorrência multiprocesso continua não homologada;
- vencedor humano do bake-off ainda não existe;
- produção e clientes reais permanecem bloqueados.
