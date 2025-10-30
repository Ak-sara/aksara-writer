<!--
aksara:true
template: invoice
style: ./templates/invoice.css
meta:
    title: Faktur Penjualan
    invoiceNumber: INV-2025-001
    company: PT. Contoh Perusahaan
    npwp: 01.234.567.8-901.000
header: | PT. Contoh Perusahaan | NPWP: 01.234.567.8-901.000 | ${new Date().toLocaleDateString('id-ID')} |
-->

# FAKTUR PENJUALAN

**No. Faktur:** ${invoiceNumber}
**Tanggal:** ${new Date().toLocaleDateString('id-ID')}

**Kepada:**
PT. Client Indonesia
Jl. Sudirman No. 123
Jakarta Pusat 10220

---

## Rincian Pembelian

| No | Deskripsi | Qty | Harga Satuan | Total |
|----|-----------|-----|--------------|-------|
| 1  | Jasa Konsultasi IT | 10 | Rp 500.000 | **Rp 5.000.000** |
| 2  | Maintenance Server | 5 | Rp 300.000 | **Rp 1.500.000** |
| 3  | Support Teknis | 20 | Rp 150.000 | **Rp 3.000.000** |

---

**Subtotal:** Rp 9.500.000
**PPN 11%:** Rp 1.045.000
**Total:** **Rp 10.545.000**

---

**Terbilang:** *Sepuluh juta lima ratus empat puluh lima ribu rupiah*

**Pembayaran:**
Bank BCA a/n PT. Contoh Perusahaan
No. Rek: 1234567890

**Hormat kami,**

[Nama Direktur]
Direktur
