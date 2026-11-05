CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`base_url` text,
	`api_key` text,
	`models` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
