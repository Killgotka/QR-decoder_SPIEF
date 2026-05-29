'use strict';

const SALT = 'spief-2026';
const SESSION_MIN = 25;

// ── Decode (mirrors QRValidator.cs) ──────────────────────────────
function decode(qrText) {
  let text = qrText.trim().replace(/-/g, '+').replace(/_/g, '/');
  const pad = text.length % 4;
  if (pad > 0) text += '='.repeat(4 - pad);

  let xored;
  try {
    const bin = atob(text);
    xored = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) xored[i] = bin.charCodeAt(i);
  } catch {
    throw new Error('bad_base64');
  }

  const raw = new Uint8Array(xored.length);
  for (let i = 0; i < xored.length; i++) {
    raw[i] = (xored[i] ^ (i * 7 + 13)) & 0xff;
  }

  const parts = new TextDecoder().decode(raw).split('|');
  if (parts.length !== 4 || parts[3] !== SALT) throw new Error('bad_signature');

  const capsuleId   = parseInt(parts[0]);
  const isExtension = parts[1] === '1';
  const unixTs      = parseInt(parts[2]);
  const startTime   = new Date(unixTs * 1000);

  if (isNaN(capsuleId) || isNaN(startTime.getTime())) throw new Error('bad_data');
  return { capsuleId, isExtension, startTime, unixTs };
}

// ── Format helpers ────────────────────────────────────────────────
// QR-коды генерируются сервером в Чите (UTC+9).
// Отображаем время в том же смещении, чтобы показывать
// «серверное» время вне зависимости от часового пояса клиента.
const SERVER_UTC_OFFSET = 9;

function fmt(d) {
  const p = n => String(n).padStart(2, '0');
  const shifted = new Date(d.getTime() + SERVER_UTC_OFFSET * 3_600_000);
  return `${p(shifted.getUTCDate())}.${p(shifted.getUTCMonth()+1)}.${shifted.getUTCFullYear()}, ${p(shifted.getUTCHours())}:${p(shifted.getUTCMinutes())}`;
}

function fmtRemaining(ms) {
  if (ms <= 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m} мин ${s} сек` : `${s} сек`;
}

// ── Show result ───────────────────────────────────────────────────
let remainingTimer = null;

function showResult(qrText) {
  let data;
  try {
    data = decode(qrText);
  } catch {
    toast('QR-код не распознан или недействителен');
    return;
  }

  const { capsuleId, isExtension, startTime, unixTs } = data;
  const endTime = new Date(startTime.getTime() + SESSION_MIN * 60000);
  const now     = new Date();

  const banner      = document.getElementById('status-banner');
  const icon        = document.getElementById('status-icon');
  const text        = document.getElementById('status-text');
  const sub         = document.getElementById('status-sub');
  const progressWrap = document.getElementById('session-progress');
  const progressBar  = document.getElementById('session-progress-bar');

  banner.className = 'status-banner';
  clearInterval(remainingTimer);
  progressWrap.style.display = 'none';

  if (now < startTime) {
    banner.classList.add('pending');
    icon.textContent = '⏳';
    text.textContent = 'Ещё не началась';
    const diff = startTime - now;
    sub.textContent = `Начало через ${fmtRemaining(diff) || 'менее минуты'}`;

  } else if (now <= endTime) {
    banner.classList.add('active');
    icon.textContent = '✅';
    text.textContent = 'Сессия активна';

    const totalMs = SESSION_MIN * 60000;
    progressWrap.style.display = 'block';

    const updateActive = () => {
      const rem = endTime - new Date();
      if (rem <= 0) {
        sub.textContent = 'Истекает…';
        progressBar.style.width = '0%';
        progressBar.className = 'session-progress-bar bar-red';
        return;
      }
      sub.textContent = `Осталось: ${fmtRemaining(rem)}`;
      const pct = Math.max(0, (rem / totalMs) * 100);
      progressBar.style.width = `${pct}%`;
      progressBar.className = 'session-progress-bar' +
        (pct > 60 ? '' : pct > 30 ? ' bar-amber' : ' bar-red');
    };
    updateActive();
    remainingTimer = setInterval(updateActive, 1000);

  } else {
    banner.classList.add('expired');
    icon.textContent = '❌';
    text.textContent = 'Сессия истекла';
    const ago = Math.floor((now - endTime) / 60000);
    sub.textContent = ago < 1 ? 'Менее минуты назад' : `${ago} мин назад`;
  }

  // Info
  document.getElementById('r-capsule').textContent = `№ ${capsuleId}`;
  document.getElementById('r-start').textContent   = fmt(startTime);
  document.getElementById('r-end').textContent     = fmt(endTime);
  document.getElementById('r-ext-row').style.display = isExtension ? 'flex' : 'none';

  // Debug (hidden by default; reset toggle state)
  const tzOff  = -new Date().getTimezoneOffset();
  const tzSign = tzOff >= 0 ? '+' : '-';
  const tzH    = String(Math.floor(Math.abs(tzOff) / 60)).padStart(2, '0');
  const tzM    = String(Math.abs(tzOff) % 60).padStart(2, '0');
  document.getElementById('r-debug').textContent =
    `UTC${tzSign}${tzH}:${tzM} · ${new Date(unixTs * 1000).toISOString().slice(0, 16).replace('T', ' ')}`;
  document.getElementById('debug-row').style.display = 'none';
  document.getElementById('debug-toggle-label').textContent = 'Тех. информация';

  showScreen('result');
  if (navigator.vibrate) navigator.vibrate(60);
}

// ── Screen switching ──────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
}

// ── QR detection ──────────────────────────────────────────────────
let barcodeDetector = null;
(async () => {
  if ('BarcodeDetector' in window) {
    try {
      const fmts = await BarcodeDetector.getSupportedFormats();
      if (fmts.includes('qr_code'))
        barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
    } catch {}
  }
})();

const _c  = document.createElement('canvas');
const _cx = _c.getContext('2d', { willReadFrequently: true });

async function detectQR(source) {
  if (barcodeDetector) {
    try {
      const codes = await barcodeDetector.detect(source);
      if (codes.length) return codes[0].rawValue;
    } catch {}
  }
  const w = source.videoWidth  || source.naturalWidth  || source.width  || 0;
  const h = source.videoHeight || source.naturalHeight || source.height || 0;
  if (!w || !h) return null;
  const scale = Math.min(1, 640 / Math.max(w, h));
  _c.width  = Math.round(w * scale);
  _c.height = Math.round(h * scale);
  _cx.drawImage(source, 0, 0, _c.width, _c.height);
  const img = _cx.getImageData(0, 0, _c.width, _c.height);
  const res = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return res ? res.data : null;
}

// ── Camera ────────────────────────────────────────────────────────
let stream = null;
let ticker = null;

function stopCamera() {
  clearInterval(ticker); ticker = null;
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  document.getElementById('scan-video').srcObject = null;
  document.getElementById('scan-active').style.display = 'none';
  document.getElementById('scan-idle').style.display   = 'flex';
}

async function startCamera() {
  document.getElementById('scan-idle').style.display   = 'none';
  document.getElementById('scan-active').style.display = 'block';
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false,
    });
  } catch {
    stopCamera();
    toast('Нет доступа к камере — попробуйте «Выбрать фото»');
    return;
  }
  const video = document.getElementById('scan-video');
  video.srcObject = stream;
  try { await video.play(); } catch {}

  ticker = setInterval(async () => {
    if (video.readyState < video.HAVE_ENOUGH_DATA) return;
    const text = await detectQR(video);
    if (text) { stopCamera(); showResult(text); }
  }, 300);
}

// ── Photo ─────────────────────────────────────────────────────────
document.getElementById('btn-open-photo').addEventListener('click', () =>
  document.getElementById('photo-input').click()
);

document.getElementById('photo-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  const overlay = document.getElementById('photo-loading');
  overlay.style.display = 'flex';

  const img = new Image();
  img.src = URL.createObjectURL(file);
  await new Promise(r => { img.onload = r; });
  URL.revokeObjectURL(img.src);
  const text = await detectQR(img);

  overlay.style.display = 'none';

  if (text) showResult(text);
  else toast('QR-код не найден на фото');
});

// ── Buttons ───────────────────────────────────────────────────────
document.getElementById('btn-open-camera').addEventListener('click', startCamera);
document.getElementById('btn-stop').addEventListener('click', stopCamera);

document.getElementById('btn-scan-again').addEventListener('click', () => {
  clearInterval(remainingTimer);
  showScreen('scan');
  startCamera();
});

document.getElementById('btn-back-idle').addEventListener('click', () => {
  clearInterval(remainingTimer);
  showScreen('scan');
});

document.getElementById('debug-toggle').addEventListener('click', () => {
  const row    = document.getElementById('debug-row');
  const label  = document.getElementById('debug-toggle-label');
  const hidden = row.style.display === 'none';
  row.style.display = hidden ? 'flex' : 'none';
  label.textContent = hidden ? 'Скрыть' : 'Тех. информация';
});

// ── Toast ─────────────────────────────────────────────────────────
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}
