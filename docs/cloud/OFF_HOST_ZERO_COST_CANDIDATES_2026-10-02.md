# Backup off-host — candidatos zero-custo

Data da pesquisa: 2026-10-02

## Sucessão — 2026-10-03

A pesquisa abaixo permanece como fotografia de 2026-10-02, mas o estado vigente mudou:

- **Backblaze B2 foi selecionado e provado em ensaio isolado autorizado**;
- bucket privado em `us-east-005`, Object Lock e retenção padrão `COMPLIANCE / 14 days`;
- writer final restrita a **`writeFiles` somente**, sem `readFiles` e sem `deleteFiles`;
- reader final restrita a **`listAllBucketNames,readFiles`**;
- S3 real: `BACKUP_OFFHOST_S3_LIVE_GREEN 7/7` e segredo inválido rejeitado;
- PostgreSQL real: `pg_dump` → B2 → download → banco vazio → `pg_restore`, **7/7 PASS**;
- cinco chaves temporárias anteriores foram revogadas; o par final tem TTL de 24 h;
- cache administrativo e segredos locais foram removidos após a prova.

Isso fecha a **escolha/prova técnica do mecanismo off-host** para o piloto. Não configura
automaticamente o ambiente operacional: credenciais frescas de implantação, banco operacional,
migrations, cutover e deploy continuam efeitos separados.


## Estado

**Estado histórico em 2026-10-02: nenhum provedor havia sido selecionado.**
Nenhuma conta, bucket, credencial, assinatura ou upload externo foi criado por esta
pesquisa.

### Estado técnico do transporte — 2026-10-02

A camada S3-compatible foi provada separadamente em MinIO real e isolado no
GitHub Actions run `37031435078`: writer somente `PutObject`, reader somente
`GetObject`, round-trip íntegro, exatamente três objetos e assinatura derivada
de secret incorreto recusada. Isso reduz o risco de integração com um provedor
S3-compatible, mas **não seleciona nem prova B2/R2 como off-host real**.

Objetivo: reduzir o gate humano do backup externo sem violar os requisitos já
canônicos do DeliveryOS:

- API compatível com S3;
- uploader sem permissão de apagar;
- retenção mínima de 14 dias;
- restore realmente ensaiado;
- zero gasto incremental enquanto houver rota materialmente suficiente.

## Critério de escolha

A credencial usada pelo processo de backup **não pode** ter poder para apagar
o que acabou de enviar. Se leitura/restauração for necessária, ela deve usar
uma segunda identidade de manutenção, fora do runtime normal.

Também não basta existir free tier: o modo operacional deve permanecer dentro
dele ou falhar/alertar antes de criar custo.

## Candidato A — Backblaze B2

**Estado histórico em 2026-10-02: melhor encaixe técnico encontrado; posteriormente SELECIONADO E PROVADO em 2026-10-03.**

### O que atende

- API **S3-compatible**.
- Os primeiros **10 GB de storage são gratuitos**.
- Application Keys separam capacidades:
  - `writeFiles` permite upload;
  - `deleteFiles` é uma capacidade distinta;
  - a chave pode ser restrita a bucket e prefixo;
  - a chave pode expirar.
- Na API S3-compatible, `writeFiles` cobre `PutObject` e multipart sem
  conceder `DeleteObject`; deleção exige `deleteFiles`.
- Object Lock permite retenção padrão por bucket entre 1 e 3.000 dias.
- Object Lock não tem custo adicional próprio; valem os custos normais de
  armazenamento.
- O bucket pode aplicar retenção padrão a todo objeto enviado, sem entregar ao
  uploader comum a capacidade de alterar essa política.

### Desenho mínimo se César autorizar

Identidades separadas:

1. **admin humano/manutenção**
   - cria/configura bucket;
   - habilita Object Lock;
   - define retenção >= 14 dias;
   - não fica no runtime.

2. **uploader DeliveryOS**
   - bucket/prefixo exclusivos;
   - `writeFiles`;
   - **sem `deleteFiles`**;
   - sem gestão de bucket;
   - segredo fora do Git.

3. **restore/auditoria**
   - `readFiles` + `listFiles` somente quando houver ensaio de restore;
   - mantida fora do runtime de backup.

### Risco de custo

O free tier é suficiente somente enquanto a retenção real permanecer dentro de
10 GB armazenados. Portanto **"B2 é grátis" não é uma propriedade eterna**.

Antes de ativar:

- medir o tamanho real dos dumps;
- calcular a janela de 14 dias;
- manter margem abaixo de 10 GB;
- configurar alertas/caps de cobrança quando disponíveis;
- se a projeção sair da faixa gratuita, parar e voltar ao César antes de
  qualquer gasto.

### Limitação

A conta B2 escolhe uma região no momento da criação e essa região não é Brasil.
Para backup/restore isso é menos sensível que para o runtime crítico, mas a
região deve ser escolhida conscientemente.

## Candidato B — Cloudflare R2

**Estado: tecnicamente viável; encaixe de least-privilege menos simples.**

### O que atende

- API S3-compatible.
- Free tier Standard:
  - 10 GB-month/mês;
  - 1 milhão de operações Class A/mês;
  - 10 milhões de Class B/mês;
  - egress gratuito.

### Diferença de autoridade

O token S3 persistente comum expõe os presets:

- `Object Read & Write`;
- `Object Read only`.

O preset comum não oferece um papel persistente simples de **PutObject sem
DeleteObject**.

R2 tem credenciais temporárias com lista explícita de ações e permite, por
assinatura local, restringir a `PutObject` e caminhos específicos. Isso pode
chegar ao mesmo resultado, mas adiciona um parent token e uma camada de
emissão/rotação que o B2 não exige para este caso.

Por isso R2 permanece opção, mas **não é a menor rota** para o contrato atual.

## Diferença prática

Para este backup específico:

- **B2:** o modelo de chave já separa upload de delete.
- **R2:** a rota simples usa Read+Write; a rota estrita exige credencial
  temporária/action-scoped e mais mecanismo.

A recomendação técnica de menor complexidade é **avaliar B2 primeiro**, sem
transformar isso em seleção automática.

## Gate humano da pesquisa — concluído para o ensaio de 2026-10-03

Para sair de pesquisa e entrar em execução, César precisa autorizar
explicitamente:

1. o provedor;
2. criação/uso de conta e bucket;
3. política de retenção >=14 dias — especialmente se usar Object Lock;
4. criação das credenciais;
5. primeira cópia externa de teste.

Depois disso o critério de prova continua o mesmo:

`backup local -> transporte -> cópia off-host -> verificação -> restore em banco vazio separado -> fingerprint/invariantes verdes`

Só após esse ciclo o item do checklist pode ser marcado.

## Fontes oficiais consultadas

Backblaze:

- Pricing: https://www.backblaze.com/cloud-storage/pricing
- S3-compatible app key capabilities:
  https://www.backblaze.com/docs/cloud-storage-s3-compatible-app-keys
- Application key capabilities:
  https://www.backblaze.com/docs/cloud-storage-application-key-capabilities
- Object Lock:
  https://www.backblaze.com/docs/cloud-storage-object-lock
- Data regions:
  https://www.backblaze.com/docs/cloud-storage-data-regions

Cloudflare:

- R2 pricing: https://developers.cloudflare.com/r2/pricing/
- R2 API tokens: https://developers.cloudflare.com/r2/api/tokens/
- R2 temporary credentials:
  https://developers.cloudflare.com/r2/api/s3/temporary-credentials/

Todas as informações acima são fotografia de 2026-10-02 e devem ser
revalidadas antes de criar infraestrutura.
