UPDATE activity_type_configurations
SET questions = '[{"key":"campaign","required":true},{"key":"audienceOrAdGroup","required":true},{"key":"creative","required":true},{"key":"placement","required":true},{"key":"platformId","required":true},{"key":"objective","required":true},{"key":"landingPage","required":true}]'::jsonb,
    updated_at = now(),
    updated_by = 'system'
WHERE stable_key = 'display-content-partnerships' AND version = 1 AND status = 'published';

UPDATE activity_type_configurations
SET inheritable_fields = ARRAY(
      SELECT DISTINCT field
      FROM unnest(inheritable_fields || ARRAY['deliveryStartDate','deliveryEndDate','productValueIds']::text[]) AS field
    ),
    permitted_overrides = ARRAY(
      SELECT DISTINCT field
      FROM unnest(permitted_overrides || ARRAY['deliveryStartDate','deliveryEndDate','productValueIds']::text[]) AS field
    ),
    updated_at = now(),
    updated_by = 'system'
WHERE stable_key IN (
  'email',
  'paid-search',
  'paid-social',
  'display-content-partnerships',
  'organic-social',
  'employee-advocacy',
  'events',
  'sales-cadences',
  'in-app',
  'mcp',
  'website',
  'partner-marketing'
) AND version = 1 AND status = 'published';