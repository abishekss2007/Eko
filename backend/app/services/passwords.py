"""Password hashing with scrypt (standard library, memory-hard, salted)."""

import hashlib
import hmac
import secrets

N, R, P, DKLEN = 2**14, 8, 1, 64
_MAXMEM = 64 * 1024 * 1024


def hash_password(password: str) -> str:
    """Return `scrypt$n$r$p$salt$hash` with a fresh 16-byte salt."""
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=N, r=R, p=P, dklen=DKLEN, maxmem=_MAXMEM)
    return f"scrypt${N}${R}${P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time comparison. Malformed hashes never verify."""
    try:
        scheme, n, r, p, salt_hex, hash_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode(),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(hash_hex) // 2,
            maxmem=_MAXMEM,
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest.hex(), hash_hex)


# Verified against when the e-mail is unknown, so a miss takes as long as a wrong password.
DUMMY_HASH = hash_password(secrets.token_urlsafe(16))
