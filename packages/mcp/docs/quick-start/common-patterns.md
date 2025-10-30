## Common Patterns

### Multi-page Document
```markdown
<!--
aksara:true
type: document
-->

# Page 1 Content

---

# Page 2 Content

---

# Page 3 Content
```

### Presentation Slides
```markdown
<!--
aksara:true
type: presentation
size: 16:9
-->

# Title Slide

---

## Content Slide
- Point 1
- Point 2
- Point 3

---

## Conclusion
```

### Mixed Content with Backgrounds
```markdown
![bg t:0 l:0 w:100% h:100%](background.jpg)

# Content Over Background

Regular markdown content appears over the background image.

![fg r:20px t:20px w:80px](logo.png)
```
