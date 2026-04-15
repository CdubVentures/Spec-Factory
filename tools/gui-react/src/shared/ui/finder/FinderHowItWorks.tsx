/**
 * FinderHowItWorks — reusable collapsible explainer for finder panels.
 *
 * Each finder feature provides a typed sections array describing its
 * pipeline, loop, learning, and settings. This component renders them
 * with consistent visual primitives (flow diagrams, callouts, compare
 * cards, tables, etc.).
 *
 * Content lives in each feature folder (e.g. pifHowItWorksContent.ts).
 * Adding an explainer to a new finder = define content + drop component.
 */

import { Fragment, type ReactNode } from 'react';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import './FinderHowItWorks.css';

/* ── Public types ─────────────────────────────────────────────── */

export type HiwTone =
  | 'accent' | 'green' | 'purple' | 'teal'
  | 'orange' | 'amber' | 'neutral' | 'muted';

export interface HiwFlowBox {
  label: string;
  sub?: string;
  tone: HiwTone;
}

export interface HiwCompareCard {
  tone: HiwTone;
  badge: string;
  title: string;
  items: string[];
}

export interface HiwLearnCell {
  tone: HiwTone;
  label: string;
  detail: string;
}

export interface HiwSlotStep {
  tone: HiwTone;
  label: string;
  detail: string;
}

export type HiwBlock =
  | { kind: 'text'; content: string }
  | { kind: 'flow'; boxes: HiwFlowBox[]; loopArrow?: boolean }
  | { kind: 'callout'; tone: HiwTone; icon: string; content: string }
  | { kind: 'compare'; cards: HiwCompareCard[] }
  | { kind: 'learn-chain'; cells: HiwLearnCell[] }
  | { kind: 'slot-steps'; steps: HiwSlotStep[] }
  | { kind: 'table'; headers: string[]; rows: string[][]; defaultCol?: number };

export interface HiwSection {
  num: number;
  tone: HiwTone;
  title: string;
  blocks: HiwBlock[];
  /** Column span in the 2-column grid. Default 1, use 2 for full-width (e.g. tables). */
  span?: 1 | 2;
}

export interface FinderHowItWorksProps {
  storeKey: string;
  subtitle: string;
  sections: HiwSection[];
}

/* ── Inline text parser (**bold** + `code`) ───────────────────── */

function parseInline(text: string): ReactNode[] {
  const result: ReactNode[] = [];
  let rest = text;
  let k = 0;

  while (rest.length > 0) {
    const bi = rest.indexOf('**');
    const ci = rest.indexOf('`');
    const nextBold = bi !== -1 ? bi : Infinity;
    const nextCode = ci !== -1 ? ci : Infinity;

    if (nextBold === Infinity && nextCode === Infinity) {
      result.push(rest);
      break;
    }

    if (nextBold <= nextCode) {
      if (bi > 0) result.push(rest.slice(0, bi));
      const close = rest.indexOf('**', bi + 2);
      if (close === -1) { result.push(rest.slice(bi)); break; }
      result.push(<strong key={k++}>{rest.slice(bi + 2, close)}</strong>);
      rest = rest.slice(close + 2);
    } else {
      if (ci > 0) result.push(rest.slice(0, ci));
      const close = rest.indexOf('`', ci + 1);
      if (close === -1) { result.push(rest.slice(ci)); break; }
      result.push(<code key={k++}>{rest.slice(ci + 1, close)}</code>);
      rest = rest.slice(close + 1);
    }
  }

  return result;
}

/* ── Tone → CSS class ─────────────────────────────────────────── */

function tc(tone: HiwTone): string {
  return `hiw-tone-${tone}`;
}

/* ── Block renderers ──────────────────────────────────────────── */

function TextBlock({ content }: { content: string }) {
  return <p className="hiw-text">{parseInline(content)}</p>;
}

function FlowBlock({ boxes, loopArrow }: { boxes: HiwFlowBox[]; loopArrow?: boolean }) {
  return (
    <div className="hiw-flow">
      {boxes.map((box, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="hiw-flow-arrow">
              {loopArrow && i === boxes.length - 1 ? '\u21BA' : '\u2192'}
            </span>
          )}
          <div className={`hiw-flow-box ${tc(box.tone)}`}>
            {box.label}
            {box.sub && <small>{box.sub}</small>}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function CalloutBlock({ tone, icon, content }: { tone: HiwTone; icon: string; content: string }) {
  return (
    <div className={`hiw-callout ${tc(tone)}`}>
      <span className="hiw-callout-icon">{icon}</span>
      <div className="hiw-text">{parseInline(content)}</div>
    </div>
  );
}

function CompareBlock({ cards }: { cards: HiwCompareCard[] }) {
  return (
    <div className="hiw-compare-grid">
      {cards.map((card, i) => (
        <div key={i} className={`hiw-compare-card ${tc(card.tone)}`}>
          <div className="hiw-compare-title">
            <span className="hiw-compare-badge">{card.badge}</span>
            {card.title}
          </div>
          <ul className="hiw-compare-list">
            {card.items.map((item, j) => (
              <li key={j}>{parseInline(item)}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function LearnChainBlock({ cells }: { cells: HiwLearnCell[] }) {
  return (
    <div className="hiw-learn-chain">
      {cells.map((cell, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="hiw-learn-arrow">{'\u2192'}</span>}
          <div className={`hiw-learn-cell ${tc(cell.tone)}`}>
            <div className="hiw-learn-label">{cell.label}</div>
            <div className="hiw-learn-detail">{parseInline(cell.detail)}</div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function SlotStepsBlock({ steps }: { steps: HiwSlotStep[] }) {
  return (
    <div className="hiw-slot-steps">
      {steps.map((step, i) => (
        <div key={i} className={`hiw-slot-step ${tc(step.tone)}`}>
          <span className="hiw-slot-label">{step.label}</span>
          <span className="hiw-slot-detail">{parseInline(step.detail)}</span>
        </div>
      ))}
    </div>
  );
}

function TableBlock({ headers, rows, defaultCol }: { headers: string[]; rows: string[][]; defaultCol?: number }) {
  return (
    <table className="hiw-table">
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td key={ci} className={ci === defaultCol ? 'hiw-table-default' : undefined}>
                {parseInline(cell)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Block dispatcher ─────────────────────────────────────────── */

function renderBlock(block: HiwBlock, index: number): ReactNode {
  switch (block.kind) {
    case 'text':
      return <TextBlock key={index} content={block.content} />;
    case 'flow':
      return <FlowBlock key={index} boxes={block.boxes} loopArrow={block.loopArrow} />;
    case 'callout':
      return <CalloutBlock key={index} tone={block.tone} icon={block.icon} content={block.content} />;
    case 'compare':
      return <CompareBlock key={index} cards={block.cards} />;
    case 'learn-chain':
      return <LearnChainBlock key={index} cells={block.cells} />;
    case 'slot-steps':
      return <SlotStepsBlock key={index} steps={block.steps} />;
    case 'table':
      return <TableBlock key={index} headers={block.headers} rows={block.rows} defaultCol={block.defaultCol} />;
  }
}

/* ── Main component ───────────────────────────────────────────── */

export function FinderHowItWorks({ storeKey, subtitle, sections }: FinderHowItWorksProps) {
  const [open, toggleOpen] = usePersistedToggle(`indexing:section:${storeKey}:how-it-works`, false);

  return (
    <div className="sf-surface-elevated border sf-border-soft rounded-lg">
      <button
        onClick={toggleOpen}
        className="w-full flex items-center gap-2.5 p-5 cursor-pointer select-none hover:opacity-80"
      >
        <span className={`text-[10px] sf-text-muted shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>
          {'\u25B6'}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] sf-text-muted">
          How It Works
        </span>
        <span className="text-[10px] sf-text-subtle">
          {subtitle}
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5">
          <div className="hiw-grid">
            {sections.map((section) => (
              <div key={section.num} className={`hiw-section ${tc(section.tone)}${section.span === 2 ? ' hiw-span-full' : ''}`}>
                <div className="hiw-heading">
                  <span className="hiw-num">{section.num}</span>
                  <h3>{section.title}</h3>
                </div>
                {section.blocks.map((block, bi) => renderBlock(block, bi))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
