import type { Node, Edge, LayoutConfig } from '../types';

interface TreeNode {
  node: Node;
  children: TreeNode[];
  x: number;
  y: number;
  width: number;
  subtreeWidth: number;
}

export class TreeLayout {
  private minNodeGap = 30;

  calculate(nodes: Node[], edges: Edge[], config: LayoutConfig): Node[] {
    if (nodes.length === 0) return [];

    const spacing = config.spacing?.y ?? 100;
    const direction = config.direction ?? 'TB';

    const tree = this.buildTree(nodes, edges);
    if (!tree) return nodes;

    if (direction === 'LR' || direction === 'RL') {
      this.calculateSubtreeHeights(tree);
      this.positionNodesHorizontal(tree, 0, 0, spacing, direction === 'RL');
    } else {
      this.calculateSubtreeWidths(tree);
      this.positionNodes(tree, 0, 0, spacing, direction);

      if (direction === 'BT') {
        const positioned = this.flattenTree(tree);
        const maxY = Math.max(...positioned.map(n => n.y ?? 0));
        positioned.forEach(node => {
          if (node.y !== undefined) node.y = maxY - node.y;
        });
      }
    }

    return this.flattenTree(tree);
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
      return nodes.length > 0 ? this.createTreeNode(nodes[0], childrenMap, nodeMap) : null;
    }

    const root = roots[0];
    return this.createTreeNode(root, childrenMap, nodeMap);
  }

  private createTreeNode(
    node: Node,
    childrenMap: Map<string, string[]>,
    nodeMap: Map<string, Node>
  ): TreeNode {
    const childIds = childrenMap.get(node.id) ?? [];
    const children = childIds
      .map(id => nodeMap.get(id))
      .filter((n): n is Node => n !== undefined)
      .map(child => this.createTreeNode(child, childrenMap, nodeMap));

    return {
      node,
      children,
      x: 0,
      y: 0,
      width: node.width ?? 100,
      subtreeWidth: 0
    };
  }

  private calculateSubtreeWidths(tree: TreeNode): number {
    if (tree.children.length === 0) {
      tree.subtreeWidth = tree.width;
      return tree.width;
    }

    const childLayout = tree.node.metadata?.childLayout || 'vertical';

    if (childLayout === 'horizontal') {
      let totalChildrenWidth = 0;
      tree.children.forEach(child => {
        totalChildrenWidth += this.calculateSubtreeWidths(child);
      });

      totalChildrenWidth += (tree.children.length - 1) * this.minNodeGap;

      tree.subtreeWidth = Math.max(tree.width, totalChildrenWidth);
      return tree.subtreeWidth;
    } else {
      let maxChildSubtreeWidth = 0;
      tree.children.forEach(child => {
        const childSubtreeWidth = this.calculateSubtreeWidths(child);
        maxChildSubtreeWidth = Math.max(maxChildSubtreeWidth, childSubtreeWidth);
      });

      const horizontalGap = 150;
      const verticalChildrenWidth = tree.width + horizontalGap + maxChildSubtreeWidth;

      tree.subtreeWidth = verticalChildrenWidth;
      return tree.subtreeWidth;
    }
  }

  private positionNodes(
    tree: TreeNode,
    leftBound: number,
    y: number,
    spacingY: number,
    globalDirection: string = 'TB'
  ): void {
    if (tree.children.length === 0) {
      tree.node.x = leftBound;
      tree.node.y = y;
      return;
    }

    const childLayout = tree.node.metadata?.childLayout || 'vertical';
    const childDirection = tree.node.metadata?.childDirection || globalDirection;

    if (childLayout === 'horizontal' || childDirection === 'LR') {
      tree.node.x = leftBound + (tree.subtreeWidth - tree.width) / 2;
      tree.node.y = y;

      const totalWidth = tree.children.reduce((sum, child) => sum + child.width, 0) +
                         (tree.children.length - 1) * this.minNodeGap;

      let currentX = leftBound + (tree.subtreeWidth - totalWidth) / 2;
      const childY = y + spacingY;

      tree.children.forEach(child => {
        child.node.x = currentX;
        child.node.y = childY;

        if (child.children.length > 0) {
          this.positionNodes(child, currentX, childY, spacingY, globalDirection);
        }

        currentX += child.subtreeWidth + this.minNodeGap;
      });
    } else {
      tree.node.x = leftBound;
      tree.node.y = y;

      const parentWidth = tree.width ?? 100;
      const horizontalGap = 150;
      const childX = tree.node.x + parentWidth + horizontalGap;
      let currentY = y + spacingY;

      tree.children.forEach(child => {
        this.positionNodes(child, childX, currentY, spacingY, globalDirection);
        currentY += (child.node.height ?? 50) + this.minNodeGap;
      });
    }
  }

  private shiftSubtree(tree: TreeNode, shiftAmount: number): void {
    tree.children.forEach(child => {
      child.node.x = (child.node.x ?? 0) + shiftAmount;
      this.shiftSubtree(child, shiftAmount);
    });
  }

  private calculateSubtreeHeights(tree: TreeNode): number {
    if (tree.children.length === 0) {
      tree.subtreeWidth = tree.node.height ?? 50;
      return tree.subtreeWidth;
    }

    let totalChildrenHeight = 0;
    tree.children.forEach(child => {
      totalChildrenHeight += this.calculateSubtreeHeights(child);
    });

    totalChildrenHeight += (tree.children.length - 1) * this.minNodeGap;

    tree.subtreeWidth = Math.max(tree.node.height ?? 50, totalChildrenHeight);
    return tree.subtreeWidth;
  }

  private positionNodesHorizontal(
    tree: TreeNode,
    x: number,
    topBound: number,
    spacingX: number,
    rightToLeft: boolean
  ): void {
    if (tree.children.length === 0) {
      tree.node.x = x;
      tree.node.y = topBound;
      return;
    }

    const childLayout = tree.node.metadata?.childLayout || 'vertical';

    if (childLayout === 'horizontal') {
      const totalHeight = tree.children.reduce((sum, child) => sum + (child.node.height ?? 50), 0) +
                          (tree.children.length - 1) * this.minNodeGap;

      let currentY = topBound + (tree.subtreeWidth - totalHeight) / 2;
      const childX = x + spacingX;

      tree.children.forEach(child => {
        child.node.x = childX;
        child.node.y = currentY;

        if (child.children.length > 0) {
          this.positionNodesHorizontal(child, childX, currentY, spacingX, rightToLeft);
        }

        currentY += (child.node.height ?? 50) + this.minNodeGap;
      });

      tree.node.x = x;
      tree.node.y = topBound + (tree.subtreeWidth - (tree.node.height ?? 50)) / 2;
    } else {
      let currentY = topBound;
      tree.children.forEach(child => {
        this.positionNodesHorizontal(child, x + spacingX, currentY, spacingX, rightToLeft);
        currentY += child.subtreeWidth + this.minNodeGap;
      });

      const firstChild = tree.children[0];
      const lastChild = tree.children[tree.children.length - 1];
      const childrenCenter = (firstChild.node.y! + (lastChild.node.y! + (lastChild.node.height ?? 50))) / 2;

      tree.node.x = x;
      tree.node.y = childrenCenter - (tree.node.height ?? 50) / 2;

      if (tree.node.y < topBound) {
        const shift = topBound - tree.node.y;
        tree.node.y = topBound;
        this.shiftSubtreeVertical(tree, shift);
      }
    }

    if (rightToLeft) {
      this.mirrorHorizontal(tree);
    }
  }

  private shiftSubtreeVertical(tree: TreeNode, shiftAmount: number): void {
    tree.children.forEach(child => {
      child.node.y = (child.node.y ?? 0) + shiftAmount;
      this.shiftSubtreeVertical(child, shiftAmount);
    });
  }

  private mirrorHorizontal(tree: TreeNode): void {
    const allNodes = this.flattenTree(tree);
    const maxX = Math.max(...allNodes.map(n => n.x ?? 0));

    allNodes.forEach(node => {
      if (node.x !== undefined) {
        node.x = maxX - node.x;
      }
    });
  }

  private flattenTree(tree: TreeNode): Node[] {
    const result: Node[] = [tree.node];
    tree.children.forEach(child => {
      result.push(...this.flattenTree(child));
    });
    return result;
  }
}
