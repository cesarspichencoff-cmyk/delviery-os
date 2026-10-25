# TATÁ Comandas — metadados PrintService V8.85

**Estado: DRAFT / HOLD / runner Windows descartável / nenhum evento lido.**

## Objetivo

A V8.85 prova o menor passo executável depois da fronteira V8.84: consultar
somente a configuração do canal
`Microsoft-Windows-PrintService/Operational` em um runner Windows hospedado e
descartável do GitHub Actions.

Ela não consulta eventos 307, não acessa fila de impressão e não possui modo
para computador remoto. A saída permanece `HOLD` mesmo quando o canal existe,
está habilitado e expõe um descritor de segurança.

## Base oficial

`Get-WinEvent -ListLog` retorna um `EventLogConfiguration` com informações do
canal, incluindo nome, habilitação e descritor de segurança. A documentação
separa a obtenção dessas propriedades de qualquer alteração: para persistir
uma mudança seria necessário modificar o objeto e chamar `SaveChanges`, método
que esta versão proíbe por teste estático.

Fontes:

- [Get-WinEvent — Microsoft Learn](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.diagnostics/get-winevent);
- [EventLogConfiguration — Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.eventing.reader.eventlogconfiguration);
- [SecurityDescriptor — Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.eventing.reader.eventlogconfiguration.securitydescriptor).

## Limites executáveis

O observador:

1. não aceita parâmetros de host, canal ou credencial;
2. exige sinais de GitHub Actions, Windows e runner `github-hosted`;
3. usa o canal exato, sem curingas;
4. executa uma única chamada `Get-WinEvent -ListLog` em job isolado;
5. interrompe a tentativa após dez segundos e remove o job;
6. exporta somente presença, habilitação e SHA-256 do descritor;
7. não exporta SDDL, SID, computador, usuário, caminho ou contagem de eventos;
8. não lê registros, evento 307, spooler, impressora, serviço, CIM, arquivos,
   rede, GP, Teknisa, fiscal ou sequência;
9. não chama `SaveChanges`, `wevtutil`, controle de serviço ou qualquer API de
   impressão;
10. nunca autoriza leitura live, impressão, reimpressão ou retry.

As variáveis de ambiente são guardrails contra uso acidental, não uma
fronteira de segurança impossível de falsificar. A evidência de execução vem
do contexto registrado do workflow hospedado. O script não deve ser copiado
nem executado no caixa.

## O que um resultado positivo significa

No máximo:

- o runner descartável expôs um canal com o nome esperado;
- o canal informou seu estado de habilitação;
- um descritor de segurança foi observado e reduzido a hash sem ser exportado.

Isso não prova:

- estado do canal no caixa;
- semântica read-only da ACL;
- SID real do coletor;
- grupos efetivos do token;
- exclusão de GP/Teknisa;
- leitura de eventos;
- vínculo com tentativa V8.82;
- papel físico;
- coexistência operacional.

## Próximo portão

Uma futura leitura de metadados operacionais exige fixar host, loja, conta e
SID; reconfirmar autorização; manter leitura de registros desabilitada; e
provar que a ACL concede leitura sem escrita ou limpeza. A passagem para esse
portão não autoriza evento 307, spooler, impressão ou retry.

**NO CASH REGISTER / NO EVENT RECORD READ / NO EVENT LOG CHANGE / NO SPOOLER
READ OR WRITE / NO PRINT / NO REPRINT / NO GP OR TEKNISA ACCESS / NO SERVICE
CHANGE / NO FISCAL OR SEFAZ CHANGE / NO SEQUENCE CHANGE / NO INSTALL / NO
DEPLOY / NO MERGE.**
