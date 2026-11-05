export type DiscordTextBlock =
    | { readonly type: 'paragraph'; readonly text: string }
    | DiscordListBlock;

interface DiscordListItem {
    text: string;
    readonly children: DiscordListBlock[];
}
interface DiscordListBlock {
    readonly type: 'list';
    readonly ordered: boolean;
    readonly start: number;
    readonly items: DiscordListItem[];
}

function listMarker(line: string) {
    const match = /^( *)(?:([-*])|(\d+)\.) (.+)$/u.exec(line);
    if (match === null) {
        return undefined;
    }
    const number = match.at(3);
    return {
        indent: match[1].length,
        ordered: number !== undefined,
        start: number === undefined ? 1 : Number(number),
        text: match[4],
    };
}

/** Preserve prose/list order and Discord's two-space nested list syntax. */
export function discordTextBlocks(text: string): readonly DiscordTextBlock[] {
    const lines = text.split('\n');
    const blocks: DiscordTextBlock[] = [];
    let index = 0;
    let paragraph: string[] = [];
    function flushParagraph() {
        if (paragraph.length > 0) {
            blocks.push({
                type: 'paragraph',
                text: paragraph.join('\n').trimEnd(),
            });
            paragraph = [];
        }
    }

    function readList(): DiscordListBlock {
        const first = listMarker(lines[index]);
        if (first === undefined) {
            throw new Error('Expected a list item.');
        }
        const block: DiscordListBlock = {
            type: 'list',
            ordered: first.ordered,
            start: first.start,
            items: [],
        };
        while (index < lines.length) {
            const marker = listMarker(lines[index]);
            if (
                marker === undefined ||
                marker.indent !== first.indent ||
                marker.ordered !== first.ordered
            ) {
                break;
            }
            const item: DiscordListItem = { text: marker.text, children: [] };
            block.items.push(item);
            index++;
            while (index < lines.length) {
                const child = listMarker(lines[index]);
                if (child !== undefined && child.indent >= first.indent + 2) {
                    item.children.push(readList());
                } else if (
                    child === undefined &&
                    lines[index].trim() !== '' &&
                    lines[index].startsWith(' '.repeat(first.indent + 2))
                ) {
                    item.text += `\n${lines[index].trimStart()}`;
                    index++;
                } else {
                    break;
                }
            }
        }
        return block;
    }
    while (index < lines.length) {
        if (lines[index].trim() === '') {
            if (paragraph.length > 0) {
                paragraph.push('');
            }
            index++;
        } else if (listMarker(lines[index]) === undefined) {
            paragraph.push(lines[index]);
            index++;
        } else {
            flushParagraph();
            blocks.push(readList());
        }
    }
    flushParagraph();
    return blocks;
}
