-- Public bucket for service cover photos (mirrors master-photos setup)
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-images', 'service-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow authenticated upload to service-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read on service-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete on service-images" ON storage.objects;

CREATE POLICY "Allow authenticated upload to service-images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'service-images');

CREATE POLICY "Allow public read on service-images"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'service-images');

CREATE POLICY "Allow authenticated delete on service-images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'service-images');
