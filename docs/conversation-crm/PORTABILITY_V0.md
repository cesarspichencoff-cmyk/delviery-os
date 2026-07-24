# Portabilidade do Conversation + CRM Pilot V0

## Contrato

O piloto não depende do nome do usuário, da pasta de instalação nem de um caminho absoluto. A raiz é descoberta pelo próprio código e todos os caminhos configuráveis são relativos a ela. Caminhos absolutos e travessias para fora do projeto são rejeitados.

O arquivo versionado `config/conversation-crm/config.example.json` contém somente valores seguros. Uma configuração local opcional pode ser criada em `config/conversation-crm/config.json`; ela é ignorada pelo Git. O segredo de anonimização existe apenas na variável de ambiente indicada pelo arquivo e nunca é exportado.

## Requisitos do computador

- Windows 10 ou 11, Linux ou macOS com Node.js compatível;
- Node.js 20 ou superior;
- npm compatível com lockfile v3;
- navegador moderno para a interface local;
- acesso local à porta configurada, cujo padrão é `4179` em `127.0.0.1`.

Não são necessários banco externo, serviço Windows, Docker ou credenciais de terceiros.

### Dependências versionadas

| Pacote | Versão efetiva do lockfile | Uso |
|---|---:|---|
| `xlsx` | `0.18.5` | Leitura local da planilha privada |
| `typescript` | `5.5.3` | Ferramentas já existentes do repositório |
| `@types/node` | `20.14.10` | Tipos das ferramentas já existentes |

O simulador e o CRM V0 usam APIs nativas do Node.js. Nenhuma dependência foi adicionada para a portabilidade.

## Instalação limpa

Depois de clonar ou copiar os arquivos versionados, abrir um terminal na raiz do projeto e executar um único comando:

```powershell
npm ci
```

O `package-lock.json` fixa a árvore efetivamente instalada. Não copiar `node_modules` de outro computador.

## Execução

Iniciar o simulador com um único comando:

```powershell
npm run conversation-crm:start
```

Abrir `http://127.0.0.1:4179/`. Para usar outra porta, definir `DELIVERYOS_CRM_SIMULATOR_PORT` antes da execução.

Executar a suíte dedicada:

```powershell
npm run conversation-crm:test
```

## Diretórios configuráveis

| Finalidade | Padrão relativo | Pode ser alterado por |
|---|---|---|
| Fluxos | `src/conversation-crm/flows` | `DELIVERYOS_CRM_CONFIG_ROOT` |
| Runtime privado | `runtime/conversation-crm` | `DELIVERYOS_CRM_RUNTIME_DIR` |
| Entrada privada | `imports/conversation-crm` | `DELIVERYOS_CRM_IMPORT_DIR` |
| Backup privado | `backups/conversation-crm` | `DELIVERYOS_CRM_BACKUP_DIR` |
| Arquivo de configuração | `config/conversation-crm/config.json` | `DELIVERYOS_CRM_CONFIG_FILE` |

Todos os valores devem continuar relativos à raiz. O host permanece fixo em `127.0.0.1` por segurança.

## Exportar e importar configuração

Exportar os fluxos e a configuração pública, sem segredo:

```powershell
npm run conversation-crm:config:export
```

O pacote é criado em `backups/conversation-crm/config-export-v0` com manifesto SHA-256. Para restaurá-lo em outra cópia do projeto, transferir esse diretório por canal privado e executar:

```powershell
npm run conversation-crm:config:import
```

A importação valida os hashes e o contrato dos fluxos, instala a cópia em `runtime/conversation-crm/restored-config-v0` e ativa `config/conversation-crm/config.json`. Pacote adulterado não é importado.

## Transferência para um segundo computador

1. Copiar apenas os arquivos versionados ou clonar a branch.
2. Não copiar `node_modules`, `runtime`, `imports`, `backups`, `uploads`, `.cache`, bancos locais ou o XLSX original junto com o código.
3. Executar `npm ci` na nova raiz.
4. Se necessário, transferir separadamente e de forma protegida o pacote de configuração exportado.
5. Executar o comando de importação.
6. Definir um novo segredo local de anonimização; não reutilizar ou gravar o segredo em arquivo.
7. Colocar entradas privadas em `imports/conversation-crm`, sem adicioná-las ao Git.
8. Executar os testes e iniciar o simulador.

Mover ou renomear a pasta do projeto não exige editar código ou configuração.

## Backup e restauração

- Configuração e fluxos: usar os comandos de exportação e importação acima.
- Exportações anonimizadas: guardar separadamente a pasta privada de backup e tratá-la como dado sensível pseudonimizado.
- Segredo HMAC: manter em cofre de segredos; ele não faz parte do backup do projeto.
- CRM e avaliações do simulador: nesta versão vivem apenas em memória e desaparecem ao encerrar o processo; não há banco operacional para restaurar.

## Pastas que nunca entram no Git

- `runtime/`;
- `imports/conversation-crm/`;
- `backups/conversation-crm/`;
- `uploads/conversation-crm/`;
- `.cache/conversation-crm/`;
- `config/conversation-crm/config.json`;
- arquivos `*.crm.db` e `*.crm.sqlite`.

## Limitações atuais

- A instalação por `npm ci` exige acesso ao registro npm ou cache previamente abastecido.
- O simulador não é um serviço e precisa ser iniciado manualmente.
- Não há persistência de produção; a portabilidade cobre código, configuração e artefatos privados explicitamente exportados.
- O pacote de configuração possui integridade por hash, não criptografia. Sua transferência deve usar canal protegido.
- O XLSX e os exports anonimizados continuam fora da branch e não são transportados automaticamente.
- O `npm audit` aponta vulnerabilidade alta na dependência preexistente `xlsx@0.18.5`, sem correção disponível pelo registro usado. Nesta versão, o importador permanece local, sem endpoint de upload, e deve receber somente arquivo conhecido e confiável. Esse risco impede tratar o importador como ingestão pública ou de produção.
