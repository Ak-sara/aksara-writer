/**
 * Aksara Writer Core
 * Modern markdown-to-document converter for Indonesian businesses
 *
 * Unlike Marp (presentation-focused), Aksara Writer is document-focused:
 * - Uses markdown as high-level language
 * - Interprets custom directives for document structure
 * - Generates sectioned HTML with precise sizing
 * - Exports to PDF/PPTX with document layout
 */

export interface ConvertOptions {
  format: 'html' | 'pdf' | 'pptx';
  theme?: string;
  template?: string;
  locale?: 'id' | 'en';
  pageSize?: 'A4' | 'Letter' | 'Legal';
  orientation?: 'portrait' | 'landscape';
}

export interface DocumentMetadata {
  title?: string;
  subtitle?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  created?: Date;
  modified?: Date;
}

export interface AksaraDirectives {
  aksara: boolean;
  type?: 'document' | 'presentation'; // document for A4/print, presentation for slides
  style?: string;
  size?: string; // e.g., "210mmx297mm", "16:9", "4:3"
  meta?: {
    title?: string;
    subtitle?: string;
  };
  header?: string; // e.g., "| left | center | right |"
  footer?: string;
  background?: string;
}

export interface DocumentSection {
  content: string;
  index: number;
  html: string;
}

export interface ConvertResult {
  success: boolean;
  data?: Buffer;
  mimeType?: string;
  error?: string;
}

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
      // Parse Aksara directives and content
      const { content, directives } = this.parseAksaraDirectives(markdown);
      this.directives = directives;

      // Parse sections (split by ---)
      this.sections = this.parseSections(content);

      switch (this.options.format) {
        case 'html':
          return await this.convertToHtml();
        case 'pdf':
          return await this.convertToPdf();
        case 'pptx':
          return await this.convertToPptx();
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
   * Format: <!-- aksara:true ... -->
   */
  private parseAksaraDirectives(markdown: string): { content: string; directives: AksaraDirectives } {
    const directiveRegex = /<!--\s*([\s\S]*?)\s*-->/;
    const match = markdown.match(directiveRegex);

    const directives: AksaraDirectives = { aksara: false };

    if (match) {
      const directiveBlock = match[1];
      const content = markdown.replace(match[0], '').trim();

      // Parse each directive line
      directiveBlock.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        if (trimmed === 'aksara:true') {
          directives.aksara = true;
        } else if (trimmed.startsWith('type:')) {
          const typeValue = trimmed.replace('type:', '').trim();
          directives.type = typeValue as 'document' | 'presentation';
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
          // Parse meta block (simplified)
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
   * Parse content into sections (split by ---)
   */
  private parseSections(content: string): DocumentSection[] {
    const sections = content.split(/^---$/m).map(section => section.trim()).filter(Boolean);

    return sections.map((sectionContent, index) => ({
      content: sectionContent,
      index: index + 1,
      html: this.markdownToHtml(sectionContent)
    }));
  }

  /**
   * Convert to sectioned HTML with document layout
   */
  private async convertToHtml(): Promise<ConvertResult> {
    const html = this.generateSectionedHtml();
    const styledHtml = this.applyDocumentTheme(html);

    return {
      success: true,
      data: Buffer.from(styledHtml, 'utf-8'),
      mimeType: 'text/html'
    };
  }

  /**
   * Convert to PDF with document layout
   */
  private async convertToPdf(): Promise<ConvertResult> {
    try {
      const html = this.generateSectionedHtml();
      const styledHtml = this.applyDocumentTheme(html);

      // Real PDF generation using Puppeteer
      const styledHtmlForPrint = this.applyPrintTheme(html);

      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.default.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();

      // Convert relative image paths to absolute paths
      const htmlWithAbsolutePaths = this.convertRelativeImagePaths(styledHtmlForPrint);

      // Enable image loading for file:// URLs
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
      });

      await page.setContent(htmlWithAbsolutePaths, { waitUntil: 'networkidle2' });

      // Wait for images to load
      await page.evaluate(() => {
        const images = Array.from(document.querySelectorAll('img'));
        return Promise.all(images.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => {
              console.warn('Image failed to load:', img.src);
              resolve(); // Continue even if image fails
            };
          });
        }));
      });

      // Get PDF options based on document type
      const pdfOptions = this.getPdfOptions();
      const pdfBuffer = await page.pdf(pdfOptions);

      await browser.close();

      return {
        success: true,
        data: pdfBuffer,
        mimeType: 'application/pdf'
      };

    } catch (error) {
      return {
        success: false,
        error: `PDF conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Convert to PPTX with business document layout
   */
  private async convertToPptx(): Promise<ConvertResult> {
    try {
      const PptxGenJS = (await import('pptxgenjs')).default;
      const pptx = new PptxGenJS();

      // Set presentation metadata
      pptx.author = 'Aksara Writer';
      pptx.title = this.metadata.title || 'Aksara Document';
      pptx.subject = this.metadata.subtitle || 'Generated by Aksara Writer';

      // Determine layout based on size directive
      const layout = this.getPptxLayout();

      // Process each section as a slide
      for (let i = 0; i < this.sections.length; i++) {
        const section = this.sections[i];
        const slide = pptx.addSlide();

        // Set slide layout
        slide.slideLayout = layout;

        // Add background if specified
        if (this.directives.background) {
          await this.addPptxBackground(slide, this.directives.background);
        }

        // Add header if specified
        if (this.directives.header) {
          this.addPptxHeader(slide, i + 1);
        }

        // Convert markdown content to PPTX elements
        await this.addMarkdownToPptx(slide, section.content);

        // Add footer if specified
        if (this.directives.footer) {
          this.addPptxFooter(slide);
        }
      }

      // Generate PPTX buffer
      const pptxBuffer = await pptx.write({ outputType: 'nodebuffer' });

      if (!pptxBuffer || pptxBuffer.length === 0) {
        throw new Error('Generated PPTX data is empty');
      }

      return {
        success: true,
        data: pptxBuffer,
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      };

    } catch (error) {
      return {
        success: false,
        error: `PPTX conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get PPTX layout based on size directive
   */
  private getPptxLayout(): any {
    if (this.directives.size?.includes(':')) {
      const [w, h] = this.directives.size.split(':').map(Number);
      if (w === 16 && h === 9) {
        return { name: 'LAYOUT_16x9', width: 10, height: 5.625 };
      } else if (w === 4 && h === 3) {
        return { name: 'LAYOUT_4x3', width: 10, height: 7.5 };
      }
    }
    // Default to 16:9
    return { name: 'LAYOUT_16x9', width: 10, height: 5.625 };
  }

  /**
   * Add background image to PPTX slide
   */
  private async addPptxBackground(slide: any, backgroundPath: string): Promise<void> {
    try {
      const path = require('path');
      const fs = require('fs');

      // Resolve background path
      let absolutePath = path.resolve(process.cwd(), backgroundPath);
      if (!fs.existsSync(absolutePath)) {
        // Try alternative path
        absolutePath = path.resolve(process.cwd(), 'assets', path.basename(backgroundPath));
      }

      if (fs.existsSync(absolutePath)) {
        // Read image as base64
        const imageData = fs.readFileSync(absolutePath);
        const base64Data = imageData.toString('base64');
        const mimeType = this.getMimeType(absolutePath);

        slide.background = {
          data: `data:${mimeType};base64,${base64Data}`,
          sizing: 'cover'
        };
        console.log(`✓ PPTX background added: ${backgroundPath}`);
      } else {
        console.warn(`✗ PPTX background not found: ${backgroundPath}`);
      }
    } catch (error) {
      console.warn(`Error adding PPTX background: ${error}`);
    }
  }

  /**
   * Add header to PPTX slide
   */
  private addPptxHeader(slide: any, pageNumber: number): void {
    if (!this.directives.header) return;

    const parts = this.directives.header.split('|').map(part => part.trim()).filter(Boolean);

    // Simple header - place at top of slide
    const headerText = parts.join(' | ').replace(/!\[image[^\]]*\]\([^)]+\)/g, ''); // Remove image syntax for now

    slide.addText(headerText, {
      x: 0.5,
      y: 0.2,
      w: 9,
      h: 0.5,
      fontSize: 12,
      color: '666666',
      align: 'center'
    });
  }

  /**
   * Add footer to PPTX slide
   */
  private addPptxFooter(slide: any): void {
    if (!this.directives.footer) return;

    slide.addText(this.directives.footer, {
      x: 0.5,
      y: 5,
      w: 9,
      h: 0.5,
      fontSize: 10,
      color: '666666',
      align: 'center'
    });
  }

  /**
   * Convert markdown content to PPTX elements
   */
  private async addMarkdownToPptx(slide: any, markdown: string): Promise<void> {
    // Split content into lines for processing
    const lines = markdown.split('\n').filter(line => line.trim());
    let currentY = 1; // Start below header

    for (const line of lines) {
      if (line.startsWith('# ')) {
        // Main title
        slide.addText(line.replace('# ', ''), {
          x: 0.5,
          y: currentY,
          w: 9,
          h: 0.8,
          fontSize: 36,
          bold: true,
          color: '2c3e50',
          align: 'center'
        });
        currentY += 1;
      } else if (line.startsWith('## ')) {
        // Subtitle
        slide.addText(line.replace('## ', ''), {
          x: 0.5,
          y: currentY,
          w: 9,
          h: 0.6,
          fontSize: 24,
          bold: true,
          color: '34495e',
          align: 'center'
        });
        currentY += 0.8;
      } else if (line.startsWith('### ')) {
        // Section header
        slide.addText(line.replace('### ', ''), {
          x: 0.5,
          y: currentY,
          w: 9,
          h: 0.5,
          fontSize: 20,
          bold: true,
          color: '34495e'
        });
        currentY += 0.6;
      } else if (line.startsWith('- ') || line.startsWith('✅ ')) {
        // Bullet point
        const bulletText = line.replace(/^- |^✅ /, '');
        slide.addText(`• ${bulletText}`, {
          x: 1,
          y: currentY,
          w: 8,
          h: 0.4,
          fontSize: 16,
          color: '2c3e50'
        });
        currentY += 0.5;
      } else if (line.startsWith('![image')) {
        // Handle positioned images
        await this.addPptxImage(slide, line, currentY);
        // Don't increment Y for positioned images
      } else if (line.trim()) {
        // Regular paragraph
        slide.addText(line, {
          x: 0.5,
          y: currentY,
          w: 9,
          h: 0.4,
          fontSize: 14,
          color: '2c3e50'
        });
        currentY += 0.5;
      }
    }
  }

  /**
   * Add image to PPTX slide with positioning
   */
  private async addPptxImage(slide: any, imageLine: string, defaultY: number): Promise<void> {
    try {
      const path = require('path');
      const fs = require('fs');

      // Extract image path
      const srcMatch = imageLine.match(/\]\(([^)]+)\)/);
      if (!srcMatch) return;

      const imagePath = srcMatch[1];
      let absolutePath = path.resolve(process.cwd(), imagePath);

      if (!fs.existsSync(absolutePath)) {
        absolutePath = path.resolve(process.cwd(), 'assets', path.basename(imagePath));
      }

      if (!fs.existsSync(absolutePath)) {
        console.warn(`✗ PPTX image not found: ${imagePath}`);
        return;
      }

      // Parse positioning attributes
      let x = 0.5, y = defaultY, w = 2, h = 1.5;

      const attrs = imageLine.match(/\[image([^\]]*)\]/)?.[1] || '';
      if (attrs) {
        const xMatch = attrs.match(/x:\s*([^;\s]+)/);
        const yMatch = attrs.match(/y:\s*([^;\s]+)/);
        const wMatch = attrs.match(/w:\s*([^;\s]+)/);
        const hMatch = attrs.match(/h:\s*([^;\s]+)/);

        if (xMatch) x = this.convertPercentToInches(xMatch[1], 10);
        if (yMatch) y = this.convertPercentToInches(yMatch[1], 5.625);
        if (wMatch) w = this.convertPercentToInches(wMatch[1], 10);
        if (hMatch && hMatch[1] !== 'auto') h = this.convertPercentToInches(hMatch[1], 5.625);
      }

      // Read image as base64
      const imageData = fs.readFileSync(absolutePath);
      const base64Data = imageData.toString('base64');
      const mimeType = this.getMimeType(absolutePath);

      slide.addImage({
        data: `data:${mimeType};base64,${base64Data}`,
        x: x,
        y: y,
        w: w,
        h: h
      });

      console.log(`✓ PPTX image added: ${imagePath} at (${x}, ${y})`);
    } catch (error) {
      console.warn(`Error adding PPTX image: ${error}`);
    }
  }

  /**
   * Convert percentage to inches for PPTX positioning
   */
  private convertPercentToInches(value: string, maxSize: number): number {
    if (value.includes('%')) {
      const percent = parseFloat(value.replace('%', ''));
      return (percent / 100) * maxSize;
    }
    return parseFloat(value) || 0;
  }

  /**
   * Generate sectioned HTML with proper document structure
   */
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

  /**
   * Generate header from directive (e.g., "| left | center | right |")
   */
  private generateHeader(pageNumber: number): string {
    if (!this.directives.header) return '';

    const parts = this.directives.header.split('|').map(part => part.trim()).filter(Boolean);

    // Process each part for images and markdown
    const processedParts = parts.map(part => this.markdownToHtml(part));

    return `
      <header class="document-header">
        <div class="header-left">${processedParts[0] || ''}</div>
        <div class="header-center">${processedParts[1] || ''}</div>
        <div class="header-right">${processedParts[2] || ''}</div>
      </header>
    `;
  }

  /**
   * Generate footer with page numbers
   */
  private generateFooter(pageNumber: number): string {
    const footerContent = this.directives.footer || '';
    const totalPages = this.sections.length;

    // Process footer content for images and markdown
    const processedFooter = this.markdownToHtml(footerContent.replace(/\[page\]/g, pageNumber.toString()).replace(/\[total\]/g, totalPages.toString()));

    return `
      <footer class="document-footer">
        <div class="footer-content">${processedFooter}</div>
        <div class="page-number">Halaman ${pageNumber} dari ${totalPages}</div>
      </footer>
    `;
  }

  /**
   * Enhanced markdown to HTML converter with Indonesian support
   */
  private markdownToHtml(markdown: string): string {
    return markdown
      // Headers
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^#### (.*$)/gm, '<h4>$1</h4>')

      // Text formatting
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')

      // Lists
      .replace(/^\- (.*$)/gm, '<li>$1</li>')
      .replace(/^(\d+)\. (.*$)/gm, '<li>$2</li>')

      // Images with positioning support: ![image x:10% y:10% w:50% h:auto](path)
      .replace(/!\[image([^\]]*)\]\(([^)]+)\)/g, (match, attrs, src) => {
        let style = 'max-width: 100%; height: auto; margin: 1rem 0;';
        let cssClass = '';

        if (attrs.trim()) {
          // Check for background placement
          if (attrs.includes('bg') || attrs.includes('background')) {
            return `<div class="page-background" style="background-image: url(${src}); background-size: cover; background-position: center; position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1;"></div>`;
          }

          // Parse positioning attributes
          const positions = attrs.match(/([xywh]):\s*([^;\s]+)/g);
          if (positions) {
            const styleMap = {
              'x': 'left',
              'y': 'top',
              'w': 'width',
              'h': 'height'
            };

            let positionStyle = 'position: absolute; ';
            positions.forEach(pos => {
              const [key, value] = pos.split(':').map(s => s.trim());
              if (styleMap[key]) {
                positionStyle += `${styleMap[key]}: ${value}; `;
              }
            });
            style = positionStyle;
          }
        }

        return `<img src="${src}" alt="image" style="${style}" class="${cssClass}">`;
      })

      // Standard images: ![alt text](path)
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; height: auto; margin: 1rem 0;">')

      // Links (Indonesian-friendly)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

      // Tables (simplified)
      .replace(/\|.*\|/g, (match) => {
        const cells = match.split('|').map(cell => cell.trim()).filter(Boolean);
        return '<tr>' + cells.map(cell => `<td>${cell}</td>`).join('') + '</tr>';
      })

      // Paragraphs
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(?!<[uh])/gm, '<p>')
      .replace(/(?<!>)$/gm, '</p>')

      // Clean up lists
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  }

  /**
   * Apply print-optimized theme without controls for PDF generation
   */
  private applyPrintTheme(html: string): string {
    const theme = this.getDocumentTheme();
    const customStyles = this.getCustomStyles();
    const isPresentation = this.directives.type === 'presentation';

    return `
<!DOCTYPE html>
<html lang="${this.options.locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.metadata.title || 'Aksara Document'}</title>
    <style>
      ${theme}
      ${customStyles}

      /* Hide all interactive controls for PDF */
      .document-controls,
      .presentation-controls {
        display: none !important;
      }

      /* PDF-specific optimizations - Match HTML exactly */
      * {
        box-sizing: border-box !important;
      }

      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: 100% !important;
      }

      body {
        background: #2a2a2a !important;
        font-family: 'Inter', 'Segoe UI', 'Noto Sans', sans-serif !important;
        line-height: 1.6 !important;
        color: #2c3e50 !important;
      }

      .aksara-document {
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        position: static !important;
        transform: none !important;
        max-width: none !important;
      }

      .document-section {
        position: relative !important;
        width: 100% !important;
        height: 100vh !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
        page-break-after: always;
        opacity: 1 !important;
        transform: none !important;
        z-index: auto !important;
        display: flex !important;
        flex-direction: column !important;
        ${isPresentation ? `
          /* Presentation PDF: Full page slides */
          min-height: 100vh !important;
        ` : `
          /* Document PDF: Full page sections */
          min-height: 100vh !important;
        `}
      }

      .document-section:last-child {
        page-break-after: avoid;
      }

      /* Universal PDF styles for all sections */
      .section-content {
        flex: 1 !important;
        ${isPresentation ? `
          display: flex !important;
          flex-direction: column !important;
          justify-content: center !important;
          padding: 2rem !important;
        ` : `
          padding: 2rem !important;
        `}
      }

      .document-header {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        z-index: 10 !important;
        padding: 1rem 2rem !important;
        background: transparent !important;
      }

      .document-footer {
        position: absolute !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        z-index: 10 !important;
        padding: 1rem 2rem !important;
        background: transparent !important;
        border-top: 1px dotted rgba(255,255,255,0.5) !important;
      }

      /* Fix images for PDF - convert relative paths to absolute */
      img {
        max-width: 100% !important;
        height: auto !important;
      }

    </style>
</head>
<body data-type="${isPresentation ? 'presentation' : 'document'}">
    ${html}
</body>
</html>
    `;
  }

  /**
   * Get presentation page height for PDF
   */
  private getPresentationPageHeight(): string {
    if (this.directives.size?.includes(':')) {
      const [w, h] = this.directives.size.split(':').map(Number);
      const aspectRatio = w / h;
      // Standard presentation size: A4 width with calculated height
      return `calc(21cm / ${aspectRatio})`;
    }
    return '29.7cm'; // Default A4 height
  }

  /**
   * Convert relative image paths to base64 data URLs for PDF generation
   */
  private convertRelativeImagePaths(html: string): string {
    const path = require('path');
    const fs = require('fs');

    // Function to convert a path to base64 data URL
    const convertPath = (imagePath: string): string | null => {
      // Skip if already absolute path or data URL
      if (imagePath.startsWith('http') || imagePath.startsWith('data:') || imagePath.startsWith('file://') || path.isAbsolute(imagePath)) {
        return null;
      }

      try {
        // Resolve relative path to absolute path from the current working directory
        let absolutePath = path.resolve(process.cwd(), imagePath);

        // Check if file exists
        if (fs.existsSync(absolutePath)) {
          // Read file and convert to base64
          const fileData = fs.readFileSync(absolutePath);
          const mimeType = this.getMimeType(absolutePath);
          const base64Data = fileData.toString('base64');
          const dataUrl = `data:${mimeType};base64,${base64Data}`;
          console.log(`✓ Image converted to base64: ${imagePath} (${mimeType})`);
          return dataUrl;
        } else {
          console.warn(`✗ Image not found: ${absolutePath}`);
          // Try alternative paths
          const altPath = path.resolve(process.cwd(), 'assets', path.basename(imagePath));
          if (fs.existsSync(altPath)) {
            const fileData = fs.readFileSync(altPath);
            const mimeType = this.getMimeType(altPath);
            const base64Data = fileData.toString('base64');
            const dataUrl = `data:${mimeType};base64,${base64Data}`;
            console.log(`✓ Image found at alternative path and converted: ${imagePath} (${mimeType})`);
            return dataUrl;
          }
          return null;
        }
      } catch (error) {
        console.warn(`Error resolving image path ${imagePath}:`, error);
        return null;
      }
    };

    // Convert img src attributes
    html = html.replace(/src="([^"]+)"/g, (match, src) => {
      const convertedPath = convertPath(src);
      return convertedPath ? `src="${convertedPath}"` : match;
    });

    // Convert CSS background-image URLs
    html = html.replace(/background-image:\s*url\(([^)]+)\)/g, (match, url) => {
      // Remove quotes if present
      const cleanUrl = url.replace(/['"]/g, '');
      const convertedPath = convertPath(cleanUrl);
      return convertedPath ? `background-image: url(${convertedPath})` : match;
    });

    // Also convert background URLs from directive styles in CSS
    html = html.replace(/url\(([^)]+)\)(\s*!\s*important)?/g, (match, url, important) => {
      // Remove quotes if present
      const cleanUrl = url.replace(/['"]/g, '');
      const convertedPath = convertPath(cleanUrl);
      return convertedPath ? `url(${convertedPath})${important || ''}` : match;
    });

    return html;
  }

  /**
   * Get MIME type for file extension
   */
  private getMimeType(filePath: string): string {
    const ext = filePath.toLowerCase().split('.').pop();
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

  /**
   * Get PDF generation options based on document type
   */
  private getPdfOptions(): any {
    const isPresentation = this.directives.type === 'presentation';

    if (isPresentation && this.directives.size?.includes(':')) {
      // Presentation mode with aspect ratio
      const [w, h] = this.directives.size.split(':').map(Number);
      const aspectRatio = w / h;

      // Use landscape orientation for presentations with no margins
      return {
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: {
          top: '0',
          right: '0',
          bottom: '0',
          left: '0'
        },
        preferCSSPageSize: false,
        width: '29.7cm',
        height: '21cm'
      };
    } else {
      // Document mode - remove all margins for WYSIWYG
      return {
        format: 'A4',
        printBackground: true,
        margin: {
          top: '0',
          right: '0',
          bottom: '0',
          left: '0'
        },
        preferCSSPageSize: false,
        width: '21cm',
        height: '29.7cm'
      };
    }
  }

  /**
   * Apply document-focused theme with custom sizing and page controls
   */
  private applyDocumentTheme(html: string): string {
    const theme = this.getDocumentTheme();
    const customStyles = this.getCustomStyles();
    const totalSections = this.sections.length;
    const isPresentation = this.directives.type === 'presentation';

    return `
<!DOCTYPE html>
<html lang="${this.options.locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.metadata.title || 'Aksara Document'}</title>
    <style>
      ${theme}
      ${customStyles}
      ${isPresentation ? this.getPresentationStyles() : ''}
    </style>
</head>
<body data-type="${isPresentation ? 'presentation' : 'document'}">
    ${isPresentation ? this.getPresentationControls(totalSections) : this.getDocumentControls(totalSections)}

    <!-- Document Content -->
    ${html}

    <script>
        const isPresentation = document.body.getAttribute('data-type') === 'presentation';
        let currentSlide = 0;
        let currentZoom = 1;
        const totalSlides = document.querySelectorAll('.document-section').length;

        // Auto-hiding controls variables
        let mouseTimer;
        let controlsVisible = false;

        // Initialize presentation mode
        if (isPresentation) {
            initPresentation();
        } else {
            initDocumentMode();
        }

        function initPresentation() {
            const sections = document.querySelectorAll('.document-section');
            sections.forEach((section, index) => {
                if (index === 0) {
                    section.classList.add('active');
                }
            });
            updateSlideCounter();
            initPresentationControls();
        }

        function initPresentationControls() {
            const controls = document.getElementById('presentation-controls');

            if (!controls) {
                console.error('Presentation controls not found');
                return;
            }

            // Define control functions within scope
            function showControls() {
                if (controls && !controlsVisible) {
                    controls.classList.add('visible');
                    controlsVisible = true;
                    console.log('Controls shown');
                }
            }

            function hideControls() {
                if (controls && controlsVisible) {
                    controls.classList.remove('visible');
                    controlsVisible = false;
                    console.log('Controls hidden');
                }
            }

            // Hide controls after 2.5 seconds of no mouse movement
            function resetMouseTimer() {
                clearTimeout(mouseTimer);
                showControls();
                mouseTimer = setTimeout(hideControls, 2500);
            }

            // Mouse movement detection with throttling
            let mouseMoveThrottle = false;
            function handleMouseMove(e) {
                if (!mouseMoveThrottle) {
                    mouseMoveThrottle = true;
                    resetMouseTimer();
                    setTimeout(() => {
                        mouseMoveThrottle = false;
                    }, 50); // Reduced throttle for more responsive feel
                }
            }

            // Event listeners
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('click', resetMouseTimer);
            document.addEventListener('keydown', resetMouseTimer);

            // Show controls initially and start timer
            showControls();
            resetMouseTimer();
        }

        // Fullscreen functionality
        function toggleFullscreen() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().then(() => {
                    updateFullscreenButton(true);
                }).catch(err => {
                    console.error('Error entering fullscreen:', err);
                });
            } else {
                document.exitFullscreen().then(() => {
                    updateFullscreenButton(false);
                }).catch(err => {
                    console.error('Error exiting fullscreen:', err);
                });
            }
        }

        function updateFullscreenButton(isFullscreen) {
            const btn = document.querySelector('.fullscreen-btn');
            if (btn) {
                btn.textContent = isFullscreen ? '⛶' : '⛶';
                btn.title = isFullscreen ? 'Exit Fullscreen (F11)' : 'Enter Fullscreen (F11)';
            }
        }

        // Listen for fullscreen changes
        document.addEventListener('fullscreenchange', () => {
            updateFullscreenButton(!!document.fullscreenElement);
        });

        function initDocumentMode() {
            window.addEventListener('scroll', updatePageIndicator);
            updatePageIndicator();
        }

        // Presentation navigation
        function nextSlide() {
            if (currentSlide < totalSlides - 1) {
                changeSlide(currentSlide + 1);
            }
        }

        function previousSlide() {
            if (currentSlide > 0) {
                changeSlide(currentSlide - 1);
            }
        }

        function changeSlide(newSlide) {
            const sections = document.querySelectorAll('.document-section');
            const direction = newSlide > currentSlide ? 'next' : 'prev';

            // Remove all classes from all sections
            sections.forEach(section => {
                section.classList.remove('active', 'prev', 'next');
            });

            // Set up the new slide structure
            sections.forEach((section, index) => {
                if (index === newSlide) {
                    section.classList.add('active');
                } else if (index < newSlide) {
                    section.classList.add('prev');
                } else {
                    section.classList.add('next');
                }
            });

            currentSlide = newSlide;
            updateSlideCounter();
            updateNavigationButtons();
        }

        function updateSlideCounter() {
            const counter = document.getElementById('current-slide');
            if (counter) {
                counter.textContent = currentSlide + 1;
            }
        }

        function updateNavigationButtons() {
            const prevBtn = document.querySelector('.nav-btn:first-child');
            const nextBtn = document.querySelector('.nav-btn:last-child');

            if (prevBtn) prevBtn.disabled = currentSlide === 0;
            if (nextBtn) nextBtn.disabled = currentSlide === totalSlides - 1;
        }

        // Document mode functions
        function zoomIn() {
            currentZoom = Math.min(currentZoom + 0.1, 2);
            updateZoom();
        }

        function zoomOut() {
            currentZoom = Math.max(currentZoom - 0.1, 0.5);
            updateZoom();
        }

        function fitWidth() {
            currentZoom = 1;
            updateZoom();
        }

        function updateZoom() {
            document.querySelector('.aksara-document').style.transform = \`scale(\${currentZoom})\`;
            document.querySelector('.aksara-document').style.transformOrigin = 'top center';
        }

        function updatePageIndicator() {
            const sections = document.querySelectorAll('.document-section');
            const scrollTop = window.pageYOffset;
            let currentPage = 1;

            sections.forEach((section, index) => {
                const rect = section.getBoundingClientRect();
                if (rect.top <= window.innerHeight / 2 && rect.bottom >= window.innerHeight / 2) {
                    currentPage = index + 1;
                }
            });

            const pageElement = document.getElementById('current-page');
            if (pageElement) {
                pageElement.textContent = currentPage;
            }
        }

        function getCurrentPage() {
            const pageElement = document.getElementById('current-page');
            return pageElement ? parseInt(pageElement.textContent) : 1;
        }

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (isPresentation) {
                if (e.key === 'ArrowRight' || e.key === ' ') {
                    e.preventDefault();
                    nextSlide();
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    previousSlide();
                } else if (e.key === 'F11') {
                    e.preventDefault();
                    toggleFullscreen();
                } else if (e.key === 'Escape' && document.fullscreenElement) {
                    e.preventDefault();
                    toggleFullscreen();
                }
            } else {
                if (e.key === 'ArrowDown' || e.key === 'PageDown') {
                    const nextSection = document.querySelector(\`[data-section="\${getCurrentPage() + 1}"]\`);
                    if (nextSection) nextSection.scrollIntoView({ behavior: 'smooth' });
                } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
                    const prevSection = document.querySelector(\`[data-section="\${getCurrentPage() - 1}"]\`);
                    if (prevSection) prevSection.scrollIntoView({ behavior: 'smooth' });
                } else if (e.key === 'F11') {
                    e.preventDefault();
                    toggleFullscreen();
                }
            }
        });

        // Initialize navigation buttons
        if (isPresentation) {
            updateNavigationButtons();
        }
    </script>
</body>
</html>`;
  }

  /**
   * Get custom styles based on directives
   */
  private getCustomStyles(): string {
    let styles = '';

    // Size-based styles
    if (this.directives.size) {
      const sizeStyles = this.parseSizeDirective(this.directives.size);
      styles += sizeStyles;
    }

    // Background styles - apply to individual sections, not container
    if (this.directives.background) {
      styles += `
        .document-section {
          background-image: url(${this.directives.background}) !important;
          background-size: cover !important;
          background-position: center !important;
          background-repeat: no-repeat !important;
        }
      `;
    }

    // Custom CSS file
    if (this.directives.style) {
      styles += `/* Custom styles from: ${this.directives.style} */\n`;
      // In full implementation, would load and include the CSS file
    }

    return styles;
  }

  /**
   * Parse size directive and return appropriate CSS
   */
  private parseSizeDirective(size: string): string {
    // Handle different size formats
    if (size.includes('mm')) {
      // e.g., "210mmx297mm" (A4)
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
      // e.g., "16:9", "4:3", "16:10" (aspect ratios for presentations)
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

  /**
   * Get presentation controls for slide navigation
   */
  private getPresentationControls(totalSections: number): string {
    return `
    <!-- Presentation Controls -->
    <div class="presentation-controls" id="presentation-controls">
        <button class="nav-btn" onclick="previousSlide()">◀</button>
        <div class="slide-counter">
            <span id="current-slide">1</span> / ${totalSections}
        </div>
        <button class="nav-btn" onclick="nextSlide()">▶</button>
        <button class="nav-btn fullscreen-btn" onclick="toggleFullscreen()" title="Toggle Fullscreen">⛶</button>
    </div>
    `;
  }

  /**
   * Get document controls for scrolling navigation
   */
  private getDocumentControls(totalSections: number): string {
    return `
    <!-- Document Controls -->
    <div class="document-controls">
        <div class="zoom-controls">
            <button class="zoom-btn" onclick="zoomIn()">🔍+</button>
            <button class="zoom-btn" onclick="zoomOut()">🔍-</button>
            <button class="zoom-btn" onclick="fitWidth()">📄</button>
        </div>
        <div class="page-nav">
            Page <span id="current-page">1</span> of ${totalSections}
        </div>
    </div>
    `;
  }

  /**
   * Get presentation-specific CSS styles
   */
  private getPresentationStyles(): string {
    return `
      /* Presentation Mode Styles */
      body[data-type="presentation"] {
        overflow: hidden;
        padding: 0 !important;
        margin: 0 !important;
      }

      body[data-type="presentation"] .aksara-document {
        position: relative;
        width: 100vw;
        height: 97vh;
        overflow: hidden;
        transform: translateY(10px);
      }

      body[data-type="presentation"] .document-footer {
        position: fixed;
        bottom: 0; left: .8em; right: .8em;
      }

      body[data-type="presentation"] .document-section {
        position: absolute;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        margin-top: 0;
        display: flex;
        flex-direction: column;
        opacity: 0;
        transform: translateX(100%);
        transition: transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.4s ease;
        overflow: visible !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        will-change: transform, opacity;
      }

      body[data-type="presentation"] .document-section.active {
        opacity: 1;
        transform: translateX(0);
        z-index: 2;
      }

      body[data-type="presentation"] .document-section.prev {
        opacity: 0.8;
        transform: translateX(-100%);
        z-index: 1;
      }

      body[data-type="presentation"] .document-section.next {
        opacity: 0.8;
        transform: translateX(100%);
        z-index: 1;
      }

      body[data-type="presentation"] .section-content {
        overflow: visible !important;
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 4rem;
        box-sizing: border-box;
      }

      /* Override aspect ratio for presentation mode to ensure 16:10 */
      body[data-type="presentation"] .document-section[data-size*=":"] {
        aspect-ratio: unset !important;
        width: 100vw !important;
        height: 100vh !important;
        max-width: none !important;
        min-height: 100vh !important;
        margin: 0 !important;
      }

      /* Auto-hiding Presentation Controls with fade effect */
      .presentation-controls {
        position: fixed;
        bottom: 2rem;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999;
        background: rgba(0,0,0,0.8);
        border-radius: 25px;
        padding: 0.8rem 1.5rem;
        display: flex;
        align-items: center;
        gap: 1rem;
        color: white;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.4s cubic-bezier(0.4, 0.0, 0.2, 1), visibility 0.4s cubic-bezier(0.4, 0.0, 0.2, 1);
        pointer-events: none;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.2);
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      }

      .presentation-controls.visible {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }

      .fullscreen-btn {
        font-size: 1.1rem;
        min-width: 40px;
      }

      .nav-btn {
        background: transparent;
        border: 2px solid white;
        color: white;
        padding: 0.5rem 1rem;
        border-radius: 8px;
        cursor: pointer;
        font-size: 1rem;
        transition: all 0.3s ease;
      }

      .nav-btn:hover {
        background: white;
        color: black;
      }

      .nav-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }

      .slide-counter {
        font-weight: 600;
        font-size: 0.9rem;
      }
    `;
  }

  /**
   * Get document-focused theme CSS with page-like sections (like Marp/Word)
   */
  private getDocumentTheme(): string {
    return `
      /* Document-focused CSS with clear page separation */
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      body {
        font-family: 'Inter', 'Segoe UI', 'Noto Sans', sans-serif;
        line-height: 1.6;
        color: #2c3e50;
        background: #2a2a2a;
        padding: 2rem;
      }

      .aksara-document {
        max-width: 1200px;
        margin: 0 auto;
      }

      .document-title {
        font-size: 2.5rem;
        font-weight: 700;
        text-align: center;
        color: white;
        padding: 2rem;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        margin-bottom: 2rem;
        border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      }

      .document-subtitle {
        font-size: 1.5rem;
        text-align: center;
        color: #666;
        margin-bottom: 2rem;
        font-weight: 300;
      }

      /* PAGE-LIKE SECTIONS - Like Marp slides or Word pages */
      .document-section {
        ${this.directives.background ? '/* Background set via directive */' : 'background: white;'}
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        margin-bottom: 2rem;
        min-height: 29.7cm; /* A4 height */
        width: 21cm; /* A4 width */
        margin-left: auto;
        margin-right: auto;
        display: flex;
        flex-direction: column;
        position: relative;
        border: 1px solid #ddd;
        overflow: hidden;
      }


      .document-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem 2rem 1rem;
        margin-bottom: 1rem;
        font-size: 0.9rem;
        color: #666;
      }

      .document-footer {
        margin-top: auto;
        padding: 1rem 2rem 1.5rem;
        text-align: center;
        font-size: 0.9rem;
        color: #666;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .footer-content {
        flex: 1;
        text-align: left;
      }

      .page-number {
        font-weight: 600;
        color: #34495e;
        font-size: 0.8rem;
      }

      .section-content {
        flex: 1;
        padding: 2rem;
        overflow-y: auto;
      }

      /* Typography - Optimized for page-like display */
      h1 {
        color: #2c3e50;
        font-size: 2rem;
        margin: 1rem 0 0.8rem 0;
        font-weight: 700;
        border-bottom: 3px solid #3498db;
        padding-bottom: 0.5rem;
      }

      h2 {
        color: #f39c12;
        font-size: 1.5rem;
        margin: 1rem 0 0.6rem 0;
        font-weight: 600;
      }

      h3 {
        color: #2980b9;
        font-size: 1.2rem;
        margin: 0.8rem 0 0.5rem 0;
        font-weight: 600;
      }

      h4 {
        color: #34495e;
        font-size: 1rem;
        margin: 0.6rem 0 0.4rem 0;
        font-weight: 500;
      }

      p {
        margin: 0.6rem 0;
        text-align: justify;
        font-size: 0.9rem;
        line-height: 1.6;
      }

      strong {
        color: #27ae60;
        font-weight: 600;
      }

      em {
        color: #8e44ad;
        font-style: italic;
      }

      code {
        background: #ecf0f1;
        padding: 0.2rem 0.4rem;
        border-radius: 3px;
        font-family: 'Fira Code', 'Consolas', monospace;
        font-size: 0.9em;
      }

      /* Lists - Indonesian business style */
      ul, ol {
        margin: 1rem 0;
        padding-left: 2rem;
      }

      li {
        margin: 0.5rem 0;
        line-height: 1.6;
      }

      /* Links */
      a {
        color: #3498db;
        text-decoration: none;
        border-bottom: 1px solid rgba(52, 152, 219, 0.3);
        transition: all 0.3s ease;
      }

      a:hover {
        color: #2980b9;
        border-bottom-color: #2980b9;
      }

      /* Tables */
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 1.5rem 0;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }

      th, td {
        padding: 0.8rem 1rem;
        text-align: left;
        border-bottom: 1px solid #ddd;
      }

      th {
        background: #34495e;
        color: white;
        font-weight: 600;
      }

      tr:nth-child(even) {
        background: #f8f9fa;
      }

      /* Responsive scaling for different screen sizes */
      @media (max-width: 1400px) {
        .document-section {
          width: 90vw;
          min-height: calc(90vw * 1.414); /* A4 ratio */
        }
      }

      @media (max-width: 900px) {
        body {
          padding: 1rem;
        }

        .document-section {
          width: 95vw;
          min-height: calc(95vw * 1.414);
          margin-bottom: 1rem;
        }

        .section-content {
          padding: 1rem;
        }

        h1 { font-size: 1.5rem; }
        h2 { font-size: 1.2rem; }
        h3 { font-size: 1rem; }
        p { font-size: 0.85rem; }
      }

      /* Print styles for PDF export */
      @media print {
        body {
          background: white;
          padding: 0;
        }

        .aksara-document {
          margin: 0;
        }

        .document-section {
          width: 100%;
          min-height: 100vh;
          page-break-after: always;
          margin-bottom: 0;
          box-shadow: none;
          border: none;
        }

        .document-section:last-child {
          page-break-after: avoid;
        }

      }

      /* Document controls - consolidated zoom and page info */
      .document-controls {
        position: fixed;
        top: 1rem;
        right: 1rem;
        z-index: 1000;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        padding: 0.5rem;
        display: flex;
        gap: 1rem;
        align-items: center;
      }

      .zoom-controls {
        display: flex;
        gap: 0.5rem;
      }

      .zoom-btn {
        background: #667eea;
        color: white;
        border: none;
        padding: 0.3rem 0.6rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
      }

      .zoom-btn:hover {
        background: #5a6fd8;
      }

      .page-nav {
        background: rgba(52, 73, 94, 0.1);
        color: #34495e;
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 600;
      }
    `;
  }
}

// Export default instance
export const aksara = new AksaraConverter();

// Export utility functions
export { ConvertOptions, DocumentMetadata, ConvertResult };