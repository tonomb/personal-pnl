CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`group_type` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`color` text,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `column_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_fingerprint` text NOT NULL,
	`date_col` text NOT NULL,
	`description_col` text NOT NULL,
	`amount_col` text,
	`debit_col` text,
	`credit_col` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `column_mappings_file_fingerprint_unique` ON `column_mappings` (`file_fingerprint`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`type` text NOT NULL,
	`category_id` integer,
	`source_file` text,
	`raw_row` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
