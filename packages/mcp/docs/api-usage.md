## API Usage (Node.js)

```typescript
import { AksaraConverter } from 'aksara-writer-core';

const converter = new AksaraConverter({
  format: 'pdf',
  locale: 'id',
  theme: 'corporate'
});

const result = await converter.convert(markdownContent);
if (result.success) {
  fs.writeFileSync('output.pdf', result.data);
}
```
