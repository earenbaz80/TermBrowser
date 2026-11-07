import express from 'express';
import { createServer as createViteServer } from 'vite';
import http from 'http';
import dns from 'dns/promises';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // In-memory encrypted cloud vault storage (per session / mock cloud)
  let cloudVault: { data: string; mfaEnabled: boolean; updatedAt: string; hash: string } | null = null;

  // Real proxy endpoint for terminal curl / fetch / reader commands
  app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    try {
      const parsed = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({ error: 'Invalid protocol. Only http and https supported.' });
      }

      const startTime = Date.now();
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'TermBrowser/2.4 (CLI Web Navigator; AES-256; x86_64)',
          'Accept': 'text/html,application/xhtml+xml,application/xml,text/plain,application/json;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      });

      const latencyMs = Date.now() - startTime;
      const contentType = response.headers.get('content-type') || 'text/plain';
      const text = await response.text();

      // Return structured response with headers, status, timing, body and extracted real images
      const headersObj: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        headersObj[key] = val;
      });

      // Extract title, real images, headings, paragraphs and links
      let extractedTitle = parsed.hostname;
      const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        extractedTitle = titleMatch[1].trim();
      }

      const extractedImages: { src: string; alt?: string }[] = [];
      const imgRegex = /<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*?>/gi;
      let imgMatch;
      while ((imgMatch = imgRegex.exec(text)) !== null) {
        try {
          const rawSrc = imgMatch[1];
          if (!rawSrc.startsWith('data:') && !rawSrc.includes('spacer') && !rawSrc.includes('pixel') && !rawSrc.includes('tracker')) {
            const absUrl = new URL(rawSrc, response.url).href;
            const altMatch = imgMatch[0].match(/\balt=["']([^"']*)["']/i);
            extractedImages.push({
              src: absUrl,
              alt: altMatch ? altMatch[1] : undefined,
            });
          }
        } catch {}
      }

      // Check og:image meta tag
      const ogMatch = text.match(/<meta[^>]*?property=["']og:image["'][^>]*?content=["']([^"']+)["']/i) ||
                      text.match(/<meta[^>]*?content=["']([^"']+)["'][^>]*?property=["']og:image["']/i);
      if (ogMatch && ogMatch[1]) {
        try {
          const ogUrl = new URL(ogMatch[1], response.url).href;
          if (!extractedImages.some((img) => img.src === ogUrl)) {
            extractedImages.unshift({ src: ogUrl, alt: 'Imagen destacada (OpenGraph)' });
          }
        } catch {}
      }

      // Extract headings
      const extractedHeadings: string[] = [];
      const hRegex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
      let hMatch;
      while ((hMatch = hRegex.exec(text)) !== null && extractedHeadings.length < 8) {
        const cleanH = hMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (cleanH) extractedHeadings.push(cleanH);
      }

      // Extract paragraphs
      const extractedParagraphs: string[] = [];
      const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
      let pMatch;
      while ((pMatch = pRegex.exec(text)) !== null && extractedParagraphs.length < 12) {
        const cleanP = pMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (cleanP.length > 25) extractedParagraphs.push(cleanP);
      }

      // Extract prominent links
      const extractedLinks: { text: string; href: string }[] = [];
      const aRegex = /<a\b[^>]*?\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let aMatch;
      while ((aMatch = aRegex.exec(text)) !== null && extractedLinks.length < 15) {
        try {
          const rawHref = aMatch[1];
          const linkText = aMatch[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
          if (linkText && !rawHref.startsWith('#') && !rawHref.startsWith('javascript:')) {
            const absHref = new URL(rawHref, response.url).href;
            if (!extractedLinks.some((l) => l.href === absHref)) {
              extractedLinks.push({ text: linkText.slice(0, 50), href: absHref });
            }
          }
        } catch {}
      }

      return res.json({
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        contentType,
        headers: headersObj,
        latencyMs,
        sizeBytes: text.length,
        body: text,
        extracted: {
          title: extractedTitle,
          images: extractedImages.slice(0, 12),
          headings: extractedHeadings,
          paragraphs: extractedParagraphs,
          links: extractedLinks,
        },
      });
    } catch (err: any) {
      return res.status(502).json({
        error: 'Proxy Fetch Failed',
        message: err.message || 'Unknown network error',
      });
    }
  });

  // Real Web Search API for normal browser search behavior
  app.get('/api/search', async (req, res) => {
    const query = (req.query.q as string || '').trim();
    if (!query) {
      return res.status(400).json({ error: 'Missing query parameter q' });
    }

    try {
      const results: { title: string; url: string; snippet: string; image?: string }[] = [];
      const images: { src: string; alt?: string }[] = [];

      // 1. Query DuckDuckGo Instant Answer API
      try {
        const ddgRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TermBrowser/2.4' },
        });
        if (ddgRes.ok) {
          const ddgData = await ddgRes.json();
          if (ddgData.Abstract && ddgData.AbstractURL) {
            results.push({
              title: ddgData.Heading || query,
              url: ddgData.AbstractURL,
              snippet: ddgData.Abstract,
              image: ddgData.Image ? (ddgData.Image.startsWith('http') ? ddgData.Image : `https://duckduckgo.com${ddgData.Image}`) : undefined,
            });
            if (ddgData.Image) {
              const fullImg = ddgData.Image.startsWith('http') ? ddgData.Image : `https://duckduckgo.com${ddgData.Image}`;
              images.push({ src: fullImg, alt: ddgData.Heading });
            }
          }

          // Related topics
          if (Array.isArray(ddgData.RelatedTopics)) {
            ddgData.RelatedTopics.slice(0, 6).forEach((topic: any) => {
              if (topic.Text && topic.FirstURL) {
                const titlePart = topic.Text.split(' - ')[0] || topic.Text.slice(0, 40);
                const imgUrl = topic.Icon?.URL ? (topic.Icon.URL.startsWith('http') ? topic.Icon.URL : `https://duckduckgo.com${topic.Icon.URL}`) : undefined;
                results.push({
                  title: titlePart,
                  url: topic.FirstURL,
                  snippet: topic.Text,
                  image: imgUrl,
                });
                if (imgUrl) images.push({ src: imgUrl, alt: titlePart });
              }
            });
          }
        }
      } catch {}

      // 2. Query Wikipedia API for rich multilingual encyclopedic search
      try {
        const wikiRes = await fetch(`https://es.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=8&namespace=0&format=json`);
        if (wikiRes.ok) {
          const wikiData = await wikiRes.json();
          const titles: string[] = wikiData[1] || [];
          const snippets: string[] = wikiData[2] || [];
          const urls: string[] = wikiData[3] || [];

          for (let i = 0; i < titles.length; i++) {
            if (!results.some((r) => r.url === urls[i])) {
              results.push({
                title: titles[i],
                url: urls[i],
                snippet: snippets[i] || `Artículo de Wikipedia sobre ${titles[i]}`,
              });
            }
          }
        }
      } catch {}

      // 3. Fallback / supplementary DuckDuckGo HTML scraping if sparse
      if (results.length < 3) {
        try {
          const htmlRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TermBrowser/2.4' },
          });
          if (htmlRes.ok) {
            const html = await htmlRes.text();
            const linkRegex = /<a\b[^>]*?class=["']result__url["'][^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
            const snippetRegex = /<a\b[^>]*?class=["']result__snippet["'][^>]*>([\s\S]*?)<\/a>/gi;
            const titleRegex = /<a\b[^>]*?class=["']result__title["'][^>]*>([\s\S]*?)<\/a>/gi;

            let m;
            while ((m = linkRegex.exec(html)) !== null && results.length < 10) {
              try {
                let actualUrl = m[1];
                if (actualUrl.includes('uddg=')) {
                  const uMatch = actualUrl.match(/uddg=([^&]+)/);
                  if (uMatch) actualUrl = decodeURIComponent(uMatch[1]);
                }
                const cleanText = m[2].replace(/<[^>]+>/g, '').trim();
                if (!results.some((r) => r.url === actualUrl) && actualUrl.startsWith('http')) {
                  results.push({
                    title: cleanText || actualUrl,
                    url: actualUrl,
                    snippet: `Resultado de la búsqueda web para: ${query}`,
                  });
                }
              } catch {}
            }
          }
        } catch {}
      }

      // If still empty, provide clean search engines destinations
      if (results.length === 0) {
        results.push(
          {
            title: `Buscar "${query}" en DuckDuckGo`,
            url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
            snippet: `Explorar resultados globales para "${query}" en DuckDuckGo.`,
          },
          {
            title: `Buscar "${query}" en Wikipedia`,
            url: `https://es.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`,
            snippet: `Consultar enciclopedia libre para "${query}".`,
          },
          {
            title: `Buscar "${query}" en Google`,
            url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            snippet: `Búsqueda estándar en Google para "${query}".`,
          }
        );
      }

      return res.json({
        query,
        count: results.length,
        results,
        images: images.slice(0, 8),
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Search failed', message: err.message });
    }
  });

  // Real DNS lookup endpoint
  app.get('/api/dns', async (req, res) => {
    const host = req.query.host as string;
    if (!host) {
      return res.status(400).json({ error: 'Missing host parameter' });
    }

    try {
      const cleanHost = host.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
      const startTime = Date.now();
      const lookupResult = await dns.lookup(cleanHost, { all: true });
      const latencyMs = Date.now() - startTime;

      let mxRecords: any[] = [];
      try {
        mxRecords = await dns.resolveMx(cleanHost);
      } catch {
        // Optional MX
      }

      return res.json({
        host: cleanHost,
        records: lookupResult,
        mx: mxRecords,
        latencyMs,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'DNS Lookup Failed',
        message: err.message,
      });
    }
  });

  // Real System Stats for MS-DOS HUD
  app.get('/api/system-stats', (req, res) => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpus = os.cpus();
    const loadAvg = os.loadavg();

    res.json({
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      uptimeSeconds: os.uptime(),
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usagePercentage: Math.round((usedMem / totalMem) * 100),
      },
      cpu: {
        model: cpus[0]?.model || 'Generic x86_64 Virtual Core',
        count: cpus.length,
        loadAvg,
      },
      timestamp: Date.now(),
    });
  });

  // Encrypted Cloud Vault Sync (AES-256 encrypted payload backup & restore)
  app.post('/api/vault/backup', (req, res) => {
    const { encryptedPayload, hash, mfaVerified } = req.body;
    if (!encryptedPayload || !hash) {
      return res.status(400).json({ error: 'Missing encryptedPayload or hash' });
    }

    cloudVault = {
      data: encryptedPayload,
      mfaEnabled: !!mfaVerified,
      updatedAt: new Date().toISOString(),
      hash,
    };

    res.json({
      success: true,
      message: 'Cloud vault backup synchronized successfully under AES-256 seal.',
      updatedAt: cloudVault.updatedAt,
      hash,
    });
  });

  app.get('/api/vault/restore', (req, res) => {
    if (!cloudVault) {
      return res.status(404).json({ error: 'No cloud vault backup found.' });
    }
    res.json(cloudVault);
  });

  // Local File System Access API (real workspace & local disk exploration)
  const WORKSPACE_ROOT = process.cwd();

  const resolveSafePath = (userPath: string = '') => {
    const clean = userPath.replace(/^[\/\\]+/, '');
    const resolved = path.resolve(WORKSPACE_ROOT, clean);
    if (!resolved.startsWith(WORKSPACE_ROOT)) {
      return WORKSPACE_ROOT;
    }
    return resolved;
  };

  app.get('/api/local-fs/list', async (req, res) => {
    try {
      const relDir = (req.query.dir as string) || '';
      const targetDir = resolveSafePath(relDir);
      const entries = await fs.readdir(targetDir, { withFileTypes: true });

      const items = await Promise.all(
        entries
          .filter((entry) => !['node_modules', '.git'].includes(entry.name))
          .map(async (entry) => {
            const fullItemPath = path.join(targetDir, entry.name);
            let size = 0;
            let mtime = new Date().toISOString();
            try {
              const stat = await fs.stat(fullItemPath);
              size = stat.size;
              mtime = stat.mtime.toISOString();
            } catch {}

            return {
              name: entry.name,
              isDirectory: entry.isDirectory(),
              size,
              updatedAt: mtime,
              path: path.relative(WORKSPACE_ROOT, fullItemPath),
              ext: path.extname(entry.name).toLowerCase(),
            };
          })
      );

      // Sort directories first, then alphabetical
      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      const currentRel = path.relative(WORKSPACE_ROOT, targetDir) || '.';
      const parentRel = currentRel === '.' ? null : path.dirname(currentRel);

      return res.json({
        root: WORKSPACE_ROOT,
        currentDir: currentRel,
        parentDir: parentRel,
        items,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to read directory', message: err.message });
    }
  });

  app.get('/api/local-fs/read', async (req, res) => {
    try {
      const relFile = req.query.file as string;
      if (!relFile) return res.status(400).json({ error: 'Missing file parameter' });
      const targetFile = resolveSafePath(relFile);
      const stat = await fs.stat(targetFile);
      if (stat.isDirectory()) {
        return res.status(400).json({ error: 'Path is a directory, not a file' });
      }

      const content = await fs.readFile(targetFile, 'utf-8');
      return res.json({
        path: path.relative(WORKSPACE_ROOT, targetFile),
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
        content,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to read file', message: err.message });
    }
  });

  app.post('/api/local-fs/write', async (req, res) => {
    try {
      const { file, content } = req.body;
      if (!file) return res.status(400).json({ error: 'Missing file path' });
      const targetFile = resolveSafePath(file);
      await fs.mkdir(path.dirname(targetFile), { recursive: true });
      await fs.writeFile(targetFile, content ?? '', 'utf-8');
      return res.json({
        success: true,
        path: path.relative(WORKSPACE_ROOT, targetFile),
        message: 'File written successfully to local filesystem.',
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to write file', message: err.message });
    }
  });

  app.post('/api/local-fs/mkdir', async (req, res) => {
    try {
      const { dir } = req.body;
      if (!dir) return res.status(400).json({ error: 'Missing directory path' });
      const targetDir = resolveSafePath(dir);
      await fs.mkdir(targetDir, { recursive: true });
      return res.json({
        success: true,
        path: path.relative(WORKSPACE_ROOT, targetDir),
        message: 'Directory created successfully.',
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to create directory', message: err.message });
    }
  });

  // Mount Vite middlewares for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production serve dist
    app.use(express.static('dist'));
  }

  const server = http.createServer(app);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[TermBrowser Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[TermBrowser Server] Fatal error:', err);
  process.exit(1);
});
