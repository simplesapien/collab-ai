/**
 * Utility for safely inspecting objects with circular references
 * @param {Object} obj - The object to inspect
 * @param {number} depth - Current depth level
 * @param {number} maxDepth - Maximum depth to traverse
 * @returns {Object} A safe representation of the object
 */
export function inspectObject(obj, depth = 0, maxDepth = 2) {
    if (depth > maxDepth) return '[Max Depth Reached]';
    if (!obj || typeof obj !== 'object') return obj;

    const result = {};
    const properties = [
        ...Object.getOwnPropertyNames(obj),
        ...Object.getOwnPropertyNames(Object.getPrototypeOf(obj))
    ];

    for (const prop of properties) {
        if (prop === 'constructor') continue;
        try {
            const value = obj[prop];
            if (typeof value === 'function') {
                result[prop] = '[Function]';
            } else if (typeof value === 'object' && value !== null) {
                result[prop] = inspectObject(value, depth + 1, maxDepth);
            } else {
                result[prop] = value;
            }
        } catch (e) {
            result[prop] = '[Circular or Inaccessible]';
        }
    }
    return result;
}

/**
 * Get only the methods of an object
 * @param {Object} obj - The object to inspect
 * @returns {string[]} Array of method names
 */
export function getMethods(obj) {
    return Object.getOwnPropertyNames(Object.getPrototypeOf(obj))
        .filter(name => typeof obj[name] === 'function');
}

/**
 * Get only the properties of an object
 * @param {Object} obj - The object to inspect
 * @returns {string[]} Array of property names
 */
export function getProperties(obj) {
    return Object.getOwnPropertyNames(obj)
        .filter(name => typeof obj[name] !== 'function');
} 