# NFC-e automática — estado atual e próxima prova read-only — 2026-10-03

## Estado comprovado no TATÁ Reader

A leitura real mínima foi concluída com sucesso sob `NT SERVICE\TataComandaReader`, banco `teknisa`, sem PII, sem observações e sem qualquer escrita, impressão ou ação fiscal.

Pedido observado:
- origem: `DLV_IFO`;
- `NRVENDAREST=0000346965`;
- `NRCOMANDA=0000346537`;
- `NRCOMANDAEXT=9092`;
- 2 itens lidos.

Isto prova a capacidade de correlacionar um pedido integrado iFood no SQL mínimo. Não prova ainda que `NRCOMANDAEXT` seja exatamente o número curto mostrado no aplicativo iFood.

## FACT — cenário fiscal atual

- Em São Paulo, NFC-e modelo 65 é obrigatória para o varejo desde 01/01/2026, substituindo CF-e-SAT, modelo 02 e modelo 56.
- A SEFAZ-SP informou que o ambiente de produção passa a usar protocolo de autorização de 17 posições em 05/10/2026.
- A NT 2025.001 define QR Code v3 para NFC-e.
- A documentação pública da Teknisa descreve NFC-e automática condicionada a caixa NFC-e específico, API Interface ativa, caixa aberto e pedido pago elegível.
- A documentação de integração iFood da Teknisa mostra cadastro de caixa delivery com tipo de emissão NFC-e como possibilidade de configuração.

## Correção arquitetural

Não usar `PRODUCTION_DISPATCH` como gatilho fiscal arbitrário.

A legislação paulista vincula a emissão do documento fiscal ao momento da saída/fornecimento da mercadoria. Portanto a automação deve descobrir e respeitar o gatilho nativo fiscal do Teknisa/Odhen para o canal real do TATÁ.

Permanece válido:

`PRODUCTION_DISPATCH != NFCE_AUTHORIZED != DANFE_PRINTED`

DeliveryOS não deve formar XML fiscal, assinar, transmitir à SEFAZ nem assumir cálculo fiscal que já pertence ao Teknisa/Odhen.

## Próxima prova read-only

Objetivo: descobrir no CAIXA, sem emitir NFC-e:

1. superfícies locais de código/config relacionadas a NFC-e, SEFAZ, DANFE, QR Code, CSC, certificado e Interface;
2. serviços/processos Teknisa/Odhen/Interface relevantes apenas por metadados;
3. impressoras/filas candidatas a DANFE apenas por metadados;
4. versão/configuração local que permita avaliar QR Code v3 e protocolo de 17 posições;
5. evidência do mecanismo nativo de gatilho para pedidos integrados, sem chamar endpoint fiscal e sem consultar dados fiscais de venda.

Effect boundary obrigatório:
- `fiscal_action=false`;
- `sefaz_call=false`;
- `danfe_print=false`;
- `database_write=false`;
- `odhen_write=false`;
- `cutover=false`.

## UNKNOWN

- se o caixa real do TATÁ está configurado como NFC-e;
- se a API Interface fiscal está ativa no ambiente real;
- se o canal iFood atual do TATÁ é elegível ao fluxo automático;
- qual é o gatilho fiscal efetivo no fluxo real;
- qual fila imprime DANFE;
- readiness do certificado/CSC sem exposição de segredo;
- compatibilidade efetiva da versão instalada com QR Code v3 e protocolo de 17 posições.

Até resolver esses pontos, nenhuma ação fiscal deve ser habilitada.
