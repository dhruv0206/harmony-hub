
-- Add participant_type to document_templates
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS participant_type text NOT NULL DEFAULT 'provider';

-- Add participant_type to service_packages
ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS participant_type text NOT NULL DEFAULT 'provider';

-- Insert law firm document templates
INSERT INTO document_templates (name, short_code, document_type, participant_type, is_active, display_order, version)
VALUES
  ('Law Firm Participation Agreement', 'LF_PARTICIPATION', 'agreement', 'law_firm', true, 100, 1),
  ('Platform Access and Data Agreement', 'LF_DATA', 'agreement', 'law_firm', true, 101, 1),
  ('Settlement Disbursement Acknowledgment Template', 'LF_DISBURSEMENT', 'agreement', 'law_firm', true, 102, 1),
  ('Law Firm BAA', 'LF_BAA', 'baa', 'law_firm', true, 103, 1),
  ('Multi-State Addendum — Law Firm', 'LF_MULTI_STATE', 'addendum', 'law_firm', true, 104, 1);

-- Insert law firm service packages
INSERT INTO service_packages (name, short_code, description, participant_type, is_active, display_order)
VALUES
  ('Standard Law Firm', 'LF_STANDARD', 'Standard document package for law firms', 'law_firm', true, 100),
  ('Full Law Firm', 'LF_FULL', 'Full document package for law firms including disbursement', 'law_firm', true, 101);

-- Insert package_documents for LF_STANDARD
INSERT INTO package_documents (package_id, template_id, signing_order, is_required, condition_description)
SELECT sp.id, dt.id, 1, true, null
FROM service_packages sp, document_templates dt
WHERE sp.short_code = 'LF_STANDARD' AND dt.short_code = 'LF_PARTICIPATION';

INSERT INTO package_documents (package_id, template_id, signing_order, is_required, condition_description)
SELECT sp.id, dt.id, 2, true, null
FROM service_packages sp, document_templates dt
WHERE sp.short_code = 'LF_STANDARD' AND dt.short_code = 'LF_BAA';

INSERT INTO package_documents (package_id, template_id, signing_order, is_required, condition_description)
SELECT sp.id, dt.id, 3, true, null
FROM service_packages sp, document_templates dt
WHERE sp.short_code = 'LF_STANDARD' AND dt.short_code = 'LF_DATA';

INSERT INTO package_documents (package_id, template_id, signing_order, is_required, condition_description)
SELECT sp.id, dt.id, 4, false, 'Only if firm practices in multiple states'
FROM service_packages sp, document_templates dt
WHERE sp.short_code = 'LF_STANDARD' AND dt.short_code = 'LF_MULTI_STATE';

-- Insert package_documents for LF_FULL
INSERT INTO package_documents (package_id, template_id, signing_order, is_required, condition_description)
SELECT sp.id, dt.id, 1, true, null
FROM service_packages sp, document_templates dt
WHERE sp.short_code = 'LF_FULL' AND dt.short_code = 'LF_PARTICIPATION';

INSERT INTO package_documents (package_id, template_id, signing_order, is_required, condition_description)
SELECT sp.id, dt.id, 2, true, null
FROM service_packages sp, document_templates dt
WHERE sp.short_code = 'LF_FULL' AND dt.short_code = 'LF_BAA';

INSERT INTO package_documents (package_id, template_id, signing_order, is_required, condition_description)
SELECT sp.id, dt.id, 3, true, null
FROM service_packages sp, document_templates dt
WHERE sp.short_code = 'LF_FULL' AND dt.short_code = 'LF_DATA';

INSERT INTO package_documents (package_id, template_id, signing_order, is_required, condition_description)
SELECT sp.id, dt.id, 4, true, null
FROM service_packages sp, document_templates dt
WHERE sp.short_code = 'LF_FULL' AND dt.short_code = 'LF_DISBURSEMENT';

INSERT INTO package_documents (package_id, template_id, signing_order, is_required, condition_description)
SELECT sp.id, dt.id, 5, false, 'Only if firm practices in multiple states'
FROM service_packages sp, document_templates dt
WHERE sp.short_code = 'LF_FULL' AND dt.short_code = 'LF_MULTI_STATE';
