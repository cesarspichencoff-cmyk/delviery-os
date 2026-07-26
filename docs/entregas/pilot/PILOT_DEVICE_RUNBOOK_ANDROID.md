# Runbook do aparelho real — Android, unidade ITAIM

> Complementa [PILOT_FIRST_SHIFT.md](PILOT_FIRST_SHIFT.md). Aquele diz o que
> observar no turno; este diz como preparar o aparelho.

## 0. Antes de tudo — o que ainda falta

Três coisas travam o início e **nenhuma delas é código**:

| Trava | Quem resolve | Sem isso |
|---|---|---|
| Preencher o termo (razão social, CNPJ, canal, responsável, vigência, retenção) e aprovar | César | o termo **não aparece** e o GPS **não liga** |
| Capturar a coordenada do ITAIM no local | operador autorizado | retorno automático fica desligado |
| Container Android | trabalho novo, fora deste repositório | piloto roda em primeiro plano, com a limitação avisada |

Sem o container, o piloto ainda acontece — usando o fallback de navegador, com
o app aberto durante a viagem.

## 1. Instalação

**Com container Android:** instalar o APK assinado; conferir em Configurações →
Aplicativos que ele aparece com permissão de localização.

**Sem container (fallback):** abrir `https://<ip-do-pc>:5193` no Chrome do
aparelho e adicionar à tela inicial. Precisa de HTTPS — sem ele o GPS não liga.
Instale o certificado da autoridade local em Configurações → Segurança →
Credenciais.

## 2. Termo — antes de qualquer permissão

Na primeira vez, o aplicativo mostra, **nesta ordem**:

1. explicação curta do que a localização faz;
2. o termo completo (`LER TERMO COMPLETO`);
3. o checkbox — **desmarcado**, e é o motoboy que marca;
4. `CONCORDAR E CONTINUAR` ou `NÃO CONCORDAR / VOLTAR`;
5. opção de receber uma cópia.

**Só depois disso** vem o pedido de permissão do Android.

Se o motoboy recusar: o GPS não liga, e a tela encaminha ao responsável. Não
insista pelo aplicativo — é conversa de gente.

**Confira:** o aceite gera um recibo com a impressão do texto (hash). O
motoboy pode consultá-lo depois. Se o termo mudar de forma material, ele
precisa aceitar de novo antes da próxima viagem rastreada.

## 3. Permissão

Peça **Localização precisa** (não "aproximada"). Se o aparelho conceder só a
aproximada, o sistema avisa — não esconde.

A permissão de segundo plano é um pedido separado do Android. O piloto **não
depende dela**; se for negada, siga assim mesmo.

## 4. Coordenada do ITAIM

No local, com o celular:

1. abrir a tela de configuração da unidade;
2. ficar **parado na porta da loja**, celular na mão, céu visível;
3. capturar **pelo menos 5 amostras** com precisão até 30 m;
4. o sistema calcula o ponto e mostra a dispersão;
5. se recusar por dispersão alta, **repetir** — não force;
6. conferir no mapa se caiu na loja;
7. confirmar, informando o papel de quem confirmou;
8. a política ganha versão e data.

Endereço de referência: **Rua João Cachoeira, 278 — Itaim Bibi**. Serve para
achar o lugar. **Não** vira coordenada — geocodificador erra mais que o raio
da cerca.

Para desfazer: basta apontar para a versão anterior da política.

## 5. Notificação persistente

Com o container, durante a viagem aparece:

```
TATÁ Entregas — localização ativa durante a viagem
```

Ela é fixa e pobre de propósito: sem endereço, sem coordenada, sem valor, sem
nome de cliente. Se ela **não** aparecer, o serviço não está rodando — pare e
verifique.

## 6. Bateria e fabricante

Antes da primeira viagem, em Configurações → Bateria → o aplicativo:

- desmarcar otimização/restrição de bateria;
- em Xiaomi, Samsung, Motorola e afins, marcar também "sem restrições" ou
  equivalente — cada fabricante chama de um jeito.

Com economia de bateria ativa, a captura fica mais espaçada **de propósito** e
o sistema mostra isso. É degradação declarada, não defeito escondido.

## 7. O que observar no aparelho

| Situação | Esperado |
|---|---|
| App minimizado | com container: continua · sem container: pode parar (limitação declarada) |
| Tela bloqueada | idem |
| Wi-Fi → dados móveis | pontos continuam, envio pode atrasar |
| Sem internet | pontos ficam guardados; sobem depois |
| Sinal perdido | status muda para "Sem sinal de GPS"; nada é inventado |
| Sinal volta | volta a "Localização atual" |
| App reiniciado | aceite do termo continua valendo |
| Serviço morto e recuperado | fica registrado |

## 8. Parar o serviço

Encerrar, cancelar ou abandonar a viagem **desliga o GPS de verdade** — não é
só esconder o rótulo. Confira: o indicador volta a `GPS DESLIGADO — SEM VIAGEM
ATIVA` e a notificação some.

## 9. Rollback

| Situação | Ação |
|---|---|
| Container com problema | voltar ao fallback de navegador — configuração |
| GPS atrapalhando | `gps_capture_enabled: false` |
| Retorno automático errando | voltar ao modo sombra |
| Coordenada errada | apontar para a versão anterior da política |
| Parar tudo | abandonar a branch; nada foi para produção |

Nenhum deles perde dado de viagem.
