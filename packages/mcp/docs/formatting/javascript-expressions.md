## JavaScript Expressions

Aksara Writer allows you to use JavaScript expressions directly in your markdown files. This is useful for dynamic content like dates.

### Usage

To use a JavaScript expression, wrap it in `${...}`.

```markdown
Today's date is ${new Date().toLocaleDateString('id-ID')}
```

### Supported Expressions

For security reasons, only a limited set of JavaScript expressions are supported:

- `new Date()`: Get the current date and time.
- `.toLocaleDateString(locale)`: Format the date for a specific locale.
- `.toDateString()`: Format the date as a string.
- `.getFullYear()`: Get the full year.
- `Date.now()`: Get the current timestamp.
- Simple math operations for date offsets.
