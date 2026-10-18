# JC Motors Cotizador

Aplicación de escritorio para cotizaciones, control de costos y reportes del taller.

## Flujo de cotizaciones

- Las cotizaciones pendientes se pueden editar sin cambiar su folio. La vigencia se cuenta desde la fecha original de creación.
- Una pendiente vence automáticamente al terminar su vigencia. Una vencida se puede duplicar para crear una nueva propuesta.
- Después de aprobar, el avance es: **Aprobada → En proceso → Terminada → Entregada**. Los importes enviados al cliente quedan bloqueados.
- En el detalle de una cotización aprobada se registran pagos y anticipos. El saldo se calcula con el total con IVA.
- El historial y el inicio buscan por folio, cliente, teléfono, marca, modelo, año y placas.

## Compartir y reportes

Desde la vista previa del PDF se puede abrir WhatsApp o correo con un mensaje preparado. La app guarda el PDF en Descargas; hay que adjuntarlo al mensaje. Cuando el sistema admite compartir archivos, el botón **Compartir archivo** envía el PDF mediante la función nativa.

**Reportes** muestra ventas, utilidad antes de IVA, cotizaciones aprobadas y cotizaciones perdidas por mes. El CSV se guarda en Descargas en la app de escritorio. La utilidad es provisional hasta capturar todos los costos.

Los datos se guardan localmente en el equipo. Los registros del antiguo control interno se migran al repositorio de costos y pagos sin borrar la copia anterior.