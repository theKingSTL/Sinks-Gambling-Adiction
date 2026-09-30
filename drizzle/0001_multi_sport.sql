DROP INDEX `legs_open_idx`;--> statement-breakpoint
ALTER TABLE `bet_legs` ADD `sport` text DEFAULT 'nba' NOT NULL;--> statement-breakpoint
CREATE INDEX `legs_open_idx` ON `bet_legs` (`status`,`sport`,`game_id`);