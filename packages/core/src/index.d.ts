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
    type?: 'document' | 'presentation';
    style?: string;
    size?: string;
    meta?: {
        title?: string;
        subtitle?: string;
    };
    header?: string;
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
export declare class AksaraConverter {
    private options;
    private metadata;
    private directives;
    private sections;
    constructor(options?: ConvertOptions);
    /**
     * Set document metadata
     */
    setMetadata(metadata: DocumentMetadata): void;
    /**
     * Convert markdown to specified format
     */
    convert(markdown: string): Promise<ConvertResult>;
    /**
     * Parse Aksara directives from HTML comment block
     * Format: <!-- aksara:true ... -->
     */
    private parseAksaraDirectives;
    /**
     * Parse content into sections (split by ---)
     */
    private parseSections;
    /**
     * Convert to sectioned HTML with document layout
     */
    private convertToHtml;
    /**
     * Convert to PDF with document layout
     */
    private convertToPdf;
    /**
     * Convert to PPTX with business document layout
     */
    private convertToPptx;
    /**
     * Get PPTX layout based on size directive
     */
    private getPptxLayout;
    /**
     * Add background image to PPTX slide
     */
    private addPptxBackground;
    /**
     * Add header to PPTX slide
     */
    private addPptxHeader;
    /**
     * Add footer to PPTX slide
     */
    private addPptxFooter;
    /**
     * Convert markdown content to PPTX elements
     */
    private addMarkdownToPptx;
    /**
     * Add image to PPTX slide with positioning
     */
    private addPptxImage;
    /**
     * Convert percentage to inches for PPTX positioning
     */
    private convertPercentToInches;
    /**
     * Generate sectioned HTML with proper document structure
     */
    private generateSectionedHtml;
    /**
     * Generate header from directive (e.g., "| left | center | right |")
     */
    private generateHeader;
    /**
     * Generate footer with page numbers
     */
    private generateFooter;
    /**
     * Enhanced markdown to HTML converter with Indonesian support
     */
    private markdownToHtml;
    /**
     * Apply print-optimized theme without controls for PDF generation
     */
    private applyPrintTheme;
    /**
     * Get presentation page height for PDF
     */
    private getPresentationPageHeight;
    /**
     * Convert relative image paths to base64 data URLs for PDF generation
     */
    private convertRelativeImagePaths;
    /**
     * Get MIME type for file extension
     */
    private getMimeType;
    /**
     * Get PDF generation options based on document type
     */
    private getPdfOptions;
    /**
     * Apply document-focused theme with custom sizing and page controls
     */
    private applyDocumentTheme;
    /**
     * Get custom styles based on directives
     */
    private getCustomStyles;
    /**
     * Parse size directive and return appropriate CSS
     */
    private parseSizeDirective;
    /**
     * Get presentation controls for slide navigation
     */
    private getPresentationControls;
    /**
     * Get document controls for scrolling navigation
     */
    private getDocumentControls;
    /**
     * Get presentation-specific CSS styles
     */
    private getPresentationStyles;
    /**
     * Get document-focused theme CSS with page-like sections (like Marp/Word)
     */
    private getDocumentTheme;
}
export declare const aksara: AksaraConverter;
export { ConvertOptions, DocumentMetadata, ConvertResult };
//# sourceMappingURL=index.d.ts.map