# Documentación del Sistema INKA CORP

## 1. Visión General del Sistema
INKA CORP es un sistema de gestión financiera integral diseñado como una **Single Page Application (SPA)** robusta. Su objetivo principal es la administración de socios, créditos, inversiones (pólizas) y ahorros, proporcionando herramientas de análisis en tiempo real y generación de documentos legales.

---

## 2. Arquitectura Técnica
El sistema sigue una arquitectura moderna de desacoplamiento entre el cliente y el servidor:

*   **Frontend:** Vanilla JavaScript (ES6+), HTML5 y CSS3. No depende de frameworks pesados, lo que garantiza tiempos de carga mínimos.
*   **Backend as a Service (BaaS):** [Supabase](https://supabase.com/) para autenticación, base de datos PostgreSQL en tiempo real y almacenamiento.
*   **Persistencia Local:** Sistema de caché híbrido en `localStorage` con actualización en segundo plano (Background Sync).
*   **PWA (Progressive Web App):** Implementación de Service Workers (`sw.js`) y Manifiesto para permitir la instalación en dispositivos móviles y funcionamiento offline parcial.

---

## 3. Estructura de Archivos Principal

*   [index.html](index.html): Layout principal que orquesta la carga de vistas dinámicas.
*   [login.html](login.html): Punto de entrada de autenticación.
*   [js/app.js](js/app.js): Núcleo de la aplicación. Maneja el estado global, la navegación y la sincronización de datos.
*   [js/auth.js](js/auth.js): Gestión de sesiones y comunicación con Supabase Auth.
*   [js/modules/](js/modules/): Contiene la lógica de negocio individual para cada proceso (Créditos, Socios, etc.).
*   [views/](views/): Fragmentos HTML que se inyectan dinámicamente en el layout principal.

---

## 4. Flujos Principales

### A. Flujo de Acceso y Seguridad
1.  **Validación de Sesión:** Al cargar [index.html](index.html), se verifica inmediatamente la sesión mediante `checkSession()`. Si no es válida, redirige a [login.html](login.html).
2.  **Carga de Perfil:** Se extraen los datos del usuario desde la tabla `ic_users` para determinar roles y permisos.
3.  **Inicialización de Caché:** El sistema carga los datos guardados en el navegador para mostrar información instantánea mientras se sincroniza con el servidor en segundo plano.

### B. Flujo de Sincronización de Datos
El sistema utiliza un **Caché Persistente**:
*   Cada 5 minutos, `refreshCacheInBackground()` descarga los datos actualizados de Socios, Créditos, Solicitudes, Pólizas y Precancelaciones.
*   Los módulos de la UI escuchan estas actualizaciones para refrescar las tablas sin necesidad de recargar la página.

### C. Ciclo de Vida de un Crédito
1.  **Simulación:** El cliente utiliza el [Simulador](views/simulador.html) para proyectar cuotas e intereses.
2.  **Solicitud:** Se registra una nueva [Solicitud de Crédito](views/solicitud_credito.html).
3.  **Aprobación y Desembolso:** Una vez aprobada, se genera el registro en la tabla `ic_creditos`, activando el cronograma de pagos.
4.  **Gestión de Pagos:** A través del [Módulo de Créditos](js/modules/creditos.js), se registran los pagos de cuotas, actualizando automáticamente el estado (Activo, Mora, Cancelado).

---

## 5. Módulos del Sistema a Detalle

### 📊 Dashboard
El centro de mando. Muestra indicadores clave (KPIs) calculados dinámicamente:
*   Total de socios activos.
*   Cartera total colocada.
*   Índice de morosidad (porcentaje de créditos en mora).
*   Accesos rápidos a desembolsos pendientes.

### 👥 Gestión de Socios
Control completo del padrón de beneficiarios. Almacena datos personales, de contacto y país de residencia, vinculándolos con sus respectivos productos financieros.

### 💳 Administración de Créditos
Es el módulo más complejo. Permite:
*   Filtrado avanzado por estado y país (Ecuador, Perú, USA).
*   Visualización de tablas de amortización interactivas.
*   Registro de pagos con soporte para carga de comprobantes.
*   Headers "Sticky" inteligentes para navegación en tablas extensas.

### 📉 Simulador
Herramienta analítica que permite proyectar dos tipos de productos:
1.  **Créditos:** Cálculo de amortización (Francés/Alemán) con gastos administrativos.
2.  **Pólizas:** Proyección de rendimientos por inversiones a plazo fijo.
*   *Salida:* Generación de fichas técnicas en PDF mediante `jsPDF` con códigos QR integrados.

### 💰 Ahorros y Pólizas
Módulos dedicados al pasivo de la institución. Permiten monitorear el crecimiento del capital de los socios y los vencimientos de inversiones a plazo.

---

## 6. Procesos Especiales

*   **Detección Móvil:** El sistema detecta automáticamente si el usuario accede desde un smartphone y ofrece una versión optimizada en [movil.html](movil.html).
*   **Generación de Documentos:** Uso intensivo de `jsPDF` para crear pagarés, tablas de amortización y recibos de pago en el cliente, reduciendo la carga del servidor.
*   **Control de Mora:** Algoritmos automáticos que comparan las fechas de pago programadas vs la fecha actual para alertar sobre retrasos.

---

## 7. Configuración y Mantenimiento
Toda la configuración de conexión con el backend se centraliza en [js/config.js](js/config.js). Los esquemas de la base de datos están documentados en [schemas.txt](schemas.txt) para facilitar la replicación o migración del entorno de Supabase.
