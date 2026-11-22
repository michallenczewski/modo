// Prosty lekser JS: znajduje literały napisów ('', "", ``) z pozycjami, pomija komentarze i wyrażenia regularne.
// Szablon `...${...}...` jest zwracany jako jeden literał (części + zakresy wyrażeń); literały wewnątrz ${} — osobno.
export function lex(src) {
  const out = [];
  let i = 0, prev = '';   // prev: ostatni znaczący token (do rozróżnienia / dzielenia i regex)
  const isId = c => /[A-Za-z0-9_$\u0080-￿]/.test(c);
  const regexOK = () => prev === '' || /^[(,=:\[!&|?{};+\-*%<>~^]$/.test(prev) || /^(return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await|=>)$/.test(prev);
  function readString(q) {   // i wskazuje na cudzysłów
    const s = i; i++;
    while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
    i++;
    return { kind: 'str', start: s, end: i, text: src.slice(s, i) };
  }
  function readTemplate() {
    const s = i; i++;
    const parts = [], exprs = []; let ps = i;
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { parts.push(src.slice(ps, i)); i++; break; }
      if (c === '$' && src[i + 1] === '{') {
        parts.push(src.slice(ps, i)); i += 2; const es = i;
        scan(true); exprs.push([es, i]); i++; ps = i; continue;
      }
      i++;
    }
    return { kind: 'tpl', start: s, end: i, text: src.slice(s, i), parts, exprs };
  }
  // scan: do końca pliku albo do zamykającej klamry (w ${...})
  function scan(inExpr) {
    let depth = 0;
    while (i < src.length) {
      const c = src[i], d = src[i + 1];
      if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
      if (c === '\'' || c === '"') { const t = readString(c); t.prev = prev; out.push(t); prev = 'STR'; continue; }
      if (c === '`') { const save = prev; const t = readTemplate(); t.prev = save; out.push(t); prev = 'STR'; continue; }
      if (c === '/' && regexOK()) {
        i++; let cls = false;
        while (i < src.length) { const e = src[i]; if (e === '\\') { i += 2; continue; } if (e === '[') cls = true; else if (e === ']') cls = false; else if (e === '/' && !cls) break; else if (e === '\n') break; i++; }
        i++; while (isId(src[i] || '')) i++; prev = 'RE'; continue;
      }
      if (/\s/.test(c)) { i++; continue; }
      if (isId(c)) { const s = i; while (i < src.length && isId(src[i])) i++; prev = src.slice(s, i); continue; }
      if (c === '=' && d === '>') { prev = '=>'; i += 2; continue; }
      if (inExpr) { if (c === '{') depth++; else if (c === '}') { if (depth === 0) return; depth--; } }
      prev = c; i++;
    }
  }
  scan(false);
  return out;
}
export function cook(raw) { return Function('"use strict"; return (' + raw + ')')(); }
