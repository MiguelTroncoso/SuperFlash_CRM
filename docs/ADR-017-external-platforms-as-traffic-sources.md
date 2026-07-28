# ADR-017: External Platforms as Traffic Sources

## Estado

Aceptado como principio de arquitectura futura; no implementado.

## Contexto

Meta Ads, Google Ads, TikTok, WhatsApp Business, landing pages, formularios,
tráfico orgánico y referidos generan tráfico y señales de adquisición. No deben
convertirse en el sistema de verdad de clientes, ventas o revenue.

## Decisión

Las plataformas externas se tratarán como fuentes de tráfico y adquisición. En
una evolución futura, SuperFlash Platform consolidará `AcquisitionSource`,
`CampaignReference`, `Attribution` y `MarketingSpend` bajo contratos propios.

Las integraciones financieras futuras —Stripe, Mercado Pago, Transbank, Binance
Pay y PayPal— se conectarán mediante límites explícitos y no serán implementadas
como parte de Architecture v1.0.

## Consecuencias

La plataforma mantiene control sobre identidad, atribución, estados comerciales
y revenue. Las integraciones podrán sustituirse sin migrar la verdad del dominio
transaccional.
