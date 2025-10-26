export interface ConvertOptions {
  format: 'html' | 'pdf' | 'pptx';
  theme?: string;
  template?: string;
  locale?: 'id' | 'en';
  pageSize?: 'A4' | 'Letter' | 'Legal';
  orientation?: 'portrait' | 'landscape';
  sourceDir?: string;
  basePath?: string;
  embedImages?: boolean; // default: false for HTML, true for PDF/PPTX
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
  meta?: Record<string, string>; // Allow any key-value pairs
  header?: string;
  footer?: string;
  background?: string;
}

export interface DocumentSection {
  content: string;
  index: number;
  html: string;
  classes?: string;
}

export interface ConvertResult {
  success: boolean;
  data?: Buffer;
  mimeType?: string;
  error?: string;
}