'use client';
import { useEffect, useRef, useState } from 'react';

export default function RecipePhoto({ initialUrl }: { initialUrl?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [selectedUrl, setSelectedUrl] = useState<string>();
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => { if (selectedUrl) URL.revokeObjectURL(selectedUrl); }, [selectedUrl]);
  const preview = selectedUrl || (!removed ? initialUrl : undefined);
  return <div>
    <label htmlFor="recipe-photo">Recipe photo</label>
    {preview && <div className="recipe-photo-preview"><img src={preview} alt="Recipe photo preview" /></div>}
    <input ref={input} id="recipe-photo" name="image" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setError('Choose a JPG, PNG or WEBP no larger than 5 MB.');
        event.target.value = '';
        setSelectedUrl(undefined);
        return;
      }
      setError('');
      setRemoved(false);
      setSelectedUrl(URL.createObjectURL(file));
    }} />
    <input type="hidden" name="removeImage" value={String(removed)} />
    <div className="flex flex-wrap gap-2 mt-2">
      <button type="button" className="btn btn-secondary" onClick={() => input.current?.click()}>{preview ? 'Change Photo' : 'Upload Photo'}</button>
      {preview && <button type="button" className="btn btn-secondary" onClick={() => {
        if (input.current) input.current.value = '';
        setSelectedUrl(undefined);
        setRemoved(true);
        setError('');
      }}>Remove Photo</button>}
    </div>
    <p className="page-description">JPG, PNG or WEBP · maximum 5 MB. Photo changes apply when you save the recipe.</p>
    {error && <p role="alert">{error}</p>}
  </div>;
}
