// Położenie słońca dla daty, godziny i miejsca (uproszczony algorytm NOAA, dokładność ok. 0,5°).
// Godzina jest czasem lokalnym strefy podanej w ustawieniach (domyślnie Europe/Warsaw, z czasem letnim).

const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;

// przesunięcie strefy względem UTC (w godzinach) dla danego dnia, np. 1 zimą i 2 latem w Warszawie
export function tzOffset(dateStr, tz) {
  try {
    const d = new Date(dateStr + 'T12:00:00Z');
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
    const g = t => +parts.find(p => p.type === t).value;
    const local = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'));
    return Math.round((local - d.getTime()) / 60000) / 60;
  } catch (e) { return 1; }
}

// zwraca { alt, az } w stopniach; az liczony od północy zgodnie z ruchem wskazówek zegara
export function sunPosition(dateStr, hours, lat, lon, tz) {
  const off = tzOffset(dateStr, tz);
  const [Y, M, D] = dateStr.split('-').map(Number);
  const utcMs = Date.UTC(Y, M - 1, D) + (hours - off) * 3600000;
  const jd = utcMs / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const Mm = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(rad(Mm)) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(rad(2 * Mm)) * (0.019993 - 0.000101 * T) + Math.sin(rad(3 * Mm)) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const decl = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda))));
  const y = Math.tan(rad(eps / 2)) ** 2;
  const eqTime = 4 * deg(y * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(Mm)) + 4 * e * y * Math.sin(rad(Mm)) * Math.cos(2 * rad(L0)) - 0.5 * y * y * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(Mm)));
  const utcMin = ((utcMs / 60000) % 1440 + 1440) % 1440;
  const tst = (utcMin + eqTime + 4 * lon + 1440) % 1440;
  let ha = tst / 4 - 180;
  const zen = deg(Math.acos(Math.sin(rad(lat)) * Math.sin(rad(decl)) + Math.cos(rad(lat)) * Math.cos(rad(decl)) * Math.cos(rad(ha))));
  const alt = 90 - zen;
  let az = deg(Math.atan2(Math.sin(rad(ha)), Math.cos(rad(ha)) * Math.sin(rad(lat)) - Math.tan(rad(decl)) * Math.cos(rad(lat)))) + 180;
  return { alt, az: (az + 360) % 360 };
}

// kierunek DO słońca w układzie programu: X wschód, Y północ, Z w górę
export function sunVector(alt, az) {
  const a = rad(alt), z = rad(az);
  return [Math.sin(z) * Math.cos(a), Math.cos(z) * Math.cos(a), Math.sin(a)];
}

// wschód i zachód (godziny lokalne) — szukane krokami co minutę
export function sunRiseSet(dateStr, lat, lon, tz) {
  let rise = null, set = null, prev = sunPosition(dateStr, 0, lat, lon, tz).alt;
  for (let m = 1; m <= 1440; m++) {
    const a = sunPosition(dateStr, m / 60, lat, lon, tz).alt;
    if (prev < -0.833 && a >= -0.833 && rise === null) rise = m / 60;
    if (prev >= -0.833 && a < -0.833) set = m / 60;
    prev = a;
  }
  return { rise, set };
}

export const fmtHour = h => { const m = Math.round(h * 60); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
