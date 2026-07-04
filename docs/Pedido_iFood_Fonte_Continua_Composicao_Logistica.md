# Pedido ao iFood — Fonte Contínua de Composição + Logística (versão longa/técnica)

> Versão detalhada, completa, em formato de e-mail formal — útil se o contato no iFood pedir
> especificação item por item, ou para arquivo interno do que foi solicitado.
> **Para copiar e enviar diretamente, prefira `docs/Mensagem_iFood_Pedido_Fonte_Continua.md`** — tem
> duas versões mais curtas e naturais (direta e estratégica), pensadas para serem coladas numa
> conversa real, não lidas como um e-mail corporativo.
> Baseada em evidência interna de 12 janelas reais analisadas — não exige nada que o iFood já não
> tenha gerado ao menos uma vez em algum dos exports recebidos até hoje.

---

**Assunto: Solicitação de exportação contínua de pedidos com itens + relatório logístico — Loja TATA SUSHI (FRN 53069)**

Olá,

Somos a TATA SUSHI (FRN_ID 53069, São Paulo/SP) e estamos desenvolvendo uma ferramenta interna de
gestão operacional a partir dos dados que o iFood já disponibiliza. Já recebemos e usamos com sucesso
alguns relatórios pontuais gerados pela plataforma — em especial um relatório de pedidos com itens
(formato HTML, com ID completo do pedido, itens, quantidade e observações do cliente) e o relatório de
logística (com os tempos de preparo, alocação, espera do entregador e entrega).

Esses dois relatórios juntos nos permitiram, pela primeira vez, entender com precisão como cada
pedido é composto e quanto tempo cada etapa realmente leva — informação essencial para melhorar
nosso atendimento e reduzir erros na montagem dos pedidos.

Gostaríamos de solicitar:

1. **Exportação contínua (diária ou semanal) de pedidos com itens**, no mesmo padrão do relatório
   que já recebemos, contendo:
   - ID completo do pedido (Order ID);
   - Data e hora do pedido;
   - Status final (concluído, cancelado, recusado);
   - Itens do pedido, com quantidade;
   - **Observações do cliente por item/pedido** (já presente em um dos formatos que recebemos —
     é um dado muito valioso para nós);
   - Valor total do pedido;
   - Motivo do cancelamento/recusa, quando houver.

2. **O relatório de logística do mesmo período**, sempre junto do relatório de pedidos, contendo:
   - Horários/tempos de aceite, acionamento do botão "pronto", saída e entrega;
   - Tempo de alocação do entregador;
   - **Tempo de espera do entregador na loja** (esse dado em especial já nos ajudou bastante a
     identificar gargalos reais);
   - Negociações e reembolsos vinculados ao pedido, quando houver.

3. **Confirmação sobre a janela exata coberta pelo relatório HTML de pedidos** — em um dos exports que
   recebemos, notamos que o período informado no título ("dia X") na verdade cobria uma janela de
   aproximadamente 24 horas anteriores ao momento da geração, não o dia-calendário completo.
   Poderiam confirmar como esse período é definido, para sabermos o melhor horário de solicitar/gerar
   o relatório de forma a cobrir o dia completo?

4. Também gostaríamos de saber se existe:
   - Uma forma de automatizar essa exportação (agendamento diário/semanal, e-mail automático, ou
     acesso via API/portal do desenvolvedor iFood);
   - Um formato estruturado (XLSX ou CSV) equivalente ao relatório HTML de itens, que seja mais
     estável para processamento automatizado do que uma página HTML;
   - A possibilidade de incluir o **preço unitário por item** no relatório de pedidos com itens (hoje
     só recebemos o valor total do pedido, sem o detalhamento por item);
   - Se as avaliações/reviews podem ser vinculadas ao ID do pedido (hoje recebemos só um resumo diário
     sem essa referência).

Qualquer uma dessas informações já ajudaria bastante; entendemos que algumas podem não estar
disponíveis hoje, e ficamos à disposição para esclarecer o uso que fazemos dos dados, se for útil para
avaliar o pedido.

Desde já agradecemos a atenção,

**TATA SUSHI — FRN 53069**
