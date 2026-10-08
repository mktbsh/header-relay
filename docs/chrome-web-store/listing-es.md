# Chrome Web Store Listing (Español)

Texto de localización en español para «Datos de la ficha en la Store» del Developer Dashboard.

## Product Details

### Name

Header Relay — Modifica cabeceras de solicitud y captura las de respuesta

### Summary

Captura encabezados de respuesta HTTP y reenvía encabezados de solicitud fijos o capturados para el desarrollo y las pruebas de API.

### Category

Developer Tools

### Language

Spanish

### Detailed Description

Header Relay ayuda a los desarrolladores a verificar el comportamiento de las solicitudes HTTP en el navegador cuando una API o aplicación web depende de encabezados personalizados, encabezados de gateway, tokens de sesión, ID de traza o metadatos de solicitud específicos del entorno.

Crea un perfil, elige los orígenes de destino, configura encabezados de solicitud fijos y define los encabezados de respuesta que se deben capturar. Cuando una respuesta coincidente incluye un encabezado de captura configurado, Header Relay mantiene ese valor en memoria durante la sesión actual del navegador y usa las reglas de sesión declarativeNetRequest de Chrome para adjuntarlo a las solicitudes coincidentes posteriores.

Funciones principales:

- Retransmisión de encabezados por origen para entornos locales, de staging, internos y de prueba.
- Encabezados de solicitud fijos para valores que siempre deben adjuntarse.
- Encabezados de respuesta capturados para valores como tokens de sesión, ID de traza o encabezados de gateway.
- Patrones glob de rutas excluidas para recursos o endpoints que no deben recibir encabezados gestionados por el relay.
- Probador de rutas excluidas para comprobar las reglas de coincidencia glob antes de guardar.
- URL Probe para comprobar si una URL coincide, está excluida y qué encabezados se adjuntarían; funciona con borradores sin guardar.
- Configuración de página completa con navegación por secciones para perfiles, orígenes, encabezados, rutas excluidas, URL Probe y registros de auditoría.
- Se pueden mantener habilitados varios perfiles a la vez, y los perfiles individuales se pueden eliminar cuando ya no se necesiten.
- Modos de visualización cómodo y compacto compartidos entre el popup y la página de configuración.
- Interfaz de estilo iOS coherente en el popup y la configuración para una experiencia nativa uniforme.
- Vista compacta del popup con el estado de encabezados activos, valores capturados, estado de sesión y número de reglas DNR.
- Registros de auditoría locales con retención automática; las URL de las solicitudes nunca se almacenan.
- Localización en japonés, coreano, español, francés, alemán, chino simplificado y chino tradicional.

Privacidad y seguridad:

- Header Relay no envía la configuración de perfiles, registros de auditoría, eventos de uso, identificadores de análisis, datos de navegación ni encabezados capturados al desarrollador, a proveedores de análisis ni a servidores no relacionados. Los valores de encabezado configurados solo se adjuntan a solicitudes que coincidan con los orígenes de destino.
- Los valores capturados se mantienen solo en almacenamiento de sesión en memoria, y se borran al reiniciar el navegador, deshabilitar/recargar/actualizar la extensión, deshabilitar el perfil, cambiar reglas, revocar el acceso al host o al borrarlos manualmente; la interfaz los muestra tal cual para que los desarrolladores puedan inspeccionarlos.
- Los nombres de encabezado sensibles muestran una advertencia. `Cookie` sigue disponible para flujos de desarrollo con una advertencia explícita sobre el estado del navegador; los encabezados de solo respuesta o controlados por el transporte se rechazan.
- Los registros de auditoría no almacenan URL de solicitudes: las URL se procesan en memoria solo para la coincidencia de orígenes y se descartan al cerrar el navegador.
- Se incluye acceso a HTTP localhost para el flujo de trabajo de desarrollo local predeterminado. Cualquier otro host solo se solicita al añadir su origen de destino, y el permiso opcional puede revocarse en cualquier momento desde la configuración de extensiones de Chrome.

Esta extensión está pensada para flujos de trabajo de desarrolladores y control de calidad (QA). No la utilice para almacenar credenciales de producción a menos que esto sea aceptable en su perfil de navegador local.

Version 0.5.0 — se añadieron permisos de host por origen, valores capturados solo de sesión, protecciones para encabezados sensibles, perfiles eliminables, ajustes de visualización compacta y registros de auditoría solo de diagnóstico.
