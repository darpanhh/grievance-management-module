from rest_framework.throttling import SimpleRateThrottle


class DailyGrievanceThrottle(SimpleRateThrottle):
    """
    Custom throttle that limits authenticated users to 3 grievance submissions
    per calendar day (UTC).

    The rate is reset at midnight UTC. Exceeding the limit returns a 429 response
    with a human-readable message.

    Note:
        This throttle only applies to POST (create) operations on the grievance
        endpoint — it is not used for read/list/detail requests.
    """

    scope = 'daily_grievance'
    rate = '3/day'

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
        wait = self.wait()
        detail = (
            f'You have reached the maximum limit of grievances per day. '
            f'Please try again after midnight.'
        )
        raise Throttled(detail=detail)
