/**
 * Página mínima para ejecutar el intérprete Python.
 *
 * Se sirve en un iframe con sandbox="allow-scripts" (sin allow-same-origin), por lo que su
 * origen es opaco: no puede leer el DOM de la app, no recibe el preload de Electron y no
 * puede acceder a las APIs locales. La CSP del documento bloquea además toda la red.
 */
export const PYTHON_RUNNER_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval'",
  "style-src 'none'",
  "img-src 'none'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join('; ');

export const pythonRunnerPage = String.raw`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Python sandbox</title>
</head>
<body>
<script>
(function () {
  'use strict';

  var MAX_CODE_LENGTH = 200000;

  function execute(code) {
    var stdout = [];

    function print() {
      var args = Array.prototype.slice.call(arguments);
      stdout.push(args.map(function (arg) {
        return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
      }).join(' '));
    }

    var len = function (value) {
      if (!value) return 0;
      return value.length !== undefined ? value.length : Object.keys(value).length;
    };
    var range = function (start, stop, step) {
      var first = start;
      var last = stop;
      var increment = step === undefined ? 1 : step;
      if (last === undefined) {
        last = first;
        first = 0;
      }
      var values = [];
      for (var i = first; increment > 0 ? i < last : i > last; i += increment) values.push(i);
      return values;
    };
    var sum = function (values) { return values.reduce(function (total, value) { return total + value; }, 0); };
    var min = function () {
      var args = Array.prototype.slice.call(arguments);
      return Array.isArray(args[0]) ? Math.min.apply(null, args[0]) : Math.min.apply(null, args);
    };
    var max = function () {
      var args = Array.prototype.slice.call(arguments);
      return Array.isArray(args[0]) ? Math.max.apply(null, args[0]) : Math.max.apply(null, args);
    };
    var json = {
      dumps: function (value, indent) { return JSON.stringify(value, null, indent === undefined ? 2 : indent); },
      loads: function (value) { return JSON.parse(value); }
    };

    var jsCode = code
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\bNone\b/g, 'null')
      .replace(/\bimport\s+math\b/g, '// import math')
      .replace(/\bimport\s+json\b/g, '// import json')
      .replace(/\bimport\s+sys\b/g, '// import sys')
      .replace(/\bimport\s+os\b/g, '// import os');

    jsCode = jsCode.replace(/for\s+([a-zA-Z0-9_]+)\s+in\s+range\(([^)]+)\):/g, function (_match, varName, rangeArgs) {
      return 'for (const ' + varName + ' of range(' + rangeArgs + ')) {';
    });
    jsCode = jsCode.replace(/for\s+([a-zA-Z0-9_]+)\s+in\s+([a-zA-Z0-9_]+):/g, function (_match, varName, listName) {
      return 'for (const ' + varName + ' of ' + listName + ') {';
    });
    jsCode = jsCode.replace(/def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\):/g, 'function $1($2) {');
    jsCode = jsCode.replace(/elif\s+([^:]+):/g, '} else if ($1) {');
    jsCode = jsCode.replace(/if\s+([^:]+):/g, 'if ($1) {');
    jsCode = jsCode.replace(/else:/g, '} else {');

    // Python list comprehensions: [expr for var in iterable] / [expr for var in iterable if cond]
    var comprehensionPattern = /\[([^\[\]]*?)\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+([^\[\]]*?)\]/;
    var comprehensionPasses = 0;
    while (comprehensionPattern.test(jsCode) && comprehensionPasses < 50) {
      comprehensionPasses += 1;
      jsCode = jsCode.replace(comprehensionPattern, function (_match, expression, varName, source) {
        var guardSplit = source.split(/\s+if\s+/);
        var iterable = '(Array.prototype.slice.call(' + guardSplit[0].trim() + '))';
        var condition = guardSplit.slice(1).join(' if ').trim();
        var mapper = '.map(function (' + varName + ') { return ' + expression.trim() + '; })';
        if (condition) {
          return iterable + '.filter(function (' + varName + ') { return ' + condition + '; })' + mapper;
        }
        return iterable + mapper;
      });
    }

    // Shadow the worker/browser capabilities the interpreter does not need. The iframe is
    // already origin-isolated and CSP-blocked; this is an extra guard against accidental use.
    var runner = new Function(
      'print', 'math', 'len', 'range', 'sum', 'min', 'max', 'json',
      'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts',
      'self', 'globalThis', 'window', 'document', 'parent', 'top', 'postMessage',
      'try {\n' + jsCode + '\n} catch (err) { throw err; }'
    );

    var result = runner(
      print, Math, len, range, sum, min, max, json,
      undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined
    );

    if (result !== undefined && stdout.length === 0) stdout.push(String(result));
    return {
      stdout: stdout.join('\n') || (result !== undefined ? String(result) : '(ejecutado sin salida)'),
      stderr: '',
      exitCode: 0
    };
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data || data.type !== 'terminus-python-run' || typeof data.id !== 'string') return;
    if (typeof data.code !== 'string' || data.code.length > MAX_CODE_LENGTH) {
      window.parent.postMessage({
        type: 'terminus-python-result',
        id: data.id,
        error: 'El código Python supera el límite permitido.'
      }, '*');
      return;
    }

    try {
      var result = execute(data.code);
      window.parent.postMessage({ type: 'terminus-python-result', id: data.id, result: result }, '*');
    } catch (error) {
      window.parent.postMessage({
        type: 'terminus-python-result',
        id: data.id,
        error: error && error.name ? error.name + ': ' + error.message : String(error)
      }, '*');
    }
  });
}());
</script>
</body>
</html>`;
