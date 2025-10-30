## Using aksara-writer-core in Tauri Apps

`aksara-writer-core` is now compatible with Tauri applications! Since Tauri runs in a sandboxed browser environment, PDF generation works differently:

### Installation

```bash
# Install without puppeteer (optional dependency)
bun add aksara-writer-core
```

### Usage in Tauri

```typescript
import { AksaraConverter } from 'aksara-writer-core';

// Initialize converter with basePath
const converter = new AksaraConverter({
  format: 'html',  // Use HTML format for Tauri
  basePath: '/path/to/your/assets'  // Required: replace process.cwd()
});

// Convert markdown to HTML
const markdown = `<!--
aksara:true
type: document
-->
# My Document
Content here...`;

const result = await converter.convert(markdown);

if (result.success) {
  // Load HTML in Tauri webview
  const htmlContent = result.data.toString();

  // Use Tauri's print API for PDF generation
  await invoke('print_to_pdf', { html: htmlContent });
}
```

### PDF Generation in Tauri

Since Puppeteer doesn't work in Tauri, implement PDF generation using:

**Option 1: Tauri Print Command** (Recommended)
```rust
// src-tauri/src/main.rs
use tauri::command;

#[command]
async fn print_to_pdf(html: String) -> Result<Vec<u8>, String> {
    // Use webview print functionality
    // Implementation depends on your Tauri setup
    Ok(vec![])
}
```

**Option 2: Use `@tauri-apps/plugin-dialog`**
```typescript
import { save } from '@tauri-apps/plugin-dialog';

// Render HTML in hidden webview
// Trigger window.print() or system print dialog
```

### Key Differences

| Feature | Node.js/CLI | Tauri |
|---------|-------------|-------|
| **Puppeteer** | ✅ Available | ❌ Not available |
| **PDF Generation** | Built-in | Use webview print |
| **HTML Export** | ✅ Supported | ✅ Supported |
| **PPTX Export** | ✅ Supported | ✅ Supported (JSZip works) |
| **File System** | `fs` module | Tauri FS API |
| **Base Path** | `process.cwd()` | Manual via `basePath` option |

### Complete Tauri Example

```typescript
import { invoke } from '@tauri-apps/api/core';
import { AksaraConverter } from 'aksara-writer-core';
import { readTextFile } from '@tauri-apps/plugin-fs';

async function convertMarkdownToPdf(markdownPath: string) {
  // Read markdown file using Tauri FS
  const markdownContent = await readTextFile(markdownPath);

  // Convert to HTML
  const converter = new AksaraConverter({
    format: 'html',
    basePath: await invoke('get_app_dir')  // Get base directory from Rust
  });

  const result = await converter.convert(markdownContent);

  if (result.success) {
    // Generate PDF using Tauri backend
    const pdfBytes = await invoke('html_to_pdf', {
      html: result.data.toString()
    });

    return pdfBytes;
  }

  throw new Error(result.error);
}
```
