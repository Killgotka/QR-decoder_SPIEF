/**
 * timezone-module.js
 *
 * Выбор и хранение UTC-смещения сервера в localStorage.
 * Решает проблему: сервер в одном timezone, клиент в другом —
 * даты нужно показывать в timezone сервера, а не браузера.
 *
 * Зависимости: нет (ванильный JS, localStorage)
 *
 * ─────────────────────────────────────────────────────────────────
 * ПОДКЛЮЧЕНИЕ
 * ─────────────────────────────────────────────────────────────────
 *
 * HTML (добавить в <header> и перед </body>):
 *
 *   <!-- индикатор + кнопка в шапке -->
 *   <span id="tz-indicator">UTC?</span>
 *   <button id="btn-settings">⚙</button>
 *
 *   <!-- модал -->
 *   <div id="settings-modal" style="display:none">
 *     <div class="modal-sheet">
 *       <div class="modal-header">
 *         <span>Часовой пояс сервера</span>
 *         <button id="btn-settings-close">✕</button>
 *       </div>
 *       <p class="modal-desc">Выберите timezone сервера. Сохраняется автоматически.</p>
 *       <ul id="tz-list"></ul>
 *     </div>
 *   </div>
 *
 * JS (в конце страницы или в DOMContentLoaded):
 *
 *   initTimezone();
 *
 * Использование offset при отображении дат:
 *
 *   const tz = getTzOffset() ?? 0;
 *   element.textContent = fmt(someDate, tz);
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

// ─── Конфигурация ─────────────────────────────────────────────────

const TIMEZONE_KEY = 'app_tz_offset'; // ключ в localStorage

/** Список часовых поясов в UI. Замени на нужные тебе. */
const TIMEZONES = [
  { label: 'UTC+0 — Лондон',        offset: 0  },
  { label: 'UTC+1 — Берлин',        offset: 1  },
  { label: 'UTC+2 — Калининград',   offset: 2  },
  { label: 'UTC+3 — Москва',        offset: 3  },
  { label: 'UTC+4 — Самара',        offset: 4  },
  { label: 'UTC+5 — Екатеринбург',  offset: 5  },
  { label: 'UTC+6 — Омск',          offset: 6  },
  { label: 'UTC+7 — Красноярск',    offset: 7  },
  { label: 'UTC+8 — Иркутск',       offset: 8  },
  { label: 'UTC+9 — Якутск / Чита', offset: 9  },
  { label: 'UTC+10 — Владивосток',  offset: 10 },
  { label: 'UTC+11 — Магадан',      offset: 11 },
  { label: 'UTC+12 — Камчатка',     offset: 12 },
];

// ─── Хранилище ────────────────────────────────────────────────────

/** Возвращает сохранённый UTC-offset в часах, или null если не задан. */
function getTzOffset() {
  const v = localStorage.getItem(TIMEZONE_KEY);
  return v !== null ? parseInt(v, 10) : null;
}

function saveTzOffset(offset) {
  localStorage.setItem(TIMEZONE_KEY, String(offset));
}

// ─── Форматирование ───────────────────────────────────────────────

/**
 * Форматирует Date в строку DD.MM.YYYY, HH:MM в нужном UTC-offset.
 *
 * @param {Date}   date      - дата для отображения
 * @param {number} tzOffset  - смещение от UTC в часах (например 9 для UTC+9)
 * @returns {string}         - строка вида "31.05.2026, 12:00"
 *
 * Почему не getHours()?
 *   getHours() возвращает час в LOCAL timezone браузера.
 *   Мы сдвигаем timestamp на нужный offset и читаем UTC-поля —
 *   так результат одинаков в любом браузере в любом timezone.
 */
function fmt(date, tzOffset = 0) {
  const p = n => String(n).padStart(2, '0');
  const shifted = new Date(date.getTime() + tzOffset * 3_600_000);
  return (
    `${p(shifted.getUTCDate())}.${p(shifted.getUTCMonth() + 1)}.${shifted.getUTCFullYear()}, ` +
    `${p(shifted.getUTCHours())}:${p(shifted.getUTCMinutes())}`
  );
}

// ─── UI ───────────────────────────────────────────────────────────

/** Обновляет чип "UTC+N" в header. */
function updateTzIndicator() {
  const el = document.getElementById('tz-indicator');
  if (!el) return;
  const tz = getTzOffset();
  el.textContent = tz !== null ? `UTC+${tz}` : 'UTC?';
}

/** Строит список timezone в модале и вешает обработчики. */
function buildTzList() {
  const list    = document.getElementById('tz-list');
  const current = getTzOffset();

  list.innerHTML = TIMEZONES.map(tz => `
    <li class="tz-item${tz.offset === current ? ' active' : ''}" data-offset="${tz.offset}">
      <span>${tz.label}</span>
      ${tz.offset === current
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
        : ''}
    </li>
  `).join('');

  list.querySelectorAll('.tz-item').forEach(item => {
    item.addEventListener('click', () => {
      saveTzOffset(parseInt(item.dataset.offset, 10));
      updateTzIndicator();
      closeSettings();
    });
  });
}

function openSettings() {
  buildTzList();
  document.getElementById('settings-modal').style.display = 'flex';
}

function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}

// ─── Инициализация ────────────────────────────────────────────────

/**
 * Вызови один раз после DOMContentLoaded.
 * Если timezone ещё не задан — автоматически открывает модал.
 */
function initTimezone() {
  // кнопка открытия настроек
  document.getElementById('btn-settings')
    ?.addEventListener('click', openSettings);

  // кнопка закрытия
  document.getElementById('btn-settings-close')
    ?.addEventListener('click', closeSettings);

  // клик на затемнение — закрыть
  document.getElementById('settings-modal')
    ?.addEventListener('click', e => {
      if (e.target === document.getElementById('settings-modal')) closeSettings();
    });

  updateTzIndicator();

  // первый запуск — показать сразу
  if (getTzOffset() === null) openSettings();
}
