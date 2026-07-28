# Testes do chatbot — contrato independente

Não criar teste tautológico nem importar a decisão privada que deveria ser verificada. Expectativa e oráculo ficam fora do runtime; `scenario_id` nunca pode influenciar classificação.

Todo gate crítico precisa de:

- caso positivo e negativo;
- controle de mutação quando aplicável;
- falha com código diferente de zero;
- evidência pequena e reproduzível;
- scanner de privacidade independente.

Não usar snapshot permissivo, expectativa genérica ou normalização que esconda divergência. Não atualizar expectativa apenas para deixar a suíte verde e não remover teste adversarial sem registrar a perda de cobertura.

Verificadores de linguagem devem analisar somente a saída pública e dados explicitamente permitidos. Eles não podem consultar `ideal_response`, intenção esperada do cenário ou decisões internas do compositor para concluir que a própria resposta está correta.

Controles negativos devem provar detecção de: resposta vazia, link ou valor desconhecido, promessa sem evidência, linguagem burocrática, pergunta repetida e vazamento técnico. Se um controle negativo não fica vermelho, o verificador falha.

