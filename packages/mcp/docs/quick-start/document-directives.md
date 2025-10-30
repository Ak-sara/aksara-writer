### Document Directives

Every Aksara document starts with configuration directives in HTML comments:

```markdown
<!--
aksara:true
type: document | presentation
size: A4 | 16:9 | 4:3 | 210mmx297mm
style: ./custom.css
meta:
    title: Document Title
    subtitle: Document Subtitle
    author: Author Name
header: | Company Name | Document Type | ${new Date().toLocaleDateString('id-ID')} |
footer: Halaman [page] dari [total] - Dibuat dengan Aksara Writer
background: ./background.jpg
-->

# Document Content Here
```
