# Lições de execução

## Instruções eficazes

- uma mudança por execução;
- baseline antes da branch;
- expectativa externa ao runtime;
- controles negativos obrigatórios;
- memória pequena e executável.

## Riscos de falso verde

- relatório verde sem diff e sem código de saída;
- verificador que importa `ideal_response`;
- cenário que injeta intenção esperada;
- snapshot amplo que aceita qualquer texto;
- métrica subjetiva apresentada como fato.

## Melhoria promovida

As regras acima foram promovidas para `AGENTS.md` e para as skills locais. A ferramenta deve registrar comandos, hashes e limitações em vez de depender do histórico da conversa.

## Retrabalho evitável identificado

Um hash de evidência não deve incluir o HEAD de documentação quando mede somente
comportamento. A mutação do commit, sem mutação do runtime, revelou a falha e a
regra foi promovida para a decisão D-003.

O baseline também mostrou que cobertura de intenção não equivale a riqueza de
superfície: estado lembrado pelo CRM pode continuar invisível na frase.

## Mudança 002

- validar o texto final com regras independentes do compositor detecta omissão
  de pergunta, fato e limite que testes do compositor isolado não veem;
- recuperação deve reconstruir a visão anterior ao turno corrente para não
  transformar retry em divergência;
- reduzir fallback genérico exige estratégias concretas e taxonomia, não
  sinônimos;
- hashes de artefato que incluem texto podem mudar legitimamente mesmo quando
  fatos e decisões permanecem equivalentes;
- uma frase operacional canônica deve ser transportada sem alteração semântica
  quando já contém a orientação autorizada.

## Mudança 003

- cegamento confiável deve acontecer no payload do servidor, não apenas por
  CSS;
- detalhe técnico pós-voto exige autorização por caso, não uma flag global da
  página;
- revisão append-only precisa de uma projeção `latest` para o dashboard não
  contar o mesmo caso duas vezes;
- mensagem livre não deve entrar no registro de feedback; apenas hash da
  resposta, tags e comentário sanitizado são necessários;
- identificadores sintéticos precisam de allowlist no scanner para não serem
  confundidos com telefone, sem relaxar a inspeção de comentários;
- teste de navegador deve observar a experiência visível e testar reload,
  mobile, teclado e falha segura;
- defeito encontrado durante homologação é evidência para a mudança seguinte,
  não autorização para corrigir respostas no mesmo sprint.

## Mudança 004

- busca de conhecimento precisa ser ampla e rastreável; parar no primeiro fato
  produz respostas formalmente válidas, mas operacionalmente pobres;
- acolhimento deve ser separado de utilidade: empatia sem resposta, direção ou
  pergunta mínima precisa falhar;
- fatos disponíveis e fallback legítimo exigem um gate independente do
  compositor;
- autosserviço já disponível deve retirar perguntas incompatíveis do plano, não
  apenas escondê-las na frase;
- URLs devem ser removidas antes de detectar pontuação interrogativa;
- re-homologação precisa de namespace de armazenamento próprio para preservar a
  rodada anterior;
- comparação antes/depois deve ser liberada após o voto e não incorporar
  comentários privados;
- teste independente que exige raiz-alvo deve falhar explicitamente quando a
  variável não existe; a correção é a invocação documentada, não afrouxar o
  teste.

## Mudança 005

- JSON Schema não desliga thinking; o runtime precisa definir reasoning explicitamente;
- validação de pergunta não basta: o prompt também precisa dizer que a pergunta obrigatória deve aparecer;
- seed deve ser derivada por caso/modelo para reproduzir falha sem depender da ordem;
- fallback não pode ser contado como geração aceita;
- contexto exibido ao avaliador faz parte do contrato do teste cego;
- artefato público cego e evidência privada auditável devem ter hashes separados;
- QA visual deve testar o momento da revelação e o avanço, não apenas a API;
- taxa automática e latência não substituem a pergunta “César enviaria?”;
- hardware de desenvolvimento não prova hardware do restaurante;
- peso verificado fora do Git não deve ser confundido com pacote redistribuível.

## Mudança 005B

- Writer fluente não prova Director correto; os dois papéis precisam de gates
  independentes de qualidade e latência;
- grammar, parsing e semântica podem garantir saída segura sem tornar a decisão
  operacionalmente correta;
- seeds fixas precisam acompanhar predicados explícitos do movimento esperado,
  não somente snapshots de JSON;
- uma correção pode ter o ato correto e ainda inverter valor anterior e novo;
- RAM nominal suficiente para carregar pesos não autoriza candidato opcional
  fora da classe de hardware certificada;
- modelo reprovado não deve consumir uma rodada adversarial ou humana apenas
  para completar uma lista de artefatos.

## Mudança 006

- movimento conversacional deve ser um contrato determinístico anterior à
  redação, não uma instrução implícita no prompt do Writer;
- respostas curtas só são seguras quando vinculadas à pergunta pendente e ao
  step atual da Journey;
- correção precisa registrar valor anterior e novo sem apagar o histórico;
- pergunta lateral deve responder e preservar explicitamente a pergunta de
  retomada;
- colisões precisam de ordem declarada e log auditável, especialmente quando
  segurança, cancelamento e correção aparecem juntos;
- o Writer deve receber contexto resumido por campos e estados, sem copiar PII
  ou valores internos desnecessários;
- fonte oficial de cardápio não implica catálogo único: canal, unidade e
  proveniência continuam obrigatórios;
- custo desconhecido é bloqueio, não oportunidade para fallback pago;
- teste cego só compara linguagem quando plano e estado são idênticos e a
  identidade técnica fica fora do artefato público;
- corpus amplo precisa de mutações adversariais; volume sem controles negativos
  não prova prioridade, isolamento de oráculo ou fail-closed.

## Correção pós-homologação humana 01

- uma mensagem real pode conter fatos, preferências, restrições e várias
  perguntas; classificar só a intenção dominante perde o objetivo humano;
- mudança no contexto sem mudança perceptível no plano não é inteligência útil;
- verdade auditável deve permanecer no diagnóstico, mas chegar ao cliente como
  orientação natural, nunca como relato do mecanismo;
- primeira visita é uma jornada de redução de complexidade, não ausência de fato;
- testes de API precisam ser complementados por espera correta e inspeção da
  resposta efetivamente renderizada no painel.

## Autonomous Experience Lab V1

- preservar uma falha como frase não basta; o ativo reutilizável é a classe,
  seu primeiro desvio e um oráculo que reprova novas formulações;
- estado correto não garante plano seguro: a ordem de precedência entre
  segurança, referência e apoio à decisão também precisa de prova;
- duas respostas iguais podem ser corretas apenas quando explicam por que a
  nova solicitação não pode mudar o resultado;
- cobertura declarada deve ser inventariada por família, não inferida do volume;
- Writer local deve ser exercitado por família, mas o gate determinístico
  completo não deve depender do custo temporal da inferência;
- um avaliador escrito pelo construtor pode aconselhar, nunca homologar a
  experiência humana.

## B2 — lições permanentes

- Não transformar alinhamento taxonômico em correção semântica dura.
- `NEEDS_CONTEXT_LOOKUP` sem ferramenta deve produzir clarificação segura.
- Writer pode degradar plano correto; disponibilidade exige fato explícito.
- Linguagem de fixture, fonte sintética ou mecanismo nunca pertence à resposta.
- Fallback seguro sem resposta útil evita mentira, mas não valida experiência.
- Comparação A/B só é causal quando ambos recebem fatos equivalentes.
- Publicação aceita não prova alinhamento: o Writer pode reconhecer o erro e
  ainda remover o fato que tornava a resposta útil.
- Fallback deve obedecer ao mesmo conteúdo mínimo do Writer; fail-closed com
  silêncio preserva segurança, mas reprova experiência.
- Conversa longa roteirizada pelo construtor é soak de pipeline, não prova de
  generalização cognitiva.
- Um A/B tecnicamente selado deixa de ser verdadeiramente cego quando o estilo
  ou os nomes artificiais revelam a variante.

## Recovery pós-certificação B2

- autorização para solicitar uma ferramenta não prova que ela executou;
- `NEEDS_TOOL` sem resultado precisa assumir a limitação e oferecer um próximo
  passo que o cliente possa realmente tomar;
- mudar palavras sem mudar estado não é progresso;
- pergunta obrigatória deve preservar o dado específico faltante, não apenas um
  ponto de interrogação;
- commitments precisam chegar ao validator central; validação dentro de um
  Writer isolado não protege fallback nem novos adapters;
- números e negações são partes materiais de restrições, não detalhes de estilo;
- replay targeted sobre conversa congelada deve manter cada unidade separada
  quando o Actor posterior reagiu a uma resposta antiga;
- customer surface e truth trace servem públicos diferentes e não devem dividir
  a mesma densidade visual.
