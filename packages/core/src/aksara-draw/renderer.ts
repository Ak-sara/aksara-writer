import type { Node, Edge, RenderOptions, ShapeRenderer } from './types';
import { defaultShapes } from './shapes';

export class SVGRenderer {
  private customShapes: Map<string, ShapeRenderer> = new Map();

  addShape(name: string, renderer: ShapeRenderer): void {
    this.customShapes.set(name, renderer);
  }

  toSVG(nodes: Node[], edges: Edge[], options?: RenderOptions): string {
    const bounds = this.calculateBounds(nodes);
    const padding = 50;

    const width = options?.width ?? bounds.maxX - bounds.minX + padding * 2;
    const height = options?.height ?? bounds.maxY - bounds.minY + padding * 2;
    const background = options?.background ?? 'transparent';

    const offsetX = padding - bounds.minX;
    const offsetY = padding - bounds.minY;

    const adjustedNodes = nodes.map(node => ({
      ...node,
      x: (node.x ?? 0) + offsetX,
      y: (node.y ?? 0) + offsetY
    }));

    const nodeMap = new Map<string, Node>();
    adjustedNodes.forEach(node => nodeMap.set(node.id, node));

    const edgesSvg = edges.map(edge => this.renderEdge(edge, nodeMap)).join('\n');
    const nodesSvg = adjustedNodes.map(node => this.renderNode(node)).join('\n');

    return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${background}"/>
  <defs>
    <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="2.5" orient="auto">
      <polygon points="0 0, 8 2.5, 0 5" fill="#666"/>
    </marker>
  </defs>
  <g id="edges">
    ${edgesSvg}
  </g>
  <g id="nodes">
    ${nodesSvg}
  </g>
</svg>`.trim();
  }

  private renderNode(node: Node): string {
    const shape = node.shape ?? 'rect';
    const renderer = this.customShapes.get(shape) ?? defaultShapes[shape] ?? defaultShapes.rect;
    return renderer(node);
  }

  private renderEdge(edge: Edge, nodeMap: Map<string, Node>): string {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);

    if (!fromNode || !toNode) return '';

    if (toNode.metadata?.treeDepth !== undefined) {
      return this.renderTreeListEdge(fromNode, toNode);
    }

    const isVerticalLayout = fromNode.metadata?.childLayout !== 'horizontal';

    const strokeDasharray = {
      solid: 'none',
      dashed: '5,5',
      dotted: '2,2',
      arrow: 'none'
    }[edge.type ?? 'solid'];

    const stroke = edge.style?.stroke ?? '#666';
    const strokeWidth = edge.style?.strokeWidth ?? 1.5;

    let path: string;
    let x1: number, y1: number, x2: number, y2: number;

    if (isVerticalLayout) {
      x1 = (fromNode.x ?? 0) + (fromNode.width ?? 100) * 0.5;
      y1 = (fromNode.y ?? 0) + (fromNode.height ?? 50);
      x2 = toNode.x ?? 0;
      y2 = (toNode.y ?? 0) + (toNode.height ?? 50) / 2;

      const dx = x2 - x1;
      const dy = y2 - y1;

      const cx1 = x1;
      const cy1 = y1 + Math.abs(dy) * 0.4;
      const cx2 = x2 - Math.abs(dx) * 0.3;
      const cy2 = y2;

      path = `M ${x1},${y1} C ${cx1},${cy1} ${cx2},${cy2} ${x2},${y2}`;
    } else {
      x1 = (fromNode.x ?? 0) + (fromNode.width ?? 100) / 2;
      y1 = (fromNode.y ?? 0) + (fromNode.height ?? 50);
      x2 = (toNode.x ?? 0) + (toNode.width ?? 100) / 2;
      y2 = toNode.y ?? 0;

      const dy = y2 - y1;
      const controlPointOffset = Math.abs(dy) * 0.5;

      const cx1 = x1;
      const cy1 = y1 + controlPointOffset;
      const cx2 = x2;
      const cy2 = y2 - controlPointOffset;

      path = `M ${x1},${y1} C ${cx1},${cy1} ${cx2},${cy2} ${x2},${y2}`;
    }

    const labelSvg = edge.label
      ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 5}"
               text-anchor="middle" font-size="11" fill="#555">
           ${edge.label}
         </text>`
      : '';

    return `
      <path d="${path}"
            stroke="${stroke}" stroke-width="${strokeWidth}"
            stroke-dasharray="${strokeDasharray}"
            fill="none"
            marker-end="url(#arrowhead)"/>
      ${labelSvg}
    `;
  }

  private renderTreeListEdge(fromNode: Node, toNode: Node): string {
    const depth = toNode.metadata?.treeDepth ?? 0;
    const isLast = toNode.metadata?.isLast ?? false;
    const ancestorLines = toNode.metadata?.ancestorLines ?? [];

    const fromX = fromNode.x ?? 0;
    const fromY = (fromNode.y ?? 0) + (fromNode.height ?? 50) / 2;
    const toX = toNode.x ?? 0;
    const toY = (toNode.y ?? 0) + (toNode.height ?? 50) / 2;

    const indentWidth = toX - fromX;

    let paths = '';

    for (let i = 0; i < depth - 1; i++) {
      if (ancestorLines[i]) {
        const x = fromX + (i + 1) * indentWidth;
        const y1 = fromY;
        const y2 = toY + (toNode.height ?? 50) / 2 + 10;
        paths += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"
                       stroke="#999" stroke-width="1.5"/>`;
      }
    }

    const branchX = toX - indentWidth / 2;
    const cornerY = toY;

    paths += `<line x1="${fromX + (fromNode.width ?? 100)}" y1="${fromY}"
                   x2="${branchX}" y2="${fromY}"
                   stroke="#666" stroke-width="1.5"/>`;

    paths += `<line x1="${branchX}" y1="${fromY}"
                   x2="${branchX}" y2="${cornerY}"
                   stroke="#666" stroke-width="1.5"/>`;

    paths += `<line x1="${branchX}" y1="${cornerY}"
                   x2="${toX}" y2="${cornerY}"
                   stroke="#666" stroke-width="1.5"/>`;

    return paths;
  }

  private calculateBounds(nodes: Node[]): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    if (nodes.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodes.forEach(node => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const width = node.width ?? 100;
      const height = node.height ?? 50;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    });

    return { minX, minY, maxX, maxY };
  }
}
