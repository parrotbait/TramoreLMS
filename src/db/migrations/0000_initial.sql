CREATE TYPE "public"."competition_status" AS ENUM('draft', 'open', 'running', 'finished');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('pending', 'active', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."fixture_state" AS ENUM('scheduled', 'finished', 'postponed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."link_purpose" AS ENUM('signin', 'admin');--> statement-breakpoint
CREATE TYPE "public"."override_kind" AS ENUM('result', 'void');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('entry', 'buyback');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('stripe', 'cash', 'revolut', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."pick_source" AS ENUM('player', 'auto', 'autoPass');--> statement-breakpoint
CREATE TYPE "public"."verdict" AS ENUM('through', 'out');--> statement-breakpoint
CREATE TABLE "alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"fixture_id" uuid,
	"message" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"season" integer NOT NULL,
	"start_matchday" integer NOT NULL,
	"final_matchday" integer DEFAULT 38 NOT NULL,
	"entry_fee_cents" integer DEFAULT 1000 NOT NULL,
	"buyback_fee_cents" integer DEFAULT 500 NOT NULL,
	"prize_cents" integer DEFAULT 30000 NOT NULL,
	"entries_open" boolean DEFAULT false NOT NULL,
	"show_raised" boolean DEFAULT false NOT NULL,
	"status" "competition_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_matchdays" CHECK ("competition"."start_matchday" between 1 and "competition"."final_matchday"),
	CONSTRAINT "competition_money" CHECK ("competition"."entry_fee_cents" >= 0 and "competition"."buyback_fee_cents" >= 0 and "competition"."prize_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "email_sent" (
	"entry_id" uuid NOT NULL,
	"week_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_sent_entry_id_week_id_kind_pk" PRIMARY KEY("entry_id","week_id","kind")
);
--> statement-breakpoint
CREATE TABLE "entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"display_name_key" text NOT NULL,
	"status" "entry_status" DEFAULT 'pending' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"bought_back" boolean DEFAULT false NOT NULL,
	"withdrawn_from_week" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_name_length" CHECK (char_length("entry"."display_name") between 1 and 20),
	CONSTRAINT "entry_pending_has_hold" CHECK (("entry"."status" = 'pending') = ("entry"."hold_expires_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "fixture" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"week_id" uuid NOT NULL,
	"home_team_id" uuid NOT NULL,
	"away_team_id" uuid NOT NULL,
	"kickoff_at" timestamp with time zone NOT NULL,
	"external_id" integer NOT NULL,
	"state" "fixture_state" DEFAULT 'scheduled' NOT NULL,
	"home_goals" integer,
	"away_goals" integer,
	"postponed_at" timestamp with time zone,
	"override_kind" "override_kind",
	"override_home_goals" integer,
	"override_away_goals" integer,
	"override_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fixture_teams_differ" CHECK ("fixture"."home_team_id" <> "fixture"."away_team_id"),
	CONSTRAINT "fixture_finished_has_score" CHECK (("fixture"."state" = 'finished') = ("fixture"."home_goals" is not null and "fixture"."away_goals" is not null)),
	CONSTRAINT "fixture_postponed_has_time" CHECK (("fixture"."state" = 'postponed') = ("fixture"."postponed_at" is not null)),
	CONSTRAINT "fixture_override_score" CHECK (("fixture"."override_kind" = 'result') = ("fixture"."override_home_goals" is not null and "fixture"."override_away_goals" is not null)),
	CONSTRAINT "fixture_override_reason" CHECK ("fixture"."override_kind" is null or "fixture"."override_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "magic_link" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"purpose" "link_purpose" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"amount_cents" integer NOT NULL,
	"fee_cents" integer DEFAULT 0 NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"note" text,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_stripe_has_session" CHECK ("payment"."method" <> 'stripe' or "payment"."stripe_session_id" is not null),
	CONSTRAINT "payment_amounts" CHECK ("payment"."amount_cents" >= 0 and "payment"."fee_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"future_comms_opt_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "person_email_lower" CHECK ("person"."email" = lower("person"."email"))
);
--> statement-breakpoint
CREATE TABLE "pick_override" (
	"entry_id" uuid NOT NULL,
	"week_id" uuid NOT NULL,
	"outcome" "verdict" NOT NULL,
	"reason" text NOT NULL,
	"actor_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pick_override_entry_id_week_id_pk" PRIMARY KEY("entry_id","week_id")
);
--> statement-breakpoint
CREATE TABLE "pick" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"week_id" uuid NOT NULL,
	"team_id" uuid,
	"source" "pick_source" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pick_pass_has_no_team" CHECK (("pick"."source" = 'autoPass') = ("pick"."team_id" is null))
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"slug" text NOT NULL,
	"football_data_id" integer
);
--> statement-breakpoint
CREATE TABLE "week" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"pl_matchday" integer NOT NULL,
	"cutoff_at" timestamp with time zone,
	"cutoff_overridden" boolean DEFAULT false NOT NULL,
	"opened_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	CONSTRAINT "week_number_positive" CHECK ("week"."number" >= 1)
);
--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_fixture_id_fixture_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sent" ADD CONSTRAINT "email_sent_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sent" ADD CONSTRAINT "email_sent_week_id_week_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."week"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture" ADD CONSTRAINT "fixture_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture" ADD CONSTRAINT "fixture_week_id_week_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."week"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture" ADD CONSTRAINT "fixture_home_team_id_team_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture" ADD CONSTRAINT "fixture_away_team_id_team_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_link" ADD CONSTRAINT "magic_link_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_override" ADD CONSTRAINT "pick_override_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_override" ADD CONSTRAINT "pick_override_week_id_week_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."week"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick" ADD CONSTRAINT "pick_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick" ADD CONSTRAINT "pick_week_id_week_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."week"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick" ADD CONSTRAINT "pick_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week" ADD CONSTRAINT "week_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_open_key" ON "alert" USING btree ("competition_id","kind","fixture_id") WHERE "alert"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entry_competition_name_key" ON "entry" USING btree ("competition_id","display_name_key") WHERE "entry"."status" <> 'withdrawn';--> statement-breakpoint
CREATE INDEX "entry_person_idx" ON "entry" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fixture_competition_external_key" ON "fixture" USING btree ("competition_id","external_id");--> statement-breakpoint
CREATE INDEX "fixture_week_idx" ON "fixture" USING btree ("week_id");--> statement-breakpoint
CREATE INDEX "magic_link_person_idx" ON "magic_link" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_stripe_session_key" ON "payment" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE INDEX "payment_entry_idx" ON "payment" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "person_email_key" ON "person" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "pick_entry_week_key" ON "pick" USING btree ("entry_id","week_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pick_entry_team_key" ON "pick" USING btree ("entry_id","team_id") WHERE "pick"."team_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "team_competition_slug_key" ON "team" USING btree ("competition_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "team_competition_name_key" ON "team" USING btree ("competition_id","full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "week_competition_number_key" ON "week" USING btree ("competition_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "week_competition_matchday_key" ON "week" USING btree ("competition_id","pl_matchday");