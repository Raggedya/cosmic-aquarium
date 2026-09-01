import { createHash } from 'node:crypto';

export const WATERS = ['heavy','dreamy','electronic','quiet','loud','dark','strange'];

const keywords = {
  heavy: ['metal','doom','sludge','hardcore','punk','noise rock','industrial','grind','stoner'],
  dreamy: ['dream pop','shoegaze','ambient pop','ethereal','psychedelic','dreampop','slowcore'],
  electronic: ['electronic','techno','house','synth','electro','idm','breakbeat','drum and bass','dnb'],
  quiet: ['ambient','acoustic','folk','minimal','piano','meditation','field recording','drone'],
  loud: ['rock','punk','hardcore','metal','noise','garage','grunge','post-hardcore'],
  dark: ['darkwave','goth','doom','industrial','post-punk','black metal','coldwave','dark ambient'],
  strange: ['experimental','avant-garde','outsider','free jazz','psych','abstract','sound collage','weird'],
};

export function classifyWaters({ tags = [], text = '', seed = '' } = {}) {
  const haystack = [...tags, text].join(' ').toLowerCase();
  const scored = WATERS.map(water => [water, keywords[water].reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0)])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (scored.length) return scored.slice(0, 3).map(([water]) => water);
  const digest = createHash('sha256').update(seed || haystack || 'cosmic-aquaria').digest();
  const primary = WATERS[digest[0] % WATERS.length];
  const secondary = WATERS[digest[1] % WATERS.length];
  return primary === secondary ? [primary] : [primary, secondary];
}

export function validWaters(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value).toLowerCase()).filter(value => WATERS.includes(value)))];
}
