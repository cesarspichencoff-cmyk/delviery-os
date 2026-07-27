# Privacidade e segurança da sessão — Sprint 2

## 1. O que nunca é capturado

Igual ao Sprint 1 (`FORBIDDEN_FIELDS` em `contracts/schemas.js`): nome de
cliente, telefone, endereço, CPF, e-mail e texto de mensagem nunca entram no
banco operacional. Isso é reforçado, não relaxado, pelo observador ao vivo:

- `live_observations` só tem campos operacionais (status, itens, horários);
- `mapping-mode.js` sinaliza atributos com nome que parece PII
  (`flagsPiiLikeAttributes`) e nunca extrai o valor deles — só avisa que
  existem;
- `evidence.js#sanitizeExcerpt` suprime padrões de telefone, e-mail e
  documento de qualquer trecho de diagnóstico antes de guardar.

Ponto a favor da fronteira: o próprio portal do iFood já tarja a maior parte
dos dados pessoais do cliente por política própria da plataforma
(`IFOOD_SCREEN_SOURCE_MAP_V1.md` §5) — o coletor não precisa se esforçar para
não ver o que a plataforma já esconde.

## 2. Sessão — nunca no Git, sempre fora do repositório

`profileDir` (perfil do Chromium) e `storageState` (se usado) são
**configuração**, nunca caminho hardcoded, e ficam fisicamente fora do
controle de versão:

```gitignore
/data/conference-brain/live-evidence/
/data/conference-brain/browser-profile/
```

Nenhum cookie, token ou credencial foi commitado nesta missão — verificado
antes de cada commit (`git status` + revisão do diff).

## 3. O que o coletor nunca faz com a sessão

- não faz login sozinho, não digita senha, não contorna 2FA;
- não contorna CAPTCHA — detecta e **suspende**
  (`LIVE_SOURCE_HEALTH.CAPTCHA_PRESENT`, exige intervenção humana);
- não reexecuta endpoint privado fora do navegador — só lê o que a própria
  página já carregou (DOM/acessibilidade em primeiro lugar, ver `LIVE_OBSERVER_V1.md`);
- não clica em nada que mude estado no portal (aceitar, despachar, cancelar).
  A única interação de escrita de todo o Sprint 2 é local: o painel interno
  grava eventos no `store` próprio, nunca no iFood.

## 4. Evidência de diagnóstico — sempre sanitizada, opcional, com prazo

`live/evidence.js#buildEvidenceRecord` nunca guarda o HTML/imagem bruta — só
hash, metadados, assinatura estrutural e um trecho sanitizado de até 500
caracteres. Screenshot é opcional e, quando existe, marcado
`screenshot_sanitized`; retenção padrão de 7 dias, com `purgeExpired()` para
remover o que passou do prazo.

## 5. Quando a coleta se suspende

`LIVE_HEALTH_REQUIRES_HUMAN = [login_required, captcha_present]`. Nesses dois
estados, `observer.js#runCycle` **não tenta ler pedidos** — grava o ciclo com
essa saúde e para. A retomada é sempre manual (alguém resolve o login/captcha
na sessão real); o coletor nunca tenta contornar sozinho.

## 6. Como desligar

Qualquer uma das flags para: `CONFERENCE_LIVE_OBSERVER_V1=0` (ou simplesmente
não definir a variável — o padrão já é desligado, inclusive em
desenvolvimento/teste, ver `flags.js#readStrictFlag`). Não há processo em
background que sobreviva ao encerramento do script que o iniciou.
