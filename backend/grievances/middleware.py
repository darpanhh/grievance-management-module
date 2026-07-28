"""
Middleware to log every API request with structured context.

Captures: user, role, method, path, status code, IP, duration.
Helps answer "Who did what, when, and what was the result?"
"""

from __future__ import annotations

import logging
import time

logger = logging.getLogger('gms.request')


class RequestLogMiddleware:
    """Log every request/response with user, role, URL, status, and timing."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.time()
        response = self.get_response(request)
        duration_ms = (time.time() - start) * 1000

        user = request.user if hasattr(request, 'user') and request.user.is_authenticated else None
        uid = str(user.id) if user else 'anonymous'
        role = user.role if user else 'ANONYMOUS'
        ip = request.META.get('REMOTE_ADDR', '')

        logger.info(
            f'user={uid} role={role} {request.method} {request.path}'
            f' => {response.status_code} ({duration_ms:.0f}ms) ip={ip}',
        )

        return response
