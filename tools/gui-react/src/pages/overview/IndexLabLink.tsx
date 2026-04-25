import type { ReactNode, MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIndexLabStore } from '../../features/indexing/state/indexlabStore.ts';
import { useTabStore } from '../../stores/tabStore.ts';
import { buildIndexLabLinkAction, type IndexLabLinkTabId } from './indexLabLinkAction.ts';
import './IndexLabLink.css';

export type { IndexLabLinkTabId } from './indexLabLinkAction.ts';

export interface IndexLabLinkProps {
  readonly category: string;
  readonly productId: string;
  readonly brand: string;
  readonly baseModel: string;
  readonly tabId: IndexLabLinkTabId;
  readonly children: ReactNode;
  readonly title?: string;
  readonly className?: string;
}

export function IndexLabLink({
  category, productId, brand, baseModel, tabId, children, title, className,
}: IndexLabLinkProps) {
  const navigate = useNavigate();
  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    const action = buildIndexLabLinkAction({ category, productId, brand, baseModel, tabId });
    useIndexLabStore.setState(action.picker);
    useTabStore.getState().set(action.tabKey, action.tabId);
    navigate(action.target);
  };
  return (
    <button
      type="button"
      className={`sf-ovx-link${className ? ' ' + className : ''}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}
