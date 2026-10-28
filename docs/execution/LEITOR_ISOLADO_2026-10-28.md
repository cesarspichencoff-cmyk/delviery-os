# Leitura isolada e autorização na devolução

A composição do servidor Entregas passa a executar a leitura do checkpoint, arquivos, conversão temporal e motor TATÁ em worker descartável. Mantém a implementação existente da fonte; não altera produtor, checkpoint, horário, itens ou significado de pronto/entregue.

## Limites

Uma leitura por instância, sem fila nem cache de pedidos. Concorrente recebe indisponibilidade e pode tentar depois. Prazo padrão de 4 segundos; memória V8 configurada em 64 MiB old/16 MiB young, stack 4 MiB. São limites do worker, não limite total de RSS do processo. A vaga só é liberada depois da terminação. A implementação executável tem caminho fixo sob appRoot, não fornecido por requisição/configuração de fonte. Cookies, sessão e cadastro não são enviados ao worker. Preloads e argumentos de debugger do processo pai não são herdados.

Falha, saída prematura, resposta inválida ou prazo excedido retornam indisponibilidade genérica, sem reaproveitar leitura anterior. Fonte indisponível continua indisponível. Nenhum listener extra, banco, infraestrutura ou serviço pago.

Após a leitura, a configuração é conferida novamente; antes de devolver os dados, identidade e concessão são revalidadas. Logout/revogação, indisponibilidade do provedor/cadastro, mudança de subject e vencimento descartam o resultado. A concessão inicial não pode expirar durante a operação e ser substituída silenciosamente por outra para liberar os mesmos dados. Isso não torna chamadas externas uma transação atômica; aplica a última verificação observável imediatamente antes da resposta.

## Prova local

- Worker: 4 famílias, incluindo CPU ocupada com HTTP respondendo antes do fim da leitura, rejeição de concorrência, prazo excedido/terminação, recuperação na próxima leitura, falha, saída prematura e integração com leitor nativo.
- Autorização: 13 famílias; novas contraprovas de revogação durante espera, logout/falha do provedor, vencimento de identidade/concessão e troca de subject.
- Servidor Entregas real em processo de teste: 9 famílias com a nova composição.
- HTTPS: 6; sessão: 18. TypeScript compilou; M1 40 e governança 14 passaram.

Fixtures sintéticas descartáveis. Nenhum acesso remoto, OTP real, publicação, impressão, escrita no Odhen ou alteração da operação. CI completo aprovado na revisão e3071759b0e2eecf18beed0912ed48b433d50b06: produto 40648260788 e Android 40648260728. Local equivalente 9cae0f1bc58dea0ae142195d2859c901e58bae60; árvore idêntica 0d3daf2db93302fb8fb9431769069795a3f19e68.

## Próximo limite

O prazo precisa ser medido no Caixa Mooca com a carga real. Prova de responsividade local não é teste de desempenho do caixa ou de bloqueio de I/O pelo sistema operacional. A UI tem prazo próprio de requisição; a revalidação do provedor adiciona uma consulta, e seu tempo precisa entrar no ensaio real. Também permanecem a conferência de referências do checkpoint (sem reset), a origem/login real, o launcher privado, o Xiaomi e a integração posterior do Gestor iFood. O conector remoto continua limitado pela cota mensal observada; não houve nova tentativa.
