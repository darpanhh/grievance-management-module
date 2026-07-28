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

        logger.info(
            'user=%(user)s role=%(role)s %(method)s %(path)s → %(status)d (%(duration).0fms) ip=%(ip)s',
            extra={
                'user': user.username if user else 'anonymous',
                'role': user.role if user else 'ANONYMOUS',
                'method': request.method,
                'path': request.path,
                'status': response.status_code,
                'duration': f'{duration_ms:.0f}',
                'ip': request.META.get('REMOTE_ADDR', ''),
            },
        )

        return response
