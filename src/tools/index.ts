import type { Editor } from '../editor/editor';
import { assetTool } from './assetTool';
import { atmosphereTool, lightTool, textTool } from './misc';
import { brushTool, terrainTool } from './paint';
import { pathTool } from './pathTool';
import { selectTool } from './select';

export function installTools(ed: Editor) {
  ed.tools = {
    select: selectTool,
    terrain: terrainTool,
    brush: brushTool,
    asset: assetTool,
    path: pathTool,
    text: textTool,
    light: lightTool,
    atmosphere: atmosphereTool,
  };
}

export const TOOL_INFO = [
  { id: 'select', label: 'Select', key: 'V', hint: 'Select, move, resize and rotate objects' },
  { id: 'terrain', label: 'Terrain', key: 'T', hint: 'Paint land & water — coastlines, islands, lakes, cave and dungeon floors' },
  { id: 'brush', label: 'Brush', key: 'B', hint: 'Paint blended ground textures' },
  { id: 'asset', label: 'Assets', key: 'A', hint: 'Place assets or paint forests with the scatter brush' },
  { id: 'path', label: 'Path', key: 'P', hint: 'Draw rivers, roads, trails, walls and borders' },
  { id: 'text', label: 'Text', key: 'L', hint: 'Add map labels' },
  { id: 'light', label: 'Light', key: 'G', hint: 'Place local light sources' },
  { id: 'atmosphere', label: 'Atmosphere', key: 'M', hint: 'Time of day, lighting presets and weather effects' },
] as const;
