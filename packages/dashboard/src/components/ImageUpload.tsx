import { useRef } from 'react';
import { ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

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
    <div className="flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <Label>{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>

      <input ref={inputRef} type="file" accept="image/*" onChange={handleChange} className="hidden" />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 transition-colors hover:border-ring hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'aspect-[3/2]',
          className,
        )}
      >
        {preview ? (
          <img src={preview} alt={`${label} preview`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 p-4 text-muted-foreground">
            <ImageIcon className="h-8 w-8" strokeWidth={1.5} />
            <span className="text-xs">Click to upload</span>
          </div>
        )}
      </button>

      {preview && (
        <Button type="button" variant="secondary" size="xs" className="self-start" onClick={handleClear}>
          Remove
        </Button>
      )}
    </div>
  );
}
