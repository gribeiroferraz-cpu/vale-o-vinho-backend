CREATE TABLE `recipeWines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipeId` int NOT NULL,
	`wineId` int NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recipeWines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`ingredients` json NOT NULL,
	`steps` json NOT NULL,
	`prepTime` int NOT NULL,
	`cookTime` int NOT NULL,
	`difficulty` enum('facil','medio','dificil') NOT NULL DEFAULT 'medio',
	`servings` int NOT NULL DEFAULT 4,
	`category` varchar(100) NOT NULL,
	`mainIngredient` varchar(100) NOT NULL,
	`imageUrl` text,
	`tips` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `recipes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `wines` ADD `occasions` json;