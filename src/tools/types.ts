import type { Vec } from '../core/geom';
import type { Editor } from '../editor/editor';

export interface ToolEvent {
  world: Vec;
  screen: Vec;
  button: number;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  pressure: number;
  /** World units per screen pixel (for zoom-independent tolerances). */
  unit: number;
}

export interface Tool {
  id: string;
  cursor?: (e: Editor) => string;
  activate?(e: Editor): void;
  deactivate?(e: Editor): void;
  down?(e: Editor, ev: ToolEvent): void;
  move?(e: Editor, ev: ToolEvent, dragging: boolean): void;
  up?(e: Editor, ev: ToolEvent): void;
  doubleClick?(e: Editor, ev: ToolEvent): void;
  /** Return true if the key was handled. */
  key?(e: Editor, k: KeyboardEvent): boolean;
  /** Draw tool gizmos. ctx is in world coordinates; `unit` = world units per screen px. */
  overlay?(e: Editor, ctx: CanvasRenderingContext2D, unit: number): void;
  /** Cancel an in-progress interaction (Escape). Returns true if something was cancelled. */
  cancel?(e: Editor): boolean;
}
