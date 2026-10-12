import { FEATURE_SECTIONS, FEATURES } from './features';

// eslint-disable-next-line complete/prefer-is-array
const isArray: (value: unknown) => value is unknown[] = Array.isArray;

export const FEATURE_ORDER_KEY = 'minisago-feature-order-draft-v1';

export interface FeatureOrderGroup {
    readonly id: string;
    readonly featureIds: readonly string[];
}

export function defaultFeatureOrder(): readonly FeatureOrderGroup[] {
    return FEATURE_SECTIONS.map((section) => ({
        id: section.id,
        featureIds: FEATURES.filter(
            (feature) => feature.section === section.id
        ).map((feature) => feature.id),
    }));
}

export function readFeatureOrder(
    value: string
): readonly FeatureOrderGroup[] | undefined {
    try {
        const parsed: unknown = JSON.parse(value);
        if (!isArray(parsed)) {
            return undefined;
        }
        const groups: FeatureOrderGroup[] = [];
        for (const item of parsed) {
            if (
                typeof item !== 'object' ||
                item === null ||
                !('id' in item) ||
                !('featureIds' in item)
            ) {
                return undefined;
            }
            if (
                typeof item.id !== 'string' ||
                !isArray(item.featureIds) ||
                !item.featureIds.every((id: unknown) => typeof id === 'string')
            ) {
                return undefined;
            }
            groups.push({
                id: item.id,
                featureIds: item.featureIds,
            });
        }
        const sectionIds = groups.map((group) => group.id);
        const featureIds = groups.flatMap((group) => group.featureIds);
        if (
            sectionIds.length !== FEATURE_SECTIONS.length ||
            new Set(sectionIds).size !== sectionIds.length ||
            !FEATURE_SECTIONS.every((section) =>
                sectionIds.includes(section.id)
            )
        ) {
            return undefined;
        }
        if (
            featureIds.length !== FEATURES.length ||
            new Set(featureIds).size !== featureIds.length ||
            !FEATURES.every((feature) => featureIds.includes(feature.id))
        ) {
            return undefined;
        }
        return groups;
    } catch {
        return undefined;
    }
}

export function moveFeature(
    groups: readonly FeatureOrderGroup[],
    id: string,
    sectionId: string,
    targetId?: string,
    after = false
): readonly FeatureOrderGroup[] {
    if (
        id === targetId ||
        !groups.some((group) => group.featureIds.includes(id)) ||
        !groups.some((group) => group.id === sectionId)
    ) {
        return groups;
    }
    const next = groups.map((group) => ({
        ...group,
        featureIds: group.featureIds.filter((featureId) => featureId !== id),
    }));
    return next.map((group) => {
        if (group.id !== sectionId) {
            return group;
        }
        const position =
            targetId === undefined ? -1 : group.featureIds.indexOf(targetId);
        const index =
            position === -1
                ? group.featureIds.length
                : position + Number(after);
        return {
            ...group,
            featureIds: [
                ...group.featureIds.slice(0, index),
                id,
                ...group.featureIds.slice(index),
            ],
        };
    });
}

export function moveSection(
    groups: readonly FeatureOrderGroup[],
    id: string,
    targetId: string,
    after = false
): readonly FeatureOrderGroup[] {
    const moving = groups.find((group) => group.id === id);
    if (
        moving === undefined ||
        id === targetId ||
        !groups.some((group) => group.id === targetId)
    ) {
        return groups;
    }
    const next = groups.filter((group) => group.id !== id);
    const index =
        next.findIndex((group) => group.id === targetId) + Number(after);
    return [...next.slice(0, index), moving, ...next.slice(index)];
}

export function featureOrderText(groups: readonly FeatureOrderGroup[]): string {
    return [
        '請套用以下功能分類與順序：',
        ...groups.map((group) => {
            const section = FEATURE_SECTIONS.find(
                (item) => item.id === group.id
            );
            return `\n${section?.title ?? group.id} [${group.id}]\n${group.featureIds.map((id) => `- ${FEATURES.find((feature) => feature.id === id)?.title ?? id} [${id}]`).join('\n')}`;
        }),
    ].join('\n');
}
