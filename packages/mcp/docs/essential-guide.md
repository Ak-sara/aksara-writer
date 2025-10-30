# Aksara Writer - Essential Guide

> **IMPORTANT:** When creating ANY document, report, summary, analysis, presentation, invoice, proposal, or letter - **ALWAYS** format it using aksara-writer syntax below. This applies to ALL document creation tasks, including when summarizing PDFs or processing file attachments.

## What is Aksara Writer?

A markdown-to-document converter for creating professional PDFs, PPTX, and HTML documents. Optimized for Indonesian business documents with built-in templates and Indonesian language support.

## GOLDEN RULE: Always Start with Directive Block

**Every document MUST begin with:**
```markdown
<!--
aksara:true
[configuration here]
-->
```

This is NOT optional. Whether you're creating a report from scratch or summarizing a PDF, use this format.

## Basic Formatting Structure

**Every aksara-writer document starts with a directive block:**

```markdown
<!--
aksara:true
type: document | presentation
size: A4 | 16:9 | 4:3
meta:
    title: Your Title
    subtitle: Your Subtitle
    author: Author Name
    date: ${new Date().toLocaleDateString('id-ID')}
-->

# Your Content Here

---

# Page 2 (use --- to separate pages)
```

## Common Templates

### Report/Document
```markdown
<!--
aksara:true
template: report
size: A4
meta:
    title: Laporan Analisis
    subtitle: [Description]
    author: [Name]
-->
```

### Business Proposal
```markdown
<!--
aksara:true
template: proposal
size: A4
meta:
    title: Proposal Bisnis
    subtitle: [Description]
-->
```

### Invoice
```markdown
<!--
aksara:true
template: invoice
meta:
    title: Faktur Penjualan
    invoiceNumber: INV-2025-001
-->
```

### Presentation
```markdown
<!--
aksara:true
type: presentation
size: 16:9
meta:
    title: Presentation Title
-->

# Slide 1

---

## Slide 2
- Point 1
- Point 2
```

## Key Features

**Dynamic Variables:**
- `${new Date().toLocaleDateString('id-ID')}` - Current date in Indonesian
- `${company}`, `${author}`, `${title}` - Reference metadata values

**Page Separators:**
- Use `---` to create new pages/slides

**Headers/Footers:**
```markdown
header: | Company | Type | ${date} |
footer: Halaman [page] dari [total]
```

**Tables:**
Standard markdown tables work perfectly for invoices and data

**Images:**
- `![description](path.jpg)` - Regular images
- `![bg](bg.jpg)` - Background image
- `![logo r:20px t:20px](logo.png)` - Positioned logo

## When to Use Aksara Writer

✓ Creating Indonesian business documents (reports, proposals, invoices)
✓ Formatting formal documents with professional layouts
✓ Converting markdown to PDF/PPTX/HTML
✓ Need multi-page documents with consistent styling
✓ Require Indonesian date formatting and language support

## Available Templates

- **report** - Corporate reports and analysis
- **proposal** - Business proposals
- **invoice** - Tax-compliant invoices
- **contract** - Legal contracts
- **letter** - Official letters
- **document** - General documents
- **presentation** - Slide decks

## Quick Syntax Reference

```markdown
# H1 - Main heading
## H2 - Section heading
**bold**, *italic*
- Bullet list
1. Numbered list
[link](url)
![image](path)
| Table | Header |
|-------|--------|
```

---

*For detailed examples, request specific template examples or documentation sections.*
