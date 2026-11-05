import replies from './demo-replies.json';
import { discordTextBlocks } from './discord-lists';
import type { DemoMessage } from './features';

export type DemoReplyId = keyof typeof replies;

/** Adapt generated Discord text to the demo's existing text/code/link blocks. */
export function demoReply(
    id: DemoReplyId
): Pick<DemoMessage, 'text' | 'blocks' | 'code' | 'links'> {
    let text = replies[id];
    let code: string | undefined;
    text = text.replace(
        /```[^\n]*\n([\s\S]*?)```/u,
        (_match, content: string) => {
            code = content.trimEnd();
            return '';
        }
    );
    const links: Array<{ label: string; href: string }> = [];
    text = text.replaceAll(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gu,
        (_match, label: string, href: string) => {
            if (
                !href.startsWith(
                    'https://discord.com/channels/100000000000000001/'
                )
            ) {
                links.push({ label, href });
            }
            return label;
        }
    );
    text = text
        .replaceAll(
            /`([^`]+)`|\*\*([^*]+)\*\*/gu,
            (_match, inline: string | undefined, bold: string | undefined) =>
                inline ?? bold ?? ''
        )
        .replaceAll(/<a?:\w+:\d+>/gu, '')
        .replaceAll('<@&100000000000000005>', '@工作人員')
        .replaceAll('<#100000000000000009>', '#每日單字')
        .replaceAll(/\n{3,}/gu, '\n\n')
        .trim();
    return {
        text,
        blocks: discordTextBlocks(text),
        ...(code !== undefined && code !== '' ? { code } : {}),
        ...(links.length > 0 ? { links } : {}),
    };
}
