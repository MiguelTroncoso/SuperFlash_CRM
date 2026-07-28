# Trials y demos

Un `Trial` es una entrega temporal vinculada a Contact, Product y, de forma
opcional, Opportunity, plan, variante, provider y fulfillment. Solo productos
activos con `allowsDemo=true` pueden originar trials. Se bloquea una clave de
política por contacto/producto/ventana para evitar demos simultáneas.

El ciclo HTTP es `REQUESTED -> APPROVED -> ACTIVE` y puede terminar en
`EXPIRED`, `CANCELLED` o `CONVERTED`. La conversión crea una Sale nueva con el
snapshot del trial y nunca modifica la venta ni el snapshot histórico del
trial. La expiración automática queda preparada para un job posterior.
