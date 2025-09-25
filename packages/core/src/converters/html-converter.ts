import { DocumentSection, AksaraDirectives, DocumentMetadata, ConvertOptions, ConvertResult } from '../types';
import { readFileSync, existsSync } from 'fs';
import { resolve, isAbsolute, basename, extname } from 'path';

export class HtmlConverter {
  constructor(
    private sections: DocumentSection[],
    private directives: AksaraDirectives,
    private metadata: DocumentMetadata,
    private options: ConvertOptions,
    private loadTemplate: (path: string) => string,
    private replaceTemplateVars: (template: string, vars: Record<string, string>) => string
  ) {}

  async convert(): Promise<ConvertResult> {
    const html = this.generateSectionedHtml();
    const styledHtml = this.applyDocumentTheme(html);

    return {
      success: true,
      data: Buffer.from(styledHtml, 'utf-8'),
      mimeType: 'text/html'
    };
  }

  private generateSectionedHtml(): string {
    const sectionsHtml = this.sections.map(section => {
      return `
        <section class="document-section" data-section="${section.index}">
          ${this.directives.header ? this.generateHeader(section.index) : ''}
          <div class="section-content">
            ${section.html}
          </div>
          ${this.generateFooter(section.index)}
        </section>
      `;
    }).join('\n');

    return `
      <div class="aksara-document" data-size="${this.directives.size || 'A4'}">
        ${sectionsHtml}
      </div>
    `;
  }

  private generateHeader(pageNumber: number): string {
    if (!this.directives.header) return '';

    const parts = this.directives.header.split('|').map(part => part.trim()).filter(Boolean);
    const processedParts = parts.map(part => this.markdownToHtml(part));

    const headerItems = processedParts.map((part, index) =>
      `<div class="header-item">${part}</div>`
    ).join('');

    return `
      <header class="document-header">
        ${headerItems}
      </header>
    `;
  }

  private generateFooter(pageNumber: number): string {
    const footerContent = this.directives.footer || '';
    const totalPages = this.sections.length;

    const processedFooter = this.markdownToHtml(
      footerContent.replace(/\[page\]/g, pageNumber.toString()).replace(/\[total\]/g, totalPages.toString())
    );

    return `
      <footer class="document-footer">
        <div class="footer-content">${processedFooter}</div>
        <div class="page-number">Halaman ${pageNumber} dari ${totalPages}</div>
      </footer>
    `;
  }

  private applyDocumentTheme(html: string): string {
    const { customUserStyles, otherCustomStyles } = this.getSeparatedCustomStyles();
    const totalSections = this.sections.length;
    const isPresentation = this.directives.type === 'presentation';

    const template = this.loadTemplate('templates/document.html');
    const scriptContent = this.loadTemplate('templates/scripts.js').replace(
      'function initializeAksaraDocument(totalSections) {',
      `// Initialized with ${totalSections} sections\nconst totalSections = ${totalSections};\n`
    ).replace(/\/\/ End of initializeAksaraDocument function\s*}$/, '');

    return this.replaceTemplateVars(template, {
      locale: this.options.locale || 'id',
      title: this.metadata.title || 'Aksara Document',
      baseStyles: this.getBaseStyles(),
      layoutStyles: isPresentation ? this.getPresentationStyles() : this.getDocumentStyles(),
      controlStyles: this.getControlStyles(),
      themeStyles: this.getThemeStyles(),
      customStyles: otherCustomStyles, // size, background styles
      userStyles: customUserStyles, // user CSS from style: directive (highest priority)
      documentType: isPresentation ? 'presentation' : 'document',
      controls: isPresentation ? this.getPresentationControls(totalSections) : this.getDocumentControls(totalSections),
      content: html,
      scriptContent
    });
  }

  private getBaseStyles(): string {
    return this.loadTemplate('styles/base.css');
  }

  private getDocumentStyles(): string {
    return this.loadTemplate('styles/document.css');
  }

  private getPresentationStyles(): string {
    const slideWidth = this.directives.size?.includes(':') ? this.getSlidePixelSize().width : 1280;
    const slideHeight = this.directives.size?.includes(':') ? this.getSlidePixelSize().height : 720;

    const template = this.loadTemplate('styles/presentation.css');
    return this.replaceTemplateVars(template, {
      slideWidth: slideWidth.toString(),
      slideHeight: slideHeight.toString()
    });
  }

  private getControlStyles(): string {
    return this.loadTemplate('styles/controls.css');
  }

  private getThemeStyles(): string {
    const themeName = this.options.theme || 'default';
    try {
      return this.loadTemplate(`styles/themes/${themeName}.css`);
    } catch (error) {
      console.warn(`Theme '${themeName}' not found, falling back to default`);
      return this.loadTemplate('styles/themes/default.css');
    }
  }

  // Keep for backward compatibility
  private getDocumentTheme(): string {
    return this.getThemeStyles();
  }

  private getGeneralStyles(): string {
    return this.getControlStyles() + '\n' + this.getDocumentStyles();
  }

  private getSlidePixelSize(): { width: number; height: number } {
    if (this.directives.size?.includes(':')) {
      const [w, h] = this.directives.size.split(':').map(Number);

      if (w === 16 && h === 9) return { width: 1920, height: 1080 };
      if (w === 16 && h === 10) return { width: 1680, height: 1050 };
      if (w === 4 && h === 3) return { width: 1024, height: 768 };

      const aspectRatio = w / h;
      return { width: 1280, height: Math.round(1280 / aspectRatio) };
    }

    return { width: 1280, height: 720 };
  }

  private getSeparatedCustomStyles(): { customUserStyles: string; otherCustomStyles: string } {
    let otherCustomStyles = '';
    let customUserStyles = '';

    // Add size and background styles first (these don't override theme styles)
    if (this.directives.size) {
      otherCustomStyles += this.parseSizeDirective(this.directives.size);
    }

    if (this.directives.background) {
      const backgroundPath = this.convertImagePath(this.directives.background);
      otherCustomStyles += `
        .document-section {
          background-image: url(${backgroundPath}) !important;
          background-size: cover !important;
          background-position: center !important;
          background-repeat: no-repeat !important;
        }
      `;
    }

    // Load user CSS file last (this should override theme styles)
    if (this.directives.style) {
      try {
        // Load custom CSS file - resolve relative to the document directory
        let stylePath: string;
        if (isAbsolute(this.directives.style)) {
          stylePath = this.directives.style;
        } else {
          // For relative paths, resolve from current working directory
          stylePath = resolve(process.cwd(), this.directives.style);
        }

        if (existsSync(stylePath)) {
          const customCss = readFileSync(stylePath, 'utf-8');
          customUserStyles += `\n/* Custom user styles from: ${this.directives.style} (applied last for highest priority) */\n${customCss}\n`;
        } else {
          console.warn(`Custom style file not found: ${this.directives.style} (resolved to: ${stylePath})`);
          customUserStyles += `/* Custom style file not found: ${this.directives.style} */\n`;
        }
      } catch (error) {
        console.warn(`Error loading custom style file ${this.directives.style}:`, error);
        customUserStyles += `/* Error loading custom style file: ${this.directives.style} */\n`;
      }
    }

    return { customUserStyles, otherCustomStyles };
  }

  // Keep the old method for backward compatibility
  private getCustomStyles(): string {
    const { customUserStyles, otherCustomStyles } = this.getSeparatedCustomStyles();
    return otherCustomStyles + customUserStyles;
  }

  private parseSizeDirective(size: string): string {
    if (size.includes('mm')) {
      const dimensions = size.split('x');
      if (dimensions.length === 2) {
        const width = dimensions[0];
        const height = dimensions[1];
        return `
          .document-section {
            width: ${width};
            height: ${height};
            page-break-after: always;
          }
          @page {
            size: ${width} ${height};
            margin: 0;
          }
        `;
      }
    } else if (size.includes(':')) {
      const [w, h] = size.split(':').map(Number);
      const aspectRatio = w / h;
      return `
        .document-section {
          aspect-ratio: ${aspectRatio};
          width: 90vw;
          max-width: 1200px;
          min-height: calc(90vw / ${aspectRatio});
          margin: 2rem auto;
          box-shadow: 0 8px 30px rgba(0,0,0,0.2);
        }
      `;
    }
    return '';
  }

  private getPresentationControls(totalSections: number): string {
    const template = this.loadTemplate('templates/presentation-controls.html');
    return this.replaceTemplateVars(template, {
      totalSections: totalSections.toString()
    });
  }

  private getDocumentControls(totalSections: number): string {
    const template = this.loadTemplate('templates/document-controls.html');
    return this.replaceTemplateVars(template, {
      totalSections: totalSections.toString()
    });
  }

  private markdownToHtml(markdown: string): string {
    // First, evaluate JavaScript expressions
    const withEvaluatedJS = this.evaluateJavaScriptExpressions(markdown);

    return withEvaluatedJS
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/^\- (.*$)/gm, '<li>$1</li>')
      .replace(/^(\d+)\. (.*$)/gm, '<li>$2</li>')
      .replace(/!\[image([^\]]*)\]\(([^)]+)\)/g, (match, attrs, src) => {
        let style = 'max-width: 100%; height: auto;';

        if (attrs.trim()) {
          if (attrs.includes('bg') || attrs.includes('background')) {
            return `<div class="page-background" style="background-image: url(${src}); background-size: cover; background-position: center; position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1;"></div>`;
          }

          const positions = attrs.match(/([xywh]):\s*([^;\s]+)/g);
          if (positions) {
            const styleMap: { [key: string]: string } = { 'x': 'left', 'y': 'top', 'w': 'width', 'h': 'height' };
            let positionStyle = 'position: absolute; ';
            positions.forEach((pos: string) => {
              const [key, value] = pos.split(':').map((s: string) => s.trim());
              if (styleMap[key]) {
                positionStyle += `${styleMap[key]}: ${value}; `;
              }
            });
            style = positionStyle;
          }
        }

        const convertedSrc = this.convertImagePath(src);
        return `<img src="${convertedSrc}" alt="image" style="${style}">`;
      })
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
        const convertedSrc = this.convertImagePath(src);
        return `<img src="${convertedSrc}" alt="${alt}" style="max-width: 100%; height: auto;">`;
      })
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\|.*\|/g, (match) => {
        const cells = match.split('|').map(cell => cell.trim()).filter(Boolean);
        return '<tr>' + cells.map(cell => `<td>${cell}</td>`).join('') + '</tr>';
      })
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(?!<[uh])/gm, '<p>')
      .replace(/(?<!>)$/gm, '</p>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
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

  private convertImagePath(imagePath: string): string {
    if (imagePath.startsWith('http') || imagePath.startsWith('data:') || isAbsolute(imagePath)) {
      return imagePath;
    }

    try {
      let absolutePath = resolve(process.cwd(), imagePath);

      if (existsSync(absolutePath)) {
        const fileData = readFileSync(absolutePath);
        const mimeType = this.getMimeType(absolutePath);
        const base64Data = fileData.toString('base64');
        return `data:${mimeType};base64,${base64Data}`;
      }

      const altPath = resolve(process.cwd(), 'assets', basename(imagePath));
      if (existsSync(altPath)) {
        const fileData = readFileSync(altPath);
        const mimeType = this.getMimeType(altPath);
        const base64Data = fileData.toString('base64');
        return `data:${mimeType};base64,${base64Data}`;
      }

      console.warn(`Image not found: ${imagePath}`);
      return imagePath; // Return original path as fallback
    } catch (error) {
      console.warn(`Error resolving image path ${imagePath}:`, error);
      return imagePath; // Return original path as fallback
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
}