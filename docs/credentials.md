# Credentials

`CredentialRecord` cifra username, password, URL y token con AES-256-GCM. La
clave se deriva de `CREDENTIAL_ENCRYPTION_KEY`; en producción la variable debe
tener al menos 32 caracteres y ser gestionada fuera del repositorio.

Las respuestas de lectura son enmascaradas. `POST /api/v1/credentials/:id/reveal`
requiere `credentials.reveal`, tiene rate limit y registra `CREDENTIAL_REVEALED`
sin valores sensibles. Los ciphertexts, secretos completos y tokens nunca se
guardan en Activity, AuditLog, Outbox o logs. `credentials.revoke` invalida el
registro de forma reversible.
