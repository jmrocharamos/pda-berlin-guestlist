CREATE INDEX `idx_guests_normalized_name` ON `guests` (`normalized_name`);--> statement-breakpoint
CREATE INDEX `idx_guests_guest_type` ON `guests` (`guest_type`);--> statement-breakpoint
CREATE INDEX `idx_staff_sessions_expiry` ON `staff_sessions` (`expires_at`);