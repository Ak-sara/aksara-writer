import type { UniversalDiagram, RenderOptions, ShapeRenderer, Node } from './types';
import { TreeLayout } from './layouts/tree';
import { GridLayout } from './layouts/grid';
import { TreeListLayout } from './layouts/tree-list';
import { SVGRenderer } from './renderer';
import { calculateTextSize } from './utils/text-sizing';
import { parse } from './parser';

export class AksaraDraw {
  private layouts = {
    tree: new TreeLayout(),
    grid: new GridLayout(),
    'tree-list': new TreeListLayout()
  };

  private renderer = new SVGRenderer();

  render(diagram: UniversalDiagram, options?: RenderOptions): string {
    const sizedNodes = this.autoSizeNodes(diagram.nodes);

    const layout = this.layouts[diagram.layout.algorithm as 'tree' | 'grid' | 'tree-list'] ?? this.layouts.grid;
    const positioned = layout.calculate(sizedNodes, diagram.edges, diagram.layout);

    return this.renderer.toSVG(positioned, diagram.edges, options);
  }

  parse(syntax: string, type?: 'org' | 'flow' | 'json'): UniversalDiagram {
    return parse(syntax, type);
  }

  registerShape(name: string, renderer: ShapeRenderer): void {
    this.renderer.addShape(name, renderer);
  }

  private autoSizeNodes(nodes: Node[]): Node[] {
    return nodes.map(node => {
      if (node.width !== undefined && node.height !== undefined) {
        return node;
      }

      const fontSize = node.style?.fontSize ?? 14;
      const { width, height } = calculateTextSize(node.label, fontSize);

      return {
        ...node,
        width: node.width ?? width,
        height: node.height ?? height
      };
    });
  }
}

export const aksaraDraw = new AksaraDraw();

export * from './types';
export { parse } from './parser';
