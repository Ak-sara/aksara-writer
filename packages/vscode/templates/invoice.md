<!--
aksara:true
type: document
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