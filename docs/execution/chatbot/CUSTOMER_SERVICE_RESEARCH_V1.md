# Pesquisa de atendimento ao cliente — V1

Consulta realizada em 2026-07-28. Esta pesquisa orienta playbooks e linguagem;
não substitui políticas TATÁ nem cria integração online. Procedimentos atuais
usam somente fontes oficiais. Estudos acadêmicos orientam comunicação e
recuperação de serviço.

## Síntese aplicável

1. Reconhecer o problema específico, não apenas pedir desculpas.
2. Responder o que já é conhecido antes de pedir dados adicionais.
3. Dar uma próxima etapa concreta e explicar o motivo.
4. Pedir somente o necessário para avançar.
5. Tratar solução financeira como análise ou decisão autorizada, nunca promessa.
6. Distinguir falha de produto, preparação, entrega, plataforma e segurança.
7. Ajustar a resposta à gravidade; situações sanitárias não recebem marketing,
   emoji ou diagnóstico.
8. Preservar evidências e contexto sem culpar uma parte antes da apuração.

## Fontes operacionais oficiais

### Problemas com o pedido iFood

- Entidade: iFood.
- URL: https://institucional.ifood.com.br/ajuda/problemas-com-o-pedido-ifood/
- Publicação/atualização exibida: 06/04/2026.
- Informação usada: em restaurante, problemas após entrega podem ser reportados
  em até 48 horas; o fluxo parte de `Pedidos` → pedido → `Ajuda` → problema com o
  pedido. O cliente seleciona itens, descreve o caso e pode anexar fotos dos
  itens, embalagem e nota. A loja participa da análise; iFood pode ser acionado
  quando não há resposta ou acordo. Pedido marcado como entregue e não recebido
  possui opção própria. O código de entrega não deve ser compartilhado antes de
  o pedido estar em mãos.
- Aplicabilidade: item faltando, errado, quantidade, personalização, segurança,
  atraso e não entrega.
- Limitação: telas e opções variam por versão/localização; o runtime não consulta
  o iFood.
- Revisão futura: antes de qualquer integração ou implantação em produção.

### Como falar com o suporte do iFood

- Entidade: iFood.
- URL: https://institucional.ifood.com.br/ajuda/pedir-ajuda-no-ifood/
- Publicação/atualização exibida: 01/04/2026.
- Informação usada: durante o pedido existe chat; após a finalização pode existir
  `Fale com a Loja`. O suporte iFood é acessado em `Ajuda` e `Falar com o iFood`.
  Para item errado ou faltante, o fluxo parte do pedido afetado.
- Aplicabilidade: orientação de canal sem transferir culpa.
- Limitação: opções podem variar por local e versão do aplicativo.
- Revisão futura: trimestral e antes de produção.

### Reembolsos e estornos

- Entidade: iFood.
- URLs:
  - https://institucional.ifood.com.br/ajuda/reembolsos-e-estornos/
  - https://institucional.ifood.com.br/clientes/prazos-e-regras-para-reembolso-ifood-ao-cliente/
- Publicação/atualização exibida: 01/04/2026.
- Informação usada: a solicitação passa por análise. Quando aprovada, o estorno
  segue o meio de pagamento. O acompanhamento fica em `Pedidos` → pedido →
  `Ajuda` → acompanhar reembolso.
- Aplicabilidade: pedido de cancelamento ou reembolso.
- Limitação: elegibilidade e prazo dependem do caso e do pagamento. O chatbot não
  decide nem promete reembolso.
- Revisão futura: antes de alterar qualquer texto de prazo ou elegibilidade.

### Nutrivigilância

- Entidade: Agência Nacional de Vigilância Sanitária — Anvisa.
- URL: https://www.gov.br/anvisa/pt-br/assuntos/fiscalizacao-e-monitoramento/nutrivigilancia/capa-nutrivigilancia/
- Atualização consultada: página vigente em 2026-07-28.
- Informação usada: suspeita de doença transmitida por alimento requer consulta
  médica ou procura de serviço de saúde o mais rápido possível.
- Aplicabilidade: mal-estar, possível alimento impróprio e reação após consumo.
- Limitação: o chatbot orienta busca de cuidado, não diagnostica.
- Revisão futura: anual ou quando houver nova orientação oficial.

### Doenças de transmissão hídrica e alimentar

- Entidade: Ministério da Saúde.
- URL: https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/d/dtha
- Atualização consultada: página vigente em 2026-07-28.
- Informação usada: sintomas podem incluir náusea, vômito, dor abdominal,
  diarreia e febre; duas ou mais pessoas com sinais semelhantes após a mesma
  origem podem caracterizar surto; deve-se procurar serviço de saúde e o
  diagnóstico depende de avaliação e exames.
- Aplicabilidade: mal-estar e múltiplas pessoas afetadas.
- Limitação: não permite atribuir causa ao restaurante ou indicar tratamento.
- Revisão futura: anual.

### Doenças diarreicas agudas

- Entidade: Ministério da Saúde.
- URL: https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/d/dda/
- Atualização consultada: página vigente em 2026-07-28.
- Informação usada: piora, vômitos repetidos, muita sede, recusa de alimentos,
  sangue nas fezes ou redução de urina exigem retorno imediato ao serviço de
  saúde; crianças e idosos apresentam risco aumentado de desidratação grave.
- Aplicabilidade: orientação proporcional em relato de sintomas.
- Limitação: sinais são triagem informativa, não diagnóstico.
- Revisão futura: anual.

### SAMU 192

- Entidade: Ministério da Saúde.
- URL: https://www.gov.br/saude/pt-br/composicao/saes/samu-192/samu-192
- Atualização consultada: página vigente em 2026-07-28.
- Informação usada: o SAMU 192 é gratuito, opera 24 horas e atende situações de
  urgência ou emergência, incluindo problemas cardiorrespiratórios e risco de
  morte.
- Aplicabilidade: dificuldade para respirar, desmaio ou outra urgência evidente.
- Limitação: não substituir avaliação profissional nem classificar todo
  desconforto como emergência.
- Revisão futura: anual.

### Denúncias sanitárias em São Paulo

- Entidade: Secretaria Municipal da Saúde de São Paulo.
- URL: https://prefeitura.sp.gov.br/web/saude/w/vigilancia_em_saude/213831
- Publicação exibida: 11/01/2021.
- Informação usada: condições sanitárias insatisfatórias em estabelecimentos da
  cidade podem ser comunicadas pelo 156 ou canal da Prefeitura; a Vigilância
  avalia e toma medidas conforme inspeção.
- Aplicabilidade: limite transparente e direito de denúncia.
- Limitação: não deve ser usado como ameaça nem substituir a condução interna.
- Revisão futura: confirmar canal antes de produção.

## Evidência acadêmica de hospitalidade e recuperação

### Service Failure Recovery Efforts in Restaurant Dining

- Autores: D. S. Sundaram, Claudia Jurowski e Cynthia Webster.
- Veículo: Journal of Hospitality & Tourism Research.
- DOI: https://doi.org/10.1177/109634809602000309
- Publicação: 1996.
- Informação usada: a eficácia de desculpa, nova execução e compensações varia
  conforme a criticidade da falha; recuperação não deve usar a mesma resposta
  para todos os casos.
- Aplicabilidade: proporcionalidade e adequação à gravidade.
- Limitação: estudo antigo e não define política operacional atual.
- Revisão futura: quando houver revisão bibliográfica ampliada.

### Interactions between Service Recovery Efforts and Customer Characteristics

- Autores e veículo: artigo no Journal of Quality Assurance in Hospitality &
  Tourism.
- DOI: https://doi.org/10.1080/1528008X.2020.1769523
- Publicação: 2020; volume publicado em 2021.
- Informação usada: desculpa, compensação e autonomia interagem com
  características do cliente e percepção de justiça; não existe recuperação
  única adequada a todos.
- Aplicabilidade: adaptar explicação e ação à necessidade, sem automatizar
  compensações.
- Limitação: orientação de experiência, não autorização financeira.
- Revisão futura: na evolução da política de recuperação de serviço.

## Conflitos e cautelas

- Duas páginas oficiais do iFood consultadas apresentam limiares diferentes para
  atraso de restaurante (10 e 15 minutos além da estimativa). Nenhum desses
  valores será hardcoded como verdade universal nesta mudança.
- O feedback sugeriu pedir foto, nota e quantidade de sacolas em vários casos.
  A documentação oficial sustenta fotos de itens, embalagem e nota para certos
  problemas no iFood, mas não sustenta perguntar sempre quantas sacolas foram
  entregues. Essa pergunta não será universalizada.
- O feedback sugeriu reforçar hábitos de higiene. Sem evidência específica e
  atual, o chatbot não fará claim de processo; demonstrará seriedade, preservará
  o relato e orientará investigação.
- Links, horários, preços e políticas TATÁ continuam vindo exclusivamente do
  catálogo interno confirmado.

## Política de uso no runtime

O atendimento não consulta a internet. Os pontos acima são convertidos em
playbooks versionados e revisáveis. Toda resposta técnica registra fontes
internas ou externas selecionadas e motivos de rejeição; somente a mensagem
necessária chega ao cliente.
