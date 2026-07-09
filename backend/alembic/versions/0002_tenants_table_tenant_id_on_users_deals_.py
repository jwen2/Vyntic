"""tenants table + tenant_id on users, deals, managers

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-08 10:04:31.600621

Option A tenancy (Plan 4, B1): tenants table, tenant_id FK on every
top-level entity. Existing rows are backfilled into the 'default' tenant:
the column is added with a server_default so populated tables pass NOT
NULL, then the default is dropped — going forward the application must
supply the tenant explicitly (ORM default until tenant-scoped auth, B3).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None

TENANT_TABLES = ('deals', 'managers', 'users')


def upgrade() -> None:
    op.create_table('tenants',
    sa.Column('tenant_id', sa.String(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('tenant_id')
    )
    # The default tenant must exist before any tenant_id FK references it.
    op.execute(
        "INSERT INTO tenants (tenant_id, name, created_at) "
        "VALUES ('default', 'Default Tenant', CURRENT_TIMESTAMP)"
    )

    for table in TENANT_TABLES:
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.add_column(
                sa.Column('tenant_id', sa.String(), nullable=False, server_default='default')
            )
            batch_op.create_index(batch_op.f(f'ix_{table}_tenant_id'), ['tenant_id'], unique=False)
            batch_op.create_foreign_key(
                f'fk_{table}_tenant_id', 'tenants', ['tenant_id'], ['tenant_id']
            )
        # Existing rows are filled; drop the schema default so new rows get
        # their tenant from the application, never silently from the DB.
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.alter_column(
                'tenant_id', server_default=None,
                existing_type=sa.String(), existing_nullable=False,
            )


def downgrade() -> None:
    for table in reversed(TENANT_TABLES):
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.drop_constraint(f'fk_{table}_tenant_id', type_='foreignkey')
            batch_op.drop_index(batch_op.f(f'ix_{table}_tenant_id'))
            batch_op.drop_column('tenant_id')

    op.drop_table('tenants')
