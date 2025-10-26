# Changelog

All notable changes to Aksara Writer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Dynamic Metadata Variables**: Define custom metadata fields and use them as variables throughout documents with `${meta.fieldname}` syntax
  - Support for any field name (not hardcoded)
  - Error handling with `[meta.fieldname not found]` message for missing fields
  - Works in content, headers, and footers
  - Perfect for corporate letters, forms, and templates
- **Pan and Drag Navigation**: Grab and drag to navigate when zoomed in on document preview
  - Cursor changes to "grab" when zoomed (zoom > 1)
  - Smooth panning with mouse drag
  - Works in both HTML export and VS Code preview
- **Gantt Chart Auto-Sizing**: Gantt charts automatically scale to full page width
  - Mermaid Gantt charts detected automatically
  - Configured with `useWidth: 1100` for better rendering
  - Responsive scaling maintains readable proportions
  - SVG attributes adjusted for proper display
- **Footer Layout Improvements**: Footer now uses flex layout matching header behavior
  - Split by `|` delimiter into multiple items
  - Proper alignment: first item left, middle centered, last item right
  - `[page]` and `[total]` placeholders work correctly
  - No more duplicate page numbers

### Fixed
- **Footer Rendering**: Fixed duplicate "Halaman X dari Y" text appearing when custom footer is provided
- **CSS-Generated Page Numbers**: Removed automatic `::after` content that conflicted with custom footers
- **Code Block Formatting**: Added `white-space: pre` to documentation page code blocks to preserve newlines

### Changed
- `AksaraDirectives.meta` type changed from fixed fields to `Record<string, string>` for dynamic fields
- Footer generation logic now matches header generation (split by `|`, flex layout)

## [0.1.7] - 2024-10-14

### Added
- Tauri application compatibility
- Support for sandboxed browser environments
- `basePath` option for custom asset path resolution
- Comprehensive Tauri integration documentation

### Fixed
- File system access in Tauri environments
- Asset path resolution without `process.cwd()`

## [0.1.6] - 2024-09-21

### Added
- VS Code extension with live preview
- Command-line interface improvements
- Indonesian business document templates

### Changed
- Improved PDF generation performance
- Enhanced Mermaid diagram rendering

## [0.1.0] - 2024-09-01

### Added
- Initial release
- Core markdown to PDF/HTML/PPTX conversion
- Indonesian language support
- Basic business templates
- Bun runtime support

[Unreleased]: https://github.com/ak-sara/aksara-writer/compare/v0.1.7...HEAD
[0.1.7]: https://github.com/ak-sara/aksara-writer/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/ak-sara/aksara-writer/compare/v0.1.0...v0.1.6
[0.1.0]: https://github.com/ak-sara/aksara-writer/releases/tag/v0.1.0
