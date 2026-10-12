import type { Metadata } from 'next';

export const SITE_ORIGIN = 'https://mini.sagocream.com';
export const SITE_NAME = 'mini sago';

export function pageMetadata(
    title: string,
    description: string,
    path: string
): Metadata {
    const image = {
        url: `${SITE_ORIGIN}/images/minisago3.png`,
        width: 1540,
        height: 1540,
        alt: 'mini sago：藍髮、紫眼的迷你西米露',
    };
    return {
        title,
        description,
        alternates: { canonical: path },
        openGraph: {
            title,
            description,
            url: `${SITE_ORIGIN}${path}`,
            siteName: SITE_NAME,
            locale: 'zh_TW',
            type: 'website',
            images: [image],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: [image],
        },
    };
}
