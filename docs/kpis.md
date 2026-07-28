# Revenue Intelligence KPIs

The API exposes monetary values grouped by ISO-like currency code. It never
converts currencies in Phase 1.

| KPI                     | Definition                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Ventas del día          | Sum and count of non-deleted `CONFIRMED`/`FULFILLED` Sale rows dated today.                                                       |
| Ventas del mes          | Same rule from the first day of the current UTC month.                                                                            |
| MRR                     | Active subscription amount normalized to a 30-day month; weekly, quarterly, semi-annual, annual and custom cycles are normalized. |
| ARR                     | MRR multiplied by 12.                                                                                                             |
| Nuevos clientes         | Contacts whose first qualifying sale falls inside the selected period.                                                            |
| Clientes activos        | Distinct contacts with a qualifying sale in the selected period.                                                                  |
| Clientes perdidos       | Prior customers without a qualifying sale in the selected period.                                                                 |
| Conversión por etapa    | Opportunities created in the period compared with qualifying sales linked to them.                                                |
| Conversión por vendedor | The same conversion grouped by opportunity owner.                                                                                 |
| Conversión por país     | The same conversion grouped by contact country.                                                                                   |
| Tiempo hasta venta      | Average days from opportunity creation to the sale date.                                                                          |
| Tiempo de activación    | Average days from sale date to Activation.                                                                                        |
| Tiempo de cierre        | Same close interval from opportunity creation to sale date.                                                                       |
| Renovaciones exitosas   | Renewals with status `PAID` and `paidAt` in the period.                                                                           |
| Churn                   | Expired/cancelled subscriptions in the period divided by the subscriptions active at its beginning.                               |
| Trial → Venta           | Converted trials divided by non-cancelled trials created in the period.                                                           |
| Ticket promedio         | Qualifying sales revenue divided by qualifying sale count, per currency.                                                          |
| LTV básico              | Ticket promedio divided by the observed churn percentage, with a 1% floor when no churn exists.                                   |

The definitions are intentionally transparent and operational. They are not
tax/accounting reporting and should not be interpreted as GAAP/IFRS metrics.
The `averageActivationDays` value is zero when no activation has occurred in
the period; it does not infer activation from fulfillment completion.
