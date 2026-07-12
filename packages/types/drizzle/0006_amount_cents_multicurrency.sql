CREATE TABLE `fx_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`base_currency` text NOT NULL,
	`currency` text NOT NULL,
	`rate` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fx_rates_month_pair_unq` ON `fx_rates` (`month`,`base_currency`,`currency`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`base_currency` text DEFAULT 'MXN' NOT NULL
);
--> statement-breakpoint
INSERT INTO `settings` (`id`, `base_currency`) VALUES (1, 'MXN');--> statement-breakpoint
ALTER TABLE `accounts` ADD `currency` text DEFAULT 'MXN' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `amount_cents` integer NOT NULL DEFAULT 0;--> statement-breakpoint
UPDATE `transactions` SET `amount_cents` = CAST(ROUND(`amount` * 100) AS INTEGER);--> statement-breakpoint
ALTER TABLE `transactions` DROP COLUMN `amount`;
