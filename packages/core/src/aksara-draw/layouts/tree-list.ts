import type { Node, Edge, LayoutConfig } from '../types';

interface TreeNode {
  node: Node;
  children: TreeNode[];
  depth: number;
  isLast: boolean;
}

export class TreeListLayout {
  private lineHeight = 60;
  private indentWidth = 150;

  calculate(nodes: Node[], edges: Edge[], config: LayoutConfig): Node[] {
    if (nodes.length === 0) return [];

    this.lineHeight = config.spacing?.y ?? 60;
    this.indentWidth = config.spacing?.x ?? 150;

    const tree = this.buildTree(nodes, edges);
    if (!tree) return nodes;

    const positioned: Node[] = [];
    this.positionNodes(tree, 0, 0, [], positioned);

    return positioned;
  }

  private buildTree(nodes: Node[], edges: Edge[]): TreeNode | null {
    const nodeMap = new Map<string, Node>();
    nodes.forEach(node => nodeMap.set(node.id, node));

    const childrenMap = new Map<string, string[]>();
    const hasParent = new Set<string>();

    edges.forEach(edge => {
      if (!childrenMap.has(edge.from)) {
        childrenMap.set(edge.from, []);
      }
      childrenMap.get(edge.from)!.push(edge.to);
      hasParent.add(edge.to);
    });

    const roots = nodes.filter(node => !hasParent.has(node.id));
    if (roots.length === 0) {
      return nodes.length > 0 ? this.createTreeNode(nodes[0], childrenMap, nodeMap, 0, false) : null;
    }

    const root = roots[0];
    return this.createTreeNode(root, childrenMap, nodeMap, 0, false);
  }

  private createTreeNode(
    node: Node,
    childrenMap: Map<string, string[]>,
    nodeMap: Map<string, Node>,
    depth: number,
    isLast: boolean
  ): TreeNode {
    const childIds = childrenMap.get(node.id) ?? [];
    const children = childIds
      .map((id, index) => {
        const childNode = nodeMap.get(id);
        if (!childNode) return null;
        return this.createTreeNode(
          childNode,
          childrenMap,
          nodeMap,
          depth + 1,
          index === childIds.length - 1
        );
      })
      .filter((n): n is TreeNode => n !== null);

    return {
      node,
      children,
      depth,
      isLast
    };
  }

  private positionNodes(
    tree: TreeNode,
    x: number,
    y: number,
    ancestorLines: boolean[],
    positioned: Node[]
  ): number {
    tree.node.x = x + (tree.depth * this.indentWidth);
    tree.node.y = y;
    tree.node.metadata = {
      ...tree.node.metadata,
      treeDepth: tree.depth,
      isLast: tree.isLast,
      ancestorLines: [...ancestorLines]
    };

    positioned.push(tree.node);

    let currentY = y + this.lineHeight;

    if (tree.children.length > 0) {
      const newAncestorLines = [...ancestorLines, !tree.isLast];

      tree.children.forEach((child, index) => {
        currentY = this.positionNodes(child, x, currentY, newAncestorLines, positioned);
      });
    }

    return currentY;
  }
}
