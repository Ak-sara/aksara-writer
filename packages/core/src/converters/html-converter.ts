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

    return `
      <header class="document-header">
        <div class="header-left">${processedParts[0] || ''}</div>
        <div class="header-center">${processedParts[1] || ''}</div>
        <div class="header-right">${processedParts[2] || ''}</div>
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
    const theme = this.getDocumentTheme();
    const customStyles = this.getCustomStyles();
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
      theme,
      customStyles,
      presentationStyles: isPresentation ? this.getPresentationStyles() : '',
      generalStyles: this.getGeneralStyles(),
      documentType: isPresentation ? 'presentation' : 'document',
      controls: isPresentation ? this.getPresentationControls(totalSections) : this.getDocumentControls(totalSections),
      content: html,
      scriptContent
    });
  }

  private getDocumentTheme(): string {
    return this.loadTemplate('styles/document-theme.css');
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

  private getGeneralStyles(): string {
    return this.loadTemplate('styles/controls.css') + '\n' + this.loadTemplate('styles/document.css');
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

  private getCustomStyles(): string {
    let styles = '';

    if (this.directives.size) {
      styles += this.parseSizeDirective(this.directives.size);
    }

    if (this.directives.background) {
      const backgroundPath = this.convertImagePath(this.directives.background);
      styles += `
        .document-section {
          background-image: url(${backgroundPath}) !important;
          background-size: cover !important;
          background-position: center !important;
          background-repeat: no-repeat !important;
        }
      `;
    }

    if (this.directives.style) {
      styles += `/* Custom styles from: ${this.directives.style} */\n`;
    }

    return styles;
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
    return markdown
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