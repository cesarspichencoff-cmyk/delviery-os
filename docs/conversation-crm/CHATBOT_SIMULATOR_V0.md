# Simulador Local do Chatbot V0

## Objetivo

Permitir teste funcional sem conectar mensageria, pedidos ou dados reais.

## Iniciar

```powershell
npm run conversation-crm:start
```

URL local: `http://127.0.0.1:4179/`.

## Jornada

1. Selecionar cenário sintético ou escrever mensagem de teste.
2. Informar contexto opcional de origem e gravidade.
3. Executar triagem.
4. Ver intenção, origem, gravidade, bloco e confiança.
5. Inspecionar campos conhecidos e ausentes.
6. Ler resposta, tags, ações permitidas e proibidas.
7. Conferir ocorrência ou consentimento CRM.
8. Marcar avaliação humana.

## Avaliações disponíveis

- correto;
- incorreto;
- resposta ruim;
- gravidade errada;
- bloco errado;
- deveria ir para humano;
- não deveria ir para humano.

Somente `case_id` e veredito ficam na memória do processo. Fechar o servidor apaga as avaliações.

## Casos sintéticos

| Categoria | Quantidade |
|---|---:|
| Simples | 10 |
| Operacionais | 10 |
| Sensíveis | 10 |
| Graves | 5 |
| Ambíguos | 5 |
| **Total** | **40** |

Todos usam identificadores `SIM-*`, códigos operacionais e mensagens próprias. Nenhum caso veio de conversa real.

## Segurança local

- Bind fixo em `127.0.0.1`.
- Política de conteúdo permite somente recursos da própria origem.
- Sem scripts, fontes ou imagens externas.
- Corpo limitado a 32 KiB.
- Erros devolvem apenas códigos sanitizados.
- Mensagem não é ecoada no registro.
- Sem arquivo, banco, cookie funcional ou `localStorage`.
- Nenhum endpoint envia mensagem ou acessa terceiro.

## Verificação visual executada

A tela foi aberta em navegador local, carregou 40 cenários, executou um caso grave, exibiu `O03`, `waiting_human`, ações proibidas e `CustomerOccurrence`. A avaliação “correto” foi registrada em memória. Não houve erro de console.
