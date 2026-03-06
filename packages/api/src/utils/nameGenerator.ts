const adjectives = [
  'amber', 'blue', 'coral', 'dawn', 'emerald', 'frost', 'golden', 'hazy',
  'ivory', 'jade', 'keen', 'lunar', 'misty', 'noble', 'ocean', 'pearl',
  'quiet', 'rosy', 'solar', 'tidal', 'ultra', 'vivid', 'warm', 'zen',
];

const nouns = [
  'bay', 'cove', 'dune', 'fern', 'glen', 'hill', 'isle', 'lake',
  'mesa', 'nest', 'opal', 'peak', 'reef', 'star', 'tide', 'vale',
  'wave', 'yard', 'arch', 'brook', 'cliff', 'drift', 'edge', 'field',
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomSuffix(): string {
  return Math.random().toString(36).substring(2, 6);
}

export function generateSubdomain(): string {
  return `${randomItem(adjectives)}-${randomItem(nouns)}-${randomSuffix()}`;
}
