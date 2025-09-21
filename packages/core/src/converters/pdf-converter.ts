import { DocumentSection, AksaraDirectives, DocumentMetadata, ConvertOptions, ConvertResult } from '../types';
import { HtmlConverter } from './html-converter';

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

  async convert(): Promise<ConvertResult> {
    try {
      const htmlResult = await this.htmlConverter.convert();
      if (!htmlResult.success || !htmlResult.data) {
        return { success: false, error: 'Failed to generate HTML for PDF' };
      }

      const styledHtmlForPrint = this.applyPrintTheme(htmlResult.data.toString());

      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      const htmlWithAbsolutePaths = this.convertRelativeImagePaths(styledHtmlForPrint);

      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
      });

      await page.setContent(htmlWithAbsolutePaths, { waitUntil: 'networkidle2' });

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

  private applyPrintTheme(html: string): string {
    const isPresentation = this.directives.type === 'presentation';

    return `
<!DOCTYPE html>
<html lang="${this.options.locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.metadata.title || 'Aksara Document'}</title>
    <style>
      ${this.loadTemplate('styles/document-theme.css')}

      /* Hide all interactive controls for PDF */
      .document-controls, .presentation-controls { display: none !important; }

      /* PDF-specific optimizations */
      * { box-sizing: border-box !important; }
      html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; height: 100% !important; }
      body { background: #2a2a2a !important; font-family: 'Inter', 'Segoe UI', 'Noto Sans', sans-serif !important; }

      .aksara-document { width: 100% !important; height: 100% !important; margin: 0 !important; padding: 0 !important; }
      .document-section {
        position: relative !important; width: 100% !important; height: 100vh !important;
        margin: 0 !important; padding: 0 !important; page-break-after: always;
        ${isPresentation ? 'min-height: 100vh !important;' : 'min-height: 100vh !important;'}
      }
      .document-section:last-child { page-break-after: avoid; }

      .section-content {
        flex: 1 !important;
        ${isPresentation ? 'display: flex !important; flex-direction: column !important; justify-content: center !important; padding: 2rem !important;' : 'padding: 2rem !important;'}
      }
    </style>
</head>
<body data-type="${isPresentation ? 'presentation' : 'document'}">
    ${html}
</body>
</html>`;
  }

  private convertRelativeImagePaths(html: string): string {
    const path = require('path');
    const fs = require('fs');

    const convertPath = (imagePath: string): string | null => {
      if (imagePath.startsWith('http') || imagePath.startsWith('data:') || path.isAbsolute(imagePath)) {
        return null;
      }

      try {
        let absolutePath = path.resolve(process.cwd(), imagePath);

        if (fs.existsSync(absolutePath)) {
          const fileData = fs.readFileSync(absolutePath);
          const mimeType = this.getMimeType(absolutePath);
          const base64Data = fileData.toString('base64');
          return `data:${mimeType};base64,${base64Data}`;
        }

        const altPath = path.resolve(process.cwd(), 'assets', path.basename(imagePath));
        if (fs.existsSync(altPath)) {
          const fileData = fs.readFileSync(altPath);
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

  private getPdfOptions(): any {
    const isPresentation = this.directives.type === 'presentation';

    if (isPresentation && this.directives.size?.includes(':')) {
      return {
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
        preferCSSPageSize: false,
        width: '29.7cm',
        height: '21cm'
      };
    } else {
      return {
        format: 'A4',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
        preferCSSPageSize: false,
        width: '21cm',
        height: '29.7cm'
      };
    }
  }
}