# Pipeline Intelligence

`GET /api/v1/pipeline/intelligence` es la lectura avanzada del pipeline. Soporta filtros por etapa, responsable, país, prioridad, producto, campaña, antigüedad, ausencia de actividad y seguimientos vencidos.

Cada oportunidad devuelve `probability` (0–100), `priority`, `ageDays`, `daysInStage`, `stalled` y `weightedValue`. El valor ponderado se calcula en consulta como `expectedAmount * probability / 100`; no se persiste como dato derivado.

La migración `20260809100000_crm_maturity_pipeline` agrega únicamente estos campos e índices a Opportunity y no modifica migraciones previas. La pantalla está disponible en `/pipeline/intelligence`.
