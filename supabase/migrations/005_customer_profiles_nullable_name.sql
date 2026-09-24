-- Allow name to be NULL so rows with only phone + user_id can be imported
ALTER TABLE customer_profiles ALTER COLUMN name DROP NOT NULL;
