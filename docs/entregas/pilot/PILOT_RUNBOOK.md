# Runbook do piloto controlado — ENTREGAS

Linguagem prática para quem opera o dia a dia com o César acompanhando.

## Antes de começar

1. Uma única máquina servidor na unidade.  
2. Arquivo `config/entregas-pilot.json` (copie do `.example` e troque **todos** os tokens).  
3. `npm install` e `npx tsc` no repositório.  
4. Anote o IP da máquina na Wi-Fi da loja (ex.: 192.168.0.20).

## Como iniciar

```bash
npm run ui:entregas:pilot
```

- Console: `http://IP:5193/console/`  
- Motoboy: `http://IP:5193/rider-mobile/`  
- iFood: `http://IP:5193/ifood-handoff/`  

Banner esperado: **PILOTO CONTROLADO · UNIDADE …**  
**Não** deve aparecer “AMBIENTE DE DEMONSTRAÇÃO”.

No navegador (cada pessoa):

```js
await entregasPilotLogin("SEU_TOKEN")
location.reload()
```

(Ou implementar campo de login futuro; o token fica em `localStorage` e vai no header.)

## Como encerrar

1. Backup manual (admin): `POST /api/backup` com token gerente.  
2. `Ctrl+C` no terminal do servidor (gera backup no encerramento).  
3. Não desligar a máquina no meio de uma gravação se puder evitar.

## Celular

1. Mesmo Wi-Fi da unidade.  
2. Abrir `http://IP:5193/rider-mobile/`.  
3. Login com token do motoboy.  
4. Se não abrir: firewall Windows liberando porta 5193; IP correto; servidor em 0.0.0.0.

## Usuários do piloto

Definidos só em `entregas-pilot.json` (tokens).  
Papéis: operador console · expedição iFood · motoboy · admin.

## Pedidos e viagem (console)

1. Registrar pedido pronto (API `POST /api/ready-order` ou fluxo do console quando houver botão de registro).  
2. Marcar pedidos e **montar viagem** com motoboy interno.  
3. Motoboy **confirma saída** no mobile.  
4. **Abrir rota** (externa).  
5. **Cheguei** → **Confirmar entrega**.  
6. Ocorrência se necessário.

Sem GPS de produção: estados sem inventar posição.

## Sem internet no celular

1. Se o servidor local cair, ações online falham — avisar o responsável.  
2. A UI de demo tinha modo offline simulado; no piloto a rede da loja é pré-requisito.  
3. Se a conexão voltar, recarregar a página e conferir se a última ação está refletida; não repetir o mesmo `command_id`.

## Expedição iFood

1. Pedidos prontos no contador.  
2. Aviso do novo (temporário).  
3. **Buscar** sempre o da fila (mais antigo).  
4. Aguardar motoboy do iFood.  
5. Conferir **sacolas · nome · número iFood**.  
6. **Entregar ao motoboy**.  
7. Nome do motoboy é opcional.

## Backup

- Automático a cada N minutos (config).  
- Manual: admin com token gerente → `POST /api/backup`.  
- Arquivos em `data/entregas-pilot/backups/`.

## Restaurar

1. Só admin (`gerente`).  
2. Listar: `GET /api/backups`.  
3. `POST /api/restore` `{ "file": "store-....json" }`.  
4. **Reiniciar o servidor.**

## Relatar erro

1. O que a tela mostrou (mensagem humana).  
2. Horário aproximado.  
3. Quem estava logado.  
4. Enviar trecho de `data/entregas-pilot/ops.log.jsonl` (sem tokens).

## Interromper o piloto com segurança

1. Parar de usar as telas.  
2. Backup final.  
3. Encerrar servidor.  
4. Não misturar dados com demo (`npm run ui:entregas` usa memória e seed).
