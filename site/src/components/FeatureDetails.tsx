'use client';

import { useState } from 'react';
import type { JSX } from 'react';
import { ArrowUpRight, Check, Copy } from 'lucide-react';

import { REPOSITORY_URL } from '@/features';
import type { Feature } from '@/features';

import './FeatureDetails.css';

interface FeatureProps {
    readonly feature: Feature;
}

export function FeatureBadge({ feature }: FeatureProps): JSX.Element {
    return (
        <span
            className={`access-badge ${feature.access === '開發中' ? 'access-development' : ''}`}
        >
            {feature.access}
        </span>
    );
}

export function FeatureExample({
    feature,
}: {
    readonly feature: Pick<Feature, 'title' | 'example'>;
}): JSX.Element {
    const [copied, setCopied] = useState(false);
    const [failed, setFailed] = useState(false);
    const canCopy =
        feature.example.startsWith('@Sago') ||
        feature.example.startsWith('/ask');

    function copyExample() {
        Promise.resolve()
            .then(async () => {
                await navigator.clipboard.writeText(feature.example);
            })
            .then(() => {
                setCopied(true);
                setFailed(false);
            })
            .catch(() => {
                setFailed(true);
            });
    }

    return (
        <div className='feature-prompt'>
            <div className='prompt-line'>
                <p>{feature.example}</p>
                {canCopy && (
                    <button
                        aria-label={`複製${feature.title}範例`}
                        className='copy-prompt'
                        onClick={copyExample}
                        type='button'
                    >
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                        <span aria-live='polite'>
                            {copied ? '已複製' : '複製'}
                        </span>
                    </button>
                )}
            </div>
            {failed && (
                <p aria-live='polite' className='copy-feedback'>
                    請選取範例文字複製。
                </p>
            )}
        </div>
    );
}

export function FeatureConditions({ feature }: FeatureProps): JSX.Element {
    return (
        <div className='feature-conditions'>
            <p>{feature.note}</p>
            <a
                className='text-link'
                href={`${REPOSITORY_URL}/blob/main/${feature.guide}`}
            >
                GitHub 說明 <ArrowUpRight size={14} />
            </a>
        </div>
    );
}

export function AccessGuide(): JSX.Element {
    return (
        <details className='access-guide'>
            <summary>功能標籤怎麼看？</summary>
            <dl>
                <div>
                    <dt>一般功能</dt>
                    <dd>在已開放的頻道中使用。</dd>
                </div>
                <div>
                    <dt>需設定</dt>
                    <dd>請擁有者先開啟對應服務與權限。</dd>
                </div>
                <div>
                    <dt>擁有者限定</dt>
                    <dd>僅 Sago 擁有者可以操作。</dd>
                </div>
                <div>
                    <dt>開發中</dt>
                    <dd>尚未穩定，可能暫時無法使用。</dd>
                </div>
            </dl>
        </details>
    );
}
