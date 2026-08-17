/**
 * 개발용 정적 서버.
 * POST /__shot 으로 dataURL 을 받으면 shots/ 폴더에 이미지로 저장한다.
 * (제작 중 화면 확인용이며 시뮬레이션 자체와는 무관하다)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SHOTS = path.join(__dirname, 'shots');
const PORT = 8765;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

fs.mkdirSync(SHOTS, { recursive: true });

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/__shot')) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const name = new URL(req.url, 'http://x').searchParams.get('name') || 'shot';
      const m = /^data:image\/(\w+);base64,(.*)$/s.exec(body);
      if (!m) { res.writeHead(400); return res.end('bad dataURL'); }
      const file = path.join(SHOTS, `${name}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
      fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
      console.log('saved', file, Math.round(m[2].length / 1024) + 'KB');
      res.writeHead(200); res.end(file);
    });
    return;
  }

  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('dev server on http://localhost:' + PORT));
