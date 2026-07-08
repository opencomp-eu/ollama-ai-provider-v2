# Changelog

## 4.0.0

### Breaking Changes

- Requires AI SDK 7 (`ai@^7.0.0`)
- Requires Node.js 22+ (aligned with AI SDK 7)
- Drops AI SDK 5/6 support
- Migrated internal provider implementation from Provider V3 to Provider V4

### Added

- Support for AI SDK 7 top-level `reasoning` option (mapped to Ollama's `think` flag)
- V4 file part handling with tagged union data shapes
- `stream-start` events in streaming responses

### Notes

- Public API (`createOllama()`, `ollama()`) is unchanged
