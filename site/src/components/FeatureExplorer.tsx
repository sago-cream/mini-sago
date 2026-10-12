'use client';

import { useEffect, useState } from 'react';
import type { DragEvent, JSX, KeyboardEvent } from 'react';
import { ChevronDown, GripVertical } from 'lucide-react';

import {
    defaultFeatureOrder,
    FEATURE_ORDER_KEY,
    featureOrderText,
    moveFeature,
    moveSection,
    readFeatureOrder,
} from '@/feature-order';
import type { FeatureOrderGroup } from '@/feature-order';
import { FEATURE_SECTIONS, FEATURES } from '@/features';
import type { Feature } from '@/features';
import { DiscordDemo } from './DiscordDemo';

import './FeatureExplorer.css';

interface DragItem {
    readonly kind: 'feature' | 'section';
    readonly id: string;
}
interface DropTarget {
    readonly key: string;
    readonly after: boolean;
}

function isAfter(event: DragEvent<HTMLElement>): boolean {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientY > box.top + box.height / 2;
}

export function FeatureExplorer(): JSX.Element {
    const [selectedId, setSelectedId] = useState<string>(FEATURES[0].id);
    const [groups, setGroups] = useState(defaultFeatureOrder);
    const [expandedSections, setExpandedSections] = useState<readonly string[]>(
        [FEATURES[0].section]
    );
    const [menuOpen, setMenuOpen] = useState(false);
    const [dragged, setDragged] = useState<DragItem>();
    const [dropTarget, setDropTarget] = useState<DropTarget>();
    const [status, setStatus] = useState('');
    const [copyFallback, setCopyFallback] = useState('');
    const selected =
        FEATURES.find((feature) => feature.id === selectedId) ?? FEATURES[0];

    useEffect(() => {
        try {
            const stored = localStorage.getItem(FEATURE_ORDER_KEY);
            const draft =
                stored === null ? undefined : readFeatureOrder(stored);
            if (draft) {
                setGroups(draft);
            }
        } catch {
            // Browser storage is optional for the local sorting preview.
        }
    }, []);

    function save(next: readonly FeatureOrderGroup[]) {
        setGroups(next);
        setCopyFallback('');
        setStatus('已暫存，尚未套用網站分類。');
        try {
            localStorage.setItem(FEATURE_ORDER_KEY, JSON.stringify(next));
        } catch {
            setStatus('排序僅保留到這次瀏覽結束，請複製排序。');
        }
    }

    function expand(id: string) {
        setExpandedSections((previous) =>
            previous.includes(id) ? previous : [...previous, id]
        );
    }

    function startDrag(event: DragEvent<HTMLElement>, item: DragItem) {
        event.stopPropagation();
        const transfer = event.dataTransfer;
        transfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', `${item.kind}:${item.id}`);
        setDragged(item);
    }

    function endDrag() {
        setDragged(undefined);
        setDropTarget(undefined);
    }

    function hover(event: DragEvent<HTMLElement>, key: string) {
        event.preventDefault();
        event.stopPropagation();
        const transfer = event.dataTransfer;
        transfer.dropEffect = 'move';
        const after = isAfter(event);
        setDropTarget((previous) =>
            previous?.key === key && previous.after === after
                ? previous
                : { key, after }
        );
    }

    function dropOnSection(
        event: DragEvent<HTMLElement>,
        group: FeatureOrderGroup
    ) {
        if (!dragged) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (dragged.kind === 'section') {
            save(moveSection(groups, dragged.id, group.id, isAfter(event)));
        } else {
            save(moveFeature(groups, dragged.id, group.id));
            expand(group.id);
        }
        endDrag();
    }

    function keyboardMove(
        event: KeyboardEvent<HTMLElement>,
        item: DragItem,
        group: FeatureOrderGroup
    ) {
        if (
            !event.altKey ||
            !['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(
                event.key
            )
        ) {
            return;
        }
        const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
        const direction =
            event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
        if (item.kind === 'section' && !vertical) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (item.kind === 'section' || !vertical) {
            const target = groups.at(
                groups.findIndex((entry) => entry.id === group.id) + direction
            );
            if (!target || (direction < 0 && groups[0].id === group.id)) {
                return;
            }
            if (item.kind === 'section') {
                save(moveSection(groups, group.id, target.id, direction > 0));
            } else {
                save(moveFeature(groups, item.id, target.id));
                expand(target.id);
            }
        } else {
            const index = group.featureIds.indexOf(item.id);
            const target =
                index + direction < 0
                    ? undefined
                    : group.featureIds.at(index + direction);
            if (target !== undefined) {
                save(
                    moveFeature(
                        groups,
                        item.id,
                        group.id,
                        target,
                        direction > 0
                    )
                );
            }
        }
    }

    async function copyOrder() {
        const text = featureOrderText(groups);
        try {
            await navigator.clipboard.writeText(text);
            setStatus('已複製排序，貼到 Codex 後告訴我要套用。');
        } catch {
            setCopyFallback(text);
            setStatus('請複製下方排序，貼到 Codex 後告訴我要套用。');
        }
    }

    function resetOrder() {
        save(defaultFeatureOrder());
        setStatus('已重設暫存排序。');
    }

    function dropEdge(key: string): 'before' | 'after' | undefined {
        if (dropTarget?.key !== key) {
            return undefined;
        }
        return dropTarget.after ? 'after' : 'before';
    }

    function featureButton(
        feature: Feature,
        group: FeatureOrderGroup
    ): JSX.Element {
        const key = `feature:${feature.id}`;
        return (
            <button
                aria-controls='feature-preview'
                aria-pressed={feature.id === selectedId}
                data-drop-edge={dropEdge(key)}
                data-feature-id={feature.id}
                draggable
                key={feature.id}
                onClick={() => {
                    setSelectedId(feature.id);
                    setMenuOpen(false);
                }}
                onDragEnd={endDrag}
                onDragOver={(event) => {
                    if (dragged?.kind === 'feature') {
                        hover(event, key);
                    }
                }}
                onDragStart={(event) => {
                    startDrag(event, { kind: 'feature', id: feature.id });
                }}
                onDrop={(event) => {
                    if (dragged?.kind !== 'feature') {
                        return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    save(
                        moveFeature(
                            groups,
                            dragged.id,
                            group.id,
                            feature.id,
                            isAfter(event)
                        )
                    );
                    expand(group.id);
                    endDrag();
                }}
                onKeyDown={(event) => {
                    keyboardMove(
                        event,
                        { kind: 'feature', id: feature.id },
                        group
                    );
                }}
                title='拖曳移動；Alt+↑/↓ 排序，Alt+←/→ 換分類'
                type='button'
            >
                <GripVertical aria-hidden='true' size={14} />
                <span>{feature.title}</span>
            </button>
        );
    }

    return (
        <div className='feature-workspace section-width'>
            <button
                aria-controls='feature-navigation'
                aria-expanded={menuOpen}
                className='feature-mobile-menu'
                onClick={() => {
                    setMenuOpen((value) => !value);
                }}
                type='button'
            >
                選擇功能：{selected.title}
                <ChevronDown aria-hidden='true' size={18} />
            </button>
            <nav
                aria-label='功能分類'
                className={`feature-sidebar ${menuOpen ? 'sidebar-open' : ''}`}
                id='feature-navigation'
            >
                <div className='feature-order-toolbar'>
                    <strong>暫時排序</strong>
                    <p>拖曳分類或項目，草稿保存在這個瀏覽器。</p>
                    <div>
                        <button
                            onClick={() => {
                                copyOrder().catch(() => {
                                    setStatus('請再試一次複製排序。');
                                });
                            }}
                            type='button'
                        >
                            複製排序
                        </button>
                        <button onClick={resetOrder} type='button'>
                            重設
                        </button>
                    </div>
                    <p aria-live='polite'>{status}</p>
                    {copyFallback !== '' && (
                        <textarea
                            aria-label='排序草稿'
                            readOnly
                            value={copyFallback}
                        />
                    )}
                </div>
                {groups.map((group) => {
                    const section = FEATURE_SECTIONS.find(
                        (item) => item.id === group.id
                    );
                    if (section === undefined) {
                        return undefined;
                    }
                    const items = group.featureIds.flatMap((id) => {
                        const feature = FEATURES.find((item) => item.id === id);
                        return feature === undefined ? [] : [feature];
                    });
                    const key = `section:${group.id}`;
                    const dropProps = {
                        'data-section-id': group.id,
                        'data-drop-edge': dropEdge(key),
                        'onDragOver': (event: DragEvent<HTMLElement>) => {
                            if (dragged) {
                                hover(event, key);
                            }
                        },
                        'onDrop': (event: DragEvent<HTMLElement>) => {
                            dropOnSection(event, group);
                        },
                    };
                    const children =
                        items.length > 0 ? (
                            items.map((feature) =>
                                featureButton(feature, group)
                            )
                        ) : (
                            <p className='feature-order-empty'>拖到這裡</p>
                        );
                    return 'standalone' in section ? (
                        <div
                            className='sidebar-section sidebar-standalone'
                            key={group.id}
                            {...dropProps}
                        >
                            {children}
                        </div>
                    ) : (
                        <details
                            className='sidebar-section'
                            key={group.id}
                            {...dropProps}
                            onToggle={(event) => {
                                const expanded = event.currentTarget.open;
                                setExpandedSections((previous) => {
                                    if (
                                        previous.includes(group.id) === expanded
                                    ) {
                                        return previous;
                                    }
                                    return expanded
                                        ? [...previous, group.id]
                                        : previous.filter(
                                              (id) => id !== group.id
                                          );
                                });
                            }}
                            open={expandedSections.includes(group.id)}
                        >
                            <summary
                                draggable
                                onDragEnd={endDrag}
                                onDragStart={(event) => {
                                    startDrag(event, {
                                        kind: 'section',
                                        id: group.id,
                                    });
                                }}
                                onKeyDown={(event) => {
                                    keyboardMove(
                                        event,
                                        { kind: 'section', id: group.id },
                                        group
                                    );
                                }}
                                title='拖曳分類；Alt+↑/↓ 排序'
                            >
                                <GripVertical aria-hidden='true' size={14} />
                                <h2>{section.title}</h2>
                                <ChevronDown aria-hidden='true' size={14} />
                            </summary>
                            {children}
                        </details>
                    );
                })}
            </nav>
            <section
                aria-labelledby='selected-feature-title'
                className='feature-preview'
                id='feature-preview'
            >
                <div className='feature-preview-heading'>
                    <h2 id='selected-feature-title'>{selected.title}</h2>
                    <p>{selected.description}</p>
                </div>
                <DiscordDemo
                    channel={selected.channel}
                    key={selected.id}
                    messages={selected.messages}
                />
                {selected.note !== '' && (
                    <p className='feature-note'>{selected.note}</p>
                )}
            </section>
        </div>
    );
}
