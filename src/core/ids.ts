let counter = 0;
export function uid(prefix = ''): string {
  counter = (counter + 1) % 1679616;
  return prefix + Date.now().toString(36) + counter.toString(36).padStart(4, '0') + Math.floor(Math.random() * 1296).toString(36);
}
