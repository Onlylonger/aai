CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`base_url` text,
	`api_key` text,
	`models` text,
	`default_model` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "providers_models_json" CHECK("providers"."models" is null or (json_valid("providers"."models") and json_type("providers"."models") = 'array'))
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`last_mode` text DEFAULT 'chat' NOT NULL,
	`last_model_provider_id` text,
	`last_model_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `conversations_updated_at_idx` ON `conversations` (`updated_at`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`seq` integer NOT NULL,
	`role` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`reasoning` text,
	`status` text NOT NULL,
	`mode` text DEFAULT 'chat' NOT NULL,
	`error` text,
	`model_provider_id` text,
	`model_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_conversation_seq_idx` ON `messages` (`conversation_id`,`seq`);