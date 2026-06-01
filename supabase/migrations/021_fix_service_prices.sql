-- Fix demo service prices that were entered with wrong decimal point (1.08 instead of 1080+)
-- Applies only to services with obviously wrong prices (< 100)

UPDATE services SET price = 2000  WHERE name ILIKE '%педикюр%'                        AND price < 100;
UPDATE services SET price = 1800  WHERE name ILIKE '%маникюр%'                        AND price < 100;
UPDATE services SET price = 3500  WHERE (name ILIKE '%rf%' OR name ILIKE '%лифтинг%') AND price < 100;
UPDATE services SET price = 2500  WHERE name ILIKE '%массаж%'                         AND price < 100;
UPDATE services SET price = 1500  WHERE name ILIKE '%стрижк%'                         AND price < 100;
UPDATE services SET price = 4000  WHERE name ILIKE '%ботокс%'                         AND price < 100;
UPDATE services SET price = 2200  WHERE name ILIKE '%чистк%'                          AND price < 100;

-- Catch-all: any remaining service with price < 100 gets a duration-based price
UPDATE services
SET price = CASE
  WHEN duration_min <= 30  THEN 1200
  WHEN duration_min <= 60  THEN 2000
  WHEN duration_min <= 90  THEN 2800
  WHEN duration_min <= 120 THEN 3500
  ELSE 4500
END
WHERE price < 100;
