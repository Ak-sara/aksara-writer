import type { Node, Edge, LayoutConfig } from '../types';

export class GridLayout {
  calculate(nodes: Node[], edges: Edge[], config: LayoutConfig): Node[] {
    if (nodes.length === 0) return [];

    const spacingX = config.spacing?.x ?? 150;
    const spacingY = config.spacing?.y ?? 100;
    const cols = Math.ceil(Math.sqrt(nodes.length));

    return nodes.map((node, i) => ({
      ...node,
      x: (i % cols) * spacingX,
      y: Math.floor(i / cols) * spacingY
    }));
  }
}
