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

  private extractBackgroundImages(html: string): { backgroundImages: string; contentWithoutBg: string } {
    const backgroundImageRegex = /<div class="image-(bg|wm)"[^>]*>.*?<\/div>/g;
    const pageBackgroundRegex = /<div class="page-background"[^>]*><\/div>/g;

    const backgroundImages: string[] = [];
    let contentWithoutBg = html;

    // Extract image-bg, image-wm divs (positioned background images)
    let match;
    while ((match = backgroundImageRegex.exec(html)) !== null) {
      backgroundImages.push(match[0]);
      contentWithoutBg = contentWithoutBg.replace(match[0], '');
    }

    // Extract page-background divs (legacy background images)
    while ((match = pageBackgroundRegex.exec(html)) !== null) {
      backgroundImages.push(match[0]);
      contentWithoutBg = contentWithoutBg.replace(match[0], '');
    }

    return {
      backgroundImages: backgroundImages.join('\n'),
      contentWithoutBg: contentWithoutBg.trim()
    };
  }

  private generateSectionedHtml(): string {
    const sectionsHtml = this.sections.map(section => {
      // Extract background images from section content
      const { backgroundImages, contentWithoutBg } = this.extractBackgroundImages(section.html);

      // Build section classes
      let sectionClasses = 'document-section';
      if (section.classes) {
        sectionClasses += ` ${section.classes}`;
      }

      return `
        <section class="${sectionClasses}" data-section="${section.index}">
          ${backgroundImages}
          ${this.directives.header ? this.generateHeader(section.index) : ''}
          <div class="section-content">
            ${contentWithoutBg}
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

    const parts = this.directives.header.split('|').filter(part => part !== '');
    const processedParts = parts.map(part => this.markdownToHtml(part.trim()));

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

    // If custom footer provided, split by | like header does
    if (footerContent) {
      const parts = footerContent.split('|').filter(part => part !== '');
      const processedParts = parts.map(part => {
        const replaced = part.trim()
          .replace(/\[page\]/g, pageNumber.toString())
          .replace(/\[total\]/g, totalPages.toString());
        return this.markdownToHtml(replaced);
      });

      const footerItems = processedParts.map((part, index) =>
        `<div class="footer-item">${part}</div>`
      ).join('');

      return `
        <footer class="document-footer">
          ${footerItems}
        </footer>
      `;
    }

    // Default footer if none provided
    return `
      <footer class="document-footer">
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
          background-size: 100% 100% !important;
          background-position: center !important;
          background-repeat: no-repeat !important;
        }
      `;
    }

    // Load user CSS file last (this should override theme styles)
    if (this.directives.style) {
      try {
        const baseDir = this.options.basePath || process.cwd();
        let stylePath: string;
        if (isAbsolute(this.directives.style)) {
          stylePath = this.directives.style;
        } else {
          stylePath = resolve(baseDir, this.directives.style);
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
          body[data-type="document"] .document-section,
          body:not([data-type]) .document-section {
            width: ${width} !important;
            height: ${height} !important;
            min-height: ${height} !important;
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

    const html = withEvaluatedJS
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/^\- (.*$)/gm, '<li>$1</li>')
      .replace(/^(\d+)\. (.*$)/gm, '<li>$2</li>')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
        // Handle ![image ...] syntax (legacy and new)
        if (alt.toLowerCase().startsWith('image')) {
          const attrs = alt.replace(/^image\s*/i, '');
          let style = 'max-width: 100%; height: auto;';

          if (attrs.trim()) {
            if (attrs.includes('bg') || attrs.includes('background')) {
              return `<div class="page-background" style="background-image: url(${src}); background-size: 100% 100%; background-position: center; position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1;"></div>`;
            }

            const positions = attrs.match(/([xywh]):\s*([^;\s]+)/g);
            if (positions) {
              const styleMap: { [key: string]: string } = { 'x': 'left', 'y': 'top', 'w': 'width', 'h': 'height' };
              let hasPositionAttrs = positions.some((pos: string) => pos.match(/^[xy]:/));
              let hasSizeAttrs = positions.some((pos: string) => pos.match(/^[wh]:/));

              if (hasPositionAttrs) {
                style = 'position: absolute; ';
              } else {
                style = '';
              }

              positions.forEach((pos: string) => {
                const [key, value] = pos.split(':').map((s: string) => s.trim());
                if (styleMap[key]) {
                  style += `${styleMap[key]}: ${value}; `;
                }
              });

              if (!hasPositionAttrs && hasSizeAttrs) {
                style += 'object-fit: contain;';
              }
            }
          }

          const convertedSrc = this.convertImagePath(src);
          return `<img src="${convertedSrc}" alt="image" style="${style}">`;
        }

        // Handle general image syntax with type identifiers and positioning
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
      .replace(/\|.*\|/g, (match) => {
        const cells = match.split('|').map(cell => cell.trim()).filter(Boolean);
        return '<tr>' + cells.map(cell => `<td>${cell}</td>`).join('') + '</tr>';
      })
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Apply paragraph wrapping similar to main converter
    const lines = html.split('\n');
    const processedLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') continue;

      // Don't wrap block elements or positioned image divs
      if (trimmed.match(/^<(h[1-6]|ul|ol|li|table|div|header|footer|pre|img|br|code)/)) {
        processedLines.push(trimmed);
      } else if (trimmed.match(/^<\/(h[1-6]|ul|ol|li|table|div|header|footer|pre)/)) {
        processedLines.push(trimmed);
      } else {
        // Wrap in paragraph tags only if not empty
        if (trimmed) {
          processedLines.push(`<p style="position: relative; z-index: 2;">${trimmed}</p>`);
        }
      }
    }

    return processedLines.join('\n');
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
    // Handle meta variable access: meta.fieldname
    if (expression.startsWith('meta.')) {
      const fieldName = expression.substring(5).trim();
      if (this.directives.meta && fieldName in this.directives.meta) {
        return this.directives.meta[fieldName];
      }
      // Error handling: field not found
      console.warn(`Metadata field not found: ${fieldName}`);
      return `[meta.${fieldName} not found]`;
    }

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

    // For HTML exports, default to NOT embedding images (keep relative paths)
    // This keeps HTML file size small
    const shouldEmbed = this.options.embedImages ?? false;

    if (!shouldEmbed) {
      // Keep relative path as-is for HTML export
      return imagePath;
    }

    // Embed as base64 if explicitly requested
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
}