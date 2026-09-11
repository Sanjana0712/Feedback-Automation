import { Sparkles } from "lucide-react";

export default function PlaceholderPage({ title, description, testId }) {
  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-20" data-testid={testId}>
      <div className="bg-[var(--card)] rounded-2xl p-10 md:p-14 flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mb-5">
          <Sparkles size={18} className="text-[var(--accent-strong)]" />
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold mb-3">{title}</h1>
        <p className="text-[var(--ink-soft)] max-w-md text-[15px]">{description}</p>
        <p className="text-xs text-[var(--muted)] mt-6 uppercase tracking-wider">Coming soon</p>
      </div>
    </div>
  );
}
