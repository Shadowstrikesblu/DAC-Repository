"""Add AIAnalysis table for AI error analysis

Revision ID: 001_add_ai_analyses
Revises: 
Create Date: 2026-06-12 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001_add_ai_analyses'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create ai_analyses table
    op.create_table(
        'ai_analyses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('execution_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('raw_error', sa.Text(), nullable=False),
        sa.Column('error_type', sa.String(), nullable=False),
        sa.Column('analysis', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('user_feedback', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['execution_id'], ['executions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes for performance
    op.create_index('idx_ai_analyses_execution', 'ai_analyses', ['execution_id'])
    op.create_index('idx_ai_analyses_user', 'ai_analyses', ['user_id'])
    op.create_index('idx_ai_analyses_created', 'ai_analyses', ['created_at'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('idx_ai_analyses_created', table_name='ai_analyses')
    op.drop_index('idx_ai_analyses_user', table_name='ai_analyses')
    op.drop_index('idx_ai_analyses_execution', table_name='ai_analyses')
    
    # Drop table
    op.drop_table('ai_analyses')
