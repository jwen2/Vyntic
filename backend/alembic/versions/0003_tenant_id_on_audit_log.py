"""tenant_id on audit_log

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-08 11:05:00.000000

Audit reads must be tenant-scoped (B4): the row carries the acting user's
tenant, denormalized at write time like user_email so rows survive user
and tenant deletion. Pre-tenancy rows all belong to the default tenant —
backfill them so the pilot's history stays visible to its admins.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('audit_log', schema=None) as batch_op:
        batch_op.add_column(sa.Column('tenant_id', sa.String(), nullable=True))
        batch_op.create_index(batch_op.f('ix_audit_log_tenant_id'), ['tenant_id'], unique=False)
    op.execute("UPDATE audit_log SET tenant_id = 'default' WHERE tenant_id IS NULL")


def downgrade() -> None:
    with op.batch_alter_table('audit_log', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_audit_log_tenant_id'))
        batch_op.drop_column('tenant_id')
