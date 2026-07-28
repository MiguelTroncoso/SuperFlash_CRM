# ADR-021 — Credential Security

## Decisión

Los valores sensibles se cifran con AES-256-GCM en reposo. La lectura normal
devuelve máscaras; el revelado requiere `credentials.reveal`, rate limit y
auditoría sin el valor. Metadata, logs, Activity y Outbox no admiten nombres de
campos de secreto.
