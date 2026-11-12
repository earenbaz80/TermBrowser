/** Command catalogue shared by the help panel and the console category manual. */
export type HelpCategory = 'todas' | 'navegación' | 'sistema' | 'red' | 'seguridad' | 'automatización';

export interface CommandDoc {
  command: string;
  syntax: string;
  category: 'navegación' | 'sistema' | 'red' | 'seguridad' | 'automatización';
  summary: string;
  description: string;
  examples: {
    code: string;
    description: string;
    /** Installation commands are copy-only: they must run in the user's own shell. */
    copyOnly?: boolean;
  }[];
}

export const COMMAND_DOCS: CommandDoc[] = [
  // --- NAVEGACIÓN ---
  {
    command: 'ir a / goto',
    syntax: 'ir a <url> | goto <url>',
    category: 'navegación',
    summary: 'Navega a cualquier página web mediante sintaxis natural en español o comando clásico.',
    description: 'Sustituye la barra de direcciones tradicional. Extrae el contenido web, párrafos, enlaces navegables e imágenes reales del sitio directamente dentro de la consola con marcos retro, además de sincronizar con el visor web.',
    examples: [
      { code: 'ir a https://news.ycombinator.com', description: 'Abrir portal Hacker News con vista en terminal e imágenes' },
      { code: 'ir a https://en.wikipedia.org/wiki/Terminal_emulator', description: 'Consultar Wikipedia en español con fotos reales' },
      { code: 'ir example.com', description: 'Navegación directa rápida' },
    ],
  },
  {
    command: 'home / inicio',
    syntax: 'home | inicio',
    category: 'navegación',
    summary: 'Regresa a la pantalla de inicio de la pestaña activa.',
    description: 'Restaura el entorno inicial de la pestaña para ejecutar nuevas búsquedas o comandos.',
    examples: [
      { code: 'home', description: 'Volver a la página principal del navegador' },
      { code: 'inicio', description: 'Alias en español para retornar al inicio' },
    ],
  },
  {
    command: 'pestaña / pestana',
    syntax: 'pestaña <n|nueva|cerrar|list>',
    category: 'navegación',
    summary: 'Gestión directa de pestañas en español (cambiar, crear, cerrar).',
    description: 'Permite alternar entre pestañas numéricamente (ej. pestaña 1, pestaña 2), abrir una nueva pestaña o cerrar la actual mediante comandos rápidos.',
    examples: [
      { code: 'pestaña 1', description: 'Cambiar a la pestaña número 1' },
      { code: 'pestaña 2', description: 'Cambiar a la pestaña número 2' },
      { code: 'pestaña nueva', description: 'Crear y activar una nueva pestaña' },
      { code: 'pestaña cerrar', description: 'Cerrar la pestaña activa' },
    ],
  },
  {
    command: 'exit / salir',
    syntax: 'exit | salir',
    category: 'sistema',
    summary: 'Verifica el estado de la sesión y muestra opciones de salida.',
    description: 'Informa sobre la integridad de la sesión cifrada y recuerda que la página y la consola comparten una única superficie de texto.',
    examples: [
      { code: 'exit', description: 'Verificar estado de sesión y opciones de navegación' },
      { code: 'salir', description: 'Comando alternativo en español' },
    ],
  },
  {
    command: 'lynx / web',
    syntax: 'lynx <url> | web <url>',
    category: 'navegación',
    summary: 'Visualiza sitios web dentro de la consola como en MS-DOS con galería de fotos reales.',
    description: 'Motor de renderizado estilo Arachne / Lynx para DOS que extrae imágenes reales, encabezados y enlaces interactivos clicables dentro de la línea de comandos.',
    examples: [
      { code: 'lynx https://en.wikipedia.org/wiki/Retrocomputing', description: 'Renderizar artículo con fotos históricas reales en terminal' },
      { code: 'web https://news.ycombinator.com', description: 'Navegación web rápida en consola' },
    ],
  },
  {
    command: 'search',
    syntax: 'search <términos de búsqueda>',
    category: 'navegación',
    summary: 'Busca en la web desde Terminus Search.',
    description: 'Consulta DuckDuckGo y Wikipedia y presenta los resultados en Terminus Search, la página de búsqueda interna del navegador, con historial y vista de lectura en la pestaña.',
    examples: [
      { code: 'search algoritmos de cifrado post-cuanticos', description: 'Buscar documentación sobre criptografía moderna' },
      { code: 'search linux terminal commands cheat sheet', description: 'Buscar guías rápidas de comandos de consola' },
    ],
  },
  {
    command: 'curl',
    syntax: 'curl [-X GET/POST] <url>',
    category: 'navegación',
    summary: 'Inspecciona peticiones HTTP reales con cabeceras, latencia y código de estado.',
    description: 'Envía peticiones HTTP a través del proxy del backend o del navegador para evitar bloqueos CORS. Devuelve los encabezados del servidor, tamaño en bytes y cuerpo formateado.',
    examples: [
      { code: 'curl https://httpbin.org/get', description: 'Probar un endpoint REST y examinar cabeceras HTTP' },
      { code: 'curl https://jsonplaceholder.typicode.com/posts/1', description: 'Obtener un recurso JSON estructurado' },
    ],
  },
  {
    command: 'reader',
    syntax: 'reader',
    category: 'navegación',
    summary: 'Activa el modo de lectura limpio y sin distracciones.',
    description: 'Elimina publicidad, scripts pesados y estilos decorativos para mostrar el texto puro y legible de la página web actual.',
    examples: [
      { code: 'reader', description: 'Alternar a la vista de lectura sin anuncios en la pestaña activa' },
    ],
  },
  {
    command: 'source',
    syntax: 'source',
    category: 'navegación',
    summary: 'Inspecciona el código fuente HTML/DOM con numeración de líneas.',
    description: 'Muestra el árbol DOM y el marcado original del sitio web cargado para análisis de seguridad y desarrollo web.',
    examples: [
      { code: 'source', description: 'Ver el código fuente HTML de la página web actual' },
    ],
  },
  {
    command: 'tab',
    syntax: 'tab <new|close|switch|list> [argumentos]',
    category: 'navegación',
    summary: 'Gestión completa de pestañas de navegación por comandos.',
    description: 'Permite abrir pestañas en blanco o con URL, cerrarlas por ID o cambiar entre ellas rápidamente.',
    examples: [
      { code: 'tab new https://news.ycombinator.com', description: 'Abrir nueva pestaña navegando a Hacker News' },
      { code: 'tab switch 2', description: 'Cambiar el foco a la segunda pestaña abierta' },
      { code: 'tab list', description: 'Listar todas las pestañas abiertas y su estado' },
      { code: 'tab close', description: 'Cerrar la pestaña activa' },
    ],
  },
  {
    command: 'bookmark',
    syntax: 'bookmark <add|list|del> [argumentos]',
    category: 'navegación',
    summary: 'Guarda marcadores cifrados en la bóveda AES-256 local.',
    description: 'Los marcadores se almacenan protegidos por clave maestra y pueden ser consultados o eliminados mediante comandos.',
    examples: [
      { code: 'bookmark add "API Docs" https://httpbin.org', description: 'Guardar un favorito con título personalizado' },
      { code: 'bookmark list', description: 'Listar todos los marcadores cifrados' },
    ],
  },

  // --- SISTEMA ---
  {
    command: 'history',
    syntax: 'history  o  history clear',
    category: 'sistema',
    summary: 'Muestra el historial persistente de comandos ejecutados o lo vacía.',
    description: 'Permite recuperar cualquier comando anterior rápidamente usando las teclas Flecha Arriba (↑) y Flecha Abajo (↓). El historial se guarda de manera persistente entre sesiones.',
    examples: [
      { code: 'history', description: 'Listar los comandos ejecutados recientemente' },
      { code: 'history clear', description: 'Vaciar el historial persistente de comandos' },
    ],
  },
  {
    command: 'top / ps',
    syntax: 'top  o  ps',
    category: 'sistema',
    summary: 'Despliega el tablero interactivo de monitorización de recursos estilo MS-DOS.',
    description: 'Muestra medidores de barras ASCII para CPU, memoria RAM, hilos en ejecución, rendimiento de red y alertas visuales/sonoras ante anomalías.',
    examples: [
      { code: 'top', description: 'Abrir el monitor de recursos interactivo MS-DOS' },
      { code: 'ps', description: 'Inspeccionar lista de procesos y tareas en ejecución' },
    ],
  },
  {
    command: 'python',
    syntax: 'python -c "<code>"',
    category: 'sistema',
    summary: 'Ejecuta código y scripts Python en tiempo real dentro del navegador.',
    description: 'Entorno de ejecución aislado con soporte para estructuras de datos, operaciones matemáticas, funciones, bucles for/while y manejo de JSON.',
    examples: [
      { code: 'python -c "print([x**2 for x in range(10)])"', description: 'Generar lista de cuadrados con list comprehension' },
      { code: 'python -c "import math; print(\'Raiz:\', math.sqrt(65536))"', description: 'Operaciones con la librería matemática' },
      { code: 'python -c "data = {\'nodo\': \'alpha\', \'status\': \'ok\'}; print(data)"', description: 'Manipular diccionarios y objetos JSON' },
    ],
  },
  {
    command: 'bash',
    syntax: 'bash -c "<comandos>"',
    category: 'sistema',
    summary: 'Ejecuta secuencias de comandos shell con encadenamiento de comandos.',
    description: 'Permite ejecutar múltiples directivas encadenadas con operadores `&&` o `;`.',
    examples: [
      { code: 'bash -c "whoami && date"', description: 'Consultar identidad del usuario y fecha/hora' },
      { code: 'bash -c "echo \'Iniciando auditoria\' && vault status"', description: 'Encadenar mensaje y consulta de seguridad' },
    ],
  },
  {
    command: 'shell nativo',
    syntax: 'Selector SHELL: AUTO | CMD | POWERSHELL | BASH',
    category: 'sistema',
    summary: 'Ejecuta comandos reales del sistema desde la app de escritorio.',
    description: 'En la aplicación Electron, el selector SHELL permite enviar comandos reales a CMD, Windows PowerShell, PowerShell Core o Bash (Git Bash en Windows, WSL como alternativa, o el Bash del sistema en Linux/macOS). La ruta de trabajo es real y persiste por pestaña: "cd C:\\Users" entra en el disco local, "cd .." sube un nivel y "cd ~" vuelve a la carpeta del usuario. Los procesos usan los permisos del usuario. En la app de escritorio, al elegir un shell nativo la terminal usa un PTY real: vim, ssh, top y otras aplicaciones de pantalla completa funcionan con teclado, colores y Ctrl+C; el modo no interactivo conserva el límite de 120 segundos y 1 MB de salida. Muchas de esas herramientas no vienen con Windows: revisa la ficha "PTY interactivo" para instalarlas. En la versión web el selector permanece en TERMINUS porque el navegador no puede ejecutar procesos locales.',
    examples: [
      { code: 'cmd: cd C:\\Users && dir', description: 'Navegar y listar archivos reales de Windows' },
      { code: 'powershell: Get-Process | Select-Object -First 5', description: 'Listar procesos reales con PowerShell' },
      { code: 'bash: uname -a && pwd', description: 'Consultar el sistema desde Git Bash, WSL o Linux' },
    ],
  },
  {
    command: 'PTY interactivo',
    syntax: 'Selector SHELL: CMD | POWERSHELL | BASH',
    category: 'sistema',
    summary: 'Ejecuta programas de pantalla completa y sesiones interactivas reales.',
    description:
      'En la app de escritorio, elegir CMD, PowerShell o Bash activa un PTY real: los programas de pantalla completa reciben teclado, colores y señales como Ctrl+C. Terminus no incluye estas herramientas; deben existir en el PATH del shell elegido. En Windows: vim se instala con "winget install vim.vim" (o viene con Git Bash); ssh con la característica opcional OpenSSH Client (Configuración > Aplicaciones > Características opcionales) o "winget install Microsoft.OpenSSH.Preview"; top y htop no existen en Windows, así que usa WSL ("wsl --install" y después "wsl top") o instala htop dentro de la distro ("sudo apt install htop"). En macOS y Linux suelen estar preinstalados. El comando top del modo emulado (sin shell nativo) abre el monitor interno de CPU/RAM, no el top del sistema.',
    examples: [
      { code: 'winget install vim.vim', description: 'Instalar Vim en Windows con winget', copyOnly: true },
      { code: 'winget install Microsoft.OpenSSH.Preview', description: 'Instalar el cliente OpenSSH con winget', copyOnly: true },
      { code: 'wsl --install', description: 'Instalar WSL y una distro de Linux (requiere reinicio)', copyOnly: true },
      { code: 'wsl sudo apt install htop', description: 'Instalar htop dentro de la distro WSL', copyOnly: true },
      { code: 'vim -u NONE archivo.txt', description: 'Abrir vim sin configuración; salir con :q!' },
      { code: 'ssh usuario@servidor', description: 'Sesión SSH interactiva (requiere cliente OpenSSH)' },
      { code: 'wsl top', description: 'Ver procesos de Linux desde Windows con WSL' },
    ],
  },
  {
    command: 'ls / dir',
    syntax: 'ls  o  dir',
    category: 'sistema',
    summary: 'Lista archivos del workspace local o del disco virtual.',
    description: 'El terminal arranca en `/workspace`, el disco local real. Use `cd /home/user` para volver al sistema virtual de demostración. `dir` emula la salida clásica de MS-DOS con fechas, horas y tamaños en bytes.',
    examples: [
      { code: 'ls', description: 'Listar archivos del directorio actual en formato Unix' },
      { code: 'dir', description: 'Listar archivos con el formato de MS-DOS 6.22' },
    ],
  },
  {
    command: 'cat / type',
    syntax: 'cat <archivo>  o  type <archivo>',
    category: 'sistema',
    summary: 'Muestra el contenido de un archivo local o virtual.',
    description: 'Lee archivos de configuración, scripts de automatización o logs de texto plano.',
    examples: [
      { code: 'cat readme.txt', description: 'Leer el manual de bienvenida del sistema' },
      { code: 'cat benchmark.py', description: 'Inspeccionar script de prueba en Python' },
      { code: 'type config.sys', description: 'Leer archivo de configuración al estilo MS-DOS' },
    ],
  },
  {
    command: 'whoami',
    syntax: 'whoami',
    category: 'sistema',
    summary: 'Muestra la identidad de sesión activa y privilegios de cifrado.',
    description: 'Imprime el usuario actual, nivel de acceso de la terminal y estado de verificación de doble factor.',
    examples: [
      { code: 'whoami', description: 'Consultar nivel de seguridad y permisos actuales' },
    ],
  },
  {
    command: 'clear / cls',
    syntax: 'clear  o  cls',
    category: 'sistema',
    summary: 'Limpia la pantalla y el búfer de salida de la terminal.',
    description: 'Borra el historial visible de la consola para mantener un espacio de trabajo limpio.',
    examples: [
      { code: 'clear', description: 'Limpiar búfer de terminal (atajo: Ctrl+L)' },
    ],
  },
  {
    command: 'voice / voz / dictar',
    syntax: 'voice | voz | dictar | mic',
    category: 'sistema',
    summary: 'Entrada y dictado por voz mediante Web Speech API (Atajo: Ctrl+M).',
    description: 'Permite dictar comandos en lenguaje natural (ej. "inicio", "ir a wikipedia", "listar archivos", "pestaña 1") y transcribir búsquedas web con visualización de VU meter y texto fosforescente estilo CRT retro.',
    examples: [
      { code: 'voice', description: 'Consultar estado del motor de voz y comandos reconocidos' },
      { code: 'dictar', description: 'Alias en español para el soporte de voz' },
    ],
  },

  // --- RED ---
  {
    command: 'ping',
    syntax: 'ping <host>',
    category: 'red',
    summary: 'Diagnostica la latencia y la calidad de la conexión con un servidor.',
    description: 'Calcula tiempos de ida y vuelta (RTT) en milisegundos, variabilidad (jitter) y pérdida de paquetes.',
    examples: [
      { code: 'ping 1.1.1.1', description: 'Medir tiempo de respuesta con DNS de Cloudflare' },
      { code: 'ping google.com', description: 'Verificar conectividad hacia Google' },
    ],
  },
  {
    command: 'dns',
    syntax: 'dns <dominio>',
    category: 'red',
    summary: 'Resuelve registros DNS (A, AAAA, MX) para cualquier dominio.',
    description: 'Consulta servidores de nombres globales mediante la API del servidor y devuelve las direcciones IP vinculadas.',
    examples: [
      { code: 'dns google.com', description: 'Consultar registros IPv4 e IPv6 de google.com' },
      { code: 'dns github.com', description: 'Resolver direcciones de servidores de GitHub' },
    ],
  },
  {
    command: 'speedtest',
    syntax: 'speedtest',
    category: 'red',
    summary: 'Mide el rendimiento de ancho de banda y latencia de la red.',
    description: 'Evalúa la velocidad de descarga, velocidad de subida bajo túnel AES-256 y estabilidad de conexión.',
    examples: [
      { code: 'speedtest', description: 'Ejecutar test completo de throughput y latencia' },
    ],
  },
  {
    command: 'ipconfig / ifconfig',
    syntax: 'ipconfig  o  ifconfig',
    category: 'red',
    summary: 'Muestra la configuración de los adaptadores de red y túnel seguro.',
    description: 'Detalla dirección IPv4, IPv6, puerta de enlace, DNS y el estado del cifrado de hardware AES-256 en la interfaz.',
    examples: [
      { code: 'ipconfig', description: 'Ver configuración de red y túnel cifrado' },
    ],
  },
  {
    command: 'scrape',
    syntax: 'scrape [url]',
    category: 'red',
    summary: 'Extrae metadatos, enlaces y recursos de una página web.',
    description: 'Analiza el DOM del objetivo para listar encabezados, enlaces externos e imágenes estructuradas.',
    examples: [
      { code: 'scrape https://news.ycombinator.com', description: 'Extraer enlaces y metadatos de Hacker News' },
      { code: 'scrape', description: 'Extraer datos de la página cargada en la pestaña activa' },
    ],
  },

  // --- SEGURIDAD ---
  {
    command: 'vault',
    syntax: 'vault <status|lock|unlock>',
    category: 'seguridad',
    summary: 'Gestiona la bóveda local protegida con cifrado AES-256-GCM.',
    description: 'Permite inspeccionar el checksum de integridad SHA-256 de los datos, bloquear o desbloquear con clave maestra.',
    examples: [
      { code: 'vault status', description: 'Verificar el estado del cifrado AES-256 y checksum' },
      { code: 'vault lock', description: 'Bloquear inmediatamente la bóveda de credenciales' },
      { code: 'vault unlock', description: 'Desbloquear la bóveda con la clave maestra' },
    ],
  },
  {
    command: 'mfa',
    syntax: 'mfa <status|verify> [código]',
    category: 'seguridad',
    summary: 'Administra la autenticación multifactor TOTP (RFC 6238).',
    description: 'Genera tokens temporales de 6 dígitos con ventana de tiempo de 30 segundos compatibles con Google Authenticator o Authy.',
    examples: [
      { code: 'mfa status', description: 'Verificar estado de doble factor y token activo' },
      { code: 'mfa verify 123456', description: 'Validar un código de verificación de 6 dígitos' },
    ],
  },
  {
    command: 'sync',
    syntax: 'sync <push|pull>',
    category: 'seguridad',
    summary: 'Sincroniza el espacio de trabajo cifrado con la nube segura.',
    description: 'Realiza un volcado cifrado con AES-256 de todas las pestañas, scripts y marcadores, requiriendo validación MFA al restaurar.',
    examples: [
      { code: 'sync push', description: 'Cifrar y subir respaldo a la nube de Terminus' },
      { code: 'sync pull', description: 'Descargar y restaurar respaldo desde la nube' },
    ],
  },
  {
    command: 'hash',
    syntax: 'hash <texto>',
    category: 'seguridad',
    summary: 'Calcula sumas criptográficas SHA-256 instantáneas.',
    description: 'Genera la huella digital criptográfica mediante la Web Crypto API nativa.',
    examples: [
      { code: 'hash "cadena secreta para verificar"', description: 'Generar hash SHA-256 de un texto' },
    ],
  },
  {
    command: 'base64',
    syntax: 'base64 <-e|-d> <texto>',
    category: 'seguridad',
    summary: 'Codifica o decodifica cadenas en formato Base64.',
    description: 'Útil para transportar cargas binarias, tokens de autenticación o secretos.',
    examples: [
      { code: 'base64 -e "clave de prueba"', description: 'Codificar texto a Base64' },
      { code: 'base64 -d "Y2xhdmUgZGUgcHJ1ZWJh"', description: 'Decodificar cadena Base64' },
    ],
  },

  // --- AUTOMATIZACIÓN ---
  {
    command: 'script',
    syntax: 'script <list|run> [nombre]',
    category: 'automatización',
    summary: 'Administra y ejecuta flujos de trabajo y macros automatizadas.',
    description: 'Ejecuta secuencias de comandos de forma ordenada con registros paso a paso para automatizar tareas repetitivas.',
    examples: [
      { code: 'script list', description: 'Ver la lista de scripts de automatización disponibles' },
      { code: 'script run "Auditoría de Seguridad y Cifrado AES-256"', description: 'Ejecutar flujo completo de auditoría del sistema' },
      { code: 'script run "Ronda Matutina de Noticias Tecnológicas"', description: 'Ejecutar macro para abrir noticias y activar modo lector' },
    ],
  },
  {
    command: 'binds',
    syntax: 'binds',
    category: 'automatización',
    summary: 'Abre el panel interactivo de atajos de teclado personalizables.',
    description: 'Permite configurar atajos rápidos (ej. Ctrl+T, Ctrl+W, Ctrl+B, Ctrl+M, Ctrl+L) para disparar cualquier comando.',
    examples: [
      { code: 'binds', description: 'Abrir el gestor de atajos de teclado' },
    ],
  },
  {
    command: 'ext',
    syntax: 'ext <list|install> [nombre]',
    category: 'automatización',
    summary: 'Gestiona extensiones de consola y plugins de terceros.',
    description: 'Permite consultar el catálogo de extensiones CLI, activarlas o integrarlas a la consola.',
    examples: [
      { code: 'ext list', description: 'Abrir el catálogo de extensiones disponibles' },
      { code: 'ext install web-scraper', description: 'Activar extensión de extracción web' },
    ],
  },
  {
    command: 'log',
    syntax: 'log <show|export> [--json|--txt]',
    category: 'automatización',
    summary: 'Exporta los registros de auditoría y actividad del sistema.',
    description: 'Descarga archivos estructurados en JSON o texto plano (.txt) con todas las acciones registradas.',
    examples: [
      { code: 'log export --json', description: 'Descargar auditoría completa en formato JSON' },
      { code: 'log export --txt', description: 'Descargar logs en archivo de texto plano' },
    ],
  },
];
