const fs = require('fs');
const path = require('path');
const https = require('https');

const FONT_DIR = path.join(__dirname, '../assets/fonts');
const FONT_PATH = path.join(FONT_DIR, 'NotoSansJP-Regular.otf');

// Noto Sans CJK JP (open source, full Japanese support)
const FONT_URL = 'https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf';

async function ensureJapaneseFont() {
  if (fs.existsSync(FONT_PATH)) return FONT_PATH;
  if (!fs.existsSync(FONT_DIR)) fs.mkdirSync(FONT_DIR, { recursive: true });

  console.log('Downloading Japanese font (first run)...');
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(FONT_PATH);
    const handle = (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        https.get(response.headers.location, handle).on('error', reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(FONT_PATH); });
    };
    https.get(FONT_URL, handle).on('error', (err) => {
      fs.unlink(FONT_PATH, () => {});
      reject(err);
    });
  });
}

function getFontPath() {
  return fs.existsSync(FONT_PATH) ? FONT_PATH : null;
}

module.exports = { ensureJapaneseFont, getFontPath };
