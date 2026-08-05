# Campañas de marketing

`Campaign` es la entidad canónica de campaña dentro de una organización. Sprint
30 la extiende con código estable, estado, objetivo, país objetivo, notas y
metadata. `MarketingAdSet`, `MarketingAd` y `MarketingCreative` forman la
jerarquía opcional y mantienen claves compuestas con `organizationId`.

Las campañas no crean una segunda fuente financiera. El gasto se registra en
`Expense` con `source = MANUAL` o `IMPORT`, y las métricas se leen desde la
misma entidad. Las rutas REST están bajo `/api/v1/marketing` y requieren los
permisos específicos del catálogo.
