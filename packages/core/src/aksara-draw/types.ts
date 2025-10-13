export interface NodeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fontSize?: number;
}

export interface EdgeStyle {
  stroke?: string;
  strokeWidth?: number;
}

export interface Node {
  id: string;
  label: string;
  shape?: 'rect' | 'circle' | 'diamond' | 'ellipse' | string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  style?: NodeStyle;
  metadata?: Record<string, any>;
}

export interface Edge {
  id?: string;
  from: string;
  to: string;
  label?: string;
  type?: 'solid' | 'dashed' | 'dotted' | 'arrow';
  style?: EdgeStyle;
}

export interface LayoutConfig {
  algorithm: 'tree' | 'grid' | 'force' | 'sequence' | 'timeline' | 'manual' | 'tree-list';
  direction?: 'TB' | 'LR' | 'RL' | 'BT';
  spacing?: {
    x: number;
    y: number;
  };
  padding?: number;
}

export interface CanvasConfig {
  width?: number;
  height?: number;
  background?: string;
}

export interface UniversalDiagram {
  type: 'flowchart' | 'org' | 'sequence' | 'timeline' | 'custom';
  nodes: Node[];
  edges: Edge[];
  layout: LayoutConfig;
  canvas?: CanvasConfig;
}

export interface RenderOptions {
  width?: number;
  height?: number;
  theme?: string;
  background?: string;
}

export type ShapeRenderer = (node: Node) => string;

export type LayoutAlgorithm = (
  nodes: Node[],
  edges: Edge[],
  config: LayoutConfig
) => Node[];
