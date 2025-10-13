export function calculateTextSize(
  text: string,
  fontSize: number = 14
): { width: number; height: number } {
  const avgCharWidth = fontSize * 0.6;
  const padding = 20;

  const lines = text.split('\n');
  const maxLineLength = Math.max(...lines.map(line => line.length));

  const width = maxLineLength * avgCharWidth + padding;
  const height = lines.length * fontSize * 1.5 + padding;

  return { width, height };
}
