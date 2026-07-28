# Message Templates

`MessageTemplate` es un contrato versionado para contenido reutilizable. Cada
plantilla pertenece a una organización y tiene `slug` único por tenant,
canal, estado, asunto opcional, cuerpo, variables detectadas y `version`.

## Variables

La sintaxis aceptada es `{{object.path}}`, con segmentos alfanuméricos. El
renderer resuelve únicamente propiedades propias del contexto y no ejecuta
expresiones. Ejemplos:

```text
Hola {{contact.name}}
Total: {{sale.total}} {{sale.currency}}
Próximo cobro: {{subscription.nextBilling}}
El trial termina: {{trial.endsAt}}
```

Las variables se detectan al crear o actualizar la plantilla. Una vista previa
devuelve el texto renderizado, las variables encontradas y las variables
ausentes. Un valor ausente se representa como texto vacío y queda explicitado
en `missingVariables`.

## API

- `GET /api/v1/templates` lista plantillas no archivadas;
- `GET /api/v1/templates/:id` obtiene una plantilla del tenant;
- `POST /api/v1/templates` crea una plantilla;
- `PATCH /api/v1/templates/:id` la actualiza e incrementa la versión;
- `POST /api/v1/templates/preview` renderiza una plantilla o contenido directo;
- `POST /api/v1/templates/:id/archive` aplica soft delete.

Los canales externos (`EMAIL`, `WHATSAPP`, `SMS`, `PUSH`, `WEBHOOK`) son
contratos futuros: el Sprint actual ejecuta únicamente comunicaciones
internas.
