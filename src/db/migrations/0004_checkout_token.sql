ALTER TABLE "payment" ADD COLUMN "checkout_token_hash" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "checkout_token_used_at" timestamp with time zone;