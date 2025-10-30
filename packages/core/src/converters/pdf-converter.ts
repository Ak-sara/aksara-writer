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

    if (this.directives.style) {
      try {
        const baseDir = this.options.basePath || process.cwd();
        let stylePath: string;
        if (isAbsolute(this.directives.style)) {
          stylePath = this.directives.style;
        } else {
          stylePath = resolve(baseDir, this.directives.style);

          if (!existsSync(stylePath) && this.options.sourceDir) {
            stylePath = resolve(this.options.sourceDir, this.directives.style);
          }
        }

        if (existsSync(stylePath)) {
          const customCss = readFileSync(stylePath, 'utf-8');
          styles += `\n/* Custom user styles from: ${this.directives.style} (applied last for PDF) */\n${customCss}\n`;
          console.log(`Loaded custom CSS from: ${stylePath}`);
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

  private expandCustomStyles(): string {
    const customStyles = this.getCustomStyles();

    // Expand nested CSS for PDF compatibility
    let expandedStyles = customStyles
      .replace(/\.document-section/g, '.pdf-page')
      .replace(/\.section-content/g, '.pdf-content');

    // Handle nested CSS by expanding it
    // Convert .pdf-page { h1 {border:none} } to .pdf-page h1 {border:none}
    expandedStyles = expandedStyles.replace(
      /\.pdf-page\s*\{\s*([^}]*?\s*)(h[1-6]|p|ul|li|strong|br)\s*\{([^}]*)\}/g,
      (match, prefix, element, styles) => {
        return `.pdf-page ${element} {${styles}} ${prefix.trim() ? `.pdf-page {${prefix}}` : ''}`;
      }
    );

    // Handle :first-child and :last-child pseudo-selectors
    expandedStyles = expandedStyles.replace(
      /\.pdf-page:(first|last)-child/g,
      '.pdf-page:$1-child'
    );

    // Ensure content has proper z-index above background images and proper flex alignment
    expandedStyles += `
    .pdf-page .pdf-content {
      position: relative !important;
      z-index: 2 !important;
    }
    .pdf-page {
      display: flex !important;
      flex-direction: column !important;
      justify-content: flex-start !important;
    }
    .pdf-page .document-footer .page-number {
      position: relative !important;
      align-self: flex-start !important;
    }`;

    return expandedStyles;
  }

  async convert(): Promise<ConvertResult> {
    try {
      const stackedHtml = this.generateStackedHtmlForPdf();
      const htmlWithAbsolutePaths = this.convertRelativeImagePaths(stackedHtml);

      let puppeteer;
      try {
        puppeteer = await import('puppeteer');
      } catch (importError) {
        return {
          success: false,
          error: 'PDF generation unavailable: puppeteer not installed. Install with: bun add puppeteer'
        };
      }

      const browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();

      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
      });

      await page.setContent(htmlWithAbsolutePaths, {
        waitUntil: 'networkidle2',
        timeout: 60000 // Increase timeout to 60 seconds for documents with many mermaid diagrams
      });

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

      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          if (typeof (window as any).mermaid === 'undefined') {
            console.log('Mermaid not loaded, skipping diagram rendering');
            resolve();
            return;
          }

          const mermaidElements = document.querySelectorAll('.mermaid, pre code.language-mermaid');
          if (mermaidElements.length === 0) {
            resolve();
            return;
          }

          console.log(`Rendering ${mermaidElements.length} mermaid diagrams...`);
          const checkInterval = setInterval(() => {
            const rendered = Array.from(mermaidElements).every(el => {
              return el.querySelector('svg') !== null || el.getAttribute('data-processed') === 'true';
            });

            if (rendered) {
              clearInterval(checkInterval);
              console.log('All mermaid diagrams rendered');
              resolve();
            }
          }, 100);

          setTimeout(() => {
            clearInterval(checkInterval);
            console.log('Mermaid rendering timeout, proceeding anyway');
            resolve();
          }, 15000);
        });
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

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
        ${isPresentation ? 'display: flex !important; flex-direction: column !important; justify-content: center !important; padding: 2rem !important;' : 'padding: 2rem 0!important;'}
      }
    </style>
</head>
<body data-type="${isPresentation ? 'presentation' : 'document'}">
    ${html}
</body>
</html>`;
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

  private generateStackedHtmlForPdf(): string {
    const isPresentation = this.directives.type === 'presentation';
    const { pageWidth, pageHeight } = this.getPageDimensions();

    // Generate each section as a simple stacked block
    const sectionsHtml = this.sections.map((section, index) => {
      const pageNumber = index + 1;
      const headerHtml = this.directives.header ? this.generateHeader(pageNumber) : '';
      const footerHtml = this.generateFooter(pageNumber);

      // Extract background images from section content
      const { backgroundImages, contentWithoutBg } = this.extractBackgroundImages(section.html);

      return `
        <div class="pdf-page${section.classes ? ` ${section.classes}` : ''}">
          ${backgroundImages}
          ${headerHtml}
          <div class="pdf-content">
            ${contentWithoutBg}
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

    <!-- Mermaid.js for diagrams -->
    <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
    <script>
      if (typeof mermaid !== 'undefined') {
        mermaid.initialize({
          startOnLoad: true,
          theme: 'default',
          securityLevel: 'loose',
          gantt: {
            useWidth: 1100  // Set a reasonable default width for Gantt charts
          }
        });

        // After Mermaid renders, resize Gantt charts to fit container
        window.addEventListener('load', () => {
          setTimeout(() => {
            document.querySelectorAll('.mermaid.gantt-chart svg').forEach(svg => {
              // Remove fixed width/height attributes
              svg.removeAttribute('width');
              svg.removeAttribute('height');
              // Set viewBox if not present
              if (!svg.getAttribute('viewBox')) {
                const bbox = svg.getBBox();
                svg.setAttribute('viewBox', \`0 0 \${bbox.width} \${bbox.height}\`);
              }
            });
          }, 500);
        });
      }
    </script>

    <style>
      ${this.loadTemplate('styles/base.css')}
      ${this.getThemeStyles()}
      ${this.loadTemplate('styles/controls.css')}
      ${this.loadTemplate('styles/document.css')}

      /* Custom styles for PDF - map .document-section to .pdf-page and expand nested CSS */
      ${this.expandCustomStyles()}

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
        ${this.directives.background ? `background-image: url("${this.convertImagePath(this.directives.background)}") !important; background-size: 100% 100% !important; background-position: center !important; background-repeat: no-repeat !important;` : ''}
      }

      .pdf-page:last-child {
        page-break-after: avoid !important;
      }

      .pdf-content {
        flex: 1 !important;
        ${isPresentation ? 'display: flex !important; flex-direction: column !important; justify-content: flex-start !important; padding: 2rem !important;' : 'padding: 2rem !important;'}
        overflow: hidden !important;
      }

      .document-header, .document-footer {
        flex-shrink: 0 !important;
      }

      /* Preserve header layout from base.css */
      .pdf-page .document-header {
        background: transparent !important;
        /* Keep original flex layout for proper header-item alignment */
      }

      .pdf-page .document-footer {
        background: transparent !important;
        /* Keep original flex layout */
      }

      /* Fix background images to cover full page */
      .pdf-page .page-background,
      .pdf-page .image-wm {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        z-index: -1 !important;
        background-size: 100% 100% !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
      }

      /* Section background images (bg directive images) should be above page background but below content */
      .pdf-page .image-bg {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        z-index: 1 !important;
        background-size: 100% 100% !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
      }

      /* Override any absolute positioning from original styles */
      .pdf-page * {
        position: static !important;
      }

      /* Allow specific positioned elements */
      .pdf-page img[style*="position: absolute"],
      .pdf-page .page-background,
      .pdf-page .image-bg,
      .pdf-page .image-wm,
      .pdf-page .image-fg,
      .pdf-page .image-lg,
      .pdf-page div[style*="position: absolute"] {
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

    // Extract background images from section content
    const { backgroundImages, contentWithoutBg } = this.extractBackgroundImages(section.html);

    return `
<!DOCTYPE html>
<html lang="${this.options.locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.metadata.title || 'Aksara Document'} - Page ${pageNumber}</title>
    <style>
      ${this.loadTemplate('styles/base.css')}
      ${this.getThemeStyles()}
      ${this.loadTemplate('styles/controls.css')}
      ${this.loadTemplate('styles/document.css')}

      /* Custom styles for PDF - map .document-section to .pdf-page and expand nested CSS */
      ${this.expandCustomStyles()}

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
        ${this.directives.background ? `background-image: url(${this.convertImagePath(this.directives.background)}) !important; background-size: 100% 100% !important; background-position: center !important; background-repeat: no-repeat !important;` : ''}
      }

      .section-content {
        flex: 1 !important;
        ${isPresentation ? 'display: flex !important; flex-direction: column !important; justify-content: center !important; padding: 2rem !important;' : 'padding: 2rem 0!important;'}
        overflow: hidden !important;
      }

      .document-header, .document-footer {
        flex-shrink: 0 !important;
      }

      /* Preserve header layout from base.css but make it less intrusive */
      .document-header {
        background: transparent !important;
        /* Keep original flex layout for proper header-item alignment */
      }

      .document-footer {
        background: transparent !important;
        /* Keep original flex layout */
      }

      /* Fix background images to cover full page */
      .page-background,
      .image-bg,
      .image-wm {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        z-index: -1 !important;
        background-size: cover !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
      }

      /* Ensure other positioned images work correctly */
      .image-fg,
      .image-lg {
        position: absolute !important;
        z-index: 5 !important;
      }
    </style>
</head>
<body data-type="${isPresentation ? 'presentation' : 'document'}">
    <div class="aksara-document">
        <section class="document-section${section.classes ? ` ${section.classes}` : ''}">
          ${backgroundImages}
          ${headerHtml}
          <div class="section-content">
            ${contentWithoutBg}
          </div>
          ${footerHtml}
        </section>
    </div>
</body>
</html>`;
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

  private markdownToHtml(markdown: string): string {
    // First, evaluate JavaScript expressions
    const withEvaluatedJS = this.evaluateJavaScriptExpressions(markdown);

    // Preserve existing HTML span tags with style attributes before markdown processing
    const htmlPreserved = withEvaluatedJS.replace(/<span[^>]*style="[^"]*"[^>]*>.*?<\/span>/g, (match) => {
      return `__HTML_PRESERVE_${Buffer.from(match).toString('base64')}_HTML_PRESERVE__`;
    });

    const processed = htmlPreserved
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
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
        const posMatch = alt.match(/([trblxywh]):[^;\s]+/g);

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
          // For bg images, create a background div instead of img element to ensure proper rendering
          if (imageType === 'bg') {
            return `<div class="image-${imageType}" style="${style} background-image: url('${convertedSrc}'); background-size: 100% 100%; background-position: center; background-repeat: no-repeat;"></div>`;
          }
          return `<div class="image-${imageType}" style="${style}"><img src="${convertedSrc}" alt="${cleanAlt}" style="width: 100%; height: 100%; object-fit: fill;"></div>`;
        }

        return `<img src="${convertedSrc}" alt="${cleanAlt}" style="${style}">`;
      })
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Restore preserved HTML span tags
    return processed.replace(/__HTML_PRESERVE_([A-Za-z0-9+/=]+)_HTML_PRESERVE__/g, (match, base64) => {
      return Buffer.from(base64, 'base64').toString('utf8');
    });
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
    const baseDir = this.options.basePath || process.cwd();
    const convertPath = (imagePath: string): string | null => {
      if (imagePath.startsWith('http') || imagePath.startsWith('data:') || isAbsolute(imagePath)) {
        return null;
      }

      try {
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