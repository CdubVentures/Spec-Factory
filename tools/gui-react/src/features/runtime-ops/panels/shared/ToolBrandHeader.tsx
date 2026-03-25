import { resolveToolBrand, type ToolCategory } from './toolBrandRegistry.ts';
import { ScriptIcon } from './toolLogos.tsx';

interface ToolBrandHeaderProps {
  /** Key into TOOL_BRAND_REGISTRY (e.g. 'playwright', 'crawlee') */
  tool: string;
  /** 'script' = our code wrapping the tool's API; 'plugin' = external tool used directly */
  category?: ToolCategory;
}

export function ToolBrandHeader({ tool, category = 'plugin' }: ToolBrandHeaderProps) {
  const entry = resolveToolBrand(tool);
  if (!entry) return null;

  const { name, url, description, Logo } = entry;
  const isScript = category === 'script';

  return (
    <div className="flex items-start gap-3 rounded-sm border sf-border-soft sf-surface-subtle px-4 py-3 mb-4">
      <div className="flex items-center gap-1.5 pt-0.5 shrink-0">
        {isScript && <ScriptIcon className="w-5 h-5 sf-text-muted" />}
        <Logo className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold sf-text-primary">{name}</span>
          {isScript && <span className="text-xs sf-text-muted">· Script</span>}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs sf-text-accent hover:underline shrink-0"
            >
              {new URL(url).hostname} &#x2197;
            </a>
          )}
        </div>
        <p className="text-xs sf-text-muted mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
