const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 10000;

// هدرهایی که نباید فوروارد بشن
const EXCLUDED = new Set([
  "host","connection","keep-alive","proxy-authenticate","proxy-authorization",
  "te","trailer","transfer-encoding","upgrade","forwarded","x-forwarded-host",
  "x-forwarded-proto","x-forwarded-port","x-host","cf-connecting-ip","cf-ray"
]);

const server = http.createServer((req, res) => {
  try {
    const targetHost = req.headers['x-host'];
    if (!targetHost) { res.writeHead(404); res.end('Not Found'); return; }

    let protocol = 'https://';
    let cleanHost = targetHost;
    if (targetHost.startsWith('http://')) { protocol = 'http://'; cleanHost = targetHost.replace('http://', ''); }
    else if (targetHost.startsWith('https://')) { cleanHost = targetHost.replace('https://', ''); }
    else if (targetHost.includes(':') && !targetHost.includes(':443') && !/^s\d+\./.test(targetHost)) { protocol = 'http://'; }

    const finalUrl = new URL(req.url, protocol + cleanHost);

    const proxyHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      if (EXCLUDED.has(lower) || lower.startsWith('x-nf-') || lower.startsWith('x-netlify-')) continue;
      proxyHeaders[key] = value;
    }
    if (req.headers['x-forwarded-for']) proxyHeaders['x-forwarded-for'] = req.headers['x-forwarded-for'];

    const proxyReq = (protocol === 'https:' ? https : http).request(finalUrl, {
      method: req.method,
      headers: proxyHeaders,
      rejectUnauthorized: false
    }, (proxyRes) => {
      const resHeaders = { ...proxyRes.headers };
      delete resHeaders['transfer-encoding'];
      delete resHeaders['content-encoding'];
      res.writeHead(proxyRes.statusCode, proxyRes.statusMessage, resHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', () => { res.writeHead(500); res.end('Error'); });

    if (req.method !== 'GET' && req.method !== 'HEAD') req.pipe(proxyReq);
    else proxyReq.end();

  } catch (e) { res.writeHead(500); res.end('Error'); }
});

server.listen(PORT, () => console.log('Relay on', PORT));
