# Firma Authenticode del instalador Windows

La firma de código permite que Windows compruebe el editor del instalador y que SmartScreen deje de tratarlo como un binario desconocido. Es **opcional**: si no hay certificado configurado, el workflow sigue generando el instalador sin firmar.

## Requisitos

- Un certificado de firma de código para Windows con clave privada, exportable como `.pfx` o `.p12`.
- Un certificado emitido por una CA pública si el instalador se distribuye a terceros. Un certificado autofirmado solo es válido en equipos donde se haya instalado su raíz.
- La contraseña del certificado.
- Salida a Internet desde el runner para el sello de tiempo RFC 3161. electron-builder usa `http://timestamp.digicert.com` por defecto.

No subas el `.pfx` ni su contraseña al repositorio.

## Configurar los secretos

En **Settings → Secrets and variables → Actions → Secrets** crea:

| Secreto | Contenido |
| --- | --- |
| `WINDOWS_CERTIFICATE_BASE64` | El archivo `.pfx` completo, codificado en base64 y en una sola línea. |
| `WINDOWS_CERTIFICATE_PASSWORD` | La contraseña del `.pfx`. Si el certificado no tiene contraseña, déjalo vacío. |

Para generar el valor en PowerShell:

```powershell
$pfx = 'C:\certs\terminus-code-signing.pfx'
[Convert]::ToBase64String([IO.File]::ReadAllBytes($pfx)) | Set-Clipboard
```

Pega el contenido del portapapeles como valor de `WINDOWS_CERTIFICATE_BASE64`. No añadas saltos de línea ni las marcas `-----BEGIN...`.

El workflow solo usa `WINDOWS_CERTIFICATE_PASSWORD` en el paso de compilación. El PFX se escribe temporalmente en `%RUNNER_TEMP%\terminus-signing.pfx`, se pasa a electron-builder mediante `WIN_CSC_LINK` y se elimina en un paso `always()`, incluso si el build falla.

## Qué hace el workflow

En `.github/workflows/ci.yml`, antes de compilar:

1. Comprueba si `WINDOWS_CERTIFICATE_BASE64` existe.
2. Decodifica el PFX en `%RUNNER_TEMP%\terminus-signing.pfx`.
3. Exporta `WIN_CSC_LINK` apuntando a ese archivo.
4. Ejecuta `npm run desktop:build` con `WIN_CSC_KEY_PASSWORD`.

electron-builder 26 usa `WIN_CSC_LINK` y `WIN_CSC_KEY_PASSWORD` para el backend `signtool`; si no están definidos, omite la firma. El workflow no necesita cambiar `package.json` ni activar `forceCodeSigning`.

Después del build, el paso **Verificar firma del instalador** comprueba:

- que `Get-AuthenticodeSignature` devuelve `Valid`;
- que hay certificado de firmante;
- que hay sello de tiempo.

Si alguna comprobación falla, el job falla y no se publica un instalador que parezca firmado pero no lo esté.

## Verificar localmente

Con el certificado y la contraseña configurados en el entorno:

```powershell
$env:WIN_CSC_LINK = 'C:\certs\terminus-code-signing.pfx'
$env:WIN_CSC_KEY_PASSWORD = '...'
npm run desktop:build

$installer = Get-ChildItem -LiteralPath release -Filter 'Terminus Setup *.exe' |
  Where-Object { $_.Name -notlike '*.__uninstaller.exe' } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

Get-AuthenticodeSignature -LiteralPath $installer.FullName |
  Format-List Status, StatusMessage, SignerCertificate, TimeStamperCertificate
```

Resultado esperado: `Status: Valid`, un firmante con el nombre del editor y un `TimeStamperCertificate` presente. También puedes comprobarlo desde las propiedades del `.exe`, pestaña **Firmas digitales**.

## Alternativas y límites

- Este flujo cubre un PFX exportable con `signtool`. Para un certificado EV en HSM, PKCS#11 o Azure Trusted Signing hay que configurar `win.sign` o `azureSignOptions` según la documentación de electron-builder; no reutilices este flujo sin adaptarlo.
- La firma no garantiza reputación inmediata en SmartScreen: un certificado nuevo puede seguir mostrando advertencias hasta que Windows acumule reputación.
- Si el certificado caduca, las firmas antiguas siguen siendo verificables mientras tengan sello de tiempo; renueva el certificado y rota los secretos antes de la fecha de expiración.
- Para desactivar la firma, elimina `WINDOWS_CERTIFICATE_BASE64` o déjalo vacío. El workflow volverá a generar un instalador sin firmar sin fallar.

## Estado actual

La release `v0.2.0` existente se generó sin certificado y su instalador figura como `NotSigned`. Para publicar una versión firmada hay que configurar los dos secretos, volver a ejecutar el CI y subir el nuevo instalador; no se debe presentar el instalador actual como firmado.
