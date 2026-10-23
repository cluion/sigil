<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Content-Security-Policy', implode('; ', [
            "default-src 'self'", "base-uri 'none'", "object-src 'none'",
            "script-src 'self'", "style-src 'self' 'unsafe-inline'",
            "img-src 'self' https:", "connect-src 'self'", "frame-src 'self'",
            "frame-ancestors 'self'", "form-action 'self'",
            "require-trusted-types-for 'script'",
            'trusted-types sigil#template sigil#sanitized',
        ]));
        if (! $request->is('sigil/media/*')) {
            $response->headers->set('Cache-Control', 'private, no-store');
        }

        return $response;
    }
}
