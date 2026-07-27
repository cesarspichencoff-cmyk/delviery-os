# Fundação de nuvem do DeliveryOS

> Este documento descreve **requisitos**, não fornecedores.
>
> A arquitetura congelada exige contratos de provedor substituíveis. Um
> documento que dissesse "crie um projeto no Supabase, clique aqui, cole ali"
> amarraria a operação a um fornecedor pelo caminho mais burro possível: a
> documentação. O que está aqui é o que o DeliveryOS **precisa**; qualquer
> provedor que atenda serve, e a verificação é automática.
>
> Nada neste documento foi executado. Criar conta, instância, domínio ou banco
> hospedado são atos com potencial de cobrança e dependem de decisão do César.
> O que **foi** executado está em `docs/execution/EVIDENCE.jsonl`.

---

## 1. As quatro peças

O DeliveryOS na nuvem tem quatro peças, e só a primeira é obrigatória para o
piloto começar.

| Peça | O que é | Obrigatória no piloto |
|---|---|---|
| **Banco** | PostgreSQL 14+, fonte de verdade online | **sim** |
| **Runtimes** | dois processos Node (crítico e assíncrono) | **sim** |
| **Backup externo** | cópia do banco **fora** da máquina do banco | **sim** |
| **Frontend estático** | HTML/JS servidos por CDN | não |

O frontend fica de fora do caminho crítico de propósito: enquanto ele for
estático, pode ser servido de qualquer lugar — inclusive do próprio runtime
crítico — e trocar isso depois não mexe em nada do resto.

---

## 2. Banco: o que exigir de qualquer provedor

Não decore esta lista. Ela está implementada em código:

```bash
DELIVERYOS_DATABASE_URL=postgres://usuario:senha@host:5432/base npm run verificar:banco
```

O comando responde em segundos, **sem migrar nada e sem gravar dado de
operação**. Sai com `0` se serve, `1` se não serve, e diz exatamente o que
faltou. É o que torna "trocar de provedor" uma decisão, e não uma aventura.

### Requisitos que reprovam

| Requisito | Por que reprova |
|---|---|
| PostgreSQL **14+** | abaixo disso faltam garantias que o schema usa |
| **TLS** na conexão (fora de localhost) | credencial e dado de operação em claro na internet é defeito, não configuração |
| Permissão de **criar schema** | sem ela as migrations não rodam — e o erro só apareceria no meio da primeira |
| **PL/pgSQL** | a trigger de append-only é escrita nela. Sem a linguagem, a migration falha **no meio**, deixando metade do schema aplicado |
| **JSONB** | todo payload de evento é JSONB |
| **`FOR UPDATE SKIP LOCKED`** | é o que faz a fila funcionar com mais de um worker. Alguns bancos gerenciados em modo de compatibilidade não suportam, e a descoberta sem este teste seria no primeiro pico |

### Requisitos que avisam

| Recomendação | Por que só avisa |
|---|---|
| Fuso do servidor em **UTC** | todo carimbo é `TIMESTAMPTZ`, então o fuso **não altera o dado armazenado**. Ele altera o que você lê numa consulta manual — e é assim que uma investigação erra o horário do turno |
| **25+ conexões** | o crítico usa 10 e o assíncrono 5; com margem para migration, backup e uma sessão humana, abaixo de 25 aperta sob pressão |

### Onde ele pode morar

Qualquer um destes atende, e a escolha é do César:

- **PostgreSQL gerenciado** (Supabase, Neon, RDS, Cloud SQL, e outros). Vantagem:
  backup e atualização por conta do fornecedor. Atenção: alguns têm plano
  gratuito que **pausa** o banco por inatividade — inaceitável para operação,
  porque a primeira entrega do dia esperaria o banco acordar.
- **PostgreSQL em VM** (qualquer provedor, ou máquina própria). Vantagem: sem
  surpresa de plano. Custo: backup e atualização passam a ser responsabilidade
  de quem opera.
- **PostgreSQL em container**, pela composição já pronta em
  `deploy/compose.platform.yaml`. É o caminho mais simples para começar, e o
  que menos depende de terceiros.

**Região:** São Paulo, ou a mais próxima disponível. Cada ida ao banco custa a
latência da distância, e o crítico faz várias por requisição. Um banco na
Virgínia acrescenta uns 120 ms por ida — invisível num teste, sensível num
turno de sexta.

---

## 3. Runtimes: o que exigir de onde eles rodam

- **Node 22 LTS** (a imagem já fixa isso);
- **dois processos**, não um. O crítico e o assíncrono escalam por motivos
  diferentes e não podem morrer juntos;
- o crítico precisa de **porta HTTP** e de health check em **`/ready`** — não
  em `/health`. A pergunta do orquestrador é "posso mandar tráfego", e ela só é
  sim quando o processo consegue persistir;
- o assíncrono **não escuta porta nenhuma**. Um provedor que exija porta aberta
  para considerar o serviço vivo não serve para ele — use um provedor que
  aceite processo de trabalho, ou rode-o junto do banco;
- **encerramento gracioso**: o orquestrador precisa mandar `SIGTERM` e esperar.
  30 s para o crítico, 45 s para o assíncrono. Matar o assíncrono no meio
  devolve o job pelo lease, mas retrabalho sobre efeito externo pode duplicar.

### Migrations são passo separado

Nunca ligue `DELIVERYOS_MIGRATE_ON_BOOT` fora de `local`. N réplicas subindo
juntas correriam a mesma migration ao mesmo tempo, e o deploy vira corrida.

```bash
npm run migrate        # antes de trocar as instâncias
npm run start:critical
npm run start:async
```

Na composição, isso já é o serviço `deliveryos-migrate`, e os dois runtimes só
sobem com `service_completed_successfully`.

---

## 4. Backup externo

O que a composição já faz: `pg_dump` diário para um **volume separado** do
banco, retendo 14 cópias.

O que isso **não** protege: perda da máquina. Backup que mora ao lado do banco
morre junto com ele.

### Requisitos do destino externo

- compatível com **S3** (R2, S3, Spaces, MinIO — qualquer um);
- **credencial só de escrita** no diretório de backup, e nenhuma permissão de
  apagar. Um invasor com a credencial do backup não pode destruir o backup;
- **retenção mínima de 14 dias**;
- **restauração testada**. Um backup que ninguém restaurou é suposição.

A restauração já é testada em código contra PostgreSQL real
(`npm run test:platform:backup`) e verifica não só os dados, mas o que costuma
sumir e só dá sinal meses depois: a trigger de append-only, as constraints, os
índices parciais e o fuso dos carimbos.

**Este passo depende de credencial e é o único item do capítulo 4 que não pôde
ser executado aqui.**

---

## 5. Frontend estático

Enquanto for HTML/JS sem servidor, qualquer CDN serve — Cloudflare Pages,
Netlify, S3+CloudFront, ou o próprio runtime crítico.

Duas regras:

- o frontend **nunca** fala direto com o banco. Toda escrita passa pelo runtime
  crítico, que é quem conhece as regras. Um frontend com credencial de banco é
  um frontend que pode gravar qualquer coisa;
- **nenhum segredo** no bundle. Tudo que vai para o navegador é público, por
  mais ofuscado que esteja.

---

## 6. Ordem de execução, quando o César autorizar

1. escolher onde o banco vai morar (§2) e criar a instância;
2. rodar `npm run verificar:banco` — **antes** de qualquer migration. Se
   reprovar, o problema aparece em segundos, e não no meio do primeiro deploy;
3. `npm run migrate`;
4. rodar as três suítes que dependem de banco, agora apontando para ele:
   ```bash
   npm run test:platform:pg && npm run test:platform:repos && npm run test:platform:backup
   ```
   Elas são a diferença entre "o banco existe" e "o banco serve";
5. subir os dois runtimes;
6. configurar o backup externo (§4) e **restaurar uma cópia** para provar;
7. só então apontar o Android para o domínio real:
   ```bash
   ./gradlew assemblePilot -Pentregas.baseUrl=https://SEU_DOMINIO
   ```

O passo 7 é travado por gate: `assemblePilot` **recusa** endereço que não seja
HTTPS ou que aponte para máquina local.

---

## 7. O que ainda não foi verificado

Registrado com precisão em `docs/execution/STATE.json`, campo `nao_comprovado`.
Em resumo:

- **Docker** não existe nesta máquina. A composição foi auditada por 30 testes
  que leem os arquivos, e 4 defeitos injetados foram detectados — mas
  `docker build` e `docker compose up` **não** rodaram;
- **banco hospedado** não foi criado. O verificador do §2 existe e foi provado
  contra PostgreSQL real, inclusive reprovando um banco sem permissão de criar
  schema;
- **destino externo de backup** não foi configurado: depende de credencial;
- **`SIGTERM`** não é observável no Windows — o sinal encerra o processo
  incondicionalmente e o handler não roda. Em container Linux isso funciona
  naturalmente, e o caminho de encerramento já é exercitado em processo pelos
  44 testes da plataforma.
