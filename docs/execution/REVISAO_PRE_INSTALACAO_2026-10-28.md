# Revisão concentrada antes da instalação

César solicitou revisão Astra com esforço alto antes da instalação. Revisão independente executada por gpt-6-astra/high; correção e contraprovas pelo executor principal. Nenhuma chamada ao caixa, provedor de login ou envio de código real.

## Falha corrigida: esgotamento de login por contas não cadastradas

O contador global recebia cada endereço antes da consulta ao cadastro. Mil endereços não aprovados preenchiam o limite de 1000 e impediam o operador legítimo de pedir código por até cinco minutos. O teste novo reproduziu a falha no código anterior (429 no lugar da recusa 403); não era hipótese apenas.

Agora a aprovação precede o consumo de capacidade. O contador é relido depois da consulta assíncrona, impedindo que chamadas simultâneas usem um valor antigo. Requisições pendentes ao provedor reservam uma das 100 vagas antes de aguardar a rede; sucesso e falha liberam a reserva. O limite de três solicitações por endereço aprovado permanece. Endereço já contabilizado não é recusado apenas porque a tabela de outros endereços está cheia.

Provas locais: 18 famílias de sessão, 6 HTTPS e 9 de composição no servidor Entregas passaram. Três contraprovas novas: 1001 endereços não cadastrados não enviam OTP nem bloqueiam o cadastrado; 20 chamadas simultâneas ao mesmo endereço produzem somente 3 solicitações; 120 endereços aprovados simultâneos produzem no máximo 100 chamadas pendentes, com liberação após falha. São transportes simulados; não representam teste de carga de rede/Windows nem proteção completa contra negação de serviço.

## Riscos preservados para instalação

- **Inicialização do leitor:** a cópia de procedência do produtor em `tests/tata-reader/fixtures/watcher_v1_installed_256dc42.ps1` registra emitted_hash mesmo quando suprime emissão inicial. Portanto um checkpoint reconstruído pode referenciar arquivo que nunca existiu. O consumidor atual recusa essa ausência; não foi alterado para ignorá-la. A observação anterior do host tinha 250 referências existentes: não há prova de falha atual. Antes da instalação conferir checkpoint e arquivos correspondentes, sem reset. Corrigir o protocolo do produtor exigirá versão explícita de supressão inicial, não dedução por arquivo ausente. Fixtures históricas não foram alteradas.
- **Tempo de processamento:** benchmark sintético local de 250 conversões de horário nativo consumiu aproximadamente 1728 ms no mesmo event loop. Não mede o Caixa Mooca. Avaliar isolamento da leitura em worker antes de permitir leituras simultâneas da fonte na mesma instância do Entregas.
- **Autorização após espera:** a autoridade confere validade antes de ler; uma leitura assíncrona futura precisará reconferir validade/revogação antes de liberar resposta. Não promover a futura execução em worker sem essa proteção.

A correção de login não resolve automaticamente esses riscos nem os testes humanos de identidade, fonte, Xiaomi e Gestor iFood. Instalação continua pendente; conector remoto segue com a cota mensal observada como esgotada. CI completo desta revisão aprovado: produto 40646268461 e Android 40646266951, commit remoto 2ccac17b5022df05ececb3f84be4d8bf459eb9a8. Árvore 70a84562c2d4da7a637df52fd3f3cb2d2fc9b9d7 idêntica ao local 9c6b3d9fc1976911f3595babdf3f3d35b472fc1b.
