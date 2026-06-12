#!/usr/bin/env node
// Audits Rhema's word-level data for trust/premium polish.
//
// This is intentionally read-only. It scans the shipped Greek text, lexicon,
// and deep-lexicon shards, then writes a small report of places where Rhema's
// displayed meaning is likely to feel wrong, weak, or unsupported.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'quality');
const OUT_JSON = path.join(OUT_DIR, 'rhema-quality-report.json');
const OUT_MD = path.join(OUT_DIR, 'rhema-quality-report.md');

const BOOKS = [
  'MAT','MAR','LUK','JOH','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH',
  '1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV'
];

const BOOK_NAMES = {
  MAT:'Matthew', MAR:'Mark', LUK:'Luke', JOH:'John', ACT:'Acts', ROM:'Romans',
  '1CO':'1 Corinthians', '2CO':'2 Corinthians', GAL:'Galatians', EPH:'Ephesians',
  PHP:'Philippians', COL:'Colossians', '1TH':'1 Thessalonians', '2TH':'2 Thessalonians',
  '1TI':'1 Timothy', '2TI':'2 Timothy', TIT:'Titus', PHM:'Philemon', HEB:'Hebrews',
  JAS:'James', '1PE':'1 Peter', '2PE':'2 Peter', '1JN':'1 John', '2JN':'2 John',
  '3JN':'3 John', JUD:'Jude', REV:'Revelation'
};

const TEXT_DATASETS = [
  { name: 'Majority', global: 'RhemaNT', file: 'rhema-nt.js' },
  { name: 'Critical', global: 'RhemaCriticalNT', file: 'rhema-critical.js' },
];

let generatedCriticalFallbacks = {};

const ISSUE_SEVERITY = {
  missingStrongs: 'high',
  missingLexicon: 'high',
  impossibleEnglish: 'high',
  displayArtifact: 'high',
  suspectReceipt: 'medium',
  weakDeepEvidence: 'medium',
  lowConfidence: 'medium',
  properNameCase: 'medium',
  functionWordDefinition: 'medium',
  broadDefinition: 'low',
};

const GREEK_FALLBACK_STRONGS = {
  συνιστανειν: '4921',
  μωυσεωσ: '3475',
  μωυσησ: '3475',
  καλυμμα: '2571',
  μεταμορφουμεθα: '3339',
  εινεκεν: '1752',
};

const CONTEXTUAL_2CO3 = {
  757: 'I begin',
  4921: 'I commend, recommend',
  4956: 'recommendation',
  1992: 'letter',
  2316: 'God',
  3475: 'Moses',
  5547: 'Christ',
  4151: 'Spirit',
  2962: 'Lord',
};

const DISPLAY_ARTIFACTS = new Set([
  'a','an','the','and','or','but','for','of','to','in','on','at','by','with','from',
  'any','some',
]);

const RAW_ALIGNMENT_ARTIFACTS = new Set([
  ...DISPLAY_ARTIFACTS,
  'one','people','things','someone','something','it','this','that',
]);

const GLOSS_STOPWORDS = new Set([
  'a','an','the','and','or','but','for','of','to','in','on','at','by','with','from',
  'as','if','that','this','it','is','are','was','were','be','been','being','not',
]);

function loadWindowGlobals(files) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  }
  return sandbox.window;
}

function stripGreek(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/\u0345/g, '\u03b9')
    .replace(/[\u0300-\u0344\u0346-\u036f]/g, '')
    .replace(/\u03c2/g, '\u03c3');
}

function greekKey(surface = '') {
  return stripGreek(surface).toLowerCase().replace(/[^\u03b1-\u03c9]/g, '');
}

function plain(value = '') {
  return String(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function firstGloss(value = '') {
  return plain(value)
    .replace(/^--\s*/, '')
    .replace(/^[xX]\s+/, '')
    .split(/[;,]/)[0]
    .trim();
}

function readableDefinition(value = '') {
  let text = firstGloss(value)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(i\.e\.|e\.g\.|figuratively|literally|properly|by implication|specially)\b[:,;]?\s*/gi, '')
    .replace(/^I\s+am\b/i, 'to be')
    .replace(/^I\s+am\s+/i, 'to be ')
    .replace(/^I\s+/i, 'to ')
    .replace(/^am\s+/i, 'to be ')
    .replace(/^is\s+/i, 'to be ')
    .replace(/^are\s+/i, 'to be ')
    .replace(/^be\s+/i, 'to be ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function compactDefinition(value = '') {
  let text = readableDefinition(value);
  if (!text) return '';
  if (/^the basic verb "?to be"?/i.test(text)) return 'to be, exist, or be present';
  text = text
    .replace(/\s+(?:--|-|–|—)\s+.*$/, '')
    .replace(/\s*\bused to\b.*$/i, '')
    .replace(/\s*\bdepending on context\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const commaParts = text.split(/\s*,\s*/).filter(Boolean);
  if (text.split(/\s+/).length > 9 && commaParts.length > 1) text = commaParts.slice(0, 3).join(', ');
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 12) text = words.slice(0, 12).join(' ');
  return text.replace(/[;,.]\s*$/, '').trim();
}

function isContentMorph(morph = '') {
  const pos = String(morph).split('-')[0];
  return !['', 'T', 'ADV', 'CONJ', 'COND', 'PRT', 'PART', 'PREP'].includes(pos);
}

function isMeaningBearingMorph(morph = '') {
  return ['V', 'N', 'A', 'D', 'R', 'I', 'X', 'F'].includes(String(morph).split('-')[0]);
}

function isCoreLexicalMorph(morph = '') {
  return ['V', 'N', 'A', 'F'].includes(String(morph).split('-')[0]);
}

function resolveWord(word, book, chapter) {
  if (!Array.isArray(word)) return word;
  if (word[1]) return word;
  const key = greekKey(word[0]);
  const fallback = GREEK_FALLBACK_STRONGS[key] || generatedCriticalFallbacks[key];
  return fallback ? [word[0], fallback, word[2] || '', word[3] || ''] : word;
}

function contextualBrief(word, book, chapter) {
  const strongs = Number(word?.[1]);
  const morph = String(word?.[2] || '');
  const key = greekKey(word?.[0] || '');
  if (strongs === 757 && morph.startsWith('V-') && morph[3] === 'M' && key.startsWith('αρχ')) return 'I begin';
  if (book === '2CO' && String(chapter) === '3') return CONTEXTUAL_2CO3[strongs] || '';
  return '';
}

function verbBase(brief = '') {
  return firstGloss(brief).replace(/^I\s+/i, '').replace(/^am\b/i, 'be').trim();
}

function roughGloss(word, lex, book, chapter) {
  const patchedBrief = contextualBrief(word, book, chapter) || lex?.brief || '';
  const morph = String(word?.[2] || '');
  const pos = morph.split('-')[0];
  if (pos === 'V') {
    const form = (morph.split('-')[1] || '').replace(/^2/, '');
    const pn = (morph.split('-')[2] || '').match(/^([123])([SP])/);
    const base = verbBase(patchedBrief);
    if (!base) return '';
    if (form.slice(2) === 'N') return `to ${base}`;
    if (form.slice(2) === 'P') {
      if (form[1] === 'P') return form[0] === 'P' ? `being ${passiveParticiple(base)}` : passiveParticiple(base);
      return `${base}ing`.replace(/eing$/, 'ing');
    }
    if (!pn) return base;
    const subj = { '1S':'I','2S':'you','3S':'he/she','1P':'we','2P':'you all','3P':'they' }[pn[1] + pn[2]] || '';
    if (base === 'be') {
      return `${subj} ${({ '1S':'am','2S':'are','3S':'is','1P':'are','2P':'are','3P':'are' }[pn[1] + pn[2]] || 'are')}`;
    }
    const finite = pn[1] === '3' && pn[2] === 'S' ? thirdSingular(base) : base;
    return `${subj} ${finite}`.trim();
  }
  if (lex?._rhemaPronounGloss) return lex._rhemaPronounGloss;
  const base = firstGloss(patchedBrief);
  if (!base) return '';
  if (pos === 'N') {
    const clean = base.replace(/^(?:a |an |the )/i, '');
    const cng = morph.split('-')[1] || '';
    return cng[1] === 'P' ? plural(clean) : clean;
  }
  return base;
}

function thirdSingular(base = '') {
  const words = base.split(' ');
  const first = words[0] || '';
  if (!first) return base;
  if (/have$/i.test(first)) words[0] = first.replace(/have$/i, 'has');
  else if (/be$/i.test(first)) words[0] = first.replace(/be$/i, 'is');
  else if (/(s|sh|ch|x|z)$/i.test(first)) words[0] = `${first}es`;
  else if (/[^aeiou]y$/i.test(first)) words[0] = `${first.slice(0, -1)}ies`;
  else words[0] = `${first}s`;
  return words.join(' ');
}

function passiveParticiple(base = '') {
  const map = {
    'come to know': 'known',
    'make clear': 'made clear',
    'write': 'written',
    'read': 'read',
    'serve': 'served',
    'transform': 'transformed',
  };
  return map[base] || base.replace(/e$/, '') + 'ed';
}

function deepClean(value = '') {
  return plain(value).replace(/\s+/g, ' ').trim();
}

function looksLikeAlignmentArtifact(value = '') {
  const clean = deepClean(value).toLowerCase();
  if (!clean) return false;
  if (RAW_ALIGNMENT_ARTIFACTS.has(clean)) return true;
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return GLOSS_STOPWORDS.has(clean);
  const meaningful = words.filter(w => !RAW_ALIGNMENT_ARTIFACTS.has(w) && !GLOSS_STOPWORDS.has(w));
  return meaningful.length === 0;
}

function looksLikeDisplayArtifact(value = '') {
  const clean = deepClean(value).toLowerCase();
  if (!clean) return false;
  return DISPLAY_ARTIFACTS.has(clean);
}

function deepSenseMeaning(entry = {}, sense = null, senseIndex = 0) {
  const labels = entry.prose?.senseLabels || [];
  const label = deepClean(labels[senseIndex] || '');
  if (label) return { text: label, source: 'lexicon-backed sense', raw: sense?.display || '' };

  const raw = deepClean(sense?.display || '');
  if (raw && !looksLikeAlignmentArtifact(raw)) return { text: raw, source: 'measured rendering', raw };

  const def = deepClean(entry.prose?.def || '');
  if (def) return { text: def, source: 'plain-English lexicon definition', raw };
  return { text: raw, source: 'measured rendering', raw };
}

function deepDefinitionSummary(entry = {}, ref = '') {
  const senses = entry.senses || [];
  const idx = ref && entry.verseSense && ref in entry.verseSense ? entry.verseSense[ref] : 0;
  const sense = senses[idx];
  const meaning = sense ? deepSenseMeaning(entry, sense, idx) : {
    text: deepClean(entry.prose?.def || ''),
    source: 'plain-English lexicon definition',
    raw: '',
  };
  return {
    ...meaning,
    senseIndex: sense ? idx : null,
    rawLooksSuspect: meaning.raw ? looksLikeAlignmentArtifact(meaning.raw) : false,
  };
}

function meaningDecision(word, lex, entry, book, chapter, verse) {
  const morph = String(word?.[2] || '');
  const pos = morph.split('-')[0];
  const formGloss = roughGloss(word, lex, book, chapter);
  const definition = compactDefinition(contextualBrief(word, book, chapter) || lex.brief || lex.extended || lex.strongs_def || '');
  const ref = `${book} ${chapter}:${verse}`;
  const deep = entry ? deepDefinitionSummary(entry, ref) : null;
  const formFirst = ['V', 'N', 'P', 'F', 'T', 'A', 'D', 'R', 'I', 'X'].includes(pos);
  const deepSafe = deep?.text && !looksLikeAlignmentArtifact(deep.text) && !['V', 'N', 'P', 'F', 'T'].includes(pos);
  const contextual = contextualBrief(word, book, chapter);
  const gloss = contextual
    ? (formGloss || contextual)
    : formFirst
      ? (formGloss || definition || deep?.text || '')
      : (deepSafe ? deep.text : (formGloss || definition || deep?.text || ''));
  return {
    gloss,
    definition: contextual ? (definition || contextual || gloss || '') : (deep?.text || definition || gloss || ''),
    formGloss,
    lexicalDefinition: definition,
    deep,
    source: contextual ? 'Greek form + chapter context' : deep?.source || 'Loaded lexicon',
  };
}

function plural(base = '') {
  if (/man$/i.test(base)) return base.replace(/man$/i, 'men');
  if (/(s|sh|ch|x|z)$/i.test(base)) return base + 'es';
  if (/[^aeiou]y$/i.test(base)) return base.slice(0, -1) + 'ies';
  return base + 's';
}

function loadDeepEntries() {
  const dir = path.join(ROOT, 'data', 'deep-lexicon');
  const entries = new Map();
  for (const file of fs.readdirSync(dir).filter(f => /^shard-\d+\.json$/.test(f))) {
    const shard = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const [strongs, entry] of Object.entries(shard)) entries.set(String(strongs), entry);
  }
  return entries;
}

function issue(type, data) {
  return { type, severity: ISSUE_SEVERITY[type] || 'low', ...data };
}

function auditWord({ dataset, book, chapter, verse, index, rawWord, word, lexicon, deep }) {
  const [surface, strongs, morph] = word;
  const ref = `${book} ${chapter}:${verse}`;
  const lex = lexicon[String(strongs)] || null;
  const issues = [];
  const pos = String(morph || '').split('-')[0];

  if (!strongs && isContentMorph(morph)) {
    issues.push(issue('missingStrongs', { dataset, ref, index, surface: rawWord[0], morph, message: 'Content word has no Strong number.' }));
    return issues;
  }
  if (strongs && !lex && isContentMorph(morph)) {
    issues.push(issue('missingLexicon', { dataset, ref, index, surface, strongs, morph, message: 'Strong number has no loaded lexicon entry.' }));
    return issues;
  }
  if (!lex) return issues;

  const entry = deep.get(String(strongs));
  const decision = meaningDecision(word, lex, entry, book, chapter, verse);
  const gloss = decision.gloss;
  const definition = decision.definition;
  const quickDisplay = gloss || definition;
  const combined = `${gloss} ${definition}`.toLowerCase();

  if (/\b(you all am|he\/she am|they am|we am|to am|been come|having been come|undefined|null|he\/she make |he \/ she make )\b/i.test(combined)) {
    issues.push(issue('impossibleEnglish', { dataset, ref, index, surface, strongs, morph, gloss, definition, message: 'Generated English looks ungrammatical.' }));
  }
  if (isCoreLexicalMorph(morph) && looksLikeDisplayArtifact(gloss)) {
    issues.push(issue('displayArtifact', {
      dataset, ref, index, surface, strongs, morph, gloss, definition,
      formGloss: decision.formGloss,
      lexicalDefinition: decision.lexicalDefinition,
      message: 'Displayed meaning looks like an English alignment artifact instead of a usable word meaning.',
    }));
  }
  if (isCoreLexicalMorph(morph) && decision.deep?.rawLooksSuspect && decision.deep.raw && decision.deep.raw !== decision.deep.text) {
    issues.push(issue('suspectReceipt', {
      dataset, ref, index, surface, strongs, morph, gloss, definition,
      raw: decision.deep.raw,
      message: 'Measured English phrase contains a suspect alignment fragment; receipts should explain why it was not used as the display gloss.',
    }));
  }
  if (/^(god|christ|lord|moses|israel|jesus|spirit)$/.test(gloss) || /^(god|christ|lord|moses|israel|jesus|spirit)$/.test(definition)) {
    issues.push(issue('properNameCase', { dataset, ref, index, surface, strongs, morph, gloss, definition, message: 'Proper sacred/name gloss is lowercase.' }));
  }
  if (isCoreLexicalMorph(morph) && /^(a|an|the|and|or|but|for|of|to|in|on|at|by|with|from|any|some|one)$/i.test(definition)) {
    issues.push(issue('functionWordDefinition', { dataset, ref, index, surface, strongs, morph, gloss, definition, message: 'Content word definition collapsed to a function word.' }));
  }
  if (entry?.confidence === 'low' || entry?.confidence === 'none') {
    issues.push(issue('lowConfidence', { dataset, ref, index, surface, strongs, morph, gloss, definition, confidence: entry.confidence, message: 'Deep lexicon evidence is low-confidence; UI should be explicit.' }));
  }
  if (isContentMorph(morph) && !entry?.prose?.def && Number(entry?.count || 0) > 1) {
    issues.push(issue('weakDeepEvidence', { dataset, ref, index, surface, strongs, morph, gloss, definition, message: 'Deep lexicon has no prose definition for a repeated word.' }));
  }
  if (quickDisplay.length > 70 || quickDisplay.split(/\s+/).length > 9) {
    issues.push(issue('broadDefinition', { dataset, ref, index, surface, strongs, morph, gloss, definition, message: 'Quick display is broad/verbose; consider a cleaner quick label.' }));
  }

  return issues;
}

function auditDataset(dataset, data, lexicon, deep, filters) {
  const issues = [];
  const text = data.text || {};
  for (const book of BOOKS) {
    if (filters.book && filters.book !== book) continue;
    const bookData = text[book] || {};
    for (const chapter of Object.keys(bookData).sort((a, b) => Number(a) - Number(b))) {
      if (filters.chapter && String(filters.chapter) !== String(chapter)) continue;
      const chapterData = bookData[chapter] || {};
      for (const verse of Object.keys(chapterData).sort((a, b) => Number(a) - Number(b))) {
        if (filters.verse && String(filters.verse) !== String(verse)) continue;
        const words = chapterData[verse] || [];
        words.forEach((rawWord, index) => {
          const word = resolveWord(rawWord, book, chapter);
          issues.push(...auditWord({ dataset, book, chapter, verse, index, rawWord, word, lexicon, deep }));
        });
      }
    }
  }
  return issues;
}

function summarize(issues) {
  const byType = {};
  const bySeverity = {};
  for (const item of issues) {
    byType[item.type] = (byType[item.type] || 0) + 1;
    bySeverity[item.severity] = (bySeverity[item.severity] || 0) + 1;
  }
  return { total: issues.length, bySeverity, byType };
}

function writeReport(report) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  const lines = [];
  lines.push('# Rhema Quality Audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Scope: ${report.scope}`);
  lines.push('');
  lines.push(`Total findings: **${report.summary.total}**`);
  lines.push('');
  lines.push('## By Severity');
  for (const [key, count] of Object.entries(report.summary.bySeverity)) lines.push(`- ${key}: ${count}`);
  lines.push('');
  lines.push('## By Type');
  for (const [key, count] of Object.entries(report.summary.byType)) lines.push(`- ${key}: ${count}`);
  lines.push('');
  lines.push('## Top Findings');
  for (const item of report.issues.slice(0, 80)) {
    const name = BOOK_NAMES[item.ref.split(' ')[0]] || item.ref.split(' ')[0];
    const ref = item.ref.replace(item.ref.split(' ')[0], name);
    lines.push(`- **${item.severity} / ${item.type}** ${item.dataset} ${ref} [${item.index}] ${item.surface || ''} ${item.strongs ? `(G${item.strongs})` : ''}: ${item.message}`);
    if (item.gloss || item.definition) lines.push(`  - gloss: ${item.gloss || '(blank)'}; definition: ${item.definition || '(blank)'}`);
  }
  fs.writeFileSync(OUT_MD, lines.join('\n') + '\n');
}

function parseArgs(argv) {
  const filters = {};
  let limit = 500;
  for (const arg of argv) {
    if (arg.startsWith('--book=')) filters.book = arg.slice(7).toUpperCase();
    if (arg.startsWith('--chapter=')) filters.chapter = arg.slice(10);
    if (arg.startsWith('--verse=')) filters.verse = arg.slice(8);
    if (arg.startsWith('--limit=')) limit = Number(arg.slice(8)) || limit;
  }
  return { filters, limit };
}

function main() {
  const { filters, limit } = parseArgs(process.argv.slice(2));
  const files = ['rhema-lexicon.js', 'rhema-critical-fallbacks.js', ...TEXT_DATASETS.map(d => d.file)];
  const globals = loadWindowGlobals(files);
  generatedCriticalFallbacks = globals.RhemaCriticalFallbacks || {};
  const lexicon = globals.RhemaLexicon || {};
  const deep = loadDeepEntries();
  const issues = [];
  for (const meta of TEXT_DATASETS) {
    issues.push(...auditDataset(meta.name, globals[meta.global], lexicon, deep, filters));
  }
  const severityRank = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => (severityRank[a.severity] - severityRank[b.severity]) || a.type.localeCompare(b.type) || a.ref.localeCompare(b.ref));
  const report = {
    generatedAt: new Date().toISOString(),
    scope: filters.book ? `${filters.book}${filters.chapter ? ' ' + filters.chapter : ''}${filters.verse ? ':' + filters.verse : ''}` : 'NT Majority + Critical',
    summary: summarize(issues),
    issues: issues.slice(0, limit),
  };
  writeReport(report);
  console.log(`Rhema quality audit complete: ${report.summary.total} findings (${OUT_MD})`);
  console.log(JSON.stringify(report.summary, null, 2));
}

main();
