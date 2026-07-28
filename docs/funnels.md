# Revenue Intelligence Funnels

The initial configurable funnel is:

```text
Mensaje → Demo → Posible comprador → Venta → Activación → Renovación
```

The API accepts a comma-separated subset through `stages`, for example
`stages=MESSAGE,DEMO,SALE`, and calculates each stage from first-party
operational records:

- `MESSAGE`: contacts created in the period.
- `DEMO`: active or converted trials.
- `POTENTIAL_BUYER`: opportunities in the configured pipeline system stage.
- `SALE`: confirmed or fulfilled sales.
- `ACTIVATION`: non-deleted active, suspended or expired activations linked to sales.
- `RENEWAL`: paid renewals.

`compare=true` calculates the same stages for the immediately preceding period
of equal duration. Conversion is each stage count divided by the preceding
stage count; the first stage is reported as 100% when present.

The funnel is a reporting projection. It does not move pipeline stages, create
sales or activate services. Future versions can add event-backed historical
funnel definitions without changing the transaction boundaries.
