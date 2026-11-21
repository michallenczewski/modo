// Wersja przeglądarkowa do testów interfejsu: serwuje folder renderer/ pod http://localhost:8765
// Uruchom: npm run web  (bez instalowania czegokolwiek; zamiast mostu Electrona działa renderer/web-api.js)
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'renderer');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const port = +process.env.PORT || 8765;
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log('Modo w przeglądarce: http://localhost:' + port));
