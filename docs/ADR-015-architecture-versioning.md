# ADR-015: Architecture Versioning

## Estado

Aceptado como decisión de gobernanza documental.

## Contexto

SuperFlash Platform necesita distinguir entre capacidades aprobadas, congeladas y
roadmaps futuros para evitar que una intención de producto se interprete como
una autorización de implementación.

## Decisión

Se adopta el esquema `Architecture vMAJOR.MINOR`:

- `MAJOR` cambia límites, principios o contratos y requiere una nueva aprobación.
- `MINOR` agrega capacidades compatibles dentro de los límites aprobados.
- `FROZEN` permite únicamente mantenimiento documental no funcional.
- Cada decisión relevante se registra en un ADR numerado.
- Los roadmaps se etiquetan explícitamente como `PLANNED` o
  `ROADMAP / NOT IMPLEMENTED`.

El [Architecture Book](architecture/README.md) es la fuente oficial de verdad.

## Consecuencias

Architecture v1.0 — Commercial Core queda `APPROVED / FROZEN` desde el commit
`d4ee72096edb6d691675a8a518a6ee3aeb610a18`. Los cambios posteriores que amplíen
el alcance deben pertenecer a una versión nueva y aprobada.
