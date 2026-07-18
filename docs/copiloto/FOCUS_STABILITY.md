# Estabilidade do Foco

`src/copiloto/focus-stability.js`

## Técnica
- persistência mínima (2 updates)
- margem de troca 1.25×
- cooldown 8 min
- hysteresis
- override crítico (severity ≥ 3)
- teto de duração 12 min
- dados inválidos → clear

## Produto
O Foco só muda quando:
1. foi resolvido
2. outra situação ficou **claramente** mais importante
3. surgiu risco crítico
4. os dados ficaram inválidos
5. a condição anterior deixou de existir

Picos de um minuto não interrompem.
