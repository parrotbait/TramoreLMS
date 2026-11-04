ALTER TABLE "alert" ADD COLUMN "emailed_at" timestamp with time zone;--> statement-breakpoint
-- Alerts raised before this migration are on the Alerts page already. Don't email a backlog.
UPDATE "alert" SET "emailed_at" = "created_at";
