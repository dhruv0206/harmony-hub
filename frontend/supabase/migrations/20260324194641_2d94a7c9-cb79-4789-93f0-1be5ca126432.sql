
DROP FUNCTION IF EXISTS public.get_total_mrr();

CREATE OR REPLACE FUNCTION public.get_total_mrr()
RETURNS TABLE(provider_mrr numeric, law_firm_mrr numeric, total_mrr numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT
    COALESCE((SELECT SUM(monthly_amount) FROM provider_subscriptions WHERE status = 'active'), 0)::numeric as provider_mrr,
    COALESCE((SELECT SUM(monthly_amount) FROM law_firm_subscriptions WHERE status = 'active'), 0)::numeric as law_firm_mrr,
    (COALESCE((SELECT SUM(monthly_amount) FROM provider_subscriptions WHERE status = 'active'), 0) +
     COALESCE((SELECT SUM(monthly_amount) FROM law_firm_subscriptions WHERE status = 'active'), 0))::numeric as total_mrr;
END;
$$;
