ALTER TYPE "public"."entry_status" ADD VALUE 'expired';--> statement-breakpoint
DROP INDEX "entry_competition_name_key";--> statement-breakpoint
CREATE UNIQUE INDEX "entry_competition_name_key" ON "entry" USING btree ("competition_id","display_name_key") WHERE "entry"."status" in ('pending', 'active');