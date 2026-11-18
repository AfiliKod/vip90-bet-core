// Demo seed'lerin tek rastgelelik kaynağı. Varsayılan Math.random'dır; testler
// sabit tohumlu bir PRNG enjekte edip üretimi deterministik yapabilir
// (bkz. demoData-seed-economics.test.js). Çalışma zamanı davranışı değişmez.
let randomSource = Math.random;

export function setRandomSource(fn = Math.random) {
  randomSource = fn;
}

export function random() {
  return randomSource();
}

export function randomInt(min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

export function randomFloat(min, max, decimals = 2) {
  return parseFloat((random() * (max - min) + min).toFixed(decimals));
}

export function pick(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

export function pickWeighted(weightedEntries) {
  const total = weightedEntries.reduce((sum, [, weight]) => sum + weight, 0);
  let r = random() * total;
  for (const [value, weight] of weightedEntries) {
    if (r < weight) return value;
    r -= weight;
  }
  return weightedEntries[weightedEntries.length - 1][0];
}

export function randomPastDate(maxDaysAgo) {
  return new Date(Date.now() - random() * maxDaysAgo * 24 * 60 * 60 * 1000);
}
