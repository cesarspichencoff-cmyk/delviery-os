# Fluxos — Console operacional

1. Ver pedidos próprios prontos  
2. Selecionar e **Criar viagem** (CreateTrip)  
3. Limite de paradas = `PilotPolicy.max_stops` (mensagem real se exceder)  
4. Confirmar saída / iniciar retorno / fechar manual (papéis)  
5. Remover delivery ativa (histórico preserva active=false)  
6. Ver pendências (`entrega_sem_confirmacao` como “Aguardando confirmação”)  
7. Motoboys por estado COR (sem ranking)  
8. Atalho para Expedição iFood  
9. Abrir ocorrência  

Estados de UI: loading, vazio, erro do domínio, permissão via papel.
