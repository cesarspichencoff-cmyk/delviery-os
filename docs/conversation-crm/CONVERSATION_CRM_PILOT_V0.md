# Conversation + CRM Pilot V0

## Resultado

O piloto implementa uma jornada local e testável:

```text
mensagem transitória
  → classificação determinística
  → bloco configurável
  → campos conhecidos e ausentes
  → regras de segurança
  → ocorrência ou consentimento codificado
  → encaminhamento humano quando necessário
```

Não há IA generativa, WhatsApp real, marketplace, sistema de pedidos, campanha, crédito, reembolso, disparo ou decisão financeira automática.

## Componentes

| Componente | Local | Responsabilidade |
|---|---|---|
| Importador | `src/conversation-crm/importer/` | Ler XLSX local, validar, tokenizar, detectar candidatos e quarentenar |
| CRM V0 | `src/conversation-crm/crm/` | Entidades imutáveis, timeline append-only, consentimento e autorização humana |
| Fluxos | `src/conversation-crm/flows/` | 35 blocos, 12 regras e mensagens de política em JSON |
| Motor | `src/conversation-crm/engine/` | Classificar, selecionar bloco, apontar lacunas e criar registro codificado |
| Casos | `src/conversation-crm/simulator/cases.js` | 40 cenários exclusivamente sintéticos |
| Simulador | `tools/conversation-crm/simulator/` | Interface e API locais para triagem e avaliação humana |
| Testes | `tests/conversation-crm/` | Importação, privacidade, domínio, fluxos, motor e servidor |
| Configuração | `config/conversation-crm/config.example.json` | Portas e diretórios relativos, sem segredo |

## Privacidade

- A mensagem é processada transitoriamente e nunca entra no resultado ou na timeline.
- O CRM aceita somente tokens de identidade e códigos operacionais.
- Payloads da timeline rejeitam campos pessoais explícitos e conteúdo semelhante a contato.
- Logs do servidor não contêm corpo de requisição.
- A interface não usa `localStorage`.
- A avaliação registra somente `case_id` e veredito em memória.
- O XLSX original e toda saída derivada permanecem fora da branch. Quando usados localmente, ficam apenas em diretórios privados ignorados pelo Git.

O export usa HMAC com segredo local. Isso remove os valores pessoais do artefato de desenvolvimento, mas tecnicamente é pseudonimização determinística. Enquanto o segredo existir, a saída deve continuar sendo tratada como sensível e nunca versionada.

## Comandos do importador

Coloque uma cópia local do XLSX em `imports/conversation-crm/`. Essa pasta é ignorada pelo Git e não deve ser transferida junto com o código.

```powershell
node tools/conversation-crm/crm-importer.js analyze --input imports/conversation-crm/entrada-privada.xlsx
node tools/conversation-crm/crm-importer.js validate --input imports/conversation-crm/entrada-privada.xlsx

$env:DELIVERYOS_CRM_ANON_SECRET = 'defina-um-segredo-local-forte-com-32-caracteres'
node tools/conversation-crm/crm-importer.js anonymize --input imports/conversation-crm/entrada-privada.xlsx --output runtime/conversation-crm/crm-anonimizado.json
node tools/conversation-crm/crm-importer.js export --input imports/conversation-crm/entrada-privada.xlsx --output backups/conversation-crm/exportacao-anonimizada
```

`anonymize` produz um JSON único. `export` produz registros, quarentena, grupos candidatos e estatísticas em arquivos separados. Entradas e saídas fora das raízes privadas configuradas são bloqueadas. Todos os argumentos de caminho são relativos à raiz do projeto.

## Executar o simulador

```powershell
npm run conversation-crm:start
```

Abrir localmente:

```text
http://127.0.0.1:4179/
```

O servidor escuta somente em `127.0.0.1`. A tela permite selecionar um dos 40 cenários ou escrever uma situação sintética, executar a triagem, inspecionar o registro CRM e marcar a avaliação humana.

## Executar os testes

```powershell
npm run conversation-crm:test
```

Cobertura principal:

- importação, validação, anonimização e quarentena;
- telefone inválido e duplicidade provável;
- conflitos de identidade sem fusão silenciosa;
- oito entidades do CRM V0;
- timeline append-only e isolamento por unidade;
- promessa e benefício dependentes de humano;
- 35 blocos e 12 regras carregados de JSON;
- alteração de mensagem de fluxo sem recompilar o motor;
- fluxos simples, operacionais, sensíveis, graves e ambíguos;
- opt-out;
- ausência de mensagem e marcadores sensíveis no resultado;
- API e interface exclusivamente locais.

## Critérios atendidos

1. O importador analisa o XLSX sem commitar valores pessoais.
2. A saída tokenizada foi produzida fora do Git.
3. Fluxos e mensagens podem ser alterados em JSON.
4. O simulador abre localmente.
5. Uma mensagem percorre classificação, bloco, regras e CRM.
6. Intenção, origem, gravidade, bloco, confiança e lacunas ficam visíveis.
7. O simulador cria registro sintético codificado.
8. Casos graves sempre escalam e ficam abertos.
9. Crédito, cortesia, reembolso e prazo não são oferecidos automaticamente.
10. Nenhum sistema externo é acessado.

## Limites atuais

- Classificação por palavras-chave é previsível, mas não compreende linguagem livre complexa.
- O CRM e as avaliações vivem em memória; não há persistência de produção.
- Não existe tela de atendimento humano ou fila real.
- Referências públicas, horário e informações da unidade exigem configuração validada.
- Não há consentimento presumido a partir da planilha CRM.
- Frequência agregada não é histórico pedido a pedido.
- Não existe identidade unificada automática entre canais.
- O procedimento completo de instalação, transferência, configuração e restauração está em `docs/conversation-crm/PORTABILITY_V0.md`.
