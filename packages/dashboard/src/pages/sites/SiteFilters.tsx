import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ALL = '__all__';

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  template: string;
  onTemplateChange: (v: string) => void;
  status: string;
  onStatusChange: (v: string) => void;
  templates: string[];
  statuses: string[];
}

export default function SiteFilters({
  search, onSearchChange, template, onTemplateChange,
  status, onStatusChange, templates, statuses,
}: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Input
        className="h-9 max-w-xs rounded-lg"
        placeholder="Search by name..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      <Select
        value={template || ALL}
        onValueChange={(v) => onTemplateChange(v === ALL ? '' : v)}
      >
        <SelectTrigger className="w-44 rounded-lg">
          <SelectValue placeholder="All Templates" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Templates</SelectItem>
          {templates.map((t) => (
            <SelectItem key={t} value={t}>{t}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={status || ALL}
        onValueChange={(v) => onStatusChange(v === ALL ? '' : v)}
      >
        <SelectTrigger className="w-44 rounded-lg">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Statuses</SelectItem>
          {statuses.map((s) => (
            <SelectItem key={s} value={s}>{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
