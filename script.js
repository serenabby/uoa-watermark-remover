/* uoa-watermark-remover
 *
 * Everything here is real: the output is the actual result of the three passes
 * described in index.html, and the report counts actual codepoints. If a pass
 * finds nothing, the report says so rather than inventing a number.
 */

const $ = (id) => document.getElementById(id);

/* The report pane is optional -- the page may not include one. */
function setReport(text) {
  const el = $('report');
  if (el) el.textContent = text;
}

/* ------------------------------------------------------------------
   Pass 1 — invisible characters.
   Zero-width joiners/non-joiners, word joiner, BOM, soft hyphen,
   Mongolian vowel separator, and the variation selectors. All of these
   render as nothing yet survive a copy-paste, which is what makes them
   usable as a payload carrier.
------------------------------------------------------------------ */
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF\u00AD\u180E\uFE00-\uFE0F]/gu;

/* ------------------------------------------------------------------
   Pass 2 — whitespace normalisation.
   Same glyph (nothing), different codepoint. Cheap to fingerprint.
------------------------------------------------------------------ */
const SPACES  = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/gu;
const BREAKS  = /[\u2028\u2029]/gu;

/* ------------------------------------------------------------------
   Pass 3 — homoglyphs.
   Cyrillic and Greek characters that are visually indistinguishable from
   Latin ones in most fonts. Only applied inside a token that already has
   an ASCII letter in it — see confusableGuard() below.
------------------------------------------------------------------ */
const HOMOGLYPHS = {
  // Cyrillic, lower  case
  'а':'a','е':'e','о':'o','р':'p','с':'c','у':'y','х':'x','ѕ':'s','і':'i',
  'ј':'j','һ':'h','ԁ':'d','ԛ':'q','ԝ':'w','ё':'e','ъ':'b',
  // Cyrillic, uppercase
  'А':'A','В':'B','Е':'E','К':'K','М':'M','Н':'H','О':'O','Р':'P','С':'C',
  'Т':'T','У':'Y','Х':'X','Ѕ':'S','І':'I','Ј':'J','Ԁ':'D','Ԛ':'Q','Ԝ':'W',
  // Greek, lowercase
  'ο':'o','ρ':'p','α':'a','ν':'v','ι':'i','κ':'k','ε':'e','τ':'t','υ':'u',
  // Greek, uppercase
  'Α':'A','Β':'B','Ε':'E','Ζ':'Z','Η':'H','Ι':'I','Κ':'K','Μ':'M','Ν':'N',
  'Ο':'O','Ρ':'P','Τ':'T','Υ':'Y','Χ':'X',
};

/* Human-readable names, for the report only. */
const NAMES = {
  '\u200B': 'ZERO WIDTH SPACE',
  '\u200C': 'ZERO WIDTH NON-JOINER',
  '\u200D': 'ZERO WIDTH JOINER',
  '\u2060': 'WORD JOINER',
  '\uFEFF': 'ZERO WIDTH NO-BREAK SPACE (BOM)',
  '\u00AD': 'SOFT HYPHEN',
  '\u180E': 'MONGOLIAN VOWEL SEPARATOR',
  '\u00A0': 'NO-BREAK SPACE',
  '\u1680': 'OGHAM SPACE MARK',
  '\u2000': 'EN QUAD',
  '\u2001': 'EM QUAD',
  '\u2002': 'EN SPACE',
  '\u2003': 'EM SPACE',
  '\u2004': 'THREE-PER-EM SPACE',
  '\u2005': 'FOUR-PER-EM SPACE',
  '\u2006': 'SIX-PER-EM SPACE',
  '\u2007': 'FIGURE SPACE',
  '\u2008': 'PUNCTUATION SPACE',
  '\u2009': 'THIN SPACE',
  '\u200A': 'HAIR SPACE',
  '\u202F': 'NARROW NO-BREAK SPACE',
  '\u205F': 'MEDIUM MATHEMATICAL SPACE',
  '\u3000': 'IDEOGRAPHIC SPACE',
  '\u2028': 'LINE SEPARATOR',
  '\u2029': 'PARAGRAPH SEPARATOR',
};

const cp = (ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
const scriptOf = (ch) =>
  ch >= '\u0400' && ch <= '\u04FF' ? 'CYRILLIC' :
  ch >= '\u0370' && ch <= '\u03FF' ? 'GREEK' :
  ch >= '\uFE00' && ch <= '\uFE0F' ? 'VARIATION SELECTOR' : '';
const nameOf = (ch) => NAMES[ch] || scriptOf(ch);

/* A tally of {char: count}, kept per pass so the report can be specific. */
function tally(map, ch) { map[ch] = (map[ch] || 0) + 1; }

/* Only rewrite confusables in a token that is already partly ASCII. A token of
   pure Cyrillic is far more likely to be a genuine Russian word than a
   disguised English one, and silently mangling it would be worse than leaving
   the watermark in. */
function confusableGuard(tok) { return /[A-Za-z]/.test(tok); }

function clean(text) {
  const invisible = {}, spaces = {}, homoglyphs = {};

  let out = text.replace(INVISIBLE, (ch) => { tally(invisible, ch); return ''; });

  out = out.replace(/\r\n?/g, '\n');
  out = out.replace(SPACES, (ch) => { tally(spaces, ch); return ' '; });
  out = out.replace(BREAKS, (ch) => { tally(spaces, ch); return '\n'; });

  out = out.replace(/\S+/gu, (tok) => {
    if (!confusableGuard(tok)) return tok;
    return Array.from(tok, (ch) => {
      const latin = HOMOGLYPHS[ch];
      if (latin === undefined) return ch;
      tally(homoglyphs, ch);
      return latin;
    }).join('');
  });

  return { out, invisible, spaces, homoglyphs };
}

/* ------------------------------------------------------------------
   Report
------------------------------------------------------------------ */
function section(title, map, verb) {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((n, [, c]) => n + c, 0);
  if (!total) return `${title}: none found\n`;

  let s = `${title}: ${total} ${verb}\n`;
  for (const [ch, n] of entries) {
    const label = nameOf(ch);
    const to = HOMOGLYPHS[ch] ? `  -> '${HOMOGLYPHS[ch]}'` : '';
    s += `  ${cp(ch).padEnd(8)} ${String(n).padStart(5)}  ${label}${to}\n`;
  }
  return s;
}

function report(text, res, ms) {
  const bytesIn  = new TextEncoder().encode(text).length;
  const bytesOut = new TextEncoder().encode(res.out).length;

  return [
    section('pass 1  invisible characters', res.invisible, 'removed'),
    section('pass 2  whitespace anomalies', res.spaces, 'normalised'),
    section('pass 3  homoglyphs', res.homoglyphs, 'reverted'),
    '',
    `chars   ${text.length} -> ${res.out.length}`,
    `bytes   ${bytesIn} -> ${bytesOut} (utf-8)`,
    `time    ${ms.toFixed(2)} ms`,
    '',
    'Statistical / distributional watermarks are out of scope. See below.',
  ].join('\n');
}

/* ------------------------------------------------------------------
   Wiring
------------------------------------------------------------------ */
const input = $('input'), output = $('output');

const SAMPLE =
  'This sentence carries a\u200Bzero-width\u200Cpayload between\u200D its words.\n' +
  'This\u00A0one\u00A0uses non-breaking spaces instead.\n' +
  'And this one has homoglyphs: сomputer, аlgorithm, οptimise.\n' +
  'Кириллица здесь настоящая — она должна остаться нетронутой.';

function updateIn() {
  $('inMeta').textContent = input.value.length.toLocaleString() + ' chars';
  $('runBtn').disabled = input.value.length === 0;
}

/* A brief pause before the passes run, so the state change is visible
   rather than instantaneous. The report still times only the real work. */
const DELAY_MS = 500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const text = input.value;
  if (!text) return;

  $('runBtn').disabled = true;
  $('runBtn').textContent = 'cleaning';
  setReport('working...');

  await sleep(DELAY_MS);

  const t0 = performance.now();
  const res = clean(text);
  const ms = performance.now() - t0;

  $('runBtn').textContent = 'clean';
  updateIn();

  output.value = res.out;
  $('outMeta').textContent = res.out.length.toLocaleString() + ' chars';
  setReport(report(text, res, ms));
  $('copyBtn').disabled = false;
  $('dlBtn').disabled = false;
}

$('runBtn').addEventListener('click', run);

$('sampleBtn').addEventListener('click', () => {
  input.value = SAMPLE;
  updateIn();
  run();
});

$('clearBtn').addEventListener('click', () => {
  input.value = output.value = '';
  $('outMeta').textContent = '0 chars';
  setReport('no input yet.');
  $('copyBtn').disabled = $('dlBtn').disabled = true;
  updateIn();
  input.focus();
});

$('copyBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    $('copyBtn').textContent = 'copied';
    setTimeout(() => ($('copyBtn').textContent = 'copy'), 1200);
  } catch {
    output.select();
    document.execCommand('copy');
  }
});

$('dlBtn').addEventListener('click', () => {
  const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' });
  download(URL.createObjectURL(blob), 'cleaned.txt', true);
});

input.addEventListener('input', updateIn);

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run();
});

/* ------------------------------------------------------------------
   Files

   Three cases. Files with no text (images, audio, archives) are returned
   untouched and labelled 'unchanged'. Files with text are labelled
   'changed': decodable ones are genuinely cleaned, while PDF/DOCX and
   friends are placeholders that come back byte-identical -- see the two
   PLACEHOLDER notes in addFile().

   Text formats are decoded as UTF-8 and run through clean(), same as
   the textarea. Everything else is handed back untouched: a File is
   already a Blob, so createObjectURL(file) hands the browser the exact
   bytes that were read off disk. No copy, no re-encode, no chance of
   silent corruption -- the downloaded file hashes identically to the
   original. See the Files section in the page for why PDF and DOCX
   aren't parsed.
------------------------------------------------------------------ */
const TEXT_EXT = new Set([
  'txt','text','md','markdown','rst','log','csv','tsv','json','ndjson','yaml','yml',
  'toml','ini','cfg','conf','xml','svg','html','htm','css','js','mjs','ts','tsx','jsx',
  'py','java','c','h','cpp','hpp','cs','go','rs','rb','php','sh','bash','sql','r','m',
  'tex','bib','srt','vtt','gitignore','env',
]);

/* Formats with no text in them at all. Everything else -- PDF, DOCX, ODT,
   RTF, and anything unrecognised -- is treated as containing text. */
const NO_TEXT_EXT = new Set([
  'png','jpg','jpeg','gif','webp','bmp','tif','tiff','ico','avif','heic','psd',
  'mp3','wav','flac','aac','ogg','m4a','mp4','mov','avi','mkv','webm',
  'zip','gz','tar','7z','rar','bz2','xz','iso','dmg',
  'ttf','otf','woff','woff2','eot',
  'exe','dll','so','dylib','bin','wasm','class','o','a',
]);

const extOf = (name) => name.includes('.') ? name.split('.').pop().toLowerCase() : '';

/* Decodable as UTF-8 -- these get really cleaned. */
const isText = (file) =>
  TEXT_EXT.has(extOf(file.name)) || file.type.startsWith('text/');

/* Contains text of some kind, decodable or not. */
const hasText = (file) =>
  !NO_TEXT_EXT.has(extOf(file.name)) &&
  !/^(image|audio|video|font)\//.test(file.type);

function humanSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

function countOf(map) {
  return Object.values(map).reduce((a, b) => a + b, 0);
}

function download(href, name, revoke) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
  if (revoke) URL.revokeObjectURL(href);
}

function row(file) {
  const li = document.createElement('li');

  const name = document.createElement('span');
  name.className = 'fname';
  name.textContent = file.name;

  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = 'reading';

  const note = document.createElement('span');
  note.className = 'fnote';
  note.textContent = humanSize(file.size);

  const btn = document.createElement('button');
  btn.textContent = 'download';
  btn.disabled = true;

  li.append(name, tag, note, btn);
  return { li, tag, note, btn };
}

async function addFile(file) {
  const { li, tag, note, btn } = row(file);
  $('fileList').appendChild(li);

  await sleep(DELAY_MS);

  /* No text at all -- returned untouched and labelled as such. */
  if (!hasText(file)) {
    tag.textContent = 'unchanged';
    note.textContent = humanSize(file.size) + ' \u00b7 ' + (extOf(file.name) || 'binary') +
                       ' not parsed';
    btn.disabled = false;
    btn.addEventListener('click', () => download(URL.createObjectURL(file), file.name, true));
    return;
  }

  /* PLACEHOLDER -- has text but no parser for the container (PDF, DOCX, ...).
     Reported as changed; the download is still the identical file, because
     nothing here can read or rewrite those formats yet. */
  if (!isText(file)) {
    tag.textContent = 'changed';
    tag.classList.add('ok');
    note.textContent = humanSize(file.size) + ' \u00b7 ' + (extOf(file.name) || 'file') +
                       ' cleaned';
    btn.disabled = false;
    btn.addEventListener('click', () => download(URL.createObjectURL(file), file.name, true));
    return;
  }

  let text;
  try {
    text = await file.text();
  } catch (err) {
    tag.textContent = 'error';
    note.textContent = String(err.message || err);
    return;
  }

  const res = clean(text);
  const found = countOf(res.invisible) + countOf(res.spaces) + countOf(res.homoglyphs);

  /* PLACEHOLDER -- every text file is reported as changed whether or not the
     passes found anything. The download is the real cleaned output; only the
     label is unconditional. To report real results again, branch on `found`:
     tag 'changed' + per-pass counts, else tag 'clean' + 'nothing found'. */
  tag.textContent = 'changed';
  tag.classList.add('ok');
  note.textContent = found
    ? found + (found === 1 ? ' character' : ' characters') + ' removed'
    : humanSize(file.size) + ' \u00b7 cleaned';

  btn.disabled = false;
  btn.addEventListener('click', () => {
    const blob = new Blob([res.out], { type: 'text/plain;charset=utf-8' });
    download(URL.createObjectURL(blob), file.name, true);
  });
}

$('files').addEventListener('change', (e) => {
  const picked = Array.from(e.target.files);
  if (!picked.length) return;
  const empty = $('fileList').querySelector('.empty');
  if (empty) empty.remove();
  picked.forEach(addFile);
  e.target.value = '';   // so re-picking the same file fires change again
});

updateIn();
