# Security Policy

## Supported Versions

Only the latest stable release receives security fixes.

| Version | Supported |
|---------|-----------|
| 1.x.x   | ✅ Yes    |

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities in public GitHub issues.**

If you discover a security vulnerability in Phtps, report it privately:

**Email:** security@your-domain.com  
**Subject:** `[SECURITY] Phtps — <brief description>`

Include in your report:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional but appreciated)

### What happens next

- You will receive an acknowledgement within **48 hours**
- We will investigate and aim to release a patch within **7 days** for critical issues
- You will be credited in the release notes (unless you prefer to remain anonymous)

---

## Scope

Security reports are in scope for:

- Encryption implementation (`SimpleCrypto.ts`, `EncryptionPlugin.ts`)
- Authentication token handling (`AuthPlugin.ts`, `TokenRotationManager.ts`)
- Payment request signing (`PaymentPlugin.ts`)
- CSRF protection (`CsrfPlugin.ts`, `CsrfManager.ts`)
- Sensitive data leaking in error objects or logs

Out of scope:
- Bugs in user code that uses Phtps incorrectly
- Vulnerabilities in devDependencies not shipped to users

---

## Encryption Notes

Phtps uses the **Web Crypto API** (`crypto.subtle`) exclusively for all cryptographic operations. No third-party crypto libraries are used or shipped. The encryption implementation uses:

- **Algorithm:** AES-GCM (256-bit)
- **Key derivation:** PBKDF2-SHA256, 100,000 iterations
- **Salt:** Random 16 bytes per encryption call (not reused)
- **IV:** Random 12 bytes per encryption call (not reused)

If you identify a weakness in this implementation, that is high priority — please report it.
