"""Team-lead role; control events may be automatic (no user)

Revision ID: b7c1e2d4f9a0
Revises: 75d3deba8c2a
Create Date: 2026-11-25
"""
import sqlalchemy as sa
from alembic import op

revision = "b7c1e2d4f9a0"
down_revision = "75d3deba8c2a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'lead'")
    op.alter_column("control_events", "user_id", existing_type=sa.UUID(), nullable=True)


def downgrade() -> None:
    op.execute("DELETE FROM control_events WHERE user_id IS NULL")
    op.alter_column("control_events", "user_id", existing_type=sa.UUID(), nullable=False)
    op.execute("UPDATE users SET role = 'admin' WHERE role = 'lead'")
    # PostgreSQL cannot drop a value from an enum type; 'lead' stays defined but unused.
