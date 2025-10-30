### Metadata Variables

Define custom metadata and use them as variables throughout your document:

```markdown
<!--
aksara:true
type: document
meta:
    company: "PT. Aksara Digital"
    from_name: "Heriawan Agung"
    ref_number: "REF/2025/001"
    any_field: "Any value"
header: | ${meta.company} | ${new Date().toLocaleDateString('id-ID')} |
footer: | ${meta.ref_number} | Page [page] of [total] |
-->

# Surat Penawaran

**Dari**: ${meta.from_name}
**Perusahaan**: ${meta.company}
**Nomor**: ${meta.ref_number}

| Field | Value |
|-------|-------|
| Perusahaan | ${meta.company} |
| Ref No | ${meta.ref_number} |
```

**Features:**
- ✅ Dynamic field names (not hardcoded)
- ✅ Use anywhere in content, headers, footers
- ✅ Error handling: `[meta.fieldname not found]` if field missing
- ✅ Perfect for corporate letters, forms, invoices
