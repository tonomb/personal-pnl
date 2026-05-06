PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`type` text NOT NULL,
	`category_id` integer,
	`account_id` text NOT NULL,
	`source_file` text,
	`raw_row` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "date", "description", "amount", "type", "category_id", "account_id", "source_file", "raw_row", "created_at") SELECT "id", "date", "description", "amount", "type", "category_id", "account_id", "source_file", "raw_row", "created_at" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `card_benefits` ADD `notes` text;--> statement-breakpoint
CREATE UNIQUE INDEX `card_benefits_account_category_unq` ON `card_benefits` (`account_id`,`category_group`);