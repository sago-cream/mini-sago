import type { JSX } from 'react';
import {
    Code,
    Download,
    Ellipsis,
    Expand,
    FileArchive,
    FileText,
} from 'lucide-react';
import Image from 'next/image';

import type { DemoFile } from '@/features';

export function DiscordAttachment({
    file,
}: {
    readonly file: DemoFile;
}): JSX.Element {
    if (file.kind === 'image' && file.src !== undefined) {
        return (
            <Image
                alt={file.name}
                className='discord-image-attachment'
                height={file.height ?? 320}
                src={file.src}
                width={file.width ?? 320}
            />
        );
    }
    if (file.kind === 'text') {
        return (
            <div className='discord-text-attachment'>
                <pre>
                    <code>{file.preview}</code>
                </pre>
                <div className='text-attachment-footer'>
                    <div>
                        <span>{file.name}</span>
                        <small>{file.detail}</small>
                    </div>
                    <div aria-hidden='true'>
                        <Code size={18} />
                        <Expand size={18} />
                        <Ellipsis size={18} />
                    </div>
                </div>
            </div>
        );
    }
    const FileIcon = file.name.endsWith('.zip') ? FileArchive : FileText;
    return (
        <div className='discord-attachment'>
            <FileIcon aria-hidden='true' size={32} />
            <div>
                {file.src === undefined ? (
                    <span>{file.name}</span>
                ) : (
                    <a download href={file.src}>
                        {file.name}
                    </a>
                )}
                <small>{file.detail}</small>
            </div>
            {file.src === undefined ? (
                <Download aria-hidden='true' size={24} />
            ) : (
                <a aria-label={`下載 ${file.name}`} download href={file.src}>
                    <Download size={24} />
                </a>
            )}
        </div>
    );
}
