"""conversations table

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-08 13:20:00.000000

C3: conversation history moves from process memory to a deal-scoped table
(durable across restarts, safe under multiple workers). Nothing to
backfill — the in-memory history was lost on every restart anyway.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('conversations',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('deal_id', sa.String(), nullable=False),
    sa.Column('question', sa.Text(), nullable=False),
    sa.Column('answer', sa.Text(), nullable=True),
    sa.Column('citations_json', sa.Text(), nullable=True),
    sa.Column('workstream', sa.String(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['deal_id'], ['deals.deal_id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('conversations', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_conversations_deal_id'), ['deal_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_conversations_workstream'), ['workstream'], unique=False)
        batch_op.create_index(batch_op.f('ix_conversations_created_at'), ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_table('conversations')
