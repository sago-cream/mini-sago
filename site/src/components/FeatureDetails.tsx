'use client';

import { useState } from 'react';
import type { JSX } from 'react';
import { Check, Copy } from 'lucide-react';

import type { Feature } from '@/features';

import './FeatureDetails.css';

export function FeatureExample({
    feature,
}: {
    readonly feature: Pick<Feature, 'title' | 'example'>;
}): JSX.Element {
    const [copied, setCopied] = useState(false);
    const [failed, setFailed] = useState(false);
    const canCopy =
        feature.example.startsWith('@迷你西米露') ||
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
