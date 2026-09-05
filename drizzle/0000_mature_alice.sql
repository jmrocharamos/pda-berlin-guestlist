CREATE TABLE `activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`role_key` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`venue` text NOT NULL,
	`capacity` integer DEFAULT 550 NOT NULL,
	`inside` integer DEFAULT 0 NOT NULL,
	`out_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `guests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`guest_type` text NOT NULL,
	`host` text DEFAULT 'PDA' NOT NULL,
	`note` text,
	`allocation` integer DEFAULT 1 NOT NULL,
	`checked_in` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff_roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role_key` text NOT NULL,
	`display_name` text NOT NULL,
	`pin_salt` text NOT NULL,
	`pin_hash` text NOT NULL,
	`permissions` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_roles_role_key_unique` ON `staff_roles` (`role_key`);--> statement-breakpoint
CREATE TABLE `staff_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`role_key` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_by` text
);
