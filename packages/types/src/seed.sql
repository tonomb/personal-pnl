-- Idempotent: clears existing default categories and re-inserts the canonical set.
-- Transactions with old category_id references will have category_id = NULL (nullable FK).
DELETE FROM categories WHERE is_default = 1;

-- INCOME — green (#22c55e)
INSERT INTO categories (id, name, group_type, is_default, color, sort_order) VALUES
  (1, 'Salary & Wages',         'INCOME',   1, '#22c55e', 10),
  (2, 'Freelance & Consulting', 'INCOME',   1, '#22c55e', 20),
  (3, 'Investment Income',      'INCOME',   1, '#22c55e', 30),
  (4, 'Rental Income',          'INCOME',   1, '#22c55e', 40),
  (5, 'Business Income',        'INCOME',   1, '#22c55e', 50),
  (6, 'Other Income',           'INCOME',   1, '#22c55e', 60);

-- FIXED — red (#ef4444)
INSERT INTO categories (id, name, group_type, is_default, color, sort_order) VALUES
  (10, 'Rent & Mortgage',       'FIXED',    1, '#ef4444', 10),
  (11, 'Loan Repayments',       'FIXED',    1, '#ef4444', 20),
  (12, 'Insurance Premiums',    'FIXED',    1, '#ef4444', 30),
  (13, 'Subscriptions',         'FIXED',    1, '#ef4444', 40),
  (14, 'Childcare & Education', 'FIXED',    1, '#ef4444', 50);

-- VARIABLE — amber (#f59e0b)
INSERT INTO categories (id, name, group_type, is_default, color, sort_order) VALUES
  (20, 'Groceries & Household',   'VARIABLE', 1, '#f59e0b', 10),
  (21, 'Dining & Restaurants',    'VARIABLE', 1, '#f59e0b', 20),
  (22, 'Transportation',          'VARIABLE', 1, '#f59e0b', 30),
  (23, 'Shopping & Clothing',     'VARIABLE', 1, '#f59e0b', 40),
  (24, 'Health & Wellness',       'VARIABLE', 1, '#f59e0b', 50),
  (25, 'Entertainment & Leisure', 'VARIABLE', 1, '#f59e0b', 60),
  (26, 'Travel & Accommodation',  'VARIABLE', 1, '#f59e0b', 70),
  (27, 'Personal Care',           'VARIABLE', 1, '#f59e0b', 80),
  (28, 'Gifts & Donations',       'VARIABLE', 1, '#f59e0b', 90),
  (29, 'Miscellaneous',           'VARIABLE', 1, '#f59e0b', 100);

-- IGNORED — grey (#9ca3af)
INSERT INTO categories (id, name, group_type, is_default, color, sort_order) VALUES
  (30, 'Internal Transfers',   'IGNORED',  1, '#9ca3af', 10),
  (31, 'Credit Card Payments', 'IGNORED',  1, '#9ca3af', 20),
  (32, 'Savings Deposits',     'IGNORED',  1, '#9ca3af', 30);
