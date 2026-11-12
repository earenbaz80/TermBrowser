# Terminus 0.2.2 — Windows x64

Release estable publicada con el tag `v0.2.2`, construida desde `main`, con el endurecimiento de red de la vista REAL y el proxy local.

## Cambios

- La vista REAL usa un forward proxy HTTP/HTTPS en loopback: Chromium solo conecta al proxy, que resuelve el hostname una vez, valida todas las direcciones y fija la IP elegida. HTTP se reenvía y HTTPS usa un túnel `CONNECT`, conservando TLS, SNI y la validación de certificados.
- Se rechazan destinos privados, loopback remoto, endpoints de metadata cloud y subframes o popups privados. El guard de Electron y el bloqueo de EasyList se conservan.
- Se incorporan las correcciones F-01 a F-07 de la revisión de seguridad: DNS rebinding, egress proxificado, vista REAL, `postMessage`, IPv4-mapped IPv6, `base-uri` y sanitización HTML basada en parser.
- La versión visible en la interfaz y los User-Agent se actualizan a `0.2.2`.
- La documentación de firma se actualiza para reflejar que esta release se publica sin certificado.

La revisión de seguridad completa está en [docs/security-review-proxy-iframes.md](https://github.com/earenbaz80/terminus/blob/main/docs/security-review-proxy-iframes.md).

## Verificación

- `npm run lint`: correcto.
- `npm test`: **28 archivos, 130 pruebas**, todas pasan.
- `npm run build` y `npm run build:server`: correctos.
- `npm run test:e2e:adblock`: `E2E_ADBLOCK_OK`, con `PRIVATE_PROXY_PROBE hits: 0` y `PRIVATE_REAL_PROBE hits: 0`.
- `Get-AuthenticodeSignature`: `NotSigned`.

El instalador no está firmado digitalmente; Windows SmartScreen puede mostrar una advertencia.

## Artefactos

- `terminus-installer-0.2.2-windows.zip`
- `Terminus Setup 0.2.2.exe`
- `SHA256SUMS.txt`

### SHA-256

```text
b0ad5f331548e890d63e80c716bdf1f64cebe3936eba720a91a8e2ba66a79105  Terminus Setup 0.2.2.exe
777c0ae76772790d07903ac45b1bfece53be3f454122d8c279cf9b0d724ef517  terminus-installer-0.2.2-windows.zip
```

## Instalación

1. Descarga y extrae el ZIP.
2. Ejecuta `Terminus Setup 0.2.2.exe`.
3. La instalación es por usuario, en `%LOCALAPPDATA%\Programs\Terminus`.

Para comprobar el instalador después de extraerlo:

```powershell
Get-FileHash '.\Terminus Setup 0.2.2.exe' -Algorithm SHA256
Get-AuthenticodeSignature '.\Terminus Setup 0.2.2.exe'
```

El hash debe coincidir con el publicado y el estado de Authenticode debe ser `NotSigned`.
