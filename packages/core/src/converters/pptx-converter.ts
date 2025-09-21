import { DocumentSection, AksaraDirectives, DocumentMetadata, ConvertOptions, ConvertResult } from '../types';

export class PptxConverter {
  constructor(
    private sections: DocumentSection[],
    private directives: AksaraDirectives,
    private metadata: DocumentMetadata,
    private options: ConvertOptions,
    private loadTemplate: (path: string) => string,
    private replaceTemplateVars: (template: string, vars: Record<string, string>) => string
  ) {}

  async convert(): Promise<ConvertResult> {
    try {
      // Dynamic import for pptxgenjs
      const pptxgen = await import('pptxgenjs');
      const pres = new pptxgen.default();

      // Set presentation properties
      pres.author = this.metadata.author || 'Aksara Writer';
      pres.company = 'Created with Aksara Writer';
      pres.subject = this.metadata.title || 'Presentation';
      pres.title = this.metadata.title || 'Untitled Presentation';

      // Configure slide layout (16:9 widescreen)
      pres.defineLayout({ name: 'LAYOUT_16x9', width: 10, height: 5.625 });
      pres.layout = 'LAYOUT_16x9';

      // Process each section as a slide
      this.sections.forEach((section, index) => {
        const slide = pres.addSlide();
        this.addSlideContent(slide, section, index);
      });

      // Generate PPTX file
      const pptxData = await pres.write({ outputType: 'arraybuffer' });

      return {
        success: true,
        data: Buffer.from(pptxData as ArrayBuffer),
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during PPTX conversion'
      };
    }
  }

  private addSlideContent(slide: any, section: DocumentSection, index: number): void {
    // Add header if configured
    if (this.directives.header) {
      const headerText = this.processHeaderFooterContent(this.directives.header);

      // Check if header contains images and try to add them
      this.addImagesFromContent(slide, this.directives.header, 0.5, 0.2);

      slide.addText(headerText, {
        x: 0.5, y: 0.2, w: 9, h: 0.5,
        fontSize: 12,
        color: '666666',
        align: 'center'
      });
    }

    // Parse and add content
    const content = this.parseContentForSlide(section.html);
    let currentY = this.directives.header ? 1 : 0.5;

    content.forEach(item => {
      switch (item.type) {
        case 'title':
          slide.addText(item.text, {
            x: 0.5, y: currentY, w: 9, h: 0.8,
            fontSize: 32,
            bold: true,
            color: '2c3e50',
            align: 'center'
          });
          currentY += 1;
          break;

        case 'heading':
          slide.addText(item.text, {
            x: 0.5, y: currentY, w: 9, h: 0.6,
            fontSize: item.level === 2 ? 24 : 18,
            bold: true,
            color: '34495e'
          });
          currentY += 0.8;
          break;

        case 'paragraph':
          slide.addText(item.text, {
            x: 0.5, y: currentY, w: 9, h: 0.4,
            fontSize: 14,
            color: '2c3e50'
          });
          currentY += 0.5;
          break;

        case 'list':
          item.items?.forEach(listItem => {
            slide.addText(`• ${listItem}`, {
              x: 0.8, y: currentY, w: 8.5, h: 0.3,
              fontSize: 12,
              color: '2c3e50'
            });
            currentY += 0.4;
          });
          break;

        case 'table':
          if (item.tableData) {
            slide.addTable(item.tableData, {
              x: 0.5, y: currentY, w: 9, h: 2,
              fontSize: 11,
              color: '2c3e50',
              fill: 'F8F9FA',
              border: { pt: '1', color: 'E9ECEF' }
            });
            currentY += 2.5;
          }
          break;
      }
    });

    // Add footer if configured
    if (this.directives.footer) {
      const footerText = this.processHeaderFooterContent(this.directives.footer);
      slide.addText(footerText, {
        x: 0.5, y: 5, w: 9, h: 0.4,
        fontSize: 10,
        color: '6c757d',
        align: 'center'
      });
    }

    // Add slide number
    slide.addText(`${index + 1} / ${this.sections.length}`, {
      x: 8.5, y: 5, w: 1, h: 0.4,
      fontSize: 10,
      color: '6c757d',
      align: 'right'
    });
  }

  private parseContentForSlide(html: string): Array<{
    type: string;
    text?: string;
    level?: number;
    items?: string[];
    tableData?: any[][];
  }> {
    const content: Array<{
      type: string;
      text?: string;
      level?: number;
      items?: string[];
      tableData?: any[][];
    }> = [];

    // Simple HTML parsing for slide content
    const lines = html.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('<h1>')) {
        content.push({
          type: 'title',
          text: this.cleanHtmlForText(trimmed.replace(/<\/?h1>/g, ''))
        });
      } else if (trimmed.startsWith('<h2>')) {
        content.push({
          type: 'heading',
          level: 2,
          text: this.cleanHtmlForText(trimmed.replace(/<\/?h2>/g, ''))
        });
      } else if (trimmed.startsWith('<h3>')) {
        content.push({
          type: 'heading',
          level: 3,
          text: this.cleanHtmlForText(trimmed.replace(/<\/?h3>/g, ''))
        });
      } else if (trimmed.startsWith('<p>') && !trimmed.includes('<li>')) {
        const text = this.cleanHtmlForText(trimmed.replace(/<\/?p>/g, ''));
        if (text.trim()) {
          content.push({
            type: 'paragraph',
            text: text.trim()
          });
        }
      } else if (trimmed.includes('<li>')) {
        // Extract list items
        const listItems = trimmed.match(/<li>(.*?)<\/li>/g);
        if (listItems) {
          content.push({
            type: 'list',
            items: listItems.map(item => this.cleanHtmlForText(item.replace(/<\/?li>/g, '')))
          });
        }
      } else if (trimmed.includes('<table>')) {
        // Parse table (simplified)
        const tableData = this.parseTableForSlide(trimmed);
        if (tableData.length > 0) {
          content.push({
            type: 'table',
            tableData
          });
        }
      }
    }

    return content;
  }

  private parseTableForSlide(tableHtml: string): any[][] {
    const tableData: any[][] = [];

    try {
      // Extract table headers
      const headerMatch = tableHtml.match(/<thead><tr>(.*?)<\/tr><\/thead>/);
      if (headerMatch) {
        const headers = headerMatch[1].match(/<th>(.*?)<\/th>/g);
        if (headers) {
          tableData.push(headers.map(h => this.cleanHtmlForText(h.replace(/<\/?th>/g, ''))));
        }
      }

      // Extract table rows
      const bodyMatch = tableHtml.match(/<tbody>(.*?)<\/tbody>/);
      if (bodyMatch) {
        const rows = bodyMatch[1].match(/<tr>(.*?)<\/tr>/g);
        if (rows) {
          rows.forEach(row => {
            const cells = row.match(/<td>(.*?)<\/td>/g);
            if (cells) {
              tableData.push(cells.map(cell => this.cleanHtmlForText(cell.replace(/<\/?td>/g, ''))));
            }
          });
        }
      }
    } catch (error) {
      console.warn('Error parsing table for slide:', error);
    }

    return tableData;
  }

  private processHeaderFooterContent(content: string): string {
    // Handle table-like structure in headers/footers
    if (content.includes('|')) {
      // Parse pipe-separated content (common in headers)
      const cells = content.split('|')
        .map(cell => cell.trim())
        .filter(cell => cell)
        .map(cell => this.processMarkdownToText(cell));

      return cells.join(' | ');
    } else {
      // Process as regular markdown
      return this.processMarkdownToText(content);
    }
  }

  private processMarkdownToText(markdown: string): string {
    return markdown
      // Process images - extract clean alt text and remove positioning attributes
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, (match, altText) => {
        // Clean positioning attributes from alt text
        const cleanAlt = altText.replace(/\s*[xywh]:[^;\s]+/g, '').trim();
        return cleanAlt || 'image';
      })
      // Remove links but keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove bold/italic
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      // Remove code
      .replace(/`(.*?)`/g, '$1')
      // Clean up extra whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  private addImagesFromContent(slide: any, content: string, defaultX: number, defaultY: number): void {
    // Extract images from markdown content
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;

    while ((match = imageRegex.exec(content)) !== null) {
      const [fullMatch, altText, imagePath] = match;

      // Parse positioning from alt text
      let x = defaultX;
      let y = defaultY;
      let w = 1;
      let h = 1;

      const posMatch = altText.match(/([xywh]):\s*([^;\s]+)/g);
      if (posMatch) {
        posMatch.forEach((pos: string) => {
          const [key, value] = pos.split(':').map((s: string) => s.trim());
          const numValue = parseFloat(value.replace(/[^\d.-]/g, ''));

          switch (key) {
            case 'x':
              x = numValue / 100 * 10; // Convert percentage to slide coordinates
              break;
            case 'y':
              y = numValue / 100 * 5.625; // Convert percentage to slide coordinates
              break;
            case 'w':
              w = numValue / 100 * 10; // Convert percentage to slide width
              break;
            case 'h':
              h = numValue / 100 * 5.625; // Convert percentage to slide height
              break;
          }
        });
      }

      try {
        // Try to add image to slide
        slide.addImage({
          path: imagePath,
          x: x,
          y: y,
          w: w,
          h: h
        });
      } catch (error) {
        console.warn(`Could not add image ${imagePath} to slide:`, error);
        // Image will be handled as text in the header/content
      }
    }
  }

  private cleanHtmlForText(html: string): string {
    return html
      // Remove images (they don't work well in table cells in PPTX)
      .replace(/<img[^>]*>/g, '[image]')
      // Remove HTML tags but keep the content
      .replace(/<\/?[^>]+>/g, '')
      // Clean up extra whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }
}