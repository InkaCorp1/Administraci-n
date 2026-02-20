# CHANGELOG - INKA CORP

## [27.2.0] - 2026-02-20
### Añadido
- **Almacenamiento Centralizado (Bucket inkacorp):** Se unificó la subida de todos los documentos y comprobantes al bucket único `inkacorp`.
- **Estructura de Carpetas (Organizativo):** Implementación de jerarquía de archivos (`documentos_creditos`, `pagos`, `caja`, `aportes`, `socios`) para un mantenimiento superior.
- **Compresión Automática:** Integración de la utilidad `image-utils.js` en todos los procesos de subida (PC y Móvil), optimizando el espacio en el servidor.

### Mejorado
- **Velocidad de Carga (STORAGE DIRECTO):** Se eliminó el uso de webhooks externos para el procesamiento de documentos, realizando la subida directa a Supabase Storage.
- **Corrección de Errores (PC y Móvil):** Se resolvió un error de sintaxis en la consola móvil causado por la redeclaración de variables en scripts duplicados.

---

## [27.1.0] - 2026-02-20
### Añadido
- **Auditoría de Desembolsos:** Los desembolsos de créditos (PC y Móvil) ahora registran automáticamente un **EGRESO** en Caja.
- **Evidencia Digital:** Se vincula automáticamente la URL del **Pagaré Firmado** como comprobante del movimiento en la bitácora de caja.
- **Integración Bancaria con Caja:** Soporte para referencias de texto (TRX-...) en movimientos de caja, permitiendo auditar pagos bancarios directamente.

### Mejorado
- **UX Móvil:** Se optimizó la visualización de la alerta de "Caja Cerrada", ocultándola por defecto para evitar parpadeos visuales durante la carga inicial de sesión.
- **Estabilidad de Datos:** Corrección de tipos en base de datos (`id_referencia` a TEXT) para mayor flexibilidad en integraciones de terceros.

---

## [27.0.0] - 2026-02-19
### Añadido
- **Módulo de Control de Caja (MAJOR RELEASE):**
  - Sistema centralizado de Apertura, Cierre y Arqueo de Caja.
  - Auditoría forzada: Integración de Triggers en base de datos para prevenir registros financieros sin sesión de caja activa.
  - Seguridad en UI: Bloqueo de modales de pago y banners de advertencia persistentes.
  - Generación de reportes de cierre en PDF con desglose detallado.
- **UX Improvements:** 
  - Botón de acceso directo en el Dashboard para apertura de caja.
  - Estilo visual profesional (remoción de elementos informales).

### Actualizado
- Versión Mayor del Service Worker (v27.0.0) para optimización de caché global.
- Estabilidad de las pasarelas de pago y validaciones de caja.

---

## [26.0.2] - 2026-02-19
### Corregido
- En el módulo de Créditos, los nombres de los socios se han cambiado de gris oscuro a blanco para una mejor legibilidad sobre fondo oscuro.
- Mejora visual en dispositivos móviles: Los encabezados de los modales ahora tienen fondo verde con letras blancas (estilo corporativo).

## [26.0.1] - 2026-02-19
### Añadido
- Nueva gestión de actualizaciones de la aplicación.
- Sistema de visualización de cambios (Changelog) post-actualización.
- Notificaciones de nuevas versiones detectadas sin recarga forzada inmediata.

### Mejorado
- Estabilidad del Service Worker en dispositivos móviles y escritorio.
- Interfaz de usuario para notificaciones de actualización.
- Control de versiones interno v26.0.1.

---
© 2026 INKA CORP - LP Solutions
