export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomFloat(min, max, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

export function pick(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

export function pickWeighted(weightedEntries) {
  const total = weightedEntries.reduce((sum, [, weight]) => sum + weight, 0);
  let r = Math.random() * total;
  for (const [value, weight] of weightedEntries) {
    if (r < weight) return value;
    r -= weight;
  }
  return weightedEntries[weightedEntries.length - 1][0];
}

export function randomPastDate(maxDaysAgo) {
  return new Date(Date.now() - Math.random() * maxDaysAgo * 24 * 60 * 60 * 1000);
}
