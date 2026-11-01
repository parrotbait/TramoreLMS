DROP INDEX "alert_open_key";--> statement-breakpoint
ALTER TABLE "alert" ADD COLUMN "key" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_open_key" ON "alert" USING btree ("competition_id","key") WHERE "alert"."resolved_at" is null;