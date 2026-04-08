-- Idempotent seed: safe to re-run. Uses INSERT OR IGNORE so existing rows are untouched.

-- INCOME categories
INSERT OR IGNORE INTO categories (id, name, group_type, is_default, color, sort_order) VALUES
  (1,  'Salary',           'INCOME',   1, '#22c55e', 10),
  (2,  'Freelance',        'INCOME',   1, '#86efac', 20),
  (3,  'Investments',      'INCOME',   1, '#4ade80', 30),
  (4,  'Other Income',     'INCOME',   1, '#bbf7d0', 40);

-- FIXED expense categories
INSERT OR IGNORE INTO categories (id, name, group_type, is_default, color, sort_order) VALUES
  (10, 'Rent / Mortgage',  'FIXED',    1, '#3b82f6', 10),
  (11, 'Insurance',        'FIXED',    1, '#60a5fa', 20),
  (12, 'Subscriptions',    'FIXED',    1, '#93c5fd', 30),
  (13, 'Loan Payments',    'FIXED',    1, '#bfdbfe', 40),
  (14, 'Phone',            'FIXED',    1, '#dbeafe', 50),
  (15, 'Internet',         'FIXED',    1, '#eff6ff', 60);

-- VARIABLE expense categories
INSERT OR IGNORE INTO categories (id, name, group_type, is_default, color, sort_order) VALUES
  (20, 'Groceries',        'VARIABLE', 1, '#f97316', 10),
  (21, 'Dining Out',       'VARIABLE', 1, '#fb923c', 20),
  (22, 'Transport',        'VARIABLE', 1, '#fdba74', 30),
  (23, 'Health',           'VARIABLE', 1, '#fed7aa', 40),
  (24, 'Entertainment',    'VARIABLE', 1, '#ffedd5', 50),
  (25, 'Shopping',         'VARIABLE', 1, '#fff7ed', 60),
  (26, 'Travel',           'VARIABLE', 1, '#f59e0b', 70),
  (27, 'Personal Care',    'VARIABLE', 1, '#fbbf24', 80),
  (28, 'Education',        'VARIABLE', 1, '#fcd34d', 90),
  (29, 'Other Expense',    'VARIABLE', 1, '#fef3c7', 100);

-- IGNORED categories (transfers, refunds, etc.)
INSERT OR IGNORE INTO categories (id, name, group_type, is_default, color, sort_order) VALUES
  (30, 'Transfers',        'IGNORED',  1, '#9ca3af', 10),
  (31, 'Refunds',          'IGNORED',  1, '#d1d5db', 20),
  (32, 'Internal',         'IGNORED',  1, '#e5e7eb', 30);
