# Guia de homologação Customer + Menu

## Iniciar

```powershell
npm ci
npm run conversation-native:start
```

Abrir `http://127.0.0.1:4179` e escolher **CRM e Cardápio**.

## Roteiro

1. Clientes — confira fontes, certeza, restrições e opt-out.
2. Importações — confirme prévia e ausência de importação automática.
3. Cardápios — alterne canal e observe preços separados e conflito aberto.
4. Recomendações — teste salão/iFood/delivery, cru/cozido, cream cheese e
   alergia sintética.
5. Consentimentos — confirme independência entre atendimento e marketing.
6. Auditoria — confirme eventos append-only e zero PII visível.

## Limitações

- somente dados sintéticos;
- migration PostgreSQL não executada;
- fontes públicas inventariadas, não sincronizadas;
- iFood localizado, mas conteúdo não lido diretamente;
- alergênicos e harmonizações reais aguardam curadoria humana;
- sem merge, contato, campanha ou integração externa.

Para rollback, desligue o servidor e reverta os commits desta branch. Nenhum
dado real ou efeito externo precisa ser desfeito.
