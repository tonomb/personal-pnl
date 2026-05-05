CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`institution` text NOT NULL,
	`type` text NOT NULL,
	`last4` text,
	`color` text DEFAULT '#3b82f6' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `card_benefits` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`category_group` text NOT NULL,
	`reward_type` text NOT NULL,
	`reward_rate` real NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `account_id` text REFERENCES accounts(id);