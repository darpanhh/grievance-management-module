from rest_framework.throttling import SimpleRateThrottle


class DailyGrievanceThrottle(SimpleRateThrottle):
    """
    Custom throttle that limits authenticated users to a configurable number
    of grievance submissions per calendar day (UTC).

    The limit is read from the SystemSettings singleton so Campus Admin can
    change it at runtime without touching code or restarting the server.

    The rate is reset at midnight UTC. Exceeding the limit returns a 429 response
    with a human-readable message.

    Note:
        This throttle only applies to POST (create) operations on the grievance
        endpoint — it is not used for read/list/detail requests.
    """

    scope = 'daily_grievance'

    def _get_limit(self):
        """Read the daily limit from SystemSettings (DB), fallback to 3."""
        try:
            from grievances.models import SystemSettings
            return SystemSettings.get().daily_grievance_limit
        except Exception:
            return 3

    @property
    def rate(self):
        return f'{self._get_limit()}/day'

    def get_cache_key(self, request, view):
        """
        Return a cache key scoped to the authenticated user ID.

        Unauthenticated requests are not throttled by this class (anonymous
        submissions require authentication; rate limiting is not applicable).
        """
        if not request.user.is_authenticated:
            return None  # Do not throttle unauthenticated requests
        return self.cache_format % {
            'scope': self.scope,
            'ident': request.user.pk,
        }

    def throttle_failure(self):
        """
        Return a 429 response with a clear, user-friendly message.

        Overrides the default message to inform the user when the limit resets.
        """
        from rest_framework.exceptions import Throttled
        limit = self._get_limit()
        detail = (
            f'You have reached the daily limit of {limit} grievance'
            f'{"s" if limit != 1 else ""}. '
            f'Please try again tomorrow.'
        )
        raise Throttled(detail=detail)
