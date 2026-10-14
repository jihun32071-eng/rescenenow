(function (root) {
  'use strict';

  const DAY = 86400000;
  const KST = 9 * 3600000;
  const pad = value => String(value).padStart(2, '0');

  function kstDate(time) {
    const date = new Date(time + KST);
    return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate());
  }

  function dayTime(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return NaN;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const time = Date.UTC(year, month - 1, day);
    const date = new Date(time);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? time - KST : NaN;
  }

  function instant(value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return dayTime(value);
    // An explicit zone prevents the device's local zone from changing a schedule.
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.exec(String(value || ''));
    if (!match || !Number.isFinite(dayTime(match[1])) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] || 0) > 59) return NaN;
    return Date.parse(value);
  }

  function koreanISO(time) {
    return new Date(time + KST).toISOString().replace(/\.\d{3}Z$/, '+09:00');
  }

  function clock(now) {
    const time = now instanceof Date ? now.getTime() : Number(now);
    return Number.isFinite(time) ? time : Date.now();
  }

  function inWindow(event, now, options) {
    const start = instant(event.start);
    if (!Number.isFinite(start)) return false;
    if (options && options.view === 'month' && /^\d{4}-(0[1-9]|1[0-2])$/.test(options.month || '')) {
      const from = dayTime(options.month + '-01');
      const [year, month] = options.month.split('-').map(Number);
      const through = Date.UTC(year, month, 1) - KST;
      const end = instant(event.end);
      return start < through && (start >= from || Number.isFinite(end) && end > from && end > start);
    }
    const today = dayTime(kstDate(now));
    // Include today and the next 90 Korean calendar dates.
    if (start >= today + 91 * DAY) return false;
    if (event.end) {
      const end = instant(event.end);
      if (Number.isFinite(end)) return end > start && (start >= today || end > now);
    }
    return start >= today;
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function decodeICS(value) {
    return String(value || '').replace(/\\([nN,;\\])/g, (_, escaped) => /[nN]/.test(escaped) ? '\n' : escaped);
  }

  function fingerprint(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    return (hash >>> 0).toString(16);
  }

  function property(line) {
    let quoted = false, colon = -1;
    for (let index = 0; index < line.length; index++) {
      if (line[index] === '"') quoted = !quoted;
      if (line[index] === ':' && !quoted) { colon = index; break; }
    }
    if (colon < 0) return null;
    const fields = line.slice(0, colon).split(/;(?=(?:[^"\n]*"[^"\n]*")*[^"\n]*$)/);
    const name = fields.shift().toUpperCase();
    const params = Object.create(null);
    fields.forEach(field => {
      const separator = field.indexOf('=');
      if (separator > 0) params[field.slice(0, separator).toUpperCase()] = field.slice(separator + 1).replace(/^"|"$/g, '');
    });
    return { name, params, value: line.slice(colon + 1) };
  }

  function readICS(raw) {
    const lines = String(raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    const entries = [];
    let current = null, depth = 0, zone = 'Asia/Seoul';
    lines.forEach(line => {
      const field = property(line);
      if (!field) return;
      if (field.name === 'BEGIN') {
        if (field.value.toUpperCase() === 'VEVENT' && !current) { current = Object.create(null); depth = 1; }
        else if (current) depth++;
        return;
      }
      if (field.name === 'END') {
        if (current && --depth === 0) { entries.push(current); current = null; }
        return;
      }
      if (current && depth === 1) current[field.name] = field;
      else if (!current && field.name === 'X-WR-TIMEZONE') zone = field.value;
    });
    return { entries, zone };
  }

  function icsTime(field, defaultZone) {
    if (!field) return null;
    const value = field.value.trim();
    if (String(field.params.VALUE || '').toUpperCase() === 'DATE' || /^\d{8}$/.test(value)) {
      const date = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
      if (!date) return null;
      const start = date[1] + '-' + date[2] + '-' + date[3];
      return Number.isFinite(dayTime(start)) ? { start, allDay: true } : null;
    }
    const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{4})?$/.exec(value);
    if (!match || !Number.isFinite(dayTime(match[1] + '-' + match[2] + '-' + match[3]))) return null;
    const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6]);
    if (hour > 23 || minute > 59 || second > 59) return null;
    let offset;
    if (match[7] === 'Z') offset = 'Z';
    else if (match[7]) offset = match[7].slice(0, 3) + ':' + match[7].slice(3);
    else {
      const zone = field.params.TZID || defaultZone || 'Asia/Seoul';
      if (zone === 'Asia/Seoul') offset = '+09:00';
      else if (/^(UTC|Etc\/UTC|Etc\/GMT|GMT)$/i.test(zone)) offset = 'Z';
      else return null; // Do not guess an unsupported time zone or DST offset.
    }
    const time = instant(match[1] + '-' + match[2] + '-' + match[3] + 'T' + match[4] + ':' + match[5] + ':' + match[6] + offset);
    return Number.isFinite(time) ? { start: koreanISO(time), allDay: false } : null;
  }

  function kind(label) {
    if (/방송|라디오|broadcast/i.test(label)) return 'broadcast';
    if (/발매|공개|release/i.test(label)) return 'release';
    return 'event';
  }

  function unique(entries) {
    const ids = new Set(), titles = new Set();
    const result = [];
    entries.forEach(entry => {
      // Two sessions can share a title and date. Their exact start time and
      // location distinguish them; a midnight timed event is not an all-day one.
      const slot = instant(entry.start) + ':' + String(entry.allDay === true);
      const idKey = entry.id + ':' + slot;
      const titleKey = titleKeyOf(entry.title) + ':' + slot + ':' + titleKeyOf(entry.location || '');
      if (ids.has(idKey) || titles.has(titleKey)) return;
      ids.add(idKey); titles.add(titleKey); result.push(entry);
    });
    return result.sort((a, b) => instant(a.start) - instant(b.start) || a.title.localeCompare(b.title, 'ko'));
  }

  function titleKeyOf(title) {
    return title.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function parseICS(raw, source, now, options) {
    source = source || {};
    now = clock(now === undefined ? Date.now() : now);
    const parsed = readICS(raw);
    const versions = new Map();
    parsed.entries.forEach(fields => {
      // Recurrence requires expansion, EXDATE and detached overrides. Exclude a
      // recurring master instead of presenting an incomplete guessed series.
      if (fields.RRULE || fields.RDATE) return;
      const start = icsTime(fields.DTSTART, parsed.zone);
      if (!start) return;
      const uid = text(fields.UID && fields.UID.value);
      const title = text(decodeICS(fields.SUMMARY && fields.SUMMARY.value));
      const id = uid || (source.key || 'calendar') + ':' + fingerprint(title + ':' + start.start);
      const recurrence = icsTime(fields['RECURRENCE-ID'], parsed.zone);
      const versionKey = id + ':' + (recurrence ? recurrence.start : start.start);
      const sequence = Number(fields.SEQUENCE && fields.SEQUENCE.value) || 0;
      const modified = icsTime(fields['LAST-MODIFIED'] || fields.DTSTAMP, parsed.zone);
      const revision = modified ? instant(modified.start) : 0;
      const old = versions.get(versionKey);
      if (old && (old.sequence > sequence || old.sequence === sequence && old.revision > revision)) return;
      const end = icsTime(fields.DTEND, parsed.zone);
      const status = text(fields.STATUS && fields.STATUS.value).toUpperCase();
      const url = text(decodeICS(fields.URL && fields.URL.value));
      const item = {
        id, title, start: start.start, allDay: start.allDay,
        kind: kind(decodeICS(fields.CATEGORIES && fields.CATEGORIES.value)),
        location: text(decodeICS(fields.LOCATION && fields.LOCATION.value)),
        sourceName: text(source.name), sourceUrl: /^https:\/\//i.test(url) ? url : text(source.webUrl),
        status: status === 'TENTATIVE' ? 'tentative' : 'confirmed',
        note: text(decodeICS(fields.DESCRIPTION && fields.DESCRIPTION.value))
      };
      if (end) item.end = end.start;
      versions.set(versionKey, { item, sequence, revision, cancelled: status === 'CANCELLED' });
    });
    return unique(Array.from(versions.values()).filter(version => !version.cancelled && version.item.title && inWindow(version.item, now, options)).map(version => version.item));
  }

  function normalizeCurated(entry, source) {
    if (!entry || !text(entry.title) || !Number.isFinite(instant(entry.start)) || /cancelled/i.test(entry.status || '')) return null;
    const result = {
      id: text(entry.id) || 'curated:' + fingerprint(entry.title + ':' + entry.start),
      title: text(entry.title), start: entry.start, allDay: entry.allDay === true || /^\d{4}-\d{2}-\d{2}$/.test(entry.start),
      kind: ['broadcast', 'event', 'release'].includes(entry.kind) ? entry.kind : 'event',
      location: text(entry.location), sourceName: text(entry.sourceName || source && source.name),
      sourceUrl: text(entry.sourceUrl || source && source.webUrl), status: text(entry.status) || 'confirmed', note: text(entry.note)
    };
    if (entry.end && Number.isFinite(instant(entry.end))) result.end = entry.end;
    if (entry.displayTime) result.displayTime = text(entry.displayTime);
    if (/^https:\/\//i.test(entry.verificationUrl || '')) result.verificationUrl = text(entry.verificationUrl);
    if (entry.verifiedAt) result.verifiedAt = text(entry.verifiedAt);
    return result;
  }

  function parseMnet(raw, source, now, options) {
    source = source || {};
    now = clock(now === undefined ? Date.now() : now);
    if (raw && raw.exposed === false) return [];
    const entries = Array.isArray(raw) ? raw : raw && Array.isArray(raw.events) ? raw.events : [];
    const result = entries.map(entry => {
      if (!entry || entry.cancelled === true || /cancelled|canceled/i.test(entry.status || '')) return null;
      const allDay = entry.allDay === true;
      const start = allDay ? entry.startAtAllDay : entry.startAt;
      if (!Number.isFinite(instant(start))) return null;
      const date = kstDate(instant(start));
      const id = text(entry.id);
      const label = text(entry.label && entry.label.name);
      let end = allDay ? entry.endAtAllDay : entry.endAt;
      if (allDay && Number.isFinite(dayTime(end))) {
        // Treat Mnet's optional date-only end as the final calendar date.
        // ICS DTEND is exclusive. A same-day pair must retain that whole day.
        end = kstDate(dayTime(end) + DAY);
      }
      const item = normalizeCurated({
        id, title: entry.title, start: allDay ? start : koreanISO(instant(start)), allDay,
        end,
        kind: kind(label), location: entry.location,
        sourceName: source.name,
        sourceUrl: id ? 'https://artist.mnetplus.world/main/stg/rescene-official/schedule/' + date.slice(0, 4) + '/' + date.slice(5, 7) + '?eventId=' + encodeURIComponent(id) : source.webUrl,
        status: /^tentative$/i.test(entry.status || '') ? 'tentative' : 'confirmed', note: ''
      });
      if (item && label) item.labelName = label;
      return item && inWindow(item, now, options) ? item : null;
    }).filter(Boolean);
    return unique(result);
  }

  function events(data, now, options) {
    data = data || {};
    now = clock(now === undefined ? Date.now() : now);
    const result = [];
    const knownIds = new Set();
    const mnetSources = [];
    (Array.isArray(data.calendars) ? data.calendars : []).forEach(source => {
      if (!source) return;
      const mnet = source.type === 'mnetplus' || source.raw;
      const items = mnet ? parseMnet(source.raw, source, now, options) : parseICS(source.ics, source, now, options);
      if (mnet) {
        mnetSources.push(source);
        const raw = source.raw;
        const entries = Array.isArray(raw) ? raw : raw && Array.isArray(raw.events) ? raw.events : [];
        entries.forEach(entry => { if (entry && entry.id) knownIds.add(String(entry.id)); });
      } else {
        readICS(source.ics).entries.forEach(fields => { if (fields.UID) knownIds.add(text(fields.UID.value)); });
      }
      result.push.apply(result, items);
    });
    const curated = data.curated && Array.isArray(data.curated.events) ? data.curated.events : [];
    curated.forEach(entry => {
      const item = normalizeCurated(entry);
      if (!item || !inWindow(item, now, options)) return;
      const date = kstDate(instant(item.start));
      const candidates = result.filter(event => titleKeyOf(event.title) === titleKeyOf(item.title) && kstDate(instant(event.start)) === date);
      const live = result.find(event => event.id === item.id) || candidates.find(event => instant(event.start) === instant(item.start) && event.allDay === item.allDay) || (candidates.length === 1 && (item.allDay || candidates[0].allDay) ? candidates[0] : null);
      if (live) {
        if (!live.location) live.location = item.location;
        live.note = item.note || live.note;
        if(item.displayTime)live.displayTime=item.displayTime;
        if(item.verificationUrl)live.verificationUrl=item.verificationUrl;
        if(item.verifiedAt)live.verifiedAt=item.verifiedAt;
        if(item.kind==='release'){live.kind='release';live.labelName='발매';}
      } else if (!knownIds.has(item.id)) {
        const mnetSeed = /^https:\/\/artist\.mnetplus\.world\/main\/stg\/rescene-official\/schedule(?:\/|\?|$)/i.test(item.sourceUrl);
        // A successful month's complete official list can remove a previously
        // seeded event. Failed months retain seeds so an outage is not a deletion.
        const removed = mnetSeed && mnetSources.some(source => {
          if (!source.raw) return false;
          const month = date.slice(0, 7);
          if (Array.isArray(source.raw.months) && source.raw.months.length) {
            const state = source.raw.months.find(state => state.month === month);
            return !!state && state.stale !== true && !state.error;
          }
          if (!source.checkedAt || source.stale) return false;
          if (Array.isArray(source.raw.monthErrors) && source.raw.monthErrors.some(state => state.month === month)) return false;
          const current = new Date(dayTime(kstDate(now)) + KST);
          const through = new Date(dayTime(kstDate(now)) + 90 * DAY + KST);
          const months = (through.getUTCFullYear() - current.getUTCFullYear()) * 12 + through.getUTCMonth() - current.getUTCMonth() + 1;
          return Array.from({ length: months }, (_, offset) => offset).some(offset => {
            const date = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + offset, 1));
            return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) === month;
          });
        });
        if (!removed) result.push(item);
      }
    });
    // Calendar/API entries are first so their latest version wins over seeds.
    return unique(result);
  }

  const api = { events, parseICS, parseMnet };
  root.ScheduleUtils = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
