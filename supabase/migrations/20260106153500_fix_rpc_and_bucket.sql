-- Ensure the images bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO UPDATE
SET public = true;

-- Drop existing policies to avoid "policy already exists" errors
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update" ON storage.objects;

-- Allow public access to read images
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'images' );

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'images' );

-- Allow authenticated users to update their own images (or all images for simplicity in this context)
CREATE POLICY "Authenticated Update"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'images' );

-- Re-create the RPC function to ensure it exists
CREATE OR REPLACE FUNCTION public.get_cliente_public_info(cid uuid)
RETURNS TABLE (nome_completo text, foto_url text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT c.nome_completo, c.foto_url
  FROM public.clientes c
  WHERE c.id = cid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cliente_public_info(uuid) TO authenticated;
