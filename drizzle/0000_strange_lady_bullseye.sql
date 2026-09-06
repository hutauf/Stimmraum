CREATE TABLE `records` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`payload` text NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE TABLE `transcripts` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`text` text NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
