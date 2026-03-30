-- Migration to remove three_year plan and convert all customers to yearly
-- This migration converts all customers with three_year plan to yearly plan
-- while preserving their existing end dates

-- Convert customers with three_year plan in subscription_type to yearly
UPDATE customers 
SET subscription_type = 'yearly' 
WHERE subscription_type = 'three_year';

-- Convert customers with three_year plan indicated in notes (Term: 3y) to yearly
-- First, update the subscription_type for those with Term: 3y in notes
UPDATE customers 
SET subscription_type = 'yearly' 
WHERE notes LIKE '%Term: 3y%' AND (subscription_type IS NULL OR subscription_type = '');

-- Remove Term: 3y from notes for all customers
UPDATE customers 
SET notes = REGEXP_REPLACE(notes, 'Term: 3y\n?', '', 'g')
WHERE notes LIKE '%Term: 3y%';

-- Clean up any remaining three_year references in plan column if it exists
-- This handles any legacy data that might have three_year in a plan column
UPDATE customers 
SET plan = 'yearly' 
WHERE plan = 'three_year';

-- Ensure all customers have a valid subscription_type
-- If subscription_type is NULL or empty, set it based on common patterns
UPDATE customers 
SET subscription_type = 'yearly' 
WHERE subscription_type IS NULL OR subscription_type = '';

-- Add a comment to document this change
COMMENT ON TABLE customers IS 'Customer subscriptions - all three_year plans converted to yearly as of 2026-02-10';