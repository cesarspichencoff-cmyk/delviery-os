# Próximos Passos — Conversation + CRM

## Gate funcional imediato

1. César executa o simulador local.
2. Avalia uma amostra equilibrada dos 40 casos.
3. Registra divergências por categoria: intenção, gravidade, bloco, resposta e humano.
4. Decide quais correções de regra entram em uma missão controlada.
5. Somente depois, adicionar os casos independentes do Kimi.

## Evoluções candidatas

### Persistência privada

- Definir armazenamento local criptografado.
- Definir retenção, expiração e exclusão.
- Preservar append-only e isolamento por unidade.
- Não persistir mensagem bruta por padrão.

### Operação humana

- Criar fila de casos abertos sem virar dashboard.
- Permitir decisão humana registrada sobre promessa e benefício.
- Garantir que grave nunca feche sem decisão.
- Expor desconhecidos e proveniência.

### Qualidade de classificação

- Expandir variações linguísticas com casos sintéticos e independentes.
- Medir falso positivo de gravidade e escalonamento.
- Avaliar IA somente como classificadora auxiliar, nunca como autoridade financeira.
- Manter fallback determinístico.

### Governança de identidade e consentimento

- Definir processo humano para conflitos de identidade.
- Não unir por nome semelhante.
- Tratar tokens HMAC como pseudônimos sensíveis.
- Definir prova de opt-in por canal antes de qualquer comunicação.

### Integrações futuras

WhatsApp, marketplace e sistemas de pedido exigem missões próprias, contratos oficiais, privacidade, idempotência, observabilidade e autorização explícita. Nenhuma integração foi iniciada nesta V0.

## Fora do escopo preservado

- Campanhas e listas de transmissão.
- Programa de pontos, indicação e fidelidade.
- Crédito, reembolso ou cortesia automáticos.
- IA generativa em produção.
- Unificação automática da base real.
- Modificação do Conference Brain, Entregas ou motores operacionais.

## Riscos conhecidos

| Risco | Situação V0 | Próxima validação |
|---|---|---|
| Palavras-chave não cobrem linguagem complexa | Aceito para piloto previsível | Avaliação funcional e novos casos independentes |
| CRM em memória não sobrevive a reinício | Deliberado | Contrato de persistência privada |
| Token HMAC ainda é pseudônimo vinculável | Saída permanece fora do Git | Gestão de segredo e retenção |
| Base possui conflitos de identidade | Preservados como candidatos | Processo humano de resolução |
| Frequência não é histórico de pedidos | Explicitamente parcial | Fonte pedido a pedido futura |
| Informações da unidade podem ficar desatualizadas | Não hardcodadas | Fonte de configuração aprovada |

