import { NextResponse, type NextRequest } from 'next/server';

import { ADMIN_SESSION_COOKIE } from '@/lib/auth/auth-constants';
import { CSRF_COOKIE, INTERNAL_CSRF_HEADER } from '@/lib/auth/csrf-constants';

export function middleware(request: NextRequest) {
    const httpsRedirect = redirectPublicHttpToHttps(request);

    if (httpsRedirect) {
        return httpsRedirect;
    }
    const csrfResponse = rejectCrossSiteMutation(request);

    if (csrfResponse) {
        return withCsrfCookie(request, withSecurityHeaders(csrfResponse));
    }

    if (
        request.nextUrl.pathname === '/rtvtime' ||
        request.nextUrl.pathname.startsWith('/rtvtime/')
    ) {
        const url = request.nextUrl.clone();
        url.pathname = request.nextUrl.pathname.replace(/^\/rtvtime/, '') || '/';

        return withCsrfCookie(request, withSecurityHeaders(NextResponse.redirect(url, 308)));
    }

    if (!isAdminProtectedPath(request.nextUrl.pathname)) {
        return withSecurityHeaders(nextWithCsrfHeader(request));
    }
    const expected = process.env.ADMIN_BOOTSTRAP_TOKEN;

    if (!expected) {
        if (shouldFailClosedForMissingAdminToken()) {
            return withCsrfCookie(
                request,
                withSecurityHeaders(
                    NextResponse.json(
                        { ok: false, error: 'Admin auth not configured' },
                        { status: 503 },
                    ),
                ),
            );
        }

        return withSecurityHeaders(nextWithCsrfHeader(request));
    }

    if (request.cookies.get(ADMIN_SESSION_COOKIE)?.value) {
        return withSecurityHeaders(nextWithCsrfHeader(request));
    }
    const actual = request.cookies.get('rpm_admin_token')?.value;

    if (actual === expected) {
        return withSecurityHeaders(nextWithCsrfHeader(request));
    }
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    url.searchParams.set('return_to', `${request.nextUrl.pathname}${request.nextUrl.search}`);

    return withCsrfCookie(request, withSecurityHeaders(NextResponse.redirect(url)));
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

function redirectPublicHttpToHttps(request: NextRequest) {
    const host = request.headers.get('host') ?? request.nextUrl.host;
    const forwardedProto = request.headers.get('x-forwarded-proto');
    const publicHttp =
        request.nextUrl.protocol === 'http:' &&
        forwardedProto !== 'https' &&
        !host.startsWith('localhost') &&
        !host.startsWith('127.0.0.1') &&
        !host.startsWith('0.0.0.0');

    if (!publicHttp) {
        return null;
    }
    const url = request.nextUrl.clone();
    url.protocol = 'https:';
    url.host = host;

    return withSecurityHeaders(NextResponse.redirect(url, 308));
}

function rejectCrossSiteMutation(request: NextRequest) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        return null;
    }
    const origin = request.headers.get('origin');
    const fetchSite = request.headers.get('sec-fetch-site');

    if (fetchSite === 'cross-site') {
        return NextResponse.json(
            { ok: false, error: 'Cross-site request denied' },
            { status: 403 },
        );
    }

    if (!origin) {
        return null;
    }

    if (origin === request.nextUrl.origin) {
        return null;
    }

    if (origin === originFromEnv(process.env.NEXT_PUBLIC_APP_BASE_URL)) {
        return null;
    }

    if (isLocalDevOrigin(origin) && isLocalDevOrigin(request.nextUrl.origin)) {
        return null;
    }

    return NextResponse.json({ ok: false, error: 'Invalid request origin' }, { status: 403 });
}

function isAdminProtectedPath(pathname: string) {
    if (pathname === '/admin/login') {
        return false;
    }

    return pathname.startsWith('/admin') || pathname === '/live';
}

function withSecurityHeaders(response: NextResponse) {
    response.headers.set('Content-Security-Policy', contentSecurityPolicy());
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    return response;
}

function nextWithCsrfHeader(request: NextRequest) {
    const token = csrfTokenFor(request);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(INTERNAL_CSRF_HEADER, token);
    requestHeaders.set(
        'x-rtv-current-path',
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );

    return withCsrfCookie(
        request,
        NextResponse.next({
            request: { headers: requestHeaders },
        }),
        token,
    );
}

function withCsrfCookie(
    request: NextRequest,
    response: NextResponse,
    token = csrfTokenFor(request),
) {
    if (!request.cookies.get(CSRF_COOKIE)?.value) {
        response.cookies.set(CSRF_COOKIE, token, {
            httpOnly: false,
            sameSite: 'lax',
            secure: isSecureCookie(),
            path: '/',
            maxAge: 60 * 60 * 12,
        });
    }

    return response;
}

function csrfTokenFor(request: NextRequest) {
    const existing = request.cookies.get(CSRF_COOKIE)?.value;

    if (existing && existing.length >= 32 && existing.length <= 128) {
        return existing;
    }

    return `${crypto.randomUUID()}${crypto.randomUUID()}`;
}

function isSecureCookie() {
    return (
        process.env.NODE_ENV === 'production' &&
        Boolean(process.env.NEXT_PUBLIC_APP_BASE_URL?.startsWith('https://'))
    );
}

function contentSecurityPolicy() {
    const appOrigin = originFromEnv(process.env.NEXT_PUBLIC_APP_BASE_URL);
    const frameAncestors = ["'self'", appOrigin].filter(Boolean).join(' ');
    const production = process.env.NODE_ENV === 'production';
    const imgSrc = ["'self'", 'data:', 'blob:', 'https:'];
    const mediaSrc = ["'self'", 'blob:', 'https:'];
    const connectSrc = ["'self'", 'https:', 'wss:'];
    const frameSrc = ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com'];
    const scriptSrc = [
        "'self'",
        "'unsafe-inline'",
        'https://static.cloudflareinsights.com',
        'https://www.youtube.com',
    ];

    if (!production) {
        imgSrc.push('http:');
        mediaSrc.push('http:');
        connectSrc.push('http:', 'ws:');
        scriptSrc.push("'unsafe-eval'");
    }

    return [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self'",
        `frame-ancestors ${frameAncestors}`,
        `img-src ${imgSrc.join(' ')}`,
        `media-src ${mediaSrc.join(' ')}`,
        `connect-src ${connectSrc.join(' ')}`,
        `frame-src ${frameSrc.join(' ')}`,
        `script-src ${scriptSrc.join(' ')}`,
        "style-src 'self' 'unsafe-inline'",
        ...(production ? ['upgrade-insecure-requests'] : []),
    ].join('; ');
}

function originFromEnv(value: string | undefined) {
    if (!value) {
        return '';
    }

    try {
        return new URL(value).origin;
    } catch {
        return '';
    }
}

function shouldFailClosedForMissingAdminToken() {
    return (
        process.env.NODE_ENV === 'production' ||
        process.env.APP_BASE_URL?.startsWith('https://') ||
        process.env.NEXT_PUBLIC_APP_BASE_URL?.startsWith('https://')
    );
}

function isLocalDevOrigin(value: string) {
    if (process.env.NODE_ENV === 'production') {
        return false;
    }

    try {
        const host = new URL(value).hostname;

        return host === 'localhost' || host === '127.0.0.1' || host === '::1';
    } catch {
        return false;
    }
}
