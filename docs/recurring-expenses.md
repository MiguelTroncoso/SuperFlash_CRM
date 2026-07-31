# Gastos recurrentes

`RecurringExpense` es una plantilla; no es el histórico contable. Cada ejecución crea un `Expense` con `generated=true` y una `occurrenceKey` determinista por fecha. La restricción única por organización, plantilla y ocurrencia hace que la generación sea idempotente incluso bajo carreras.

Pausar detiene futuras ocurrencias sin alterar las existentes. Finalizar fija el ciclo y deja el histórico intacto. Una modificación de plantilla afecta la siguiente ocurrencia generada, no registros ya materializados.
