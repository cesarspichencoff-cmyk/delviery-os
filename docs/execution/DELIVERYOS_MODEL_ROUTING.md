# Política permanente de roteamento de modelos

> Vale para todo prompt do DeliveryOS a partir de 2026-08-04. Ela existe porque decisão de dados,
> segurança e produção errada custa mais do que qualquer economia de modelo.

## Cabeçalho obrigatório

Todo prompt novo começa com:

```text
MODELO:
NÍVEL:
AGENTES:
RESPONSABILIDADE DO LÍDER:
TAREFAS DELEGÁVEIS:
NÃO DELEGAR:
```

Prompt sem cabeçalho: o líder preenche antes de executar e declara o que assumiu.

## Quando usar cada modelo

| Situação | Modelo | Nível |
|---|---|---|
| Arquitetura, contrato de dados, integração, segurança, produção, idempotência, replay | **Opus 5** | alto ou **máximo** |
| Decisão de estado do projeto, auditoria canônica, veredito de release | **Opus 5** | **máximo** |
| Implementação **delimitada** (arquivo conhecido, contrato já fechado) | Sonnet 5 | alto |
| Testes mecânicos, fixtures, documentação derivada | Sonnet 5 | médio |
| Auditoria final independente | modelo **diferente** do que implementou | alto |

**Nunca esforço baixo** em: dados, segurança, idempotência, ordenação, replay, persistência,
produção, PII, ou qualquer coisa que grave.

## Subagentes

**Use** para: inventário amplo (varrer worktrees, listar arquivos), busca de padrão em muitos
diretórios, leitura paralela de suítes longas.

**Não use** para: decidir estado do projeto, reconciliar evidência conflitante, assinar veredito,
escolher arquitetura. O líder Opus reconcilia e assina — subagente entrega insumo, não conclusão.

**Regra de custo:** cada subagente começa frio e re-deriva contexto. Se o líder já tem o contexto,
fazer inline é mais barato e mais correto.

## Auditor independente — quando é obrigatório

- antes de declarar qualquer coisa pronta para operação real;
- antes de conectar dois subsistemas que hoje não se conhecem;
- ao fechar gate que envolva dinheiro, PII ou aparelho em campo;
- quando o mesmo agente escreveu o código **e** o teste que o aprova.

## O que nunca vai para modelo rápido

Contrato de evento · schema durável · migração · ordenação e conflito · confiança e evidência ·
autenticação de dispositivo · política de retenção · rollback · qualquer decisão que o César precise
confiar sem reler.

## Padrão para as próximas missões de lançamento

| Missão | Modelo | Nível | Agentes |
|---|---|---|---|
| Subir Postgres + `/ready` + migrações | Opus 5 | alto | 1 |
| Piloto Entregas ponta a ponta (API + console) | Opus 5 | alto | 1 |
| APK em aparelho real | Opus 5 | alto | 1 (+1 leitura de logs) |
| Ligar Copiloto read-only sobre Entregas | **Opus 5** | **máximo** | 1 |
| Auditoria de prontidão de campo | Opus 5 (outro contexto) | alto | 1 |
