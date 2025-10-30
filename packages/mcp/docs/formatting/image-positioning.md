## Image Positioning

Aksara Writer provides advanced options for positioning and styling images.

### Usage

You can control the position and size of an image by adding special prefixes and attributes to the alt text.

```markdown
![bg t:0 l:0 w:100% h:100%](background.png)  # Full background
![fg r:20px t:50px w:100px](logo.png)       # Positioned foreground
![lg h:60px](header-logo.png)               # Logo with height constraint
![wm opacity:0.3](watermark.png)            # Watermark overlay
```

### Prefixes

- `bg`: Background image. Positioned behind the content.
- `fg`: Foreground image. Positioned in front of the content.
- `lg`: Logo image. Special handling for logos.
- `wm`: Watermark image. Positioned as a watermark.

### Attributes

- `t`: top
- `r`: right
- `b`: bottom
- `l`: left
- `w`: width
- `h`: height
- `opacity`: Opacity of the image.
