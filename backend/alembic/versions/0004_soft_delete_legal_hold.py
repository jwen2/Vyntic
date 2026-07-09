"""soft delete + legal hold on deals; soft delete on documents

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-08 12:10:00.000000

C1 (S8): deletes stop hard-removing rows. deleted_at marks soft deletion;
deals.legal_hold blocks both deletion and the retention purge. legal_hold
gets a temporary server_default so existing rows satisfy NOT NULL, then
the default is dropped (the application always writes the flag).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('deals', schema=None) as batch_op:
        batch_op.add_column(sa.Column('deleted_at', sa.DateTime(), nullable=True))
        batch_op.add_column(
            sa.Column('legal_hold', sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch_op.create_index(batch_op.f('ix_deals_deleted_at'), ['deleted_at'], unique=False)
    with op.batch_alter_table('deals', schema=None) as batch_op:
        batch_op.alter_column(
            'legal_hold', server_default=None,
            existing_type=sa.Boolean(), existing_nullable=False,
        )

    with op.batch_alter_table('documents', schema=None) as batch_op:
        batch_op.add_column(sa.Column('deleted_at', sa.DateTime(), nullable=True))
        batch_op.create_index(batch_op.f('ix_documents_deleted_at'), ['deleted_at'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('documents', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_documents_deleted_at'))
        batch_op.drop_column('deleted_at')

    with op.batch_alter_table('deals', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_deals_deleted_at'))
        batch_op.drop_column('legal_hold')
        batch_op.drop_column('deleted_at')
