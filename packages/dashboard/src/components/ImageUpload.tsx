import { useRef } from 'react';

interface ImageUploadProps {
  label: string;
  hint?: string;
  preview: string | null;
  onFileSelect: (file: File) => void;
  onClear: () => void;
  className?: string;
}

export default function ImageUpload({ label, hint, preview, onFileSelect, onClear, className }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  }

  function handleClear() {
    onClear();
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="form-group">
      <label>{label}</label>
      {hint && <span className="form-hint imgupload-hint">{hint}</span>}
      <input ref={inputRef} type="file" accept="image/*" onChange={handleChange} className="imgupload-file-input" />
      <div
        className={`tmpl-image-upload ${className || ''}`}
        onClick={() => inputRef.current?.click()}
      >
        {preview ? (
          <img src={preview} alt={`${label} preview`} className="imgupload-preview-img" />
        ) : (
          <div className="tmpl-image-placeholder">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span>Click to upload</span>
          </div>
        )}
      </div>
      {preview && (
        <button type="button" className="btn btn-secondary btn-xs imgupload-remove-btn" onClick={handleClear}>
          Remove
        </button>
      )}
    </div>
  );
}
