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
	CONSTRAINT "providers_models_json" CHECK("providers"."models" is null or json_valid("providers"."models"))
);
