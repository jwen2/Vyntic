"""
Vyntic — FastAPI Application
AI-powered asset analysis for PE deal comparison.
"""
import logging

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.auth import get_current_user
from app.config import settings
from app.rate_limit import limiter

from app.api.routes_deals import router as deals_router, view_router as deals_view_router
from app.api.routes_managers import router as managers_router
from app.api.routes_monitoring import router as monitoring_router, portfolio_router
from app.api.routes_ingest import router as ingest_router
from app.api.routes_query import router as query_router
from app.api.routes_matrix import router as matrix_router
from app.api.routes_metrics import router as metrics_router
from app.api.routes_stream import router as stream_router
from app.api.routes_doc_matrix import router as doc_matrix_router
from app.api.routes_audit import router as audit_router
from app.api.routes_auth import router as auth_router
from app.api.routes_conversation import router as conversation_router
from app.api.routes_workflows import router as workflows_router
from app.api.routes_workflow_runs import (
    router as workflow_runs_router,
    stream_router as runs_stream_router,
)

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Vyntic",
    description="AI-powered asset analysis for PE deal comparison",
    version="0.1.0",
    redirect_slashes=False,
)

# Rate limiting (S6): limiter state + 429 handler. Limits are declared on
# the endpoints themselves (see routes_auth).
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in settings.cors_origins.split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Default-deny (S1-cross): every router is mounted behind get_current_user so
# a newly added handler is authenticated even if its author forgets the
# dependency. Handlers still declare their own Depends for the user object and
# finer-grained checks (require_admin / require_deal_access); FastAPI's
# dependency cache means auth resolves once per request.
#
# Opt-outs, each enforced by tests/test_default_deny.py:
#   - auth_router: login/register are public by design; its other routes carry
#     explicit per-route auth.
#   - deals_view_router / runs_stream_router: iframe + EventSource clients
#     cannot send headers, so these authenticate per-route via
#     get_current_user_or_query_token.
AUTHENTICATED = [Depends(get_current_user)]

app.include_router(auth_router)
app.include_router(audit_router, dependencies=AUTHENTICATED)
app.include_router(deals_router, dependencies=AUTHENTICATED)
app.include_router(deals_view_router)
app.include_router(managers_router, dependencies=AUTHENTICATED)
app.include_router(monitoring_router, dependencies=AUTHENTICATED)
app.include_router(portfolio_router, dependencies=AUTHENTICATED)
app.include_router(ingest_router, dependencies=AUTHENTICATED)
app.include_router(query_router, dependencies=AUTHENTICATED)
app.include_router(matrix_router, dependencies=AUTHENTICATED)
app.include_router(metrics_router, dependencies=AUTHENTICATED)
app.include_router(stream_router, dependencies=AUTHENTICATED)
app.include_router(doc_matrix_router, dependencies=AUTHENTICATED)
app.include_router(conversation_router, dependencies=AUTHENTICATED)
app.include_router(workflows_router, dependencies=AUTHENTICATED)
app.include_router(workflow_runs_router, dependencies=AUTHENTICATED)
app.include_router(runs_stream_router)


@app.on_event("startup")
async def startup():
    # Refuse to boot with shipped default secrets unless dev opts in.
    from app.config import assert_secure_secrets, settings as app_settings
    assert_secure_secrets(app_settings)

    # Initialize database tables
    from app.database import init_db
    init_db()

    # Mark runs stranded by the previous process as errored — executor tasks
    # are in-process and do not survive restarts.
    from app.services.workflow_run_store import reconcile_interrupted_runs
    reconciled = reconcile_interrupted_runs()
    if reconciled:
        logger.info(f"Reconciled {reconciled} run(s) interrupted by restart")

    # Same for ingest jobs: in-flight parsing/embedding dies with the process.
    # Queued jobs with saved files survive and are picked up by the pool below.
    from app.services.ingest_store import reconcile_interrupted_ingests
    stranded_ingests = reconcile_interrupted_ingests()
    if stranded_ingests:
        logger.info(f"Reconciled {stranded_ingests} ingest job(s) interrupted by restart")

    # Bounded ingest worker pool (claims queued ingest jobs from the DB).
    from app.services import ingest_worker
    ingest_worker.ensure_started()

    # Create default admin user if it doesn't exist
    from app.config import settings
    from app.auth import get_user_by_email, create_user, grant_deal_access
    admin = get_user_by_email(settings.default_admin_email)
    if not admin:
        admin = create_user(
            email=settings.default_admin_email,
            password=settings.default_admin_password,
            full_name="Admin",
            is_admin=True,
        )
        logger.info(f"Created default admin user: {settings.default_admin_email}")

    # Seed sample data (skips deals that already exist in DB). Local Docker dev
    # can disable this to avoid blocking startup on document ingestion.
    if settings.seed_sample_data:
        from app.seed import seed_sample_data
        await seed_sample_data(admin_user_id=admin.id)
    else:
        logger.info("Sample data seeding disabled via SEED_SAMPLE_DATA=false")

    # Seed built-in workflow templates (idempotent)
    from app.services.workflow_seed import seed_builtin_workflows
    seed_builtin_workflows()


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "vyntic"}
