## Responsive Typography

Aksara Writer uses responsive typography that scales with viewport:

```css
/* Base responsive scaling */
font-size: clamp(1rem, 3vh, 1.5rem);

/* Heading scales */
h1 { font-size: clamp(2.5rem, 8vh, 4rem); }
h2 { font-size: clamp(2rem, 6vh, 3rem); }
h3 { font-size: clamp(1.5rem, 4.5vh, 2.25rem); }
```
