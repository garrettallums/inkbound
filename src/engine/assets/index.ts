import { registerAtlasAssets } from './atlas';
import { registerNatureAssets } from './nature';
import { registerBuildingAssets } from './buildings';
import { registerPropAssets } from './props';

let done = false;

/** Register the built-in asset library (idempotent). */
export function registerBuiltInAssets() {
  if (done) return;
  done = true;
  registerAtlasAssets();
  registerNatureAssets();
  registerBuildingAssets();
  registerPropAssets();
}

export * from './registry';
export { ARCH_STYLES } from './buildings';
