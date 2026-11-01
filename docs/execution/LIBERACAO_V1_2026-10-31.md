# Liberação da V1 Copiloto + Entregas (sem iFood) — roteiro único

Branch `claude/deliveryos-v1-trip-identity-20261031` (sobre a PR #126). Este roteiro diz o que o
software já prova, o que o César decide, como configurar o piloto e como fazer o aceite em campo.
**A V1 só é 10/10 depois do aceite físico abaixo** — nada aqui foi instalado ou rodado em aparelho.

## 1. O que o software prova hoje (CI no HEAD exato da branch)

| Frente | Prova | Onde |
|---|---|---|
| Viagem pela interface real (2 terminais + motoboys) | 12/12, mutações 12/12 sem cegas | `VIAGEM_REAL_INTERFACE_2026-10-31.md` |
| Entrada por código pessoal no console e no celular | R11/R12 na mesma suíte | `src/entregas/ui/shared/access-gate.js` |
| Ações do motoboy sem rede (fila do aparelho) | 10/10, mutações 9/9, JUnit Android 18 classes 0 falhas | `COMANDOS_OFFLINE_NATIVOS_2026-10-31.md` |
| Ponte da tela do motoboy com o Android (GPS só na viagem dele) | 31/31 | `test:entregas:rider-bridge` |
| Cadeia Entregas inteira | 242 linhas OK, idêntica à base | `npm run test:entregas` |
| Idempotência HTTP, recibos, PostgreSQL descartável, governança | verdes no CI de produto | `deliveryos-product-ux.yml` |

## 2. Decisões do César

| Decisão | Estado |
|---|---|
| Motoboy só age e só vê a própria viagem; console escolhe o motoboy da casa | **Aprovado em 31/10** ("Sim, pode fazer o que for necessário…") |
| Ligar `offline_queue_enabled` no ambiente do ensaio | Recomendado: ligar no piloto em **modo arquivo** (abaixo). Em PostgreSQL, a fila não é anunciada até existir recibo por unidade (0011 + papel por unidade, aprovação à parte) |
| Termo de localização publicável | **Aprovado em 01/11** ("1 sim"). Falta só preencher os campos legais reais: razão social, CNPJ, canal e responsável de contato, dias de retenção — não inventados |
| Custódia da assinatura do APK de campo | **No projeto** (01/11), nos segredos criptografados do GitHub — nunca em arquivo (repositório público). `tools/android_gerar_chave_campo.sh` gera a chave; o workflow `deliveryos-android-field-release.yml` (tag `entregas-campo-*`) assina e publica com SHA-256 |
| Códigos de acesso | **Definidos em 01/11**, um por terminal (tablet, caixa, motoboy). Vão só no `pilot.json` do host, nunca no repositório. Como são curtos, o servidor trava a origem após 5 erros em 15 min (sem conferir o código durante a trava); credencial de máquina não conta |
| Endereço, iFood, fila offline em PostgreSQL, celular sem Google Play, cadência de GPS por movimento | **Dentro da V1** (01/11) — ver seção 7 |

## 3. Configuração do piloto para o ensaio (modo arquivo, offline disponível)

| Variável | Valor |
|---|---|
| `ENTREGAS_PILOT_CONFIG` | `pilot.json` com `unit_id: "ITAIM"` e um usuário por pessoa (`operador_expedicao`, `lider_delivery`/`gerente`, `motoboy_interno`), cada um com seu código |
| `ENTREGAS_DATA_DIR` | pasta de dados própria do piloto (backup pelo próprio piloto) |
| `ENTREGAS_STORAGE_BACKEND` | `file` (padrão) — recibos duráveis disponíveis |
| `ENTREGAS_GPS_FLAGS_CONFIG` | `{"gps_capture_enabled": true, "offline_queue_enabled": true}` |
| `ENTREGAS_TERM_CONFIG` | o termo aprovado pelo César (não publicável = GPS desligado) |
| `ENTREGAS_PILOT_DELEGATION_PUBLIC_KEY_B64` / `..._KEY_ID` | chave pública Ed25519 de delegação (a privada fica na plataforma) |
| `ENTREGAS_PLATFORM_URL` / `ENTREGAS_PLATFORM_READ_SECRET` | runtime crítico (sessão do aparelho, GPS canônico) |
| `ENTREGAS_HTTPS=1`, `ENTREGAS_TLS_CERT`, `ENTREGAS_TLS_KEY` | HTTPS obrigatório para o WebView do app |

Antes de subir: `node tools/windows-local-lab/operator-package-preflight.cjs --app-root <pacote>`
(somente leitura, `activationAllowed:false`). Depois: `/api/health` 200 e
`/api/policies` (com código de motoboy) mostrando `offline_queue_enabled: true`.

APK: variante de campo com `ENTREGAS_BASE_URL` = origem HTTPS do piloto e `ENTREGAS_PLATFORM_URL`;
o artefato do CI é de bancada (`android-bancada-nao-instalar-em-campo`) e **não** vai a campo.

## 4. Ensaio de aceite (marcar PASS/FALHA com hora; sem dado pessoal no registro)

1. Tablet e caixa abrem o console, pedem o código, entram cada um com o seu. Código errado não entra.
2. Caixa monta a viagem escolhendo o motoboy; tablet monta outra ao mesmo tempo. Nenhuma recusa.
3. Celular do motoboy: entra com o código dele; vê **só** a viagem dele; aceita o termo; concede a localização.
4. "Confirmar saída" na loja (com rede): viagem `em_rota` no console; GPS liga (notificação visível).
5. Na porta do cliente, **modo avião**: "Cheguei" e "Confirmar entrega" funcionam e a tela diz
   "guardada no aparelho, aguardando envio" — não "confirmada".
6. Tira o modo avião: em até alguns minutos a linha "guardada" some, o console mostra a entrega
   confirmada **uma vez** e a linha do tempo tem uma saída, uma chegada e uma entrega.
7. Fecha e reabre o app no meio da viagem: nada duplica; a próxima ação não é recusada.
8. Retorno e encerramento pelo console: GPS desliga; nenhuma captura depois do fim.
9. "Sair" no celular: pede o código de novo. Responsável remove o código do cadastro: o acesso cai.
10. Registrar modelo do aparelho, versão do Android, bateria no início/fim e pontos esperados × recebidos.

Qualquer FALHA: parar, anotar o passo e a mensagem exata da tela; não repetir até entender.

## 5. Retorno (rollback)

Voltar o binário/launcher anterior **sem** restaurar dados por cima (`FECHAMENTO_PILOTO_2026-10-28.md`,
seção Recuperação). Desligar a fila offline é trocar `offline_queue_enabled` para `false` e
reiniciar: o app volta ao modo online; o que já está guardado no aparelho continua na fila do Room
e sobe quando a fila voltar a ser aceita.

## 6. O que continua fora da V1

Nada, por decisão de 01/11. O que segue abaixo está dentro, ainda **não implementado**.

## 7. Itens trazidos para a V1 em 01/11 — ordem e dependência

| Ordem | Item | O que exige | Prova de pronto |
|---|---|---|---|
| 1 | Endereço do pedido na viagem ("Abrir rota") | rótulo do pedido acompanha a parada só para o motoboy dono e quem expede | navegador: motoboy vê o próprio endereço, outro motoboy não |
| 2 | Fila offline em PostgreSQL (Mooca) | recibo por unidade (0011) + papel por unidade com RLS; a 0011 original está no Foxxy (SHA256 `CFE5D40D…`) | PG descartável com papel por unidade + piloto anunciando a fila |
| 3 | Cadência de GPS por movimento | ligar parado/em movimento/retorno à política já existente | JVM + medição de bateria no aparelho (sem promessa antes) |
| 4 | Celular sem Google Play | provedor `LocationManager` com os mesmos portões | JVM + um aparelho sem Google Play |
| 5 | iFood | acesso ao Gestor no caixa (sombra por leitura de tela já preparada em 29/10) ou credencial oficial | amostra minimizada, sem duplicar, ligada ao pedido Teknisa |

## 8. Decisões de 01/11 (continuação)

| Tema | Decisão / registro |
|---|---|
| Termo | Preenchido com razão social informada (TATÁ Sushi), CNPJ e canal de contato; retenção: trajeto 7 dias, eventos 90 dias; publicável no servidor real (hash `e023c816fa4c`). Arquivo só no host (tem telefone) |
| Backup | Pasta no próprio computador do piloto, de preferência dentro do OneDrive (sai da loja sem custo novo). Cópia diária criptografada; cópias com trajeto apagadas em 7 dias; eventos 90 dias. A implementar, junto com o apagamento do trajeto no servidor |
| 0011 do Foxxy | Fica por último (decisão do César) |
| Toqan (work.toqan.ai) | Fonte de CONTEXTO do iFood (receita semanal, avaliações, sugestões), gerada por IA com aviso de erro: entra como ambiente rotulado "Toqan · IA", nunca como fato de pedido nem como foco. Radar de 2 em 2 minutos por mensagem não é base para fato operacional |
| Espelhamento de pedidos iFood | Primeiro pelo TATÁ Comandas (PDV), se o iFood cai sozinho no Teknisa; depois API oficial; tela do Gestor por último |

