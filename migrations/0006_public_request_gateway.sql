BEGIN;

-- Direct application access stays tenant-scoped. The SECURITY DEFINER gateway needs
-- to resolve a token before the organization context is known, so only this table
-- stops forcing RLS for its owner. Ordinary roles still remain under its RLS policy.
ALTER TABLE request_public_links NO FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public_request_link_read(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l request_public_links%ROWTYPE;
  payload jsonb;
BEGIN
  SELECT * INTO l
  FROM request_public_links
  WHERE token_hash=p_token_hash
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at>now())
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  PERFORM set_config('app.organization_id',l.organization_id::text,true);
  PERFORM set_config('app.user_id','',true);

  IF l.mode='complete' AND l.request_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'mode',l.mode,
      'requestId',r.id,
      'request',jsonb_build_object(
        'title',r.title,
        'contactName',r.contact_name,
        'contactPosition',r.contact_position,
        'contactPhone',r.contact_phone,
        'contactEmail',r.contact_email,
        'siteName',r.site_name,
        'location',r.location_text,
        'city',r.city,
        'transportAccess',r.transport_access,
        'nearestTransport',r.nearest_transport,
        'logisticsComment',r.logistics_comment,
        'startDate',r.expected_start_date,
        'durationText',r.duration_text,
        'projectIndefinite',r.project_indefinite,
        'schedule',r.schedule_json,
        'provision',r.provision_json,
        'commercialLimits',r.commercial_limits_json,
        'staffingRequirements',r.staffing_requirements_json,
        'roles',COALESCE((SELECT jsonb_agg(jsonb_build_object('specialtyId',rr.specialty_id,'name',s.name,'count',rr.count_required,'qualification',rr.qualification,'experience',rr.experience_text,'salaryTarget',rr.salary_target,'salaryUnit',rr.salary_unit,'scheduleType',rr.schedule_type,'startsAt',rr.starts_at,'endsAt',rr.ends_at,'presenceHours',rr.presence_hours,'paidHours',rr.paid_hours,'lunchMinutes',rr.lunch_minutes,'lunchPaid',rr.lunch_paid,'nightHours',rr.night_hours,'overtimeRule',rr.overtime_rule,'requirements',rr.requirements_json) ORDER BY rr.created_at) FROM request_roles rr JOIN specialties s ON s.id=rr.specialty_id WHERE rr.request_id=r.id),'[]'::jsonb)
      ),
      'specialties',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) ORDER BY s.name),'[]'::jsonb) FROM specialties s WHERE s.organization_id=l.organization_id AND s.active=true)
    ) INTO payload
    FROM requests r WHERE r.id=l.request_id;
  ELSE
    SELECT jsonb_build_object(
      'mode',l.mode,
      'requestId',NULL,
      'request',NULL,
      'specialties',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) ORDER BY s.name),'[]'::jsonb) FROM specialties s WHERE s.organization_id=l.organization_id AND s.active=true)
    ) INTO payload;
  END IF;
  RETURN payload;
END $$;

CREATE OR REPLACE FUNCTION public_request_link_submit(p_token_hash text,p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l request_public_links%ROWTYPE;
  rid uuid;
  role_item jsonb;
  can_replace_roles boolean;
BEGIN
  SELECT * INTO l FROM request_public_links
  WHERE token_hash=p_token_hash AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_PUBLIC_LINK'; END IF;

  PERFORM set_config('app.organization_id',l.organization_id::text,true);
  PERFORM set_config('app.user_id','',true);

  IF l.mode='create' AND l.request_id IS NULL THEN
    INSERT INTO requests(
      organization_id,title,status,stage,outcome,location_text,expected_start_date,duration_text,project_indefinite,schedule_json,
      owner_user_id,created_by_user_id,assigned_team_id,source_kind,contact_name,contact_position,contact_phone,contact_email,
      site_name,city,transport_access,nearest_transport,logistics_comment,staffing_requirements_json,provision_json,commercial_limits_json
    ) VALUES (
      l.organization_id,COALESCE(NULLIF(trim(p_payload->>'title'),''),'Новая заявка с публичной формы'),'new','new','open',NULLIF(trim(p_payload->>'location'),''),
      NULLIF(p_payload->>'startDate','')::date,NULLIF(trim(p_payload->>'durationText'),''),COALESCE((p_payload->>'projectIndefinite')::boolean,false),COALESCE(p_payload->'schedule','{}'::jsonb),
      l.created_by_user_id,l.created_by_user_id,NULL,'public_form',NULLIF(trim(p_payload->>'contactName'),''),NULLIF(trim(p_payload->>'contactPosition'),''),NULLIF(trim(p_payload->>'contactPhone'),''),NULLIF(trim(p_payload->>'contactEmail'),''),
      NULLIF(trim(p_payload->>'siteName'),''),NULLIF(trim(p_payload->>'city'),''),NULLIF(trim(p_payload->>'transportAccess'),''),NULLIF(trim(p_payload->>'nearestTransport'),''),NULLIF(trim(p_payload->>'logisticsComment'),''),
      COALESCE(p_payload->'staffingRequirements','{}'::jsonb),COALESCE(p_payload->'provision','{}'::jsonb),COALESCE(p_payload->'commercialLimits','{}'::jsonb)
    ) RETURNING id INTO rid;
    UPDATE request_public_links SET request_id=rid,mode='complete' WHERE id=l.id;
  ELSE
    rid:=l.request_id;
    IF rid IS NULL THEN RAISE EXCEPTION 'PUBLIC_LINK_WITHOUT_REQUEST'; END IF;
    UPDATE requests SET
      title=COALESCE(NULLIF(trim(p_payload->>'title'),''),title),
      contact_name=COALESCE(NULLIF(trim(p_payload->>'contactName'),''),contact_name),contact_position=COALESCE(NULLIF(trim(p_payload->>'contactPosition'),''),contact_position),
      contact_phone=COALESCE(NULLIF(trim(p_payload->>'contactPhone'),''),contact_phone),contact_email=COALESCE(NULLIF(trim(p_payload->>'contactEmail'),''),contact_email),
      site_name=COALESCE(NULLIF(trim(p_payload->>'siteName'),''),site_name),location_text=COALESCE(NULLIF(trim(p_payload->>'location'),''),location_text),city=COALESCE(NULLIF(trim(p_payload->>'city'),''),city),
      transport_access=COALESCE(NULLIF(trim(p_payload->>'transportAccess'),''),transport_access),nearest_transport=COALESCE(NULLIF(trim(p_payload->>'nearestTransport'),''),nearest_transport),logistics_comment=COALESCE(NULLIF(trim(p_payload->>'logisticsComment'),''),logistics_comment),
      expected_start_date=COALESCE(NULLIF(p_payload->>'startDate','')::date,expected_start_date),duration_text=COALESCE(NULLIF(trim(p_payload->>'durationText'),''),duration_text),
      project_indefinite=COALESCE((p_payload->>'projectIndefinite')::boolean,project_indefinite),schedule_json=COALESCE(p_payload->'schedule',schedule_json),
      staffing_requirements_json=COALESCE(p_payload->'staffingRequirements',staffing_requirements_json),provision_json=COALESCE(p_payload->'provision',provision_json),commercial_limits_json=COALESCE(p_payload->'commercialLimits',commercial_limits_json),updated_at=now()
    WHERE id=rid;
  END IF;

  SELECT NOT EXISTS(SELECT 1 FROM calculations WHERE request_id=rid) INTO can_replace_roles;
  IF can_replace_roles AND jsonb_typeof(p_payload->'roles')='array' THEN
    DELETE FROM request_roles WHERE request_id=rid;
    FOR role_item IN SELECT * FROM jsonb_array_elements(p_payload->'roles') LOOP
      IF EXISTS(SELECT 1 FROM specialties s WHERE s.id=(role_item->>'specialtyId')::uuid AND s.organization_id=l.organization_id) THEN
        INSERT INTO request_roles(organization_id,request_id,specialty_id,count_required,requirements_json,qualification,experience_text,salary_target,salary_unit,schedule_type,starts_at,ends_at,presence_hours,paid_hours,lunch_minutes,lunch_paid,night_hours,overtime_rule)
        VALUES(l.organization_id,rid,(role_item->>'specialtyId')::uuid,GREATEST(COALESCE((role_item->>'count')::int,1),1),COALESCE(role_item->'requirements','{}'::jsonb),NULLIF(trim(role_item->>'qualification'),''),NULLIF(trim(role_item->>'experience'),''),NULLIF(role_item->>'salaryTarget','')::numeric,NULLIF(trim(role_item->>'salaryUnit'),''),NULLIF(trim(role_item->>'scheduleType'),''),NULLIF(role_item->>'startsAt','')::time,NULLIF(role_item->>'endsAt','')::time,NULLIF(role_item->>'presenceHours','')::numeric,NULLIF(role_item->>'paidHours','')::numeric,NULLIF(role_item->>'lunchMinutes','')::int,COALESCE((role_item->>'lunchPaid')::boolean,false),NULLIF(role_item->>'nightHours','')::numeric,NULLIF(trim(role_item->>'overtimeRule'),''));
      END IF;
    END LOOP;
  END IF;

  INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
  VALUES(l.organization_id,NULL,'request',rid,'public_form_submitted','Заказчик заполнил публичную форму',jsonb_build_object('publicLinkId',l.id));
  RETURN rid;
END $$;

REVOKE ALL ON FUNCTION public_request_link_read(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public_request_link_submit(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_request_link_read(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public_request_link_submit(text,jsonb) TO PUBLIC;

COMMIT;
