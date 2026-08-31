export type RandomSource = () => number;

function uniqueIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

export function shuffleTrackIds(ids: string[], random: RandomSource = Math.random) {
  const shuffled = uniqueIds(ids);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function buildTrackDeck(ids: string[], recentIds: string[], random: RandomSource = Math.random) {
  const allIds = uniqueIds(ids);
  const recent = uniqueIds(recentIds).filter((id) => allIds.includes(id));
  const recentSet = new Set(recent);
  const fresh = shuffleTrackIds(allIds.filter((id) => !recentSet.has(id)), random);
  const replay = shuffleTrackIds(allIds.filter((id) => recentSet.has(id)), random);
  const deck = [...fresh, ...replay];

  if (deck.length > 1 && deck[0] === recent[0]) {
    const alternativeIndex = deck.findIndex((id) => id !== recent[0]);
    if (alternativeIndex > 0) [deck[0], deck[alternativeIndex]] = [deck[alternativeIndex], deck[0]];
  }

  return deck;
}

export function secureRandomUnit() {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0] / 0x1_0000_0000;
  }
  return Math.random();
}
