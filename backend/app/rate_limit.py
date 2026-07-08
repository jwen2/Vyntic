"""
Rate limiting (Plan 2, S6).

Single shared Limiter instance — its own module so route modules can import
it without going through app.main (which imports the route modules).

In-process storage: limits apply per replica. Good enough while the app runs
as one process; Plan 5 (horizontal scaling) moves the storage to Redis so
limits hold across replicas.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

LOGIN_LIMIT = "10/minute"
REGISTER_LIMIT = "5/minute"
