# Política de seguridad

## Estado del proyecto

Terminus es un proyecto personal y no ha sido auditado por terceros. La revisión de seguridad incluida en `docs/security-review-proxy-iframes.md` es interna y de alcance limitado; no sustituye una auditoría independiente ni una prueba de penetración.

El modelo de confianza es de un solo usuario en su equipo. El terminal nativo ejecuta comandos con los permisos del usuario y la política de red privada se aplica al navegador y a las APIs locales, no a esos comandos.

## Versiones soportadas

| Versión | Soporte |
| --- | --- |
| 0.3.x | Sí (versión actual del paquete; release pendiente de publicar) |
| 0.2.x | Sí (última release publicada, 0.2.2) |
| Anteriores | No |

## Reportar una vulnerabilidad

No abras un issue público para vulnerabilidades de seguridad.

Usa **GitHub Security Advisories → Report a vulnerability** en este repositorio. Si esa opción no está disponible, contacta al mantenedor por un canal privado indicado en el perfil del repositorio.

Incluye, cuando sea posible:

- versión de Terminus y sistema operativo;
- una descripción del impacto;
- pasos mínimos para reproducirlo;
- una prueba de concepto sin datos personales ni secretos;
- una propuesta de mitigación, si la tienes.

No hay programa de recompensas. Se intentará confirmar el reporte y publicar una corrección o mitigación, pero no se garantiza un plazo.

## Alcance

Se revisan especialmente:

- el proxy local y el forward proxy de la vista REAL;
- el aislamiento de iframes, `postMessage` y CSP;
- la sanitización de HTML;
- el servidor local, la sesión y las APIs de archivos;
- el aislamiento de Electron y los permisos;
- la cadena de build y las dependencias.

Quedan fuera de alcance:

- ataques que requieran acceso administrativo previo al equipo;
- comandos ejecutados deliberadamente en el terminal nativo;
- vulnerabilidades de sitios web de terceros;
- falta de firma Authenticode o advertencias de SmartScreen;
- problemas que dependan de desactivar la política de red privada.

## Divulgación

Se agradece la divulgación coordinada. No se publicarán detalles explotables antes de que exista una corrección o una mitigación razonable.
