# Security Policy

## Supported versions

The project is in its initial development phase (`0.0.x`). Only the latest
commit of the default branch receives security fixes.

| Version | Supported |
|---------|-----------|
| latest `0.0.x` | ✅ |
| older | ❌ |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions or pull requests.**

Report them privately using GitHub's
[private vulnerability reporting](https://github.com/s-celles/progressive-web-office/security/advisories/new)
(GitHub Security Advisories, "GHSA"). Please include:

- the affected version or commit,
- the browser and operating system (with versions),
- a description of the issue and its impact,
- steps to reproduce, ideally with a minimal sample file,
- any suggested fix.

## Disclosure process

1. We acknowledge your report within **7 days**.
2. We investigate, confirm the issue and assess its severity (CVSS).
3. A fix is prepared in a private fork attached to the draft advisory.
4. A GitHub Security Advisory (GHSA) is published together with the fix,
   and a CVE is requested through GitHub when appropriate.
5. Reporters are credited in the advisory unless they prefer otherwise.

We aim to publish fixes within **90 days** of the report.

## Scope

Progressive Web Office (PWO) processes untrusted documents in the browser. Issues of particular
interest include:

- script execution or HTML injection from a crafted document (DOCX, ODT, XLSX,
  ODS, PPTX, ODP, Markdown, MDZ, LaTeX, CSV or PDF),
- path traversal / zip-slip in package handling,
- denial of service through crafted archives (zip bombs, pathological XML),
- bypasses of the Content-Security-Policy,
- any leak of document content outside the device, or of a git access token
  or AI API key to anything other than its own API,
- document changes made by an AI agent (assistant or WebMCP) without the
  user's consent or approval.
