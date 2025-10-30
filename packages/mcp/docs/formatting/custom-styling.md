## Custom Styling

### CSS Class Mapping
- `.document-section` → Target individual pages/slides
- `.section-content` → Main content area
- `.document-header` → Header area
- `.document-footer` → Footer area
- `.page-number` → Page numbering

### Example Custom Styles
```css
.document-section:first-child {
    text-align: right;
    color: #CCC;
}

.document-section:first-child h1,
.document-section:first-child h3 {
    color: #FFF;
}

.section-content {
    background-color: rgba(255,255,255,0.8);
    border-radius: 1rem;
    padding: 2rem;
}
```
