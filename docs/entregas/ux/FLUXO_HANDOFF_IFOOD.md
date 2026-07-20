# Fluxo — Expedição iFood

Nome da superfície: **EXPEDIÇÃO IFOOD** / **HANDOFF IFOOD** (não “Entregadores iFood”).

pedido → StartHandoff → verificação courier → volumes → responsáveis → ConfirmHandoff  

Sem `courier_verified` ou volumes divergentes → domínio rejeita; UI mostra erro real.  
Campo impresso Entregador **não** vira rider.  
Após confirmado: sem Trip, sem GPS, sem acompanhamento do courier.
