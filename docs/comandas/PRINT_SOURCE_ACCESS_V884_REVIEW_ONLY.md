# TATÁ Comandas — fronteira de acesso da fonte V8.84

**Estado: DRAFT / HOLD / revisão offline / nenhum acesso ao host.**

## Decisão

A V8.84 não cria um coletor. Ela corrige uma premissa de arquitetura: uma
conta capaz de abrir diretamente a fila Windows não pode ser chamada, sem
ressalvas, de "somente leitura".

Na especificação oficial do Windows, `PRINTER_READ`, `PRINTER_WRITE` e
`PRINTER_EXECUTE` usam a mesma máscara `0x00020008`, que inclui
`PRINTER_ACCESS_USE`. O `OpenPrinter` descreve esse direito como operações
básicas de impressão. Portanto, conceder o direito necessário a uma rota
direta de fila também introduz capacidade de impressão; isso não satisfaz a
separação mínima exigida para uma testemunha independente.

Fontes oficiais:

- Microsoft MS-RPRN — [Access Values](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rprn/945c4df5-4969-49c5-b1ce-59c1b3f35024);
- Microsoft Win32 — [OpenPrinter](https://learn.microsoft.com/en-us/windows/win32/printdocs/openprinter);
- Microsoft Win32 — [EnumJobs](https://learn.microsoft.com/en-us/windows/win32/printdocs/enumjobs).

O contrato puro em
`tools/comandas_print_source_access_v884_review_only.cjs` rejeita por isso a
fonte `WINDOWS_SPOOLER_QUEUE_API`, mesmo quando o chamador a rotula como
read-only.

## Alternativa de menor privilégio, ainda não provada

A única rota estruturalmente aceita para futura investigação é consultar um
canal **já existente e já habilitado**
`Microsoft-Windows-PrintService/Operational`, limitado ao evento 307, sem
abrir handle de impressora ou RPC do spooler. `Get-WinEvent` oferece consulta
filtrada e limite de eventos, e a segurança de canais de Event Log distingue
direitos de leitura, escrita e limpeza.

Fontes oficiais:

- Microsoft PowerShell — [Get-WinEvent](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.diagnostics/get-winevent);
- Microsoft Windows Server — [segurança de Event Log](https://learn.microsoft.com/en-us/troubleshoot/windows-server/group-policy/set-event-log-security-locally-or-via-group-policy);
- Microsoft MS-RPRN — [dados do evento 307](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rprn/b4a22048-7837-460e-b1bd-8d34f4270f29).

Essa alternativa também tem limites materiais:

- o evento 307 contém campos de documento, usuário, máquina, impressora e
  porta; a fonte é sensível mesmo quando a saída é sanitizada;
- evento de spooler não é confirmação de papel físico;
- a existência, habilitação e ACL do canal no caixa estão `UNKNOWN`;
- o vínculo confiável entre evento e tentativa V8.82 sem exportar informação
  sensível ainda não foi provado;
- a identidade efetiva do coletor, o token do emissor e o conjunto de atores
  GP/Teknisa ainda não foram observados;
- nenhuma coexistência sob carga operacional foi executada.

Por isso o melhor resultado possível é
`REVIEW_ONLY_EVENT_LOG_CANDIDATE_REQUIRES_EXTERNAL_PROOF`.

## Contrato estrutural

Uma proposta elegível para revisão deve:

1. usar SID de serviço dedicado para coletor e emissor, distintos entre si;
2. pinar externamente o conjunto de identidades GP/Teknisa sem expô-las na
   saída;
3. solicitar apenas leitura do canal existente e filtro do evento 307;
4. limitar a consulta a no máximo 256 eventos e dez segundos;
5. manter o evento bruto apenas em memória até sanitização;
6. exportar somente `job_id`, hashes do registro/snapshot, timestamp e código
   de status;
7. não exportar documento, usuário, máquina, impressora, porta, pedido ou XML
   bruto;
8. não abrir handle de impressora, usar RPC do spooler, injetar nos processos
   GP/Teknisa, ler configuração deles, controlar serviço, alterar Event Log,
   gravar arquivo, usar rede, tocar fiscal/SEFAZ ou sequência.

Campos extras de aprovação ou autoridade são recusados; uma proposta não pode
se promover por autodeclaração.

## O que a V8.84 não faz

- não implementa `Get-WinEvent`;
- não lê Event Log, spooler, impressora, processo, serviço ou arquivo;
- não cria usuário, serviço, SID, grupo ou ACL;
- não habilita nem configura o canal PrintService;
- não assina evidência;
- não acessa GP/Teknisa;
- não prova impressão, ausência de efeito ou retry seguro.

## Próximo portão

Antes de qualquer leitura live, uma inspeção separadamente autorizada teria de
provar em metadados:

- SID real do coletor e do emissor;
- grupos efetivos do token do coletor;
- exclusão das identidades GP/Teknisa;
- canal já habilitado;
- ACL específica com leitura e sem escrita/limpeza;
- vínculo mínimo de tentativa sem exportar os campos sensíveis;
- comportamento limitado sob falha e carga;
- autorização humana própria para a leitura do host.

**NO LIVE READ / NO MERGE / NO DEPLOY / NO INSTALL / NO PRINT / NO SPOOLER
READ OR WRITE / NO EVENT LOG READ OR CHANGE / NO GP OR TEKNISA ACCESS / NO
FISCAL OR SEFAZ CHANGE / NO SERVICE OR SEQUENCE CHANGE / NO CASH REGISTER
ACCESS.**
