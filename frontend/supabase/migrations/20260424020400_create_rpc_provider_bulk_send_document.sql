-- =============================================================================
-- rpc_provider_bulk_send_document
-- =============================================================================
-- Purpose:
--   Atomic, server-side replacement for the browser-side for-loop that sends
--   a single document template to many providers at once. For each provider:
--
--     1. INSERT into provider_documents (status='sent', sent_at=now()).
--     2. INSERT into signature_requests (contract_id=template_id,
--        provider_id, requested_by=auth.uid(),
--        expires_at = now() + p_expires_days, provider_document_id).
--        NOTE: signature_requests has no provider_document_id column today,
--        so we instead back-link by updating provider_documents.signature_request_id.
--     3. UPDATE provider_documents SET signature_request_id = <new sig req>.
--     4. If provider.contact_email maps to a profile, INSERT a notification
--        ("Action Required: Sign <template_name>") linking to /sign/<sig_id>.
--     5. INSERT an activity (activity_type='status_change') on the provider.
--     6. Push a result row with status='sent'.
--
--   Per-provider failures are isolated: any exception in step 1-5 for a
--   single provider is caught, a result row is pushed with
--   status='error: <message>', and the loop continues to the next provider.
--
--   SECURITY INVOKER so RLS on provider_documents, signature_requests,
--   activities, and notifications is enforced against the calling user.
--   (Notifications has a permissive INSERT policy for authenticated users.)
--
--   IMPORTANT: the task spec wires signature_requests.contract_id to the
--   template_id. The existing contract_id FK requires a row in contracts,
--   which a document_templates row is NOT. Callers must therefore ensure
--   p_template_id also exists as a row in contracts, OR this function must
--   be migrated to target a different column once signature_requests is
--   updated to reference document_templates directly. We preserve the
--   requested semantics here per the task description.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.rpc_provider_bulk_send_document(uuid[], uuid, int);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_provider_bulk_send_document(
  p_provider_ids uuid[],
  p_template_id  uuid,
  p_expires_days int DEFAULT 14
)
RETURNS TABLE (
  provider_id          uuid,
  signature_request_id uuid,
  status               text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_provider_id      uuid;
  v_template_name    text;
  v_doc_id           uuid;
  v_sig_id           uuid;
  v_contact_email    text;
  v_profile_id       uuid;
  v_err              text;
BEGIN
  -- Load the template name once up front for the notification title.
  SELECT dt.name
    INTO v_template_name
  FROM public.document_templates dt
  WHERE dt.id = p_template_id;

  IF v_template_name IS NULL THEN
    RAISE EXCEPTION 'Template % not found', p_template_id USING ERRCODE = 'P0002';
  END IF;

  FOREACH v_provider_id IN ARRAY p_provider_ids LOOP
    -- Reset per-iteration locals so error rows don't carry stale ids.
    v_doc_id        := NULL;
    v_sig_id        := NULL;
    v_contact_email := NULL;
    v_profile_id    := NULL;

    BEGIN
      -- 1. provider_documents row
      INSERT INTO public.provider_documents (
        provider_id, template_id, status, sent_at
      ) VALUES (
        v_provider_id, p_template_id, 'sent', now()
      )
      RETURNING id INTO v_doc_id;

      -- 2. signature_requests row.
      --    contract_id is set to the template id per spec; callers must
      --    ensure that identifier is valid for the contracts FK.
      INSERT INTO public.signature_requests (
        contract_id, provider_id, requested_by, expires_at
      ) VALUES (
        p_template_id,
        v_provider_id,
        auth.uid(),
        now() + make_interval(days => p_expires_days)
      )
      RETURNING id INTO v_sig_id;

      -- 3. Back-link the document to its signature request.
      UPDATE public.provider_documents
         SET signature_request_id = v_sig_id
       WHERE id = v_doc_id;

      -- 4. Notify the provider if their contact_email matches a profile.
      SELECT pr.contact_email INTO v_contact_email
      FROM public.providers pr
      WHERE pr.id = v_provider_id;

      IF v_contact_email IS NOT NULL THEN
        SELECT pf.id INTO v_profile_id
        FROM public.profiles pf
        WHERE pf.email = v_contact_email
        LIMIT 1;

        IF v_profile_id IS NOT NULL THEN
          INSERT INTO public.notifications (
            user_id, title, message, type, link
          ) VALUES (
            v_profile_id,
            'Action Required: Sign "' || v_template_name || '"',
            'A new document is waiting for your signature.',
            'info',
            '/sign/' || v_sig_id::text
          );
        END IF;
      END IF;

      -- 5. Audit activity.
      INSERT INTO public.activities (
        provider_id, user_id, activity_type, description
      ) VALUES (
        v_provider_id,
        auth.uid(),
        'status_change',
        'Sent document "' || v_template_name || '" for signature'
      );

      -- 6. Successful row.
      provider_id          := v_provider_id;
      signature_request_id := v_sig_id;
      status               := 'sent';
      RETURN NEXT;

    EXCEPTION WHEN OTHERS THEN
      -- Isolate per-provider failures: emit an error row and continue.
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      provider_id          := v_provider_id;
      signature_request_id := NULL;
      status               := 'error: ' || v_err;
      RETURN NEXT;
    END;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.rpc_provider_bulk_send_document(uuid[], uuid, int) IS
  'Bulk-send a document template to many providers atomically per-provider. Returns one row per input provider with status=sent or status=error:<msg>.';
