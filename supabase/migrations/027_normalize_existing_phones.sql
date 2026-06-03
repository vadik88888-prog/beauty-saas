-- Strip all non-digit characters from existing client phone numbers
-- so they match the digits-only format the API now uses on insert and lookup.
-- Example: +375 (29) 845-61-23 → 375298456123
UPDATE clients
SET phone = REGEXP_REPLACE(phone, '[^0-9]', '', 'g')
WHERE phone IS NOT NULL
  AND phone ~ '[^0-9]';
