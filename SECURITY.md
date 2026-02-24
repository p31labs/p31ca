# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅        |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Email: security@phosphorus31.org

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a detailed response
within 7 days.

## Security Design Principles

P31 uses a layered security model:

1. **Protocol level:** CRC8-MAXIM integrity checks, HMAC-SHA256 authentication
2. **Transport level:** COBS framing prevents injection attacks
3. **Application level:** Voltage scoring filters high-risk content
4. **Infrastructure level:** All secrets in `.env` (never committed),
   Docker network isolation, Caddy TLS termination

## Disclosure Policy

We follow coordinated disclosure. We will credit reporters in our changelog
unless they prefer to remain anonymous.
