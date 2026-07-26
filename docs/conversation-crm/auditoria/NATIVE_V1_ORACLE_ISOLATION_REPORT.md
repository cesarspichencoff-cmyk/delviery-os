# Isolamento do oráculo — Chatbot Nativo DeliveryOS V1.1

Data: 2026-07-26
Base: `8931d1975793b280fad806bb116907a0aeef3761`
Branch: `feature/conversation-native-deliveryos-simulated-v1-oracle-isolation`

## Achado reproduzido

Antes da correção, `new NativeConversationEngine({ flags })` carregava `loadCanonicalCatalogs()` e deixava `scenarios=200` acessível. Isso reproduziu `AUD-V11-001`.

## Correção

- loader operacional separado de forma física do loader do oráculo;
- Engine exige catálogo operacional explícito;
- catálogo ausente, incompleto, desconhecido ou com cenários falha fechado;
- factory de runtime carrega somente `loadRuntimeCatalogs()`;
- factory de testes aceita apenas catálogo operacional;
- registry, router, placeholders e migração também validam a fronteira;
- simulador é o único consumidor de produção que importa explicitamente `catalogs/oracle`;
- expectativas continuam externas à classificação.

## Provas

- Engine sem catálogo: `OPERATIONAL_CATALOG_REQUIRED`;
- catálogo incompleto: `OPERATIONAL_CATALOG_INVALID`;
- catálogo com cenários: `OPERATIONAL_CATALOG_ORACLE_PROHIBITED`;
- fronteira estática sem imports de cenário, testes ou review packets;
- runtime e Engine sem propriedade `scenarios`;
- sentinela impossível não aparece no runtime nem altera a intenção;
- 200 entradas passam em ordem original, inversa e pseudoaleatória;
- mutação do classificador torna o catálogo vermelho;
- suíte nativa ampliada para 217 testes.

## Limites

Não houve integração real, dado real, mudança de expectativa, redução de cobertura ou autorização de produção. Multiprocesso, retenção/rotação, dados institucionais e a vulnerabilidade preexistente de `xlsx@0.18.5` continuam registrados.
