
-- Insert a demo law firm for the law_firm demo user
INSERT INTO public.law_firms (id, firm_name, contact_name, contact_email, contact_phone, city, state, status, firm_size, practice_areas, states_licensed)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Smith & Associates PI Law',
  'John Smith',
  'lawfirm@demo.com',
  '(555) 999-0101',
  'Atlanta',
  'GA',
  'active',
  'Small 2-5',
  ARRAY['Personal Injury', 'Auto Accident', 'Medical Malpractice'],
  ARRAY['GA', 'FL', 'SC']
)
ON CONFLICT (id) DO NOTHING;
