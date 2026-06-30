CREATE TABLE `activity_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int,
	`kind` varchar(64) NOT NULL,
	`message` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(512) NOT NULL,
	`theme` text,
	`mode` enum('manual','aprovar','auto') NOT NULL DEFAULT 'aprovar',
	`status` enum('Pendente','Postado','Aguardando Aprovação','Erro: Imagem Ausente','Fluxo Parado') NOT NULL DEFAULT 'Pendente',
	`scheduledAt` bigint,
	`mediaType` enum('image','reel') NOT NULL DEFAULT 'image',
	`captionManual` text,
	`captionAi` text,
	`captionApproved` boolean NOT NULL DEFAULT false,
	`imageStorageKey` varchar(512),
	`imageUrl` varchar(1024),
	`instagramId` varchar(128),
	`permalink` varchar(512),
	`driveFileId` varchar(256),
	`approvalToken` varchar(64),
	`approvalEmailSentAt` bigint,
	`lastMissingAlertAt` bigint,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(128) NOT NULL,
	`settingValue` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `settings_settingKey_unique` UNIQUE(`settingKey`)
);
