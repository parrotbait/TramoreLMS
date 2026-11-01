-- Created by Claude driven by Eddie Long on 2026-11-01.
--
-- Only paid entries can pick. The app checks this too. These triggers make
-- the database refuse it even if a bug in the app tried.

-- 1. A pick needs an active (paid, not withdrawn) entry.
CREATE OR REPLACE FUNCTION lms_pick_requires_active_entry() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "entry" WHERE "id" = NEW."entry_id" AND "status" = 'active'
    ) THEN
        RAISE EXCEPTION 'Entry % is not active, so it cannot pick', NEW."entry_id"
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE TRIGGER "pick_requires_active_entry"
    BEFORE INSERT OR UPDATE ON "pick"
    FOR EACH ROW EXECUTE FUNCTION lms_pick_requires_active_entry();
--> statement-breakpoint

-- 2. An active entry needs a paid entry payment. Checked at commit, because
--    the payment row can only be written after the entry exists.
CREATE OR REPLACE FUNCTION lms_check_entry_paid(target_entry_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM "entry" WHERE "id" = target_entry_id AND "status" = 'active')
        AND NOT EXISTS (
            SELECT 1 FROM "payment"
            WHERE "payment"."entry_id" = target_entry_id
              AND "kind" = 'entry'
              AND "status" = 'paid'
        )
    THEN
        RAISE EXCEPTION 'Entry % is active but has no paid entry payment', target_entry_id
            USING ERRCODE = 'check_violation';
    END IF;
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION lms_active_entry_requires_payment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM lms_check_entry_paid(NEW."id");
    RETURN NULL;
END
$$;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER "active_entry_requires_payment"
    AFTER INSERT OR UPDATE OF "status" ON "entry"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION lms_active_entry_requires_payment();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION lms_payment_change_keeps_entry_paid() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM lms_check_entry_paid(OLD."entry_id");
    RETURN NULL;
END
$$;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER "payment_change_keeps_entry_paid"
    AFTER UPDATE OR DELETE ON "payment"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION lms_payment_change_keeps_entry_paid();
