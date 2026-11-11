import { ExtensionManifest } from '../types';

export const BUILT_IN_EXTENSIONS: ExtensionManifest[] = [
  {
    id: 'json-pretty',
    name: 'JSON Beautifier & Validator',
    version: '1.4.0',
    description: 'Parsea, indenta, valida y resalta sintaxis JSON con soporte para minificación.',
    author: 'Terminus Core Team',
    installed: true,
    commands: [
      {
        name: 'json-pretty',
        description: 'Formatea y valida un string JSON o archivo.',
        usage: 'json-pretty \'{"key":"value"}\' [--minify]',
      },
    ],
  },
  {
    id: 'web-scraper',
    name: 'DOM Web Extractor & Scraper',
    version: '2.1.0',
    description: 'Extrae títulos, metadatos OpenGraph, enlaces y encabezados H1-H3 de cualquier URL o pestaña activa.',
    author: 'Terminus Core Team',
    installed: true,
    commands: [
      {
        name: 'scrape',
        description: 'Extrae enlaces, imágenes y texto de una URL o de la pestaña actual.',
        usage: 'scrape [url] [--links] [--images] [--meta]',
      },
    ],
  },
  {
    id: 'dns-lookup',
    name: 'DNS Resolver Pro',
    version: '1.2.0',
    description: 'Consulta servidores de nombres, registros A, AAAA, MX y tiempos de resolución.',
    author: 'Network Ops Guild',
    installed: true,
    commands: [
      {
        name: 'dns',
        description: 'Resuelve registros DNS para un dominio específico.',
        usage: 'dns <dominio>',
      },
    ],
  },
  {
    id: 'base64',
    name: 'Base64 & Hex Toolset',
    version: '1.0.5',
    description: 'Codifica y decodifica texto binario en base64 y hexadecimal de manera instantánea.',
    author: 'Crypto Tooling Lab',
    installed: true,
    commands: [
      {
        name: 'base64',
        description: 'Codifica o decodifica un string en base64.',
        usage: 'base64 -e "texto"  o  base64 -d "dGV4dG8="',
      },
    ],
  },
  {
    id: 'regex-tester',
    name: 'Regex Matcher & Analyzer',
    version: '1.1.2',
    description: 'Evalúa expresiones regulares en tiempo real con grupos de captura y conteo de coincidencias.',
    author: 'Developer Utilities',
    installed: true,
    commands: [
      {
        name: 'regex',
        description: 'Prueba una expresión regular contra un texto objetivo.',
        usage: 'regex <patrón> <texto> [-g] [-i]',
      },
    ],
  },
  {
    id: 'cyber-hash',
    name: 'Cyber Hash Integrity Suite',
    version: '2.0.1',
    description: 'Calcula sumas criptográficas SHA-256, SHA-512 y simulación de HMAC para verificación de integridad.',
    author: 'Security Division',
    installed: true,
    commands: [
      {
        name: 'hash',
        description: 'Calcula el hash SHA-256 de una cadena.',
        usage: 'hash <texto>',
      },
    ],
  },
  {
    id: 'speedtest',
    name: 'Network Latency & Throughput Prober',
    version: '1.3.0',
    description: 'Mide la latencia de red, jitter y rendimiento de paquetes hacia servidores globales.',
    author: 'Network Ops Guild',
    installed: true,
    commands: [
      {
        name: 'speedtest',
        description: 'Ejecuta una prueba de latencia y velocidad.',
        usage: 'speedtest [--host=<url>]',
      },
    ],
  },
];
