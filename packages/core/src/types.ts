export interface ConvertOptions {
  format: 'html' | 'pdf' | 'pptx';
  theme?: string;
  template?: string;
  locale?: 'id' | 'en';
  pageSize?: 'A4' | 'Letter' | 'Legal';
  orientation?: 'portrait' | 'landscape';
  sourceDir?: string;
  basePath?: string;
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
  classes?: string;
}

export interface ConvertResult {
  success: boolean;
  data?: Buffer;
  mimeType?: string;
  error?: string;
}