ALTER TABLE `posts` ADD `scheduleCronTaskUid` varchar(65);
-->statement-breakpoint
CREATE INDEX `posts_schedule_uid_idx` ON `posts` (`scheduleCronTaskUid`);
