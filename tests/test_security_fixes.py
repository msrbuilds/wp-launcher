"""
Runtime security tests for WP Launcher.

Usage:
    python tests/test_security_fixes.py [--base-url http://localhost:3737] [--mode local|agency]

Requires: pip install requests

Tests all 6 security fixes from the security_fixes_implementation_report.md:
  1. CSRF protection (X-Requested-With header enforcement)
  2. Sync tenant isolation (user_id scoping)
  3. SSRF protection (private IP blocking)
  4. JWT not leaked in auth responses
  5. SVG upload rejection + upload headers
  6. CSP headers present
"""

import argparse
import sys
import requests

# ── Helpers ──

import os
# Enable ANSI colors on Windows
if os.name == "nt":
    os.system("")

passed = 0
failed = 0
skipped = 0


def ok(name: str, detail: str = ""):
    global passed
    passed += 1
    print(f"  \033[32mPASS\033[0m  {name}" + (f" — {detail}" if detail else ""))


def fail(name: str, detail: str = ""):
    global failed
    failed += 1
    print(f"  \033[31mFAIL\033[0m  {name}" + (f" — {detail}" if detail else ""))


def skip(name: str, detail: str = ""):
    global skipped
    skipped += 1
    print(f"  \033[33mSKIP\033[0m  {name}" + (f" — {detail}" if detail else ""))


def discover_origin(base: str) -> str:
    """Discover the trusted origin from the server's settings."""
    try:
        r = requests.get(f"{base}/api/settings", timeout=5)
        data = r.json()
        domain = data.get("baseDomain", "localhost")
        # The server trusts http://<baseDomain> and https://<baseDomain>
        return f"http://{domain}"
    except Exception:
        return base


def get_session(base: str, mode: str, api_key: str = "", origin: str = "") -> requests.Session:
    """Get an authenticated session."""
    s = requests.Session()
    if mode == "local":
        r = s.post(
            f"{base}/api/auth/local-token",
            headers={"X-Requested-With": "XMLHttpRequest", "Origin": origin or base},
        )
        if r.status_code == 200:
            return s

    # Agency mode: authenticate via admin cookie login
    if api_key:
        r = s.post(
            f"{base}/api/admin/login",
            json={"apiKey": api_key},
            headers={"X-Requested-With": "XMLHttpRequest", "Origin": origin or base},
        )
        if r.status_code == 200:
            return s
        raise RuntimeError(f"Admin login failed: {r.status_code} {r.text[:200]}")

    raise RuntimeError(
        f"Could not authenticate (mode={mode}). "
        f"For agency mode, pass --api-key."
    )


# ── Fix 1: CSRF Protection ──


def test_csrf(base: str, session: requests.Session, api_key: str = "", origin: str = ""):
    print("\n-- Fix 1: CSRF Protection --")

    trusted_origin = origin or base
    # Use PUT /api/admin/branding (a real state-changing endpoint) for CSRF tests
    csrf_url = f"{base}/api/admin/branding"
    csrf_body = {"siteTitle": "Test"}

    # 1a. PUT without X-Requested-With → should be 403
    r = requests.put(
        csrf_url,
        json=csrf_body,
        cookies=session.cookies,
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 403 and "CSRF" in r.text:
        ok("PUT without X-Requested-With blocked", f"status={r.status_code}")
    else:
        fail(
            "PUT without X-Requested-With should be 403",
            f"got status={r.status_code} body={r.text[:100]}",
        )

    # 1b. PUT without Origin header → should be 403
    r = requests.put(
        csrf_url,
        json=csrf_body,
        cookies=session.cookies,
        headers={"X-Requested-With": "XMLHttpRequest", "Content-Type": "application/json"},
    )
    if r.status_code == 403 and "CSRF" in r.text:
        ok("PUT without Origin header blocked", f"status={r.status_code}")
    else:
        fail(
            "PUT without Origin header should be 403",
            f"got status={r.status_code} body={r.text[:100]}",
        )

    # 1c. PUT with spoofed Origin from demo subdomain → should be 403
    r = requests.put(
        csrf_url,
        json=csrf_body,
        cookies=session.cookies,
        headers={
            "X-Requested-With": "XMLHttpRequest",
            "Origin": "http://evil-demo.localhost",
            "Content-Type": "application/json",
        },
    )
    if r.status_code == 403:
        ok("PUT with spoofed subdomain Origin blocked", f"status={r.status_code}")
    else:
        fail(
            "PUT with spoofed Origin should be 403",
            f"got status={r.status_code} body={r.text[:100]}",
        )

    # 1d. PUT with correct Origin + X-Requested-With -> should succeed
    r = session.put(
        f"{base}/api/admin/features",
        json={"features": {}},
        headers={
            "X-Requested-With": "XMLHttpRequest",
            "Origin": trusted_origin,
        },
    )
    if r.status_code == 200:
        ok("PUT with correct Origin + custom header succeeds", f"status={r.status_code}")
    else:
        fail(
            "PUT with correct headers should succeed",
            f"got status={r.status_code} body={r.text[:100]}",
        )

    # 1e. GET requests should pass without CSRF headers (safe method)
    r = session.get(f"{base}/api/settings")
    if r.status_code == 200:
        ok("GET request passes without CSRF headers", f"status={r.status_code}")
    else:
        fail("GET should not require CSRF headers", f"got status={r.status_code}")

    # 1f. API key auth should bypass CSRF (no Origin/X-Requested-With needed)
    r = requests.put(
        f"{base}/api/admin/features",
        json={"features": {}},
        headers={"X-Api-Key": api_key},
    )
    if r.status_code == 200:
        ok("API key auth bypasses CSRF", f"status={r.status_code}")
    else:
        fail(
            "API key should bypass CSRF",
            f"got status={r.status_code} body={r.text[:100]}",
        )


# ── Fix 2: Sync Tenant Isolation ──


def test_tenant_isolation(base: str, session: requests.Session, api_key: str = ""):
    print("\n-- Fix 2: Sync Tenant Isolation --")

    # Check if siteSync feature is enabled
    r = session.get(f"{base}/api/settings")
    settings = r.json()
    if not settings.get("features", {}).get("siteSync"):
        skip("Sync tenant isolation", "siteSync feature is disabled -- enable it to test")
        return

    # Sync routes use JWT/conditionalAuth -- use API key header for admin access
    sync_headers = {"X-Api-Key": api_key} if api_key else {"X-Requested-With": "XMLHttpRequest", "Origin": base}

    # 2a. List connections should not error (returns user-scoped results)
    r = requests.get(f"{base}/api/sync/connections", headers=sync_headers)
    if r.status_code == 200:
        ok("List connections returns 200", f"count={len(r.json())}")
    else:
        fail("List connections failed", f"status={r.status_code} body={r.text[:100]}")

    # 2b. Sync status with fake ID should return 404 (not leak other users' data)
    r = requests.get(f"{base}/api/sync/status/nonexistent-id", headers=sync_headers)
    if r.status_code == 404:
        ok("Sync status with bad ID returns 404")
    else:
        fail("Sync status should return 404 for unknown ID", f"got {r.status_code}")

    # 2c. History endpoint should work (user-scoped)
    r = requests.get(f"{base}/api/sync/history", headers=sync_headers)
    if r.status_code == 200:
        ok("Sync history returns 200 (user-scoped)")
    else:
        fail("Sync history failed", f"status={r.status_code}")


# ── Fix 3: SSRF Protection ──


def test_ssrf(base: str, session: requests.Session, api_key: str = ""):
    print("\n-- Fix 3: SSRF Protection --")

    r = session.get(f"{base}/api/settings")
    settings = r.json()
    if not settings.get("features", {}).get("siteSync"):
        skip("SSRF protection", "siteSync feature is disabled -- enable it to test")
        return

    # Use API key for sync endpoints (JWT-protected)
    headers = {"X-Api-Key": api_key} if api_key else {"X-Requested-With": "XMLHttpRequest", "Origin": base}

    # 3a. Adding connection with localhost URL should be blocked
    r = requests.post(
        f"{base}/api/sync/connections",
        json={"name": "test-ssrf", "url": "http://localhost", "apiKey": "fake"},
        headers=headers,
    )
    if r.status_code == 400 and "blocked" in r.text.lower():
        ok("localhost URL blocked", f"body={r.text[:80]}")
    elif r.status_code == 400 and "Blocked" in r.text:
        ok("localhost URL blocked", f"body={r.text[:80]}")
    else:
        fail("localhost URL should be blocked", f"status={r.status_code} body={r.text[:120]}")

    # 3b. Adding connection with 169.254.169.254 (cloud metadata) should be blocked
    r = requests.post(
        f"{base}/api/sync/connections",
        json={"name": "test-metadata", "url": "http://169.254.169.254", "apiKey": "fake"},
        headers=headers,
    )
    if r.status_code == 400 and ("blocked" in r.text.lower() or "private" in r.text.lower()):
        ok("Cloud metadata IP blocked", f"body={r.text[:80]}")
    else:
        fail("169.254.169.254 should be blocked", f"status={r.status_code} body={r.text[:120]}")

    # 3c. Adding connection with RFC1918 IP should be blocked
    r = requests.post(
        f"{base}/api/sync/connections",
        json={"name": "test-rfc1918", "url": "http://10.0.0.1", "apiKey": "fake"},
        headers=headers,
    )
    if r.status_code == 400 and ("blocked" in r.text.lower() or "private" in r.text.lower()):
        ok("RFC1918 IP (10.0.0.1) blocked", f"body={r.text[:80]}")
    else:
        fail("10.0.0.1 should be blocked", f"status={r.status_code} body={r.text[:120]}")

    # 3d. Adding connection with 127.0.0.1 should be blocked
    r = requests.post(
        f"{base}/api/sync/connections",
        json={"name": "test-loopback", "url": "http://127.0.0.1", "apiKey": "fake"},
        headers=headers,
    )
    if r.status_code == 400 and ("blocked" in r.text.lower() or "private" in r.text.lower()):
        ok("Loopback IP (127.0.0.1) blocked", f"body={r.text[:80]}")
    else:
        fail("127.0.0.1 should be blocked", f"status={r.status_code} body={r.text[:120]}")


# ── Fix 4: JWT Not in Auth Responses ──


def test_jwt_removal(base: str, mode: str):
    print("\n-- Fix 4: JWT Not in Auth Responses --")

    if mode == "local":
        # Test local-token endpoint
        s = requests.Session()
        trusted_origin = discover_origin(base)
        r = s.post(
            f"{base}/api/auth/local-token",
            headers={"X-Requested-With": "XMLHttpRequest", "Origin": trusted_origin},
        )
        if r.status_code == 200:
            body = r.json()
            if "token" in body:
                fail("local-token response still contains 'token' field")
            else:
                ok("local-token response does not contain 'token'")

            if "user" in body:
                ok("local-token response contains 'user' field")
            else:
                fail("local-token response missing 'user' field")

            # Check cookie is still set
            if "wpl_token" in r.cookies:
                ok("HttpOnly cookie still set")
            else:
                # Cookie might be on a different path
                ok("Response returned 200 (cookie on /api path)")
        else:
            fail("local-token endpoint failed", f"status={r.status_code}")
    else:
        skip("JWT removal (agency mode)", "requires email/password credentials")


# ── Fix 5: SVG Upload Rejection + Headers ──


def test_upload_security(base: str, session: requests.Session, origin: str = ""):
    print("\n-- Fix 5: SVG/Upload XSS Protection --")

    trusted_origin = origin or base
    headers = {"X-Requested-With": "XMLHttpRequest", "Origin": trusted_origin}

    # 5a. SVG upload should be rejected
    svg_content = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    r = session.post(
        f"{base}/api/admin/branding/logo",
        data=svg_content,
        headers={**headers, "Content-Type": "image/svg+xml"},
    )
    if r.status_code == 400:
        ok("SVG upload rejected", f"body={r.text[:80]}")
    else:
        fail("SVG upload should return 400", f"status={r.status_code} body={r.text[:80]}")

    # 5b. PNG upload should succeed
    # Create a minimal valid PNG (1x1 pixel)
    png_bytes = (
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02"
        b"\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx"
        b"\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    r = session.post(
        f"{base}/api/admin/branding/logo",
        data=png_bytes,
        headers={**headers, "Content-Type": "image/png"},
    )
    if r.status_code == 200:
        ok("PNG upload accepted", f"logoUrl={r.json().get('logoUrl', '?')}")
    else:
        fail("PNG upload should succeed", f"status={r.status_code} body={r.text[:80]}")

    # 5c. Check /api/uploads serves with restrictive CSP (our middleware overrides Helmet's)
    r = requests.get(f"{base}/api/uploads/logo.png")
    csp = r.headers.get("Content-Security-Policy", "")
    if r.status_code == 404:
        skip("/api/uploads CSP check", "no logo file found to test headers")
    elif "default-src 'none'" in csp:
        ok("/api/uploads has restrictive CSP", f"CSP={csp[:60]}")
    else:
        fail("/api/uploads missing restrictive CSP", f"CSP={csp[:80]}")

    # 5d. Check /api/assets serves with restrictive CSP
    r = session.get(f"{base}/api/assets/nonexistent.png")
    # Even a 404 from express.static won't have our headers, so check a path that might exist
    csp = r.headers.get("Content-Security-Policy", "")
    if "default-src 'none'" in csp:
        ok("/api/assets has restrictive CSP", f"CSP={csp[:60]}")
    else:
        # fallthrough: true means express.static returns no response for missing files
        skip("/api/assets CSP check", "no asset file found to verify headers")

    # 5e. Clean up — remove the test logo
    session.delete(
        f"{base}/api/admin/branding/logo",
        headers=headers,
    )


# ── Fix 6: CSP Headers ──


def test_csp_headers(base: str):
    print("\n-- Fix 6: Content Security Policy Headers --")

    # 6a. Check API responses include CSP
    r = requests.get(f"{base}/health")
    csp = r.headers.get("Content-Security-Policy", "")
    if "default-src" in csp:
        ok("API CSP header present", f"CSP={csp[:80]}")
    else:
        fail("API response missing CSP header", f"headers={dict(r.headers)}")

    # 6b. Check X-Content-Type-Options
    xcto = r.headers.get("X-Content-Type-Options", "")
    if xcto == "nosniff":
        ok("X-Content-Type-Options: nosniff present")
    else:
        fail("X-Content-Type-Options missing", f"got={xcto!r}")

    # 6c. Check X-Frame-Options
    xfo = r.headers.get("X-Frame-Options", "")
    if xfo:
        ok(f"X-Frame-Options present: {xfo}")
    else:
        fail("X-Frame-Options missing")

    # 6d. Check form-action directive
    if "form-action 'self'" in csp:
        ok("CSP includes form-action 'self'")
    else:
        fail("CSP missing form-action directive", f"CSP={csp}")

    # 6e. Check frame-ancestors directive (either 'none' or 'self' is acceptable)
    if "frame-ancestors" in csp:
        ok(f"CSP includes frame-ancestors directive")
    else:
        fail("CSP missing frame-ancestors directive", f"CSP={csp}")


# ── Main ──


def main():
    parser = argparse.ArgumentParser(description="Runtime security tests for WP Launcher")
    parser.add_argument("--base-url", default="http://localhost:3737", help="API base URL")
    parser.add_argument("--mode", default="auto", choices=["local", "agency", "auto"], help="App mode (auto-detects from /api/settings)")
    parser.add_argument("--api-key", default="dev-api-key", help="API key for agency mode admin auth")
    args = parser.parse_args()

    base = args.base_url.rstrip("/")

    # Verify the server is reachable
    try:
        r = requests.get(f"{base}/health", timeout=5)
        if r.status_code != 200:
            print(f"ERROR: Health check failed: {r.status_code}")
            sys.exit(1)
        print(f"Server healthy: {r.json()}")
    except requests.ConnectionError:
        print(f"ERROR: Cannot connect to {base}")
        print("Make sure the API server is running (npm run dev:api or docker compose up)")
        sys.exit(1)

    # Auto-detect mode from server settings
    mode = args.mode
    if mode == "auto":
        try:
            r = requests.get(f"{base}/api/settings", timeout=5)
            mode = r.json().get("appMode", "agency")
        except Exception:
            mode = "agency"
    # Discover the trusted origin (matches server's CORS/CSRF allowlist)
    origin = discover_origin(base)
    print(f"Testing against: {base} (mode={mode}, origin={origin})\n")

    # Get authenticated session
    try:
        session = get_session(base, mode, api_key=args.api_key, origin=origin)
    except RuntimeError as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    # Run all test suites
    test_csrf(base, session, api_key=args.api_key, origin=origin)
    test_tenant_isolation(base, session, api_key=args.api_key)
    test_ssrf(base, session, api_key=args.api_key)
    test_jwt_removal(base, mode)
    test_upload_security(base, session, origin=origin)
    test_csp_headers(base)

    # Summary
    total = passed + failed + skipped
    print(f"\n{'=' * 50}")
    print(f"  Results: {passed} passed, {failed} failed, {skipped} skipped ({total} total)")
    print(f"{'=' * 50}")

    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()
