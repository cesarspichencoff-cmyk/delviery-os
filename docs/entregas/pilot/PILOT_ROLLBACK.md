# Rollback do piloto

## Quando reverter

- Corrupção de dados  
- Comportamento inseguro  
- Impasse operacional sem workaround  

## Passos

1. **Parar** o servidor piloto (`Ctrl+C`).  
2. **Não** apagar a pasta `data/entregas-pilot/` sem backup.  
3. Listar backups em `data/entregas-pilot/backups/`.  
4. Restaurar o último backup válido (API restore ou cópia manual de `store-*.json` → `store.json` **após validar JSON**).  
5. Reiniciar `npm run ui:entregas:pilot`.  
6. Login e smoke: montar viagem de teste **sem** pedidos reais se possível.  

## Rollback de código

- Voltar ao commit do checkpoint visual / gate: ver git log `feature/entregas-v1`.  
- **Não** force-push.  
- Worktree do Copiloto V3.3 permanece intocado.

## Dados de demo

- Ambiente demo (`ui:entregas`) **não** usa a pasta do piloto.  
- Não copiar `store.json` do piloto para demo nem o contrário.
