ALTER TABLE "competition" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "demo_now" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_demo_clock" CHECK ("competition"."is_demo" or "competition"."demo_now" is null);