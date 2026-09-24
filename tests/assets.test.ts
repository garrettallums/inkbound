import { describe, expect, it } from 'vitest';
import { registerBuiltInAssets } from '../src/engine/assets';
import { allAssets, getAsset } from '../src/engine/assets/registry';
import { BUILTIN_COLLECTIONS } from '../src/engine/collections';

describe('built-in library', () => {
  registerBuiltInAssets();
  it('registers a large, uniquely named library', () => {
    const all = allAssets();
    expect(all.length).toBeGreaterThan(300);
    expect(new Set(all.map((a) => a.id)).size).toBe(all.length);
  });

  it('every built-in collection references real assets', () => {
    for (const c of BUILTIN_COLLECTIONS) for (const i of c.items) expect(getAsset(i.assetId), `${c.id} → ${i.assetId}`).toBeTruthy();
  });

  it('covers every architectural collection', () => {
    const styles = new Set(allAssets().filter((a) => a.category === 'Settlement' && a.style).map((a) => a.style));
    for (const s of ['Viking / Norse', 'Medieval European', 'Rustic Frontier', 'Coastal', 'Desert', 'Elven', 'Dwarven', 'Ruined']) expect(styles.has(s)).toBe(true);
  });
});
