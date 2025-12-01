-- Participants Table
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_type VARCHAR(10) NOT NULL CHECK (user_type IN ('customer', 'admin')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_participants_conversation ON participants(conversation_id);
CREATE INDEX idx_participants_user ON participants(user_id, user_type);