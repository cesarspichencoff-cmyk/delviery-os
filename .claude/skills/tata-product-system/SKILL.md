---
name: tata-product-system
description: >
  Sistema de produto e identidade visual do ecossistema TATA / DeliveryOS.
  Use sempre que for desenhar, revisar ou implementar UI, UX, componentes,
  mapa, estados operacionais, shell, ENTREGAS, SELECAO, Copiloto ou qualquer
  módulo novo. Obriga leitura do Sprint Visual DeliveryOS V2 como fonte canônica
  global e proíbe baseline app-v1.
---

# TATA Product System

## Fonte visual canônica (obrigatória)

**O Sprint Visual DeliveryOS V2 é a fonte visual canônica global do ecossistema TATA.**

Demos iniciais, incluindo **app-v1**, são **referências históricas** e **não podem prevalecer** sobre o cânone.

| Nível | Fonte | Papel |
|---|---|---|
| 1 | `docs/design/canonical/deliveryos-visual-v2/` | Autoridade visual principal |
| 2 | DeliveryOS Organismo Operacional V3.3 | Implementação validada (Copiloto); não reescrever nesta skill |
| 3 | `docs/PRODUCT_CONSTITUTION.md` + esta skill | Princípios de produto |
| 4 | Adaptação do módulo | Expressão própria com parentesco inequívoco |
| 5 | app-v1 / demos antigas | `historical_reference_only` |

Manifesto: `docs/design/CANONICAL_VISUAL_MANIFEST.json`  
Hierarquia: `docs/design/VISUAL_REFERENCE_HIERARCHY.md`  
SoT: `docs/design/VISUAL_SOURCE_OF_TRUTH.md`

## Protocolo obrigatório antes de implementar UI

Qualquer IA ou humano que trabalhar no projeto deve:

1. **Localizar o arquivo canônico**  
   `docs/design/canonical/deliveryos-visual-v2/Sprint Visual DeliveryOS V2 (1).zip`  
   e o extract em `extracted/` (Pacote Visual, Organismo, Contrato Estados Técnicos, TATA OS).

2. **Estudar documentos e imagens**  
   Não bastam tokens de cor. Ler tipografia, composição, hierarquia, estados, silêncio visual, anti-padrões (PRESERVAR / REMOVER).

3. **Declarar quais princípios foram utilizados**  
   Em doc de linhagem ou PR: lista explícita (ex.: uma atenção soberana, Spectral/Hanken/Plex, confiança=solidez, ação soberana verde).

4. **Apresentar matriz de linhagem visual**  

   | Elemento | Sprint Visual V2 | DELIVERYOS V3.3 | Proposta do módulo | Justificativa |

5. **Demonstrar parentesco antes de implementar**  
   Composições de alta fidelidade ou side-by-side com referência canônica.  
   Cores iguais **não** provam parentesco.

6. **Justificar toda divergência**  
   Por escrito. Divergência sem justificativa = rejeição.

7. **Nunca reduzir a referência a uma paleta de cores.**

## Gramática (não copiar tela do Copiloto)

Transportar:

- uma atenção dominante · uma ação soberana  
- composição editorial · hierarquia clara  
- tipografia com personalidade (Spectral / Hanken Grotesk / IBM Plex Mono)  
- tecnologia silenciosa · inteligência pelo **comportamento**  
- espaços vazios com intenção · contexto recuado  
- superfícies vivas · linguagem humana  
- ausência de SaaS genérico · detalhe técnico escondido  
- precisão e serenidade  

### Metáforas

| Módulo | Metáfora |
|---|---|
| DELIVERYOS COPILOTO | A operação ganha consciência. |
| ENTREGAS | Os pedidos ganham movimento. |

## Checklist para módulo novo (antes de código)

- Qual é a função no ecossistema?
- Qual é a metáfora operacional?
- Qual princípio do Sprint V2 está sendo traduzido?
- Qual é a atenção soberana?
- Qual é a ação principal?
- Como a inteligência é percebida?
- Como conversa com o Copiloto?
- O que é compartilhado / específico?
- Como evita parecer outro produto ou dashboard SaaS?
- Como preserva simplicidade para usuários reais?

## Proibições

- app-v1 como baseline visual ou estrutural  
- extrair só a paleta do Sprint  
- tipografia system sem justificativa  
- três colunas genéricas como “identidade DELIVERYOS”  
- cards comuns como estrutura dominante  
- limpeza = falta de personalidade; simplicidade = ausência de tecnologia  
- espaço vazio sem intenção  
- mapa padrão de provedor como identidade final  
- parentesco só por hex iguais  
- reescrever o ZIP canônico  
- alterar worktree congelado do Copiloto V3.3 sem patch/merge explícito  

## ENTREGAS — regra de fase

Quando a experiência estiver **funcionalmente aprovada** e **visualmente não aprovada**:

- preservar domínio, commands, regras, ApplicationService, contratos, persistência, testes, fluxos  
- reconstruir **somente** a camada de experiência visual  
- **não** iniciar redesign antes da aprovação das composições pelo César  

Linhagem do módulo: `docs/entregas/ux/LINHAGEM_VISUAL_CANONICA.md`  
Composições: `docs/entregas/ux/composicoes-v2/`
