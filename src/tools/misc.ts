import type { Rect } from '../core/geom';
import { uid } from '../core/ids';
import { Emitter } from '../core/emitter';
import type { Editor } from '../editor/editor';
import { EFFECT_INFO } from '../engine/effects';
import { LIGHT_PRESETS } from '../engine/lighting';
import { snapToGrid } from '../engine/renderer';
import { TEXT_PRESETS } from '../engine/text';
import type { EffectKind, EffectObject, LightObject, TextObject } from '../model/types';
import { pickObject } from './select';
import type { Tool } from './types';

/** Fired when a newly created label should receive keyboard focus in the properties panel. */
export const focusTextEvents = new Emitter();
/** Set when focus was requested before the text field mounted. */
export const textFocus = { pending: false };

function requestTextFocus() {
  textFocus.pending = true;
  // After the pointer sequence finishes, so the canvas doesn't steal focus back.
  setTimeout(() => focusTextEvents.emit(), 80);
}

export function makeText(ed: Editor, x: number, y: number, presetId: string, text?: string): TextObject {
  const p = TEXT_PRESETS.find((t) => t.id === presetId) ?? TEXT_PRESETS[0];
  const k = ed.doc.assetPack === 'atlas' ? ed.doc.assetScale : 2.2;
  return {
    id: uid('o'), type: 'text', layerId: ed.targetLayer('labels', true).id, text: text ?? p.label, x, y,
    font: 'IM Fell English', size: Math.round(p.size * k), weight: 400, italic: false, letterSpacing: 0.1, lineHeight: 1.15,
    align: 'center', rotation: 0, curve: 0, color: '#1e1914', outline: 0, outlineColor: '#efe6d2', shadow: 0, shadowColor: 'rgba(0,0,0,0.6)',
    opacity: 1, uppercase: false, ...p.patch,
    ...(p.patch.outline ? { outline: p.patch.outline * Math.max(1, k * 0.6) } : {}),
  };
}

export const textTool: Tool = {
  id: 'text',
  cursor: () => 'text',
  down(ed, ev) {
    const hit = pickObject(ed, ev.world, 4 * ev.unit);
    if (hit && hit.type === 'text') {
      ed.setSelection([hit.id]);
      requestTextFocus();
      return;
    }
    const t = makeText(ed, ev.world.x, ev.world.y, ed.settings.text.presetId);
    ed.putObjects([t], 'Add label');
    ed.setSelection([t.id]);
    requestTextFocus();
  },
};

export function makeLight(ed: Editor, x: number, y: number, kind: LightObject['kind']): LightObject {
  const p = LIGHT_PRESETS[kind];
  const k = ed.doc.assetPack === 'atlas' ? ed.doc.assetScale * 0.35 : 1;
  const layer = ed.doc.layers.find((l) => l.kind === 'lighting') ?? ed.addLayer('lighting', 'Lighting');
  return {
    id: uid('o'), type: 'light', layerId: layer.id, kind, x, y, radius: p.radius * k, intensity: p.intensity, color: p.color,
    falloff: p.falloff, shadowStrength: 0.5, flicker: p.flicker,
  };
}

export const lightTool: Tool & { dragId: string | null; offset: { x: number; y: number } } = {
  id: 'light',
  dragId: null,
  offset: { x: 0, y: 0 },
  cursor: () => 'copy',
  down(ed, ev) {
    const near = ed.lights().find((l) => Math.hypot(l.x - ev.world.x, l.y - ev.world.y) < 16 * ev.unit);
    if (near) {
      ed.setSelection([near.id]);
      ed.begin('Move light');
      this.dragId = near.id;
      this.offset = { x: near.x - ev.world.x, y: near.y - ev.world.y };
      return;
    }
    let p = ev.world;
    if (ed.settings.snap) p = snapToGrid(ed.doc.grid, p.x, p.y);
    const l = makeLight(ed, p.x, p.y, ed.settings.light.kind);
    ed.putObjects([l], `Add ${LIGHT_PRESETS[l.kind].label}`);
    ed.setSelection([l.id]);
    if (!ed.doc.lighting.enabled) ed.toast('Tip: pick a darker global preset (e.g. Twilight) in Atmosphere to see lights shine.');
  },
  move(ed, ev, dragging) {
    if (!dragging || !this.dragId) return;
    const o = ed.doc.objects[this.dragId];
    if (o?.type === 'light') ed.putObject({ ...o, x: ev.world.x + this.offset.x, y: ev.world.y + this.offset.y });
  },
  up(ed) {
    if (this.dragId) { this.dragId = null; ed.commit(); }
  },
  cancel(ed) {
    if (this.dragId) { this.dragId = null; ed.rollback(); return true; }
    return false;
  },
};

export function makeEffect(ed: Editor, kind: EffectKind, region: Rect | null): EffectObject {
  const info = EFFECT_INFO[kind];
  const layer = ed.doc.layers.find((l) => l.kind === 'effects') ?? ed.addLayer('effects', 'Atmosphere');
  const k = ed.doc.assetPack === 'atlas' ? 1 : 1;
  return {
    id: uid('o'), type: 'effect', layerId: layer.id, kind, intensity: info.intensity, scale: info.scale * k, color: info.color,
    seed: ed.newSeed() % 1000, angle: info.angle, region,
  };
}

export const atmosphereTool: Tool & { start: { x: number; y: number } | null; rect: Rect | null; kind: EffectKind } = {
  id: 'atmosphere',
  start: null,
  rect: null,
  kind: 'fog',
  cursor: () => 'crosshair',
  down(_ed, ev) {
    this.start = ev.world;
    this.rect = null;
  },
  move(ed, ev, dragging) {
    if (!dragging || !this.start) return;
    this.rect = { x: Math.min(this.start.x, ev.world.x), y: Math.min(this.start.y, ev.world.y), w: Math.abs(ev.world.x - this.start.x), h: Math.abs(ev.world.y - this.start.y) };
    ed.requestRender();
  },
  up(ed, ev) {
    const r = this.rect;
    this.start = null;
    this.rect = null;
    if (!r || r.w < 10 * ev.unit || r.h < 10 * ev.unit) return;
    const e = makeEffect(ed, this.kind, r);
    ed.putObjects([e], `Add ${EFFECT_INFO[this.kind].label}`);
    ed.setSelection([e.id]);
  },
  cancel(ed) {
    if (!this.start) return false;
    this.start = null;
    this.rect = null;
    ed.requestRender();
    return true;
  },
  overlay(ed, ctx, unit) {
    ctx.save();
    ctx.lineWidth = unit * 1.2;
    ctx.setLineDash([unit * 6, unit * 4]);
    for (const o of ed.selectedObjects) {
      if (o.type === 'effect' && o.region) { ctx.strokeStyle = '#ffc446'; ctx.strokeRect(o.region.x, o.region.y, o.region.w, o.region.h); }
    }
    if (this.rect) {
      ctx.strokeStyle = '#9fd8ff';
      ctx.fillStyle = 'rgba(159,216,255,0.08)';
      ctx.fillRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
      ctx.strokeRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
    }
    ctx.restore();
  },
};
