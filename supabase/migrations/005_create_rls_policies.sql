-- Grant access to anon role for customer interactions
GRANT SELECT ON conversations TO anon;
GRANT INSERT ON conversations TO anon;
GRANT SELECT, INSERT ON messages TO anon;
GRANT SELECT, INSERT ON participants TO anon;

-- Grant full access to authenticated role for admin operations
GRANT ALL PRIVILEGES ON conversations TO authenticated;
GRANT ALL PRIVILEGES ON messages TO authenticated;
GRANT ALL PRIVILEGES ON participants TO authenticated;
GRANT ALL PRIVILEGES ON attachments TO authenticated;

-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

-- Create policies for customers (anon role)
CREATE POLICY "Customers can view their own conversations" ON conversations
  FOR SELECT TO anon USING (
    customer_ip = inet_client_addr() OR 
    EXISTS (
      SELECT 1 FROM participants 
      WHERE conversation_id = conversations.id 
      AND user_type = 'customer'
    )
  );

CREATE POLICY "Customers can insert messages" ON messages
  FOR INSERT TO anon WITH CHECK (
    sender_type = 'customer' AND
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE id = messages.conversation_id
      AND status = 'active'
    )
  );

-- Create policies for admins (authenticated role)
CREATE POLICY "Admins can view all conversations" ON conversations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage all messages" ON messages
  FOR ALL TO authenticated USING (true);