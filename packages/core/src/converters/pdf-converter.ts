import { DocumentSection, AksaraDirectives, DocumentMetadata, ConvertOptions, ConvertResult } from '../types';
import { HtmlConverter } from './html-converter';
import { readFileSync, existsSync } from 'fs';
import { resolve, isAbsolute, basename, extname } from 'path';

export class PdfConverter {
  private htmlConverter: HtmlConverter;

  constructor(
    private sections: DocumentSection[],
    private directives: AksaraDirectives,
    private metadata: DocumentMetadata,
    private options: ConvertOptions,
    private loadTemplate: (path: string) => string,
    private replaceTemplateVars: (template: string, vars: Record<string, string>) => string
  ) {
    this.htmlConverter = new HtmlConverter(sections, directives, metadata, options, loadTemplate, replaceTemplateVars);
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

  private getCustomStyles(): string {
    let styles = '';

    // Load custom CSS file for PDF
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
          styles += `\n/* Custom user styles from: ${this.directives.style} (applied last for PDF) */\n${customCss}\n`;
        } else {
          console.warn(`Custom style file not found: ${this.directives.style} (resolved to: ${stylePath})`);
          styles += `/* Custom style file not found: ${this.directives.style} */\n`;
        }
      } catch (error) {
        console.warn(`Error loading custom style file ${this.directives.style}:`, error);
        styles += `/* Error loading custom style file: ${this.directives.style} */\n`;
      }
    }

    return styles;
  }


  async convert(): Promise<ConvertResult> {
    try {
      // Generate simple stacked HTML for PDF (no presentation CSS)
      const stackedHtml = this.generateStackedHtmlForPdf();
      const htmlWithAbsolutePaths = this.convertRelativeImagePaths(stackedHtml);

      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();

      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
      });

      await page.setContent(htmlWithAbsolutePaths, { waitUntil: 'networkidle2' });

      // Wait for images to load
      await page.evaluate(() => {
        const images = Array.from(document.querySelectorAll('img'));
        return Promise.all(images.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => {
              console.warn('Image failed to load:', img.src);
              resolve();
            };
          });
        }));
      });

      // Add a small delay to ensure layout is complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      const pdfOptions = this.getPdfOptions();
      const pdfBuffer = await page.pdf(pdfOptions);
      await browser.close();

      return {
        success: true,
        data: Buffer.from(pdfBuffer),
        mimeType: 'application/pdf'
      };

    } catch (error) {
      return {
        success: false,
        error: `PDF conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private applyPrintTheme(html: string): string {
    const isPresentation = this.directives.type === 'presentation';
    const { pageWidth, pageHeight } = this.getPageDimensions();

    return `
<!DOCTYPE html>
<html lang="${this.options.locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.metadata.title || 'Aksara Document'}</title>
    <style>
      ${this.getThemeStyles()}

      /* Hide all interactive controls for PDF */
      .document-controls, .presentation-controls { display: none !important; }

      /* PDF-specific optimizations */
      * { box-sizing: border-box !important; }
      html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
      body { background: #2a2a2a !important; font-family: 'Inter', 'Segoe UI', 'Noto Sans', sans-serif !important; }

      @page {
        size: ${pageWidth} ${pageHeight};
        margin: 0;
      }

      .aksara-document {
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        display: block !important;
      }

      /* Force all sections to be visible and stacked for PDF */
      .document-section {
        position: relative !important;
        width: ${pageWidth} !important;
        height: ${pageHeight} !important;
        min-height: ${pageHeight} !important;
        max-height: ${pageHeight} !important;
        margin: 0 !important;
        padding: 0 !important;
        page-break-after: always !important;
        page-break-inside: avoid !important;
        break-after: page !important;
        break-inside: avoid !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        overflow: hidden !important;
        transform: none !important;
        /* Override any presentation-specific hiding */
        left: auto !important;
        top: auto !important;
        z-index: auto !important;
        box-sizing: border-box !important;
      }

      .document-section:last-child {
        page-break-after: avoid !important;
        break-after: avoid !important;
      }

      /* Override presentation CSS that might hide sections */
      .document-section.next,
      .document-section.prev,
      .document-section:not(.active) {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        transform: none !important;
      }

      .section-content {
        flex: 1 !important;
        height: 100% !important;
        ${isPresentation ? 'display: flex !important; flex-direction: column !important; justify-content: center !important; padding: 2rem !important;' : 'padding: 2rem !important;'}
      }
    </style>
</head>
<body data-type="${isPresentation ? 'presentation' : 'document'}">
    ${html}
</body>
</html>`;
  }

  private generateStackedHtmlForPdf(): string {
    const isPresentation = this.directives.type === 'presentation';
    const { pageWidth, pageHeight } = this.getPageDimensions();

    // Generate each section as a simple stacked block
    const sectionsHtml = this.sections.map((section, index) => {
      const pageNumber = index + 1;
      const headerHtml = this.directives.header ? this.generateHeader(pageNumber) : '';
      const footerHtml = this.generateFooter(pageNumber);

      return `
        <div class="pdf-page">
          ${headerHtml}
          <div class="pdf-content">
            ${section.html}
          </div>
          ${footerHtml}
        </div>
      `;
    }).join('\n');

    return `
<!DOCTYPE html>
<html lang="${this.options.locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.metadata.title || 'Aksara Document'}</title>
    <style>
      ${this.getThemeStyles()}
      ${this.loadTemplate('styles/controls.css')}
      ${this.loadTemplate('styles/document.css')}

      /* Custom styles for PDF */
      ${this.getCustomStyles()}

      /* Hide all interactive controls for PDF */
      .document-controls, .presentation-controls,
      .aksara-document, .document-section { display: none !important; }

      /* Simple PDF layout - no positioning tricks */
      * { box-sizing: border-box !important; }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        font-family: 'Inter', 'Segoe UI', 'Noto Sans', sans-serif !important;
        background: #2a2a2a !important;
      }

      @page {
        size: ${pageWidth} ${pageHeight};
        margin: 0;
      }

      /* Each page is a simple block that will break naturally */
      .pdf-page {
        width: 100% !important;
        height: ${pageHeight} !important;
        min-height: ${pageHeight} !important;
        max-height: ${pageHeight} !important;
        margin: 0 !important;
        padding: 0 !important;
        page-break-after: always !important;
        page-break-inside: avoid !important;
        display: flex !important;
        flex-direction: column !important;
        position: relative !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
        ${this.directives.background ? `background-image: url(${this.convertImagePath(this.directives.background)}) !important; background-size: cover !important; background-position: center !important; background-repeat: no-repeat !important;` : ''}
      }

      .pdf-page:last-child {
        page-break-after: avoid !important;
      }

      .pdf-content {
        flex: 1 !important;
        ${isPresentation ? 'display: flex !important; flex-direction: column !important; justify-content: center !important; padding: 2rem !important;' : 'padding: 2rem !important;'}
        overflow: hidden !important;
      }

      .document-header, .document-footer {
        flex-shrink: 0 !important;
      }

      /* Override any absolute positioning from original styles */
      .pdf-page * {
        position: static !important;
      }

      /* Allow specific positioned elements (like images with x:, y: attributes) */
      .pdf-page img[style*="position: absolute"] {
        position: absolute !important;
      }
    </style>
</head>
<body>
    ${sectionsHtml}
</body>
</html>`;
  }

  private generateSingleSectionHtml(section: any, pageNumber: number): string {
    const isPresentation = this.directives.type === 'presentation';
    const { pageWidth, pageHeight } = this.getPageDimensions();

    const headerHtml = this.directives.header ? this.generateHeader(pageNumber) : '';
    const footerHtml = this.generateFooter(pageNumber);

    return `
<!DOCTYPE html>
<html lang="${this.options.locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.metadata.title || 'Aksara Document'} - Page ${pageNumber}</title>
    <style>
      ${this.getThemeStyles()}

      /* Hide all interactive controls for PDF */
      .document-controls, .presentation-controls { display: none !important; }

      /* PDF-specific optimizations */
      * { box-sizing: border-box !important; }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: 100% !important;
      }
      body {
        background: #2a2a2a !important;
        font-family: 'Inter', 'Segoe UI', 'Noto Sans', sans-serif !important;
      }

      @page {
        size: ${pageWidth} ${pageHeight};
        margin: 0;
      }

      .aksara-document {
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        display: flex !important;
        flex-direction: column !important;
      }

      .document-section {
        position: relative !important;
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        box-sizing: border-box !important;
        ${this.directives.background ? `background-image: url(${this.convertImagePath(this.directives.background)}) !important; background-size: cover !important; background-position: center !important; background-repeat: no-repeat !important;` : ''}
      }

      .section-content {
        flex: 1 !important;
        ${isPresentation ? 'display: flex !important; flex-direction: column !important; justify-content: center !important; padding: 2rem !important;' : 'padding: 2rem !important;'}
        overflow: hidden !important;
      }

      .document-header, .document-footer {
        flex-shrink: 0 !important;
      }
    </style>
</head>
<body data-type="${isPresentation ? 'presentation' : 'document'}">
    <div class="aksara-document">
        <section class="document-section">
          ${headerHtml}
          <div class="section-content">
            ${section.html}
          </div>
          ${footerHtml}
        </section>
    </div>
</body>
</html>`;
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
      .replace(/!\[image([^\]]*)\]\(([^)]+)\)/g, (match, attrs, src) => {
        const convertedSrc = this.convertImagePath(src);
        let style = 'max-width: 100%; height: auto;';

        if (attrs.trim()) {
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

        return `<img src="${convertedSrc}" alt="image" style="${style}">`;
      })
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
        const convertedSrc = this.convertImagePath(src);
        return `<img src="${convertedSrc}" alt="${alt}" style="max-width: 100%; height: auto;">`;
      })
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
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

  private async mergePdfBuffers(pdfBuffers: Buffer[]): Promise<Buffer> {
    if (pdfBuffers.length === 0) {
      throw new Error('No PDF buffers to merge');
    }

    if (pdfBuffers.length === 1) {
      return pdfBuffers[0];
    }

    // For now, just concatenate the buffers
    // In a more robust implementation, you'd use a PDF library like pdf-lib
    // to properly merge PDFs, but for basic functionality, this should work
    return Buffer.concat(pdfBuffers);
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
      return imagePath;
    } catch (error) {
      console.warn(`Error resolving image path ${imagePath}:`, error);
      return imagePath;
    }
  }

  private getPageDimensions(): { pageWidth: string; pageHeight: string } {
    if (this.directives.size) {
      const size = this.directives.size;

      // Handle mm dimensions (e.g., 210mmx297mm)
      if (size.includes('mm')) {
        const dimensions = size.split('x');
        if (dimensions.length === 2) {
          return {
            pageWidth: dimensions[0],
            pageHeight: dimensions[1]
          };
        }
      }

      // Handle aspect ratios (e.g., 16:9, 4:3)
      if (size.includes(':')) {
        const [w, h] = size.split(':').map(Number);
        const aspectRatio = w / h;

        if (aspectRatio > 1) { // Landscape
          return {
            pageWidth: '29.7cm',
            pageHeight: `${29.7 / aspectRatio}cm`
          };
        } else { // Portrait or square
          return {
            pageWidth: `${21 * aspectRatio}cm`,
            pageHeight: '29.7cm'
          };
        }
      }
    }

    // Default dimensions
    const isPresentation = this.directives.type === 'presentation';
    return isPresentation
      ? { pageWidth: '29.7cm', pageHeight: '21cm' }
      : { pageWidth: '21cm', pageHeight: '29.7cm' };
  }

  private convertRelativeImagePaths(html: string): string {
    const convertPath = (imagePath: string): string | null => {
      if (imagePath.startsWith('http') || imagePath.startsWith('data:') || isAbsolute(imagePath)) {
        return null;
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
        return null;
      } catch (error) {
        console.warn(`Error resolving image path ${imagePath}:`, error);
        return null;
      }
    };

    html = html.replace(/src="([^"]+)"/g, (match, src) => {
      const convertedPath = convertPath(src);
      return convertedPath ? `src="${convertedPath}"` : match;
    });

    html = html.replace(/background-image:\s*url\(([^)]+)\)/g, (match, url) => {
      const cleanUrl = url.replace(/['"]/g, '');
      const convertedPath = convertPath(cleanUrl);
      return convertedPath ? `background-image: url(${convertedPath})` : match;
    });

    return html;
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

  private getPdfOptions(): any {
    const isPresentation = this.directives.type === 'presentation';

    // Handle different size formats
    if (this.directives.size) {
      const size = this.directives.size;

      // Handle mm dimensions (e.g., 210mmx297mm)
      if (size.includes('mm')) {
        const dimensions = size.split('x');
        if (dimensions.length === 2) {
          const width = dimensions[0];
          const height = dimensions[1];
          return {
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
            preferCSSPageSize: true,
            width: width,
            height: height,
            tagged: false,
            outline: false
          };
        }
      }

      // Handle aspect ratios (e.g., 16:9, 4:3)
      if (size.includes(':')) {
        const [w, h] = size.split(':').map(Number);
        const aspectRatio = w / h;

        // Calculate landscape dimensions based on aspect ratio
        if (aspectRatio > 1) { // Landscape
          return {
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
            preferCSSPageSize: true,
            width: '29.7cm',
            height: `${29.7 / aspectRatio}cm`,
            tagged: false,
            outline: false
          };
        } else { // Portrait or square
          return {
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
            preferCSSPageSize: true,
            width: `${21 * aspectRatio}cm`,
            height: '29.7cm',
            tagged: false,
            outline: false
          };
        }
      }
    }

    // Default fallback
    if (isPresentation) {
      return {
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
        preferCSSPageSize: true,
        tagged: false,
        outline: false
      };
    } else {
      return {
        format: 'A4',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
        preferCSSPageSize: true,
        tagged: false,
        outline: false
      };
    }
  }
}