import type { Node, ShapeRenderer } from './types';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const defaultShapes: Record<string, ShapeRenderer> = {
  rect: (node: Node) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const width = node.width ?? 100;
    const height = node.height ?? 50;
    const fill = node.style?.fill ?? 'white';
    const stroke = node.style?.stroke ?? 'black';
    const strokeWidth = node.style?.strokeWidth ?? 2;
    const fontSize = node.style?.fontSize ?? 14;

    return `
      <rect x="${x}" y="${y}"
            width="${width}" height="${height}"
            fill="${fill}" stroke="${stroke}"
            stroke-width="${strokeWidth}" rx="5"/>
      <text x="${x + width / 2}" y="${y + height / 2}"
            text-anchor="middle" dominant-baseline="middle"
            font-size="${fontSize}" fill="black">
        ${escapeHtml(node.label)}
      </text>
    `;
  },

  circle: (node: Node) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const width = node.width ?? 80;
    const height = node.height ?? 80;
    const radius = Math.max(width, height) / 2;
    const fill = node.style?.fill ?? 'white';
    const stroke = node.style?.stroke ?? 'black';
    const strokeWidth = node.style?.strokeWidth ?? 2;
    const fontSize = node.style?.fontSize ?? 14;

    return `
      <circle cx="${x + width / 2}" cy="${y + height / 2}"
              r="${radius}"
              fill="${fill}" stroke="${stroke}"
              stroke-width="${strokeWidth}"/>
      <text x="${x + width / 2}" y="${y + height / 2}"
            text-anchor="middle" dominant-baseline="middle"
            font-size="${fontSize}" fill="black">
        ${escapeHtml(node.label)}
      </text>
    `;
  },

  diamond: (node: Node) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const width = node.width ?? 100;
    const height = node.height ?? 80;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const w2 = width / 2;
    const h2 = height / 2;
    const fill = node.style?.fill ?? 'white';
    const stroke = node.style?.stroke ?? 'black';
    const strokeWidth = node.style?.strokeWidth ?? 2;
    const fontSize = node.style?.fontSize ?? 14;

    return `
      <path d="M ${cx},${y} L ${x + width},${cy} L ${cx},${y + height} L ${x},${cy} Z"
            fill="${fill}" stroke="${stroke}"
            stroke-width="${strokeWidth}"/>
      <text x="${cx}" y="${cy}"
            text-anchor="middle" dominant-baseline="middle"
            font-size="${fontSize}" fill="black">
        ${escapeHtml(node.label)}
      </text>
    `;
  },

  ellipse: (node: Node) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const width = node.width ?? 120;
    const height = node.height ?? 60;
    const rx = width / 2;
    const ry = height / 2;
    const fill = node.style?.fill ?? 'white';
    const stroke = node.style?.stroke ?? 'black';
    const strokeWidth = node.style?.strokeWidth ?? 2;
    const fontSize = node.style?.fontSize ?? 14;

    return `
      <ellipse cx="${x + width / 2}" cy="${y + height / 2}"
               rx="${rx}" ry="${ry}"
               fill="${fill}" stroke="${stroke}"
               stroke-width="${strokeWidth}"/>
      <text x="${x + width / 2}" y="${y + height / 2}"
            text-anchor="middle" dominant-baseline="middle"
            font-size="${fontSize}" fill="black">
        ${escapeHtml(node.label)}
      </text>
    `;
  }
};
