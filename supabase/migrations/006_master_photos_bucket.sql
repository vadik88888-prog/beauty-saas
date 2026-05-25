-- Create public bucket for master photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('master-photos', 'master-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if any (for idempotency)
DROP POLICY IF EXISTS "Allow authenticated upload to master-photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read on master-photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete on master-photos" ON storage.objects;

-- Allow authenticated users to upload
CREATE POLICY "Allow authenticated upload to master-photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'master-photos');

-- Allow public read
CREATE POLICY "Allow public read on master-photos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'master-photos');

-- Allow authenticated users to delete (for replacing photos)
CREATE POLICY "Allow authenticated delete on master-photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'master-photos');
