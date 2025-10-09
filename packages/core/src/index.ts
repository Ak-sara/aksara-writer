/**
 * Aksara Writer Core - Refactored
 * Modern markdown-to-document converter for Indonesian businesses
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve, isAbsolute, basename, extname } from 'path';
import { fileURLToPath } from 'url';

import { ConvertOptions, DocumentMetadata, AksaraDirectives, DocumentSection, ConvertResult } from './types';
import { HtmlConverter } from './converters/html-converter';
import { PdfConverter } from './converters/pdf-converter';
import { PptxConverter } from './converters/pptx-converter';

export class AksaraConverter {
  private options: ConvertOptions;
  private metadata: DocumentMetadata;
  private directives: AksaraDirectives;
  private sections: DocumentSection[];

  constructor(options: ConvertOptions = { format: 'html' }) {
    this.options = {
      locale: 'id',
      pageSize: 'A4',
      orientation: 'portrait',
      ...options
    };
    this.metadata = {};
    this.directives = { aksara: false };
    this.sections = [];
  }

  /**
   * Set document metadata
   */
  setMetadata(metadata: DocumentMetadata): void {
    this.metadata = { ...this.metadata, ...metadata };
  }

  /**
   * Convert markdown to specified format
   */
  async convert(markdown: string): Promise<ConvertResult> {
    try {
      const { content, directives } = this.parseAksaraDirectives(markdown);
      this.directives = directives;
      this.sections = this.parseSections(content);

      switch (this.options.format) {
        case 'html':
          return await this.createHtmlConverter().convert();
        case 'pdf':
          return await this.createPdfConverter().convert();
        case 'pptx':
          return await this.createPptxConverter().convert();
        default:
          throw new Error(`Unsupported format: ${this.options.format}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Parse Aksara directives from HTML comment block
   */
  private parseAksaraDirectives(markdown: string): { content: string; directives: AksaraDirectives } {
    const directiveRegex = /<!--\s*([\s\S]*?)\s*-->/;
    const match = markdown.match(directiveRegex);
    const directives: AksaraDirectives = { aksara: false };

    if (match) {
      const directiveBlock = match[1];
      const content = markdown.replace(match[0], '').trim();

      directiveBlock.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        if (trimmed.startsWith('aksara:') && trimmed.replace('aksara:', '').trim() === 'true') {
          directives.aksara = true;
        } else if (trimmed.startsWith('type:')) {
          directives.type = trimmed.replace('type:', '').trim() as 'document' | 'presentation';
        } else if (trimmed.startsWith('style:')) {
          directives.style = trimmed.replace('style:', '').trim();
        } else if (trimmed.startsWith('size:')) {
          directives.size = trimmed.replace('size:', '').trim();
        } else if (trimmed.startsWith('header:')) {
          directives.header = trimmed.replace('header:', '').trim();
        } else if (trimmed.startsWith('footer:')) {
          directives.footer = trimmed.replace('footer:', '').trim();
        } else if (trimmed.startsWith('background:')) {
          directives.background = trimmed.replace('background:', '').trim();
        } else if (trimmed.startsWith('meta:')) {
          directives.meta = {};
        } else if (trimmed.includes('title:') && directives.meta) {
          directives.meta.title = trimmed.replace(/.*title:/, '').trim();
          if (directives.meta.title) {
            this.metadata.title = directives.meta.title;
          }
        } else if (trimmed.includes('subtitle:') && directives.meta) {
          directives.meta.subtitle = trimmed.replace(/.*subtitle:/, '').trim();
          if (directives.meta.subtitle) {
            this.metadata.subtitle = directives.meta.subtitle;
          }
        }
      });

      return { content, directives };
    }

    return { content: markdown, directives };
  }

  /**
   * Parse content into sections (split by ---) and extract class comments
   */
  private parseSections(content: string): DocumentSection[] {
    const sections = content.split(/^---$/m).map(section => section.trim()).filter(Boolean);

    return sections.map((sectionContent, index) => {
      // Extract class comment from section content
      const classCommentRegex = /<!--\s*class:\s*([^-]*?)\s*-->/;
      const classMatch = sectionContent.match(classCommentRegex);

      let classes = '';
      let cleanContent = sectionContent;

      if (classMatch) {
        classes = classMatch[1].trim();
        // Remove the class comment from content
        cleanContent = sectionContent.replace(classCommentRegex, '').trim();
      }

      return {
        content: cleanContent,
        index: index + 1,
        html: this.markdownToHtml(cleanContent),
        classes: classes || undefined
      };
    });
  }

  /**
   * Enhanced markdown to HTML converter with Indonesian support
   */
  private markdownToHtml(markdown: string): string {
    // First, evaluate JavaScript expressions before any other processing
    let html = this.evaluateJavaScriptExpressions(markdown);

    // Process code blocks FIRST (before inline code and tables) to prevent interference
    const codeBlocks: string[] = [];
    html = html.replace(/```(\w+)?[ \t]*\n([\s\S]*?)```/g, (match, lang, code) => {
      let codeHtml;
      const trimmedLang = lang ? lang.trim() : '';
      if (trimmedLang === 'mermaid') {
        // Use a base64-like placeholder to preserve newlines
        codeHtml = `<pre class="mermaid">${code.trim()}</pre>`;
      } else {
        // Escape HTML and preserve whitespace/indentation for code
        codeHtml = `<pre><code class="language-${trimmedLang || 'plaintext'}">${this.escapeHtml(code)}</code></pre>`;
      }
      const placeholder = `<!--__CODE_BLOCK_${codeBlocks.length}__-->`;
      codeBlocks.push(codeHtml);
      return placeholder;
    });

    // Then parse tables
    html = this.parseTable(html);

    // Process block elements
    html = html
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
      .replace(/^\- (.*$)/gm, '<li>$1</li>')
      .replace(/^(\d+)\. (.*$)/gm, '<li>$2</li>');

    // Process inline elements (AFTER code blocks to avoid interference)
    html = html
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
        // Extract image type identifier and positioning
        const typeMatch = alt.match(/^(bg|fg|lg|wm)\b/);
        const posMatch = alt.match(/([trblxywh]):\s*([^;\s]+)/g);

        // Determine z-index from type
        const zIndexMap = { 'wm': 0, 'bg': 1, 'fg': 2, 'lg': 3 };
        const imageType = typeMatch ? typeMatch[1] : null;
        const zIndex = imageType ? zIndexMap[imageType as keyof typeof zIndexMap] : 'auto';

        let style = 'max-width: 100%; height: auto;';
        let hasPositioning = imageType && posMatch && posMatch.some((pos: string) => pos.match(/^[trblxy]:/));
        let hasSizing = posMatch && posMatch.some((pos: string) => pos.match(/^[wh]:/));

        if (hasPositioning) {
          const styleMap = {
            't': 'top', 'r': 'right', 'b': 'bottom', 'l': 'left',
            'x': 'left', 'y': 'top', // legacy aliases
            'w': 'width', 'h': 'height'
          };
          let positionStyle = `position: absolute; z-index: ${zIndex}; `;

          posMatch!.forEach((pos: string) => {
            const [key, value] = pos.split(':').map((s: string) => s.trim());
            if (styleMap[key as keyof typeof styleMap]) {
              positionStyle += `${styleMap[key as keyof typeof styleMap]}: ${value}; `;
            }
          });
          style = positionStyle;
        } else if (hasSizing) {
          // Handle standalone sizing (w: and h:) without positioning
          let sizeStyle = '';
          posMatch!.forEach((pos: string) => {
            const [key, value] = pos.split(':').map((s: string) => s.trim());
            if (key === 'w') {
              sizeStyle += `width: ${value}; `;
            } else if (key === 'h') {
              sizeStyle += `height: ${value}; `;
            }
          });
          if (sizeStyle) {
            style = sizeStyle + 'object-fit: contain;';
          }
        }

        // Clean alt text
        const cleanAlt = alt.replace(/^(bg|fg|lg|wm)\s*/, '').replace(/\s*[trblxywh]:[^;\s]+/g, '').trim();
        const convertedSrc = this.convertImagePath(src);

        if (hasPositioning) {
          return `<div class="image-${imageType}" style="${style}"><img src="${convertedSrc}" alt="${cleanAlt}" style="width: 100%; height: 100%; object-fit: fill;"></div>`;
        }

        return `<img src="${convertedSrc}" alt="${cleanAlt}" style="${style}">`;
      })
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>');

    // Wrap consecutive list items in single ul tags
    html = html.replace(/(<li>.*?<\/li>\s*)+/g, (match) => {
      return `<ul>${match}</ul>`;
    });

    // Split into lines and wrap paragraphs more carefully
    const lines = html.split('\n');
    const processedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line === '') {
        continue; // Skip empty lines
      }

      // Check if line contains code block placeholder (as HTML comment)
      if (line.match(/<!--__CODE_BLOCK_\d+__-->/)) {
        processedLines.push(line);
      }
      // Don't wrap block elements
      else if (line.match(/^<(h[1-6]|ul|ol|li|table|div|header|footer|pre)/)) {
        processedLines.push(line);
      } else if (line.match(/^<\/(h[1-6]|ul|ol|li|table|div|header|footer|pre)/)) {
        processedLines.push(line);
      } else if (line.match(/^<(img|br|code|div)/)) {
        processedLines.push(line);
      } else if (line.match(/^<\/?(ul|ol)>/)) {
        processedLines.push(line);
      } else {
        // Wrap in paragraph tags only if not empty
        if (line.trim()) {
          processedLines.push(`<p style="position: relative; z-index: 2;">${line}</p>`);
        }
      }
    }

    // Restore code blocks from placeholders BEFORE joining lines
    const restoredLines = processedLines.map(line => {
      let restoredLine = line;
      codeBlocks.forEach((codeBlock, index) => {
        restoredLine = restoredLine.replace(`<!--__CODE_BLOCK_${index}__-->`, codeBlock);
      });
      return restoredLine;
    });

    return restoredLines.join('\n');
  }

  private parseTable(markdown: string): string {
    const tableRegex = /^\|(.+)\|\s*\n\|[-\s|:]+\|\s*\n((?:\|.+\|\s*\n?)*)/gm;
    return markdown.replace(tableRegex, (match, headerRow, bodyRows) => {
      const headers = headerRow.split('|').map((h: string) => h.trim()).filter((h: string) => h);
      const rows = bodyRows.trim().split('\n').map((row: string) =>
        row.split('|').map((cell: string) => cell.trim()).filter((cell: string) => cell)
      );

      const headerHtml = headers.map((h: string) => `<th>${h}</th>`).join('');
      const bodyHtml = rows.map((row: string[]) =>
        `<tr>${row.map((cell: string) => `<td>${cell}</td>`).join('')}</tr>`
      ).join('');

      return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
    });
  }

  /**
   * Template loading utilities
   */
  private getTemplateDir(): string {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    return join(currentDir, '..');
  }

  private loadTemplate = (templatePath: string): string => {
    try {
      const fullPath = join(this.getTemplateDir(), templatePath);
      return readFileSync(fullPath, 'utf-8');
    } catch (error) {
      console.warn(`Could not load template ${templatePath}, using fallback`);
      return '';
    }
  }

  private replaceTemplateVars = (template: string, vars: Record<string, string>): string => {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
  }

  private evaluateJavaScriptExpressions(text: string): string {
    return text.replace(/\$\{([^}]+)\}/g, (match, expression) => {
      try {
        // Safely evaluate simple expressions
        const result = this.safeEval(expression.trim());
        return result !== undefined ? String(result) : match;
      } catch (error) {
        console.warn(`Failed to evaluate expression: ${expression}`, error);
        return match; // Return original if evaluation fails
      }
    });
  }

  private safeEval(expression: string): any {
    // Only allow safe expressions - primarily Date functions
    if (expression.includes('new Date()')) {
      // Handle date expressions
      if (expression.includes('.toLocaleDateString(')) {
        const match = expression.match(/new Date\(\)\.toLocaleDateString\(['"`]([^'"`]+)['"`]\)/);
        if (match) {
          const locale = match[1];
          return new Date().toLocaleDateString(locale);
        }
        // Default locale
        return new Date().toLocaleDateString();
      }
      if (expression.includes('.toDateString()')) {
        return new Date().toDateString();
      }
      if (expression.includes('.getFullYear()')) {
        return new Date().getFullYear();
      }
    }

    // Handle Date constructor with offset (like due dates)
    if (expression.includes('new Date(Date.now()')) {
      const match = expression.match(/new Date\(Date\.now\(\)\s*([+\-])\s*([^)]+)\)\.toLocaleDateString\(['"`]([^'"`]+)['"`]\)/);
      if (match) {
        const operator = match[1];
        const offsetExpr = match[2].trim();
        const locale = match[3];

        // Safely evaluate simple math expressions for date offset
        if (/^[\d\s+\-*/().]+$/.test(offsetExpr)) {
          const offset = Function(`"use strict"; return (${offsetExpr})`)();
          const dateMs = operator === '+' ? Date.now() + offset : Date.now() - offset;
          return new Date(dateMs).toLocaleDateString(locale);
        }
      }
    }

    // Handle simple math and string operations
    if (/^[\d\s+\-*/().]+$/.test(expression)) {
      return Function(`"use strict"; return (${expression})`)();
    }

    // Handle simple string concatenation
    if (expression.includes('+') && (expression.includes('"') || expression.includes("'"))) {
      return Function(`"use strict"; return (${expression})`)();
    }

    throw new Error(`Unsafe expression: ${expression}`);
  }

  /**
   * Create converter instances
   */
  private createHtmlConverter(): HtmlConverter {
    return new HtmlConverter(
      this.sections,
      this.directives,
      this.metadata,
      this.options,
      this.loadTemplate,
      this.replaceTemplateVars
    );
  }

  private createPdfConverter(): PdfConverter {
    return new PdfConverter(
      this.sections,
      this.directives,
      this.metadata,
      this.options,
      this.loadTemplate,
      this.replaceTemplateVars
    );
  }

  private createPptxConverter(): PptxConverter {
    return new PptxConverter(
      this.sections,
      this.directives,
      this.metadata,
      this.options,
      this.loadTemplate,
      this.replaceTemplateVars
    );
  }

  private convertImagePath(imagePath: string): string {
    if (imagePath.startsWith('http') || imagePath.startsWith('data:') || isAbsolute(imagePath)) {
      return imagePath;
    }

    try {
      const baseDir = this.options.basePath || process.cwd();
      let absolutePath = resolve(baseDir, imagePath);

      if (existsSync(absolutePath)) {
        const fileData = readFileSync(absolutePath);
        const mimeType = this.getMimeType(absolutePath);
        const base64Data = fileData.toString('base64');
        return `data:${mimeType};base64,${base64Data}`;
      }

      const altPath = resolve(baseDir, 'assets', basename(imagePath));
      if (existsSync(altPath)) {
        const fileData = readFileSync(altPath);
        const mimeType = this.getMimeType(altPath);
        const base64Data = fileData.toString('base64');
        return `data:${mimeType};base64,${base64Data}`;
      }

      console.warn(`Image not found: ${imagePath}`);
      return imagePath;
    } catch (error) {
      console.warn(`Error resolving image path ${imagePath}:`, error);
      return imagePath;
    }
  }

  private getMimeType(filePath: string): string {
    const ext = extname(filePath).toLowerCase().slice(1);
    const mimeTypes: Record<string, string> = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'webp': 'image/webp',
      'bmp': 'image/bmp'
    };
    return mimeTypes[ext || ''] || 'image/png';
  }

  private escapeHtml(text: string): string {
    const htmlEscapes: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, char => htmlEscapes[char]);
  }
}

// Export default instance
export const aksara = new AksaraConverter();

// Export types and utilities
export * from './types';