import type { UniversalDiagram, Node, Edge } from './types';

export function parseOrgChart(syntax: string): UniversalDiagram {
  const lines = syntax.trim().split('\n').filter(line => line.trim());
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let nodeIdCounter = 1;

  const nodeMap = new Map<string, string>();
  const nodeMetadata = new Map<string, any>();

  lines.forEach(line => {
    const match = line.match(/^(.+?)\s*>\s*\[(.+)\](?:\s*\((.+)\))?$/);
    if (match) {
      const parent = match[1].trim();
      const children = match[2].split(',').map(c => c.trim());
      const options = match[3]?.trim();

      if (!nodeMap.has(parent)) {
        const id = `n${nodeIdCounter++}`;
        nodeMap.set(parent, id);
        nodes.push({ id, label: parent });
      }

      const parentId = nodeMap.get(parent)!;

      if (options) {
        const optionsParsed: any = {};
        if (options.includes('horizontal') || options.includes('h')) {
          optionsParsed.childLayout = 'horizontal';
        }
        if (options.includes('vertical') || options.includes('v')) {
          optionsParsed.childLayout = 'vertical';
        }
        if (options.includes('LR')) {
          optionsParsed.childDirection = 'LR';
        }
        if (options.includes('TB') || options.includes('TD')) {
          optionsParsed.childDirection = 'TB';
        }
        if (options.includes('RL')) {
          optionsParsed.childDirection = 'RL';
        }
        if (options.includes('BT')) {
          optionsParsed.childDirection = 'BT';
        }
        nodeMetadata.set(parentId, optionsParsed);
      }

      children.forEach(child => {
        if (!nodeMap.has(child)) {
          const id = `n${nodeIdCounter++}`;
          nodeMap.set(child, id);
          nodes.push({ id, label: child });
        }
        const childId = nodeMap.get(child)!;
        edges.push({ from: parentId, to: childId });
      });
    } else {
      const singleNode = line.trim();
      if (singleNode && !nodeMap.has(singleNode)) {
        const id = `n${nodeIdCounter++}`;
        nodeMap.set(singleNode, id);
        nodes.push({ id, label: singleNode });
      }
    }
  });

  nodes.forEach(node => {
    const metadata = nodeMetadata.get(node.id);
    if (metadata) {
      node.metadata = metadata;
    }
  });

  return {
    type: 'org',
    nodes,
    edges,
    layout: {
      algorithm: 'tree',
      direction: 'TB',
      spacing: { x: 150, y: 100 }
    }
  };
}

export function parseFlowchart(syntax: string): UniversalDiagram {
  const lines = syntax.trim().split('\n').filter(line => line.trim());
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let nodeIdCounter = 1;

  const nodeMap = new Map<string, string>();

  const getOrCreateNode = (name: string): string => {
    const match = name.match(/^(.+?)\?$/);
    const label = match ? match[1].trim() : name.trim();
    const shape = match ? 'diamond' : 'rect';

    if (!nodeMap.has(name)) {
      const id = `n${nodeIdCounter++}`;
      nodeMap.set(name, id);
      nodes.push({ id, label, shape });
    }
    return nodeMap.get(name)!;
  };

  lines.forEach(line => {
    const arrowMatch = line.match(/^(.+?)\s*->\s*(.+?)(?:\s*\[label:\s*(.+?)\])?$/);
    if (arrowMatch) {
      const from = arrowMatch[1].trim();
      const to = arrowMatch[2].trim();
      const label = arrowMatch[3]?.trim();

      const fromId = getOrCreateNode(from);
      const toId = getOrCreateNode(to);

      edges.push({ from: fromId, to: toId, label });
    } else {
      getOrCreateNode(line.trim());
    }
  });

  return {
    type: 'flowchart',
    nodes,
    edges,
    layout: {
      algorithm: 'tree',
      direction: 'TB',
      spacing: { x: 150, y: 100 }
    }
  };
}

export function parseJSON(json: string): UniversalDiagram {
  try {
    return JSON.parse(json) as UniversalDiagram;
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function parse(syntax: string, type?: 'org' | 'flow' | 'json'): UniversalDiagram {
  if (type === 'json' || syntax.trim().startsWith('{')) {
    return parseJSON(syntax);
  } else if (type === 'org' || syntax.includes('>')) {
    return parseOrgChart(syntax);
  } else if (type === 'flow' || syntax.includes('->')) {
    return parseFlowchart(syntax);
  } else {
    return parseOrgChart(syntax);
  }
}
