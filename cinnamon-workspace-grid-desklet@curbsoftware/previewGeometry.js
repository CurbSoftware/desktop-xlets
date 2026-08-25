/* Pure workspace preview geometry. No Cinnamon or St dependency. */

function _number(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeRect(rect) {
    rect = rect || {};
    return {
        x: _number(rect.x, 0),
        y: _number(rect.y, 0),
        width: Math.max(0, _number(rect.width, 0)),
        height: Math.max(0, _number(rect.height, 0))
    };
}

/**
 * projectRect maps a desktop rectangle into a preview and clips it to bounds.
 * Returns null when source or intersection has no area.
 */
function projectRect(rect, desktop, previewWidth, previewHeight) {
    const source = normalizeRect(rect);
    const area = normalizeRect(desktop);
    const width = Math.max(0, _number(previewWidth, 0));
    const height = Math.max(0, _number(previewHeight, 0));

    if (!source.width || !source.height || !area.width || !area.height || !width || !height)
        return null;

    const left = Math.max(source.x, area.x);
    const top = Math.max(source.y, area.y);
    const right = Math.min(source.x + source.width, area.x + area.width);
    const bottom = Math.min(source.y + source.height, area.y + area.height);
    if (right <= left || bottom <= top)
        return null;

    return {
        x: Math.round((left - area.x) * width / area.width),
        y: Math.round((top - area.y) * height / area.height),
        width: Math.max(1, Math.round((right - left) * width / area.width)),
        height: Math.max(1, Math.round((bottom - top) * height / area.height))
    };
}

/** Returns centered icon geometry only when icon fully fits inside window. */
function iconRect(windowRect, iconSize) {
    if (!windowRect)
        return null;
    const size = Math.max(0, _number(iconSize, 0));
    if (!size || windowRect.width < size || windowRect.height < size)
        return null;
    return {
        x: Math.round(windowRect.x + (windowRect.width - size) / 2),
        y: Math.round(windowRect.y + (windowRect.height - size) / 2),
        width: size,
        height: size
    };
}
