#!/usr/bin/env node

/**
 * Aksara Writer CLI
 * Command line interface for converting markdown documents
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { AksaraConverter, ConvertOptions } from 'aksara-writer-core';
import { readFile, writeFile, access } from 'fs/promises';
import { constants } from 'fs';
import { extname, basename, resolve, dirname } from 'path';

/**
 * Read input from stdin
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
  });
}

const program = new Command();

program
  .name('aksara-writer')
  .description('Aksara Writer - Modern markdown converter for Indonesian businesses')
  .version('0.1.0');

program
  .command('convert')
  .description('Convert markdown file to specified format')
  .argument('<input>', 'Input markdown file (use "-" for stdin)')
  .option('-f, --format <format>', 'Output format (html, pdf, pptx)', 'html')
  .option('-o, --output <output>', 'Output file path')
  .option('-t, --theme <theme>', 'Document theme', 'default')
  .option('--template <template>', 'Document template')
  .option('--locale <locale>', 'Document locale (id, en)', 'id')
  .option('--page-size <size>', 'Page size (A4, Letter, Legal)', 'A4')
  .option('--orientation <orientation>', 'Page orientation (portrait, landscape)', 'portrait')
  .option('--stdout', 'Output to stdout instead of file (for live preview)')
  .action(async (input: string, options) => {
    const isStdin = input === '-';
    const useStdout = options.stdout;

    // Only show spinner for file operations, not stdin/stdout
    const spinner = (!isStdin && !useStdout) ? ora('Converting document...').start() : null;

    try {
      // Read input - either from file or stdin
      let markdown: string;
      let inputPath: string;

      if (isStdin) {
        // Read from stdin for live preview
        markdown = await readStdin();
        inputPath = process.cwd(); // Use current directory for relative paths
      } else {
        // Read from file for normal operation
        inputPath = resolve(input);
        markdown = await readFile(inputPath, 'utf-8');
      }

      // Prepare conversion options
      const convertOptions: ConvertOptions = {
        format: options.format as 'html' | 'pdf' | 'pptx',
        theme: options.theme,
        template: options.template,
        locale: options.locale as 'id' | 'en',
        pageSize: options.pageSize as 'A4' | 'Letter' | 'Legal',
        orientation: options.orientation as 'portrait' | 'landscape',
        sourceDir: isStdin ? process.cwd() : dirname(resolve(input))
      };

      // Create converter
      const converter = new AksaraConverter(convertOptions);

      // Convert document
      const result = await converter.convert(markdown);

      if (!result.success) {
        if (spinner) spinner.fail(chalk.red('Conversion failed'));
        console.error(chalk.red(`Error: ${result.error}`));
        process.exit(1);
      }

      if (useStdout) {
        // Output to stdout for live preview
        process.stdout.write(result.data!.toString());
      } else {
        // Write to file for normal operation
        const outputPath = options.output || getDefaultOutputPath(input, options.format);

        // Check if file exists and show appropriate message
        let fileExists = false;
        try {
          await access(outputPath, constants.F_OK);
          fileExists = true;
        } catch {
          // File doesn't exist, which is fine
        }

        // Write file (this will overwrite if it exists)
        await writeFile(outputPath, result.data!);

        if (spinner) {
          const action = fileExists ? 'replaced' : 'created';
          spinner.succeed(chalk.green(`Document ${action} successfully`));
        }
        console.log(chalk.blue(`Input:  ${inputPath}`));
        console.log(chalk.blue(`Output: ${resolve(outputPath)}`));
        console.log(chalk.blue(`Format: ${options.format.toUpperCase()}`));
        console.log(chalk.blue(`Locale: ${options.locale}`));
        if (fileExists) {
          console.log(chalk.yellow(`Note: Existing file was replaced`));
        }
      }

    } catch (error) {
      if (spinner) spinner.fail(chalk.red('Conversion failed'));
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

program
  .command('templates')
  .description('List available templates')
  .action(() => {
    console.log(chalk.blue('📄 Available Templates:\n'));

    const templates = [
      {
        name: 'invoice',
        title: 'Faktur/Invoice',
        description: 'Indonesian tax-compliant invoice template'
      },
      {
        name: 'proposal',
        title: 'Proposal Bisnis',
        description: 'Professional business proposal template'
      },
      {
        name: 'report',
        title: 'Laporan',
        description: 'Corporate report template'
      },
      {
        name: 'contract',
        title: 'Kontrak',
        description: 'Legal contract template'
      },
      {
        name: 'letter',
        title: 'Surat Resmi',
        description: 'Official letter template'
      }
    ];

    templates.forEach(template => {
      console.log(chalk.green(`  ${template.name}`));
      console.log(chalk.white(`    ${template.title}`));
      console.log(chalk.gray(`    ${template.description}\n`));
    });

    console.log(chalk.yellow('Usage: aksara convert document.md --template invoice'));
  });

program
  .command('themes')
  .description('List available themes')
  .action(() => {
    console.log(chalk.blue('🎨 Available Themes:\n'));

    const themes = [
      {
        name: 'default',
        title: 'Default Indonesian Business',
        description: 'Clean professional theme for Indonesian businesses'
      },
      {
        name: 'minimal',
        title: 'Minimal',
        description: 'Clean and minimal design'
      },
      {
        name: 'corporate',
        title: 'Corporate',
        description: 'Formal corporate document style'
      },
      {
        name: 'government',
        title: 'Government',
        description: 'Indonesian government document style'
      }
    ];

    themes.forEach(theme => {
      console.log(chalk.green(`  ${theme.name}`));
      console.log(chalk.white(`    ${theme.title}`));
      console.log(chalk.gray(`    ${theme.description}\n`));
    });

    console.log(chalk.yellow('Usage: aksara convert document.md --theme corporate'));
  });

program
  .command('init')
  .description('Initialize a new document with template')
  .argument('[template]', 'Template name', 'default')
  .option('-n, --name <name>', 'Document name', 'document')
  .action(async (template: string, options) => {
    const spinner = ora(`Creating new document with ${template} template...`).start();

    try {
      const filename = `${options.name}.md`;
      const content = getTemplateContent(template);

      // Check if file exists
      let fileExists = false;
      try {
        await access(filename, constants.F_OK);
        fileExists = true;
      } catch {
        // File doesn't exist, which is fine
      }

      // Write file (this will overwrite if it exists)
      await writeFile(filename, content);

      const action = fileExists ? 'replaced' : 'created';
      spinner.succeed(chalk.green(`Document ${action}: ${filename}`));
      if (fileExists) {
        console.log(chalk.yellow(`Warning: Existing file was replaced`));
      }
      console.log(chalk.blue('Next steps:'));
      console.log(chalk.white(`  1. Edit ${filename}`));
      console.log(chalk.white(`  2. Convert: aksara convert ${filename} --format pdf`));

    } catch (error) {
      spinner.fail(chalk.red('Failed to create document'));
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

/**
 * Get default output path based on input and format
 */
function getDefaultOutputPath(input: string, format: string): string {
  const name = basename(input, extname(input));
  const extensions = {
    html: '.html',
    pdf: '.pdf',
    pptx: '.pptx'
  };
  return `${name}${extensions[format as keyof typeof extensions] || '.html'}`;
}

/**
 * Get template content
 */
function getTemplateContent(template: string): string {
  const templates = {
    default: `<!--
aksara:true
style: ./style.css
size: 210mmx297mm
meta:
    title: Dokumen Bisnis
    subtitle: Document Professional
header: | PT. Perusahaan | Dokumen Rahasia | ${new Date().toLocaleDateString('id-ID')} |
footer: Halaman [page] dari [total] - Dibuat dengan Aksara Writer
background: ../assets/background-subtle.jpg
-->

# Judul Dokumen

## Pendahuluan

Ini adalah dokumen bisnis yang dibuat dengan **Aksara Writer** - alat konversi markdown yang berfokus pada **pembuatan dokumen** (bukan presentasi seperti Marp).

### Keunikan Aksara Writer

- 📝 **Document-focused**: Menggunakan markdown sebagai high-level language
- 🎯 **Custom directives**: Interpretasi direktif khusus untuk struktur dokumen
- 📐 **Sectioned HTML**: Generate HTML terseksi dengan sizing yang presisi
- 📄 **Multi-format**: Export ke PDF/PPTX dengan layout dokumen

### Perbedaan dengan Marp

| Aspek | Marp | Aksara Writer |
|-------|------|---------------|
| **Fokus** | Presentation | Document |
| **Target** | Slide deck | Business document |
| **Struktur** | Slide-based | Section-based |
| **Output** | Screen-optimized | Print-optimized |

---

# Halaman Kedua

## Advanced Features

Aksara Writer menyediakan fitur lanjutan untuk pembuatan dokumen bisnis Indonesia:

### Indonesian Language Support

- ✅ **Localized UI**: Interface dalam Bahasa Indonesia
- ✅ **Business templates**: Template khusus bisnis Indonesia
- ✅ **Government compliance**: Sesuai standar dokumen pemerintah
- ✅ **Tax-compliant formats**: Format sesuai peraturan perpajakan

## Kesimpulan

Dengan **Aksara Writer**, Anda dapat membuat dokumen profesional yang tidak hanya indah secara visual, tetapi juga sesuai dengan standar bisnis Indonesia.

---
*Dibuat dengan Aksara Writer - The Document Creator, Not Just Presentation Tool*
`,

    invoice: `<!--
aksara:true
style: ./templates/invoice.css
size: 210mmx297mm
meta:
    title: Faktur Penjualan
    subtitle: Invoice #INV-001
header: | PT. Nama Perusahaan | NPWP: 01.234.567.8-901.000 | ${new Date().toLocaleDateString('id-ID')} |
footer: Terima kasih atas kepercayaan Anda - PT. Nama Perusahaan
background: ../assets/invoice-letterhead.jpg
-->

# FAKTUR PENJUALAN

<div style="display: flex; justify-content: space-between; margin: 2rem 0;">
  <div>
    <strong>Nomor:</strong> INV-001<br>
    <strong>Tanggal:</strong> ${new Date().toLocaleDateString('id-ID')}<br>
    <strong>Jatuh Tempo:</strong> ${new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString('id-ID')}
  </div>
  <div style="text-align: right;">
    <strong>STATUS: BELUM DIBAYAR</strong><br>
    <em>Due Date: 30 hari dari tanggal faktur</em>
  </div>
</div>

---

## Data Perusahaan

**PT. Nama Perusahaan**
Alamat: Jl. Sudirman No. 123, Jakarta Pusat 10220
NPWP: 01.234.567.8-901.000
Telp: (021) 1234567 | Email: info@namapersh.co.id
Website: www.namapersh.co.id

## Data Pelanggan

**Kepada Yth:**
**[Nama Pelanggan/Perusahaan]**
Alamat: [Alamat Lengkap Pelanggan]
NPWP: [NPWP Pelanggan jika ada]
Telp: [Nomor Telepon]

---

# Detail Barang/Jasa

| No | Kode | Deskripsi Barang/Jasa | Qty | Satuan | Harga Satuan | Jumlah |
|----|------|----------------------|-----|--------|--------------|--------|
| 1  | BRG001 | Jasa Konsultasi IT | 20 | Jam | Rp 500.000 | **Rp 10.000.000** |
| 2  | BRG002 | Software License | 1 | Unit | Rp 5.000.000 | **Rp 5.000.000** |
| 3  | BRG003 | Training & Support | 5 | Hari | Rp 1.000.000 | **Rp 5.000.000** |

---

## Ringkasan Pembayaran

<div style="background: #f8f9fa; padding: 1.5rem; border-radius: 8px; margin: 2rem 0;">

| | |
|--|--:|
| **Subtotal** | **Rp 20.000.000** |
| **Diskon (5%)** | *-Rp 1.000.000* |
| **Subtotal setelah diskon** | **Rp 19.000.000** |
| **PPN 11%** | **Rp 2.090.000** |
| **Biaya Admin** | **Rp 50.000** |
| | |
| **TOTAL PEMBAYARAN** | **Rp 21.140.000** |

</div>

### Terbilang:
*Dua Puluh Satu Juta Seratus Empat Puluh Ribu Rupiah*

### Informasi Pembayaran:
- **Bank:** BCA
- **No. Rekening:** 1234567890
- **Atas Nama:** PT. Nama Perusahaan

### Catatan:
- Pembayaran mohon dilakukan paling lambat tanggal jatuh tempo
- Konfirmasi pembayaran dapat dikirim ke email finance@namapersh.co.id
- Faktur ini merupakan dokumen resmi dan sah secara hukum

---
*Dokumen ini dibuat secara otomatis menggunakan Aksara Writer*
`,

    proposal: `<!--
aksara:true
style: ./templates/proposal.css
size: 210mmx297mm
meta:
    title: Proposal Bisnis
    subtitle: Proposal Kerjasama Strategis
header: | RAHASIA | Proposal Bisnis | ${new Date().toLocaleDateString('id-ID')} |
footer: © ${new Date().getFullYear()} PT. Nama Perusahaan - Dokumen Rahasia
background: ../assets/proposal-bg.jpg
-->

# PROPOSAL BISNIS
## Kerjasama Strategis dan Investasi

---

# Ringkasan Eksekutif

**Latar Belakang Perusahaan:**
PT. [Nama Perusahaan] adalah perusahaan teknologi yang berfokus pada pengembangan solusi digital untuk pasar Indonesia. Didirikan pada tahun [tahun], kami telah melayani lebih dari [jumlah] klien dari berbagai industri.

**Tujuan Proposal:**
Proposal ini bertujuan untuk menawarkan kerjasama strategis dalam pengembangan [nama proyek/produk] yang akan memberikan manfaat signifikan bagi kedua belah pihak.

**Nilai Investasi:**
- **Total Investasi:** Rp [jumlah]
- **ROI Proyeksi:** [persentase]% dalam [periode]
- **Break-even Point:** Bulan ke-[angka]

---

# Analisis Pasar & Peluang

## Kondisi Pasar Saat Ini

### Identifikasi Masalah
1. **Gap teknologi** dalam industri [nama industri]
2. **Keterbatasan solusi** yang ada di pasar Indonesia
3. **Biaya tinggi** untuk implementasi teknologi impor
4. **Kurangnya lokalisasi** produk untuk kebutuhan lokal

### Ukuran Pasar
- **Total Addressable Market (TAM):** Rp [jumlah] triliun
- **Serviceable Available Market (SAM):** Rp [jumlah] miliar
- **Serviceable Obtainable Market (SOM):** Rp [jumlah] miliar

## Peluang Bisnis

| Segment | Ukuran Pasar | Growth Rate | Penetrasi Saat Ini |
|---------|--------------|-------------|---------------------|
| Enterprise | Rp 500M | 15% YoY | 5% |
| SME | Rp 200M | 25% YoY | 2% |
| Government | Rp 300M | 10% YoY | 8% |

---

# Solusi yang Ditawarkan

## Produk/Layanan Unggulan

### [Nama Produk/Layanan 1]
**Deskripsi:** [Penjelasan detail produk/layanan]
**Target Market:** [Segmen pasar yang ditargetkan]
**Unique Value Proposition:** [Keunggulan unik yang ditawarkan]

### [Nama Produk/Layanan 2]
**Deskripsi:** [Penjelasan detail produk/layanan]
**Revenue Model:** [Model pendapatan yang digunakan]
**Competitive Advantage:** [Keunggulan kompetitif]

## Diferensiasi Kompetitif

✅ **Teknologi terdepan** dengan R&D berkelanjutan
✅ **Tim expert** dengan pengalaman 10+ tahun
✅ **Lokalisasi penuh** untuk pasar Indonesia
✅ **Support 24/7** dalam Bahasa Indonesia
✅ **Compliance** dengan regulasi lokal
✅ **Partnership ecosystem** yang kuat

---

# Strategi Go-to-Market

## Target Customer Segments

### Primary Market
- **Large Enterprise:** 500+ karyawan, budget IT >Rp 5M/tahun
- **Government Agencies:** Kementerian, BUMN, Pemda
- **Financial Services:** Bank, Insurance, Fintech

### Secondary Market
- **SME Digital-forward:** 50-500 karyawan
- **Educational Institutions:** Universitas, Sekolah
- **Healthcare Providers:** RS, Klinik, Lab

## Strategi Pemasaran

### Digital Marketing
- **Content Marketing:** Blog, webinar, case studies
- **SEO/SEM:** Targeting keywords industri spesifik
- **Social Media:** LinkedIn, Twitter untuk B2B
- **Email Marketing:** Nurturing campaigns

### Partnership Strategy
- **System Integrators:** Kerjasama dengan SI terkemuka
- **Technology Partners:** Alliance dengan vendor global
- **Channel Partners:** Distributor dan reseller

---

# Financial Projections

## Struktur Investasi

| Komponen | Year 1 | Year 2 | Year 3 | Total |
|----------|--------|--------|--------|-------|
| **Product Development** | Rp 2M | Rp 3M | Rp 2M | Rp 7M |
| **Marketing & Sales** | Rp 1.5M | Rp 2.5M | Rp 3M | Rp 7M |
| **Operations** | Rp 1M | Rp 1.5M | Rp 2M | Rp 4.5M |
| **Working Capital** | Rp 0.5M | Rp 1M | Rp 1M | Rp 2.5M |
| **Total** | **Rp 5M** | **Rp 8M** | **Rp 8M** | **Rp 21M** |

## Revenue Projections

### 3-Year Financial Forecast

| Metrics | Year 1 | Year 2 | Year 3 |
|---------|--------|--------|--------|
| **Revenue** | Rp 8M | Rp 25M | Rp 60M |
| **Gross Profit** | Rp 6M | Rp 20M | Rp 48M |
| **EBITDA** | Rp 1M | Rp 8M | Rp 24M |
| **Net Profit** | -Rp 2M | Rp 5M | Rp 18M |
| **Customer Count** | 50 | 200 | 500 |

### Key Financial Metrics
- **CAC (Customer Acquisition Cost):** Rp 100K
- **LTV (Lifetime Value):** Rp 2M
- **LTV:CAC Ratio:** 20:1
- **Gross Margin:** 80%
- **Monthly Churn Rate:** <5%

---

# Tim & Manajemen

## Profil Manajemen Kunci

### [Nama CEO] - Chief Executive Officer
- **Pengalaman:** 15 tahun di industri teknologi
- **Background:** Ex-CTO di [Perusahaan Besar]
- **Expertise:** Strategic planning, product development

### [Nama CTO] - Chief Technology Officer
- **Pengalaman:** 12 tahun dalam software development
- **Background:** Lead Engineer di [Perusahaan Tech]
- **Expertise:** System architecture, team leadership

### [Nama CFO] - Chief Financial Officer
- **Pengalaman:** 10 tahun di corporate finance
- **Background:** Finance Director di [Perusahaan Publik]
- **Expertise:** Financial planning, investor relations

## Struktur Organisasi

Tim saat ini terdiri dari **[jumlah]** profesional dengan keahlian di:
- **Engineering:** 60% (Software developers, DevOps, QA)
- **Business:** 25% (Sales, Marketing, Customer Success)
- **Operations:** 15% (Finance, HR, Legal, Admin)

---

# Risk Analysis & Mitigation

## Identified Risks

### Market Risks 🟡
- **Competitor baru** dengan funding besar
- **Perubahan regulasi** pemerintah
- **Economic downturn** mempengaruhi IT spending

### Technical Risks 🟢
- **Scalability challenges** saat rapid growth
- **Security vulnerabilities** dalam product
- **Technology obsolescence** karena innovation cepat

### Business Risks 🟡
- **Key person dependency** pada founder team
- **Customer concentration** pada few large accounts
- **Cash flow** challenges dalam early stage

## Mitigation Strategies

✅ **Diversified revenue streams** untuk reduce dependency
✅ **Strong security practices** dan regular audits
✅ **Talent retention program** untuk key employees
✅ **Strategic partnerships** untuk market access
✅ **Conservative financial planning** dengan multiple scenarios

---

# Call to Action

## Proposal Kerjasama

Kami mengundang [Nama Partner] untuk bergabung dalam journey transformasi digital Indonesia melalui kerjasama strategis yang mutual beneficial.

### Investment Terms
- **Total Investment:** Rp [jumlah]
- **Equity Stake:** [persentase]%
- **Board Seats:** [jumlah] dari [total]
- **Dividend Policy:** [kebijakan dividen]

### Timeline
- **Due Diligence:** 4 minggu
- **Legal Documentation:** 2 minggu
- **Fund Transfer:** 1 minggu
- **Project Kickoff:** Immediately after closing

### Next Steps
1. **Preliminary Discussion** - This week
2. **Detailed Presentation** - Next week
3. **Site Visit & Team Meeting** - Week 3
4. **Term Sheet Negotiation** - Week 4

## Contact Information

**[Nama Penanggung Jawab]**
Position: [Jabatan]
Email: [email]
Phone: [nomor telepon]
WhatsApp: [nomor wa]

**Office Address:**
[Alamat lengkap kantor]

---

*Proposal ini bersifat rahasia dan hanya untuk keperluan evaluasi kerjasama. Dilarang menyebarkan tanpa izin tertulis dari PT. [Nama Perusahaan]. Dibuat dengan Aksara Writer.*
`
  };

  return templates[template as keyof typeof templates] || templates.default;
}

// Handle CLI errors gracefully
process.on('uncaughtException', (error) => {
  console.error(chalk.red('Unexpected error:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red('Unhandled promise rejection:'), reason);
  process.exit(1);
});

// Show help if no arguments
if (process.argv.length === 2) {
  program.help();
}

program.parse();