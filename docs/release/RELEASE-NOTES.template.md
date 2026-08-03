# YAM Release {{VERSION}}

**Date:** {{DATE}}  
**Version:** {{VERSION}}

## Artifacts

| File | Description | Size |
|------|-------------|------|
{{ARTIFACT_ROWS}}

## Checksums (SHA256)

```text
{{CHECKSUMS}}
```

Individual `.sha256` files are provided next to each artifact.

## Installation

- **Setup (recommended):** run the NSIS `.exe` installer.
- **MSI:** use the `.msi` package for managed deployment.
- **Portable:** run the portable `.exe` directly.

**Requirement:** Windows with WebView2 Runtime and Microsoft Edge.

The desktop package embeds the Python collection backend and its runtime dependencies. Users do not need to install Python. The backend is extracted atomically to `%USERPROFILE%\.yam\runtime` when needed; cookies, databases, and diagnostic logs remain local.
