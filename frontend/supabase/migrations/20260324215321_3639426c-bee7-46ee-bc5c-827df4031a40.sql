
-- Add renewal columns to contracts table
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS renewal_status text NOT NULL DEFAULT 'not_due',
  ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS renewal_notice_days integer NOT NULL DEFAULT 60;

-- Validation trigger for renewal_status
CREATE OR REPLACE FUNCTION public.validate_renewal_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.renewal_status NOT IN ('not_due', 'upcoming', 'in_renewal', 'renewed', 'expired', 'auto_renewed') THEN
    RAISE EXCEPTION 'Invalid renewal_status: %', NEW.renewal_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_renewal_status ON public.contracts;
CREATE TRIGGER check_renewal_status
  BEFORE INSERT OR UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_renewal_status();
