# Comandas — conferência de convivência das impressoras (revisão)

**Estado:** revisão offline. Não é roteiro de instalação, ativação de serviço ou impressão.
**Produto:** TATÁ Comandas. A Academia fornece apenas regras de caixas, sacolas e kits.

## O que já é possível comprovar sem o caixa

`tools/comparar_preflight_impressoras_v878_offline.cjs` é um comparador **puro, sem rede, sem Windows APIs e sem spooler**. Ele lê dois relatórios JSON locais compatíveis com `tools/production_printer_preflight_readonly.ps1`. A execução não coleta relatórios nem toca nas impressoras: as entradas devem existir previamente. A saída contém somente códigos de divergência, sem nomes das impressoras, IPs, clientes ou conteúdo dos pedidos.

O comparador exige seis rotas de impressão esperadas, inventário válido e a mesma máquina em duas observações separadas por até 15 minutos. Detecta remoção ou inclusão de filas, mudanças de driver/porta/endereço, configurações da impressora, compartilhamento e publicação, indisponibilidade, aumento de trabalhos pendentes e vínculos inconsistentes entre rotas e filas. Rejeita relatórios que declarem sondagem TCP, escrita ou impressão.

**`STRUCTURAL_MATCH_ONLY` não significa `SAFE`, `GO` nem prova de impressão.** Mesmo sem diferenças, o sistema continua informando `authorizes_install=false`, `authorizes_print=false` e `absence_of_interference_proven=false`. Dados fornecidos não substituem atestação independente de origem ou leitura de desempenho do host.

## Quando o computador CAIXA_MOOCA estiver acessível

1. Revalidar autorização humana **específica para inspeção passiva**, identidade do dispositivo e horário adequado. Sem essa autorização: não executar nada no caixa.
2. Primeiro verificar, em leitura, quais filas/portas/serviços do GP/Teknisa existem e o consumo atual de CPU/RAM. Se a carga estiver alta, suspender a avaliação.
3. **Não executar automaticamente** `production_printer_preflight_readonly.ps1` no caixa: esse script grava um arquivo de evidência por padrão. Também não habilitar `-ProbeTcp9100`, que faz contato de rede. Qualquer coleta e gravação exigem revisão separada do efeito e consentimento adequado.
4. Somente com dois relatórios já disponíveis e autorizados, comparar **fora do caixa** usando:
   `node tools/comparar_preflight_impressoras_v878_offline.cjs <relatorio-antes.json> <relatorio-depois.json>`
5. Divergência, relatório incompleto, troca de host, status desconhecido ou aumento de fila: **HOLD**. Não presumir que as Comandas causaram o evento. Investigar com o GP como autoridade operacional.
6. Mesmo com `STRUCTURAL_MATCH_ONLY`, manter **HOLD** para instalação/serviço/impressão. Ainda faltam Reader real, vínculo de origem e sequência, testes de desempenho e coexistência, critérios de interrupção, rollback e autorização separada para eventual prova em papel.

## Critérios de parada

Não instalar, configurar driver/porta, substituir GP, escrever em spooler, enviar ESC/POS ou iniciar teste físico nesta fase. Qualquer sinal de fila travada, degradação de serviço, recurso insuficiente, dúvida fiscal ou prova incompleta mantém **NO_GO**. A ausência de evidência não é evidência de ausência de interferência.

**Provas atuais:** verificação offline com relatórios fictícios + CI Linux/Windows. Nenhum teste é equivalente à convivência na loja.
