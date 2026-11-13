//@ts-check
/**
 * @file whitted.js
 * @description Classical Whitted-Style Recursive Ray Tracing Engine (Turner Whitted 1980).
 * Implements Whitted's illumination model:
 * 
 *     I = I_a + k_d * sum(N . L_j) + k_s * S + k_t * T
 * 
 * Direct lighting via shadow rays to point light sources, ideal specular mirror reflection (S),
 * and ideal refraction / transmission (T) via Snell's Law.
 * All scene geometry uses a single unified Material type.
 * Antialiasing is performed via Whitted's 4-corner adaptive subdivision.
 * 
 * Runs inside a dedicated Web Worker or directly in a script context.
 */

// ----------------------------------------------------------------------------
// Type Definitions (JSDoc)
// ----------------------------------------------------------------------------

/**
 * An RGB color representation [r, g, b] where each channel is in [0, 1].
 * @typedef {[number, number, number]} ColorRGB
 */

/**
 * Unified Material specification for Whitted Ray Tracing.
 * @typedef {Object} MaterialSpec
 * @property {ColorRGB} [ambient] Ambient reflection color [r, g, b].
 * @property {ColorRGB} [diffuse] Diffuse reflection color [r, g, b].
 * @property {ColorRGB} [specular] Specular reflection color [r, g, b].
 * @property {number} [shininess] Specular highlight exponent.
 * @property {number} [reflectivity] Mirror reflection strength [0, 1].
 * @property {number} [transparency] Transmission strength [0, 1].
 * @property {number} [refractiveIndex] Refraction behavior (index of refraction).
 */

/**
 * Pinhole perspective camera configuration.
 * @typedef {Object} CameraSpec
 * @property {Vec3 | [number, number, number]} [lookfrom] Eye position in 3D world space.
 * @property {Vec3 | [number, number, number]} [lookat] Target look point in 3D world space.
 * @property {Vec3 | [number, number, number]} [vup] Up vector.
 * @property {number} [vfov] Vertical field of view in degrees.
 * @property {number} [aspectRatio] Viewport aspect ratio (width / height).
 */

/**
 * Rendered pixel payload: [x, y, [r, g, b]] where r, g, b are integers in [0, 255].
 * @typedef {[number, number, [number, number, number]]} RenderedPixel
 */

/**
 * Progress callback payload sent to frontend / parent thread.
 * @typedef {[[number, number], RenderedPixel[], boolean, {shadowRaysCast?: number, shadowRaysReached?: number, raysTraced?: number, aaSubdivisions?: number}?]} ProgressPayload
 */

/**
 * Raytracer execution options.
 * @typedef {Object} RaytracerOptions
 * @property {number} [imageWidth=400] Canvas width in pixels.
 * @property {number} [imageHeight] Canvas height in pixels.
 * @property {number} [aspectRatio=16/9] Canvas aspect ratio.
 * @property {number} [maxDepth=10] Maximum ray recursion bounce depth.
 * @property {number} [gamma=2.0] Gamma correction exponent.
 * @property {ColorRGB | string | null} [ambient=null] Scene constant ambient light color.
 * @property {ColorRGB | string | null} [onHitAndBlack=null] Diagnostic color to assign to pixels that hit geometry but evaluated to black (NOT part of Whitted ray tracing).
 * @property {PointLight[]} [pointLights] Optional explicit list of point lights.
 * @property {boolean} [shadowRaysForPointLights=true] Whether direct shadow rays are enabled.
 * @property {number | null} [maxAntialiasingSubdivisions=null] Max subdivision depth for adaptive AA (null = no max).
 * @property {number} [adaptiveTolerance=0.1] Contrast threshold for adaptive pixel subdivision.
 * @property {string | any[]} [scene='whitted'] Scene preset name or custom object list.
 * @property {CameraSpec} [camera] Camera options override.
 * @property {number} [updateInterval=1] Progress batch interval.
 */

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

export const INFINITY = Infinity;
export const PI = 3.1415926535897932385;

// ----------------------------------------------------------------------------
// Math and Vector Classes
// ----------------------------------------------------------------------------

/**
 * 3D Vector class with vector arithmetic.
 */
export class Vec3 {
    /**
     * @param {number} [x=0]
     * @param {number} [y=0]
     * @param {number} [z=0]
     */
    constructor(x = 0, y = 0, z = 0) {
        this.x = Number(x) || 0;
        this.y = Number(y) || 0;
        this.z = Number(z) || 0;
    }

    get r() { return this.x; }
    set r(v) { this.x = v; }

    get g() { return this.y; }
    set g(v) { this.y = v; }

    get b() { return this.z; }
    set b(v) { this.z = v; }

    /**
     * @param {any} [v]
     * @param {number} [defaultVal=0]
     * @returns {Vec3}
     */
    static from(v, defaultVal = 0) {
        if (v === null || v === undefined) return new Vec3(defaultVal, defaultVal, defaultVal);
        if (typeof v === 'number') return new Vec3(v, v, v);
        if (v instanceof Vec3) return v.copy();
        if (Array.isArray(v)) return new Vec3(v[0] ?? defaultVal, v[1] ?? defaultVal, v[2] ?? defaultVal);
        if (typeof v === 'object') {
            if ('x' in v || 'y' in v || 'z' in v) {
                return new Vec3(v.x ?? defaultVal, v.y ?? defaultVal, v.z ?? defaultVal);
            }
            if ('r' in v || 'g' in v || 'b' in v) {
                return new Vec3(v.r ?? defaultVal, v.g ?? defaultVal, v.b ?? defaultVal);
            }
        }
        return new Vec3(defaultVal, defaultVal, defaultVal);
    }

    copy() {
        return new Vec3(this.x, this.y, this.z);
    }

    negative() {
        return new Vec3(-this.x, -this.y, -this.z);
    }

    length() {
        return Math.sqrt(this.lengthSquared());
    }

    lengthSquared() {
        return (this.x * this.x) + (this.y * this.y) + (this.z * this.z);
    }

    /**
     * @param {Vec3} v
     * @returns {Vec3}
     */
    plus(v) {
        return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z);
    }

    /**
     * @param {Vec3} v
     * @returns {Vec3}
     */
    minus(v) {
        return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z);
    }

    /**
     * @param {Vec3} v
     * @returns {Vec3}
     */
    times(v) {
        return new Vec3(this.x * v.x, this.y * v.y, this.z * v.z);
    }

    /**
     * @param {number} n
     * @returns {Vec3}
     */
    timesNum(n) {
        return new Vec3(this.x * n, this.y * n, this.z * n);
    }

    /**
     * @param {number} n
     * @returns {Vec3}
     */
    divByNum(n) {
        return new Vec3(this.x / n, this.y / n, this.z / n);
    }

    /**
     * @param {Vec3} v
     * @returns {number}
     */
    dot(v) {
        return (this.x * v.x) + (this.y * v.y) + (this.z * v.z);
    }

    /**
     * @param {Vec3} v
     * @returns {Vec3}
     */
    cross(v) {
        return new Vec3(
            this.y * v.z - this.z * v.y,
            this.z * v.x - this.x * v.z,
            this.x * v.y - this.y * v.x
        );
    }

    unitVector() {
        const len = this.length();
        return len > 0 ? this.divByNum(len) : new Vec3(0, 0, 0);
    }

    toArray() {
        return [this.x, this.y, this.z];
    }

    toString() {
        return `<Vec3(${this.x}, ${this.y}, ${this.z})>`;
    }
}

/** @typedef {Vec3} Point3D */
/** @typedef {Vec3} Color */

export const Point3D = Vec3;
export const Color = Vec3;

/**
 * Parses color inputs into a standard ColorRGB [r, g, b] array.
 * @param {any} v Input color value (name, hex, array, number, Vec3).
 * @param {ColorRGB} [defaultColor=[0, 0, 0]]
 * @returns {ColorRGB}
 */
export function parseColorRGB(v, defaultColor = [0, 0, 0]) {
    if (v === null || v === undefined || v === '') return [...defaultColor];
    if (v instanceof Vec3) return [v.x, v.y, v.z];
    if (Array.isArray(v)) {
        // Only scale if values look like 8-bit integers (e.g. > 1 and integer-like or > 2)
        // Values in [0, 1] remain as-is. If all are in [0, 1], scale is 1.
        // For array like [255, 255, 255], scale by 1/255.
        const maxVal = Math.max(Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0);
        const scale = maxVal > 1.0 && maxVal <= 255 && (v.some(c => Number(c) > 1 && Number.isInteger(Number(c)))) ? (1 / 255) : 1;
        return [Number(v[0]) * scale, Number(v[1]) * scale, Number(v[2]) * scale];
    }
    if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        /** @type {Record<string, ColorRGB>} */
        const NAMED_COLORS = {
            black: [0, 0, 0],
            white: [1, 1, 1],
            red: [1, 0, 0],
            green: [0, 1, 0],
            blue: [0, 0, 1],
            yellow: [1, 1, 0],
            cyan: [0, 1, 1],
            magenta: [1, 0, 1],
            gray: [0.5, 0.5, 0.5],
            grey: [0.5, 0.5, 0.5],
            orange: [1, 0.647, 0],
            purple: [0.5, 0, 0.5],
            pink: [1, 0.753, 0.796]
        };
        if (s in NAMED_COLORS) return [...NAMED_COLORS[s]];
        if (s === 'none' || s === 'off' || s === 'dark') return [0, 0, 0];

        const hex = s.startsWith('#') ? s.slice(1) : s;
        if (/^[0-9a-f]{6}$/i.test(hex)) {
            return [
                parseInt(hex.slice(0, 2), 16) / 255,
                parseInt(hex.slice(2, 4), 16) / 255,
                parseInt(hex.slice(4, 6), 16) / 255
            ];
        }
        if (/^[0-9a-f]{3}$/i.test(hex)) {
            return [
                parseInt(hex[0] + hex[0], 16) / 255,
                parseInt(hex[1] + hex[1], 16) / 255,
                parseInt(hex[2] + hex[2], 16) / 255
            ];
        }
        if (s.includes(',')) {
            const parts = s.split(',').map(p => Number(p.trim()));
            if (parts.length >= 3 && !parts.some(isNaN)) {
                const scale = (parts[0] > 1 || parts[1] > 1 || parts[2] > 1) ? (1 / 255) : 1;
                return [parts[0] * scale, parts[1] * scale, parts[2] * scale];
            }
        }
        const num = Number(s);
        if (!isNaN(num)) {
            const val = num > 1 ? num / 255 : num;
            return [val, val, val];
        }
    }
    if (typeof v === 'number' && !isNaN(v)) {
        const val = v > 1 ? v / 255 : v;
        return [val, val, val];
    }
    return [...defaultColor];
}

// ----------------------------------------------------------------------------
// Material
// ----------------------------------------------------------------------------

/**
 * Unified Material for Whitted Ray Tracing.
 * All scene objects are required to have this material type.
 */
export class Material {
    /**
     * @param {MaterialSpec} [spec={}]
     */
    constructor(spec = {}) {
        const reflectivityVal = Number(spec.reflectivity ?? 0);
        const transparencyVal = Number(spec.transparency ?? 0);
        const hasSpecularSpec = spec.specular !== undefined && spec.specular !== null;
        const hasDiffuseSpec = spec.diffuse !== undefined && spec.diffuse !== null;

        // If the material has significant specular mirror reflection or transparent properties
        // and diffuse was not explicitly specified, default diffuse to [0, 0, 0] (pure specular / dielectric).
        // Otherwise, default diffuse to neutral gray [0.5, 0.5, 0.5].
        const isPureSpecularOrGlass = (reflectivityVal > 0 || transparencyVal > 0);
        /** @type {ColorRGB} */
        const defaultDiffuse = isPureSpecularOrGlass ? [0, 0, 0] : [0.5, 0.5, 0.5];

        /** @type {ColorRGB} */
        const diffuseCol = hasDiffuseSpec ? parseColorRGB(spec.diffuse, defaultDiffuse) : defaultDiffuse;

        /**
         * Ambient reflection color [r, g, b].
         * @type {ColorRGB}
         */
        this.ambient = (spec.ambient !== undefined && spec.ambient !== null)
            ? parseColorRGB(spec.ambient, [0, 0, 0])
            : [diffuseCol[0], diffuseCol[1], diffuseCol[2]];

        /**
         * Diffuse reflection color [r, g, b].
         * @type {ColorRGB}
         */
        this.diffuse = diffuseCol;

        /**
         * Specular reflection color [r, g, b].
         * Defaults to [1, 1, 1] if reflectivity > 0 and specular was omitted,
         * or [0, 0, 0] if neither was specified.
         * @type {ColorRGB}
         */
        /** @type {ColorRGB} */
        const defaultSpecular = (reflectivityVal > 0) ? [1, 1, 1] : [0, 0, 0];
        this.specular = hasSpecularSpec ? parseColorRGB(spec.specular, defaultSpecular) : defaultSpecular;

        /**
         * Specular highlight exponent.
         * @type {number}
         */
        this.shininess = Number(spec.shininess ?? 0);

        /**
         * Mirror reflection strength [0, 1].
         * @type {number}
         */
        this.reflectivity = Number(spec.reflectivity ?? 0);

        /**
         * Transmission strength [0, 1].
         * @type {number}
         */
        this.transparency = transparencyVal;

        /**
         * Refraction behavior (index of refraction eta).
         * @type {number}
         */
        this.refractiveIndex = Number(spec.refractiveIndex ?? 1.0);
    }
}

// ----------------------------------------------------------------------------
// Ray & Hit Record
// ----------------------------------------------------------------------------

export class Ray {
    /**
     * @param {Point3D | [number, number, number]} origin
     * @param {Vec3 | [number, number, number]} direction
     */
    constructor(origin, direction) {
        this.origin = origin instanceof Vec3 ? origin : Vec3.from(origin);
        this.direction = direction instanceof Vec3 ? direction : Vec3.from(direction);
    }

    /**
     * Evaluates ray position at parameter t: P(t) = origin + t * direction.
     * @param {number} t
     * @returns {Point3D}
     */
    at(t) {
        return this.origin.plus(this.direction.timesNum(t));
    }
}

export class HitRecord {
    constructor() {
        /** @type {Point3D | null} */
        this.point = null;
        /** @type {Vec3 | null} */
        this.normal = null;
        /** @type {Material | null} */
        this.material = null;
        /** @type {number} */
        this.t = 0;
        /** @type {boolean} */
        this.frontFace = true;
    }

    /**
     * Sets hit normal orientation relative to incoming ray.
     * @param {Ray} ray
     * @param {Vec3} outwardNormal
     */
    setFaceNormal(ray, outwardNormal) {
        this.frontFace = ray.direction.dot(outwardNormal) < 0;
        this.normal = this.frontFace ? outwardNormal : outwardNormal.negative();
    }

    /**
     * @param {HitRecord} rec
     */
    become(rec) {
        this.point = rec.point ? rec.point.copy() : null;
        this.normal = rec.normal ? rec.normal.copy() : null;
        this.material = rec.material;
        this.t = rec.t;
        this.frontFace = rec.frontFace;
    }
}

// ----------------------------------------------------------------------------
// Scene Geometry & Lights
// ----------------------------------------------------------------------------

export class Hittable {
    /**
     * @param {Ray} ray
     * @param {number} tMin
     * @param {number} tMax
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    hit(ray, tMin, tMax, hitRecord) {
        throw new Error('hit() is not implemented for this Hittable.');
    }
}

export class Sphere extends Hittable {
    /**
     * @param {Point3D | [number, number, number]} center
     * @param {number} radius
     * @param {Material | MaterialSpec} material
     */
    constructor(center, radius, material) {
        super();
        this.center = center instanceof Vec3 ? center : Vec3.from(center);
        this.radius = Number(radius);
        if (!material) {
            throw new Error('All objects are required to have a Material.');
        }
        this.material = material instanceof Material ? material : new Material(material);
    }

    /**
     * @param {Ray} ray
     * @param {number} tMin
     * @param {number} tMax
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    hit(ray, tMin, tMax, hitRecord) {
        const oc = ray.origin.minus(this.center);
        const a = ray.direction.lengthSquared();
        const halfB = oc.dot(ray.direction);
        const c = oc.lengthSquared() - (this.radius * this.radius);

        const discriminant = (halfB * halfB) - (a * c);
        if (discriminant < 0) return false;
        const sqrtD = Math.sqrt(discriminant);

        let root = (-halfB - sqrtD) / a;
        if (root < tMin || tMax < root) {
            root = (-halfB + sqrtD) / a;
            if (root < tMin || tMax < root) {
                return false;
            }
        }

        hitRecord.t = root;
        hitRecord.point = ray.at(hitRecord.t);
        const outwardNormal = hitRecord.point.minus(this.center).divByNum(this.radius);
        hitRecord.setFaceNormal(ray, outwardNormal);
        hitRecord.material = this.material;

        return true;
    }
}

export class PointLight {
    /**
     * @param {Point3D | [number, number, number]} position
     * @param {ColorRGB} [color=[1, 1, 1]]
     * @param {number} [intensity=1.0]
     */
    constructor(position, color = [1, 1, 1], intensity = 1.0) {
        this.position = position instanceof Vec3 ? position : Vec3.from(position);
        this.color = parseColorRGB(color, [1, 1, 1]);
        this.intensity = Number(intensity ?? 1.0);
    }
}

export class HittableList extends Hittable {
    /**
     * @param {Hittable[]} [objects=[]]
     */
    constructor(objects = []) {
        super();
        this.objects = [...objects];
    }

    /**
     * @param {Hittable} object
     */
    add(object) {
        this.objects.push(object);
    }

    /**
     * @param {Ray} ray
     * @param {number} tMin
     * @param {number} tMax
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    hit(ray, tMin, tMax, hitRecord) {
        let hitAnything = false;
        let closestSoFar = tMax;
        const tempRecord = new HitRecord();

        for (const object of this.objects) {
            if (object.hit(ray, tMin, closestSoFar, tempRecord)) {
                hitAnything = true;
                closestSoFar = tempRecord.t;
                hitRecord.become(tempRecord);
            }
        }

        return hitAnything;
    }
}

// ----------------------------------------------------------------------------
// Camera
// ----------------------------------------------------------------------------

/**
 * Classical ideal pinhole perspective camera.
 */
export class Camera {
    /**
     * @param {CameraSpec} [spec={}]
     */
    constructor(spec = {}) {
        const aspectRatio = spec.aspectRatio ?? (16.0 / 9.0);
        const lookfrom = spec.lookfrom ? (spec.lookfrom instanceof Vec3 ? spec.lookfrom : Vec3.from(spec.lookfrom)) : null;
        const lookat = spec.lookat ? (spec.lookat instanceof Vec3 ? spec.lookat : Vec3.from(spec.lookat)) : new Point3D(0, 0, -1);
        const vup = spec.vup ? (spec.vup instanceof Vec3 ? spec.vup : Vec3.from(spec.vup)) : new Vec3(0, 1, 0);
        const vfov = spec.vfov ?? 90;

        this.origin = new Point3D(0, 0, 0);

        if (!lookfrom) {
            this.viewportHeight = 2.0;
            this.viewportWidth = aspectRatio * this.viewportHeight;
            this.horizontal = new Vec3(this.viewportWidth, 0, 0);
            this.vertical = new Vec3(0, this.viewportHeight, 0);
            this.lowerLeftCorner = this.origin
                .minus(this.horizontal.divByNum(2.0))
                .minus(this.vertical.divByNum(2.0))
                .minus(new Vec3(0, 0, 1.0));
        } else {
            const theta = vfov * (Math.PI / 180.0);
            const h = Math.tan(theta / 2);
            this.viewportHeight = 2.0 * h;
            this.viewportWidth = aspectRatio * this.viewportHeight;

            this.w = lookfrom.minus(lookat).unitVector();
            this.u = vup.cross(this.w).unitVector();
            this.v = this.w.cross(this.u);

            this.origin = lookfrom.copy();
            this.horizontal = this.u.timesNum(this.viewportWidth);
            this.vertical = this.v.timesNum(this.viewportHeight);
            this.lowerLeftCorner = this.origin
                .minus(this.horizontal.divByNum(2.0))
                .minus(this.vertical.divByNum(2.0))
                .minus(this.w);
        }
    }

    /**
     * Generates a primary ray from the camera pinhole through viewport coordinates (s, t).
     * @param {number} s
     * @param {number} t
     * @returns {Ray}
     */
    getRay(s, t) {
        const direction = this.lowerLeftCorner
            .plus(this.horizontal.timesNum(s))
            .plus(this.vertical.timesNum(t))
            .minus(this.origin);
        return new Ray(this.origin, direction);
    }
}

// ----------------------------------------------------------------------------
// Optics Helpers
// ----------------------------------------------------------------------------

/**
 * Computes specular mirror reflection direction: R = V - 2 * (V . N) * N.
 * @param {Vec3} v
 * @param {Vec3} n
 * @returns {Vec3}
 */
export function reflect(v, n) {
    return v.minus(n.timesNum(v.dot(n) * 2.0));
}

/**
 * Computes Snell's law refraction direction vector.
 * @param {Vec3} uv
 * @param {Vec3} n
 * @param {number} etaiOverEtat
 * @returns {Vec3 | null} Refracted unit vector, or null if total internal reflection occurs.
 */
export function refract(uv, n, etaiOverEtat) {
    const cosTheta = Math.min(uv.negative().dot(n), 1.0);
    const rOutPerp = uv.plus(n.timesNum(cosTheta)).timesNum(etaiOverEtat);
    const k = 1.0 - rOutPerp.lengthSquared();
    if (k < 0) return null;
    const rOutParallel = n.timesNum(-Math.sqrt(k));
    return rOutPerp.plus(rOutParallel);
}

/**
 * Clamps value x into range [min, max].
 * @param {number} x
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(x, min, max) {
    if (x < min) return min;
    if (x > max) return max;
    return x;
}

// ----------------------------------------------------------------------------
// Scene Presets
// ----------------------------------------------------------------------------

/**
 * Creates built-in lecture demo scenes or parses a custom array of objects.
 * Returns the world, light sources, and preset camera.
 * 
 * @param {string | any[]} [sceneSpec='whitted'] Preset scene name or custom array.
 * @param {number} [aspectRatio=16/9] Viewport aspect ratio.
 * @returns {{world: HittableList, lights: PointLight[], camera: Camera | null}}
 */
export function createWorld(sceneSpec = 'whitted', aspectRatio = 16 / 9) {
    const world = new HittableList();
    /** @type {PointLight[]} */
    const lights = [];
    /** @type {Camera | null} */
    let camera = null;

    if (Array.isArray(sceneSpec)) {
        for (const item of sceneSpec) {
            if (item instanceof PointLight) {
                lights.push(item);
            } else if (item instanceof Sphere) {
                world.add(item);
            } else if (item && typeof item === 'object') {
                const kind = String(item.kind || '').toLowerCase();
                if (kind === 'pointlight') {
                    lights.push(new PointLight(item.position || item.center, item.color, item.intensity));
                } else {
                    world.add(new Sphere(item.center, item.radius ?? item.r ?? 0.5, item.material));
                }
            }
        }
        return { world, lights, camera };
    }

    const preset = typeof sceneSpec === 'string' ? sceneSpec.toLowerCase() : 'whitted';

    switch (preset) {
        case 'sphere': {
            world.add(new Sphere(
                new Point3D(0.0, 0.0, -1.0),
                0.5,
                new Material({
                    ambient: [0.0, 0.0, 0.0],
                    diffuse: [52 / 255, 152 / 255, 219 / 255],
                    specular: [0.0, 0.0, 0.0]
                })
            ));
            camera = new Camera({
                aspectRatio,
                lookfrom: new Point3D(0, 0, 0),
                lookat: new Point3D(0, 0, -1),
                vup: new Vec3(0, 1, 0),
                vfov: 60
            });
            break;
        }

        case 'spherewithpointlight': {
            world.add(new Sphere(
                new Point3D(0.0, 0.0, -1.0),
                0.5,
                new Material({
                    ambient: [0.0, 0.0, 0.0],
                    diffuse: [52 / 255, 152 / 255, 219 / 255],
                    specular: [0.0, 0.0, 0.0],
                    shininess: 32,
                    reflectivity: 0.1
                })
            ));
            lights.push(new PointLight(new Point3D(1.0, 1.2, 0.5), [1.0, 1.0, 1.0], 1.0));
            camera = new Camera({
                aspectRatio,
                lookfrom: new Point3D(0, 0, 0),
                lookat: new Point3D(0, 0, -1),
                vup: new Vec3(0, 1, 0),
                vfov: 60
            });
            break;
        }

        case 'twosphereswithpointlight': {
            world.add(new Sphere(
                new Point3D(0.0, 0.0, -1.0),
                0.5,
                new Material({
                    ambient: [0.1, 0.1, 0.1],
                    diffuse: [52 / 255, 152 / 255, 219 / 255],
                    specular: [0.0, 0.0, 0.0]
                })
            ));
            world.add(new Sphere(
                new Point3D(0.0, -100.5, -1.0),
                100.0,
                new Material({
                    ambient: [0.1, 0.1, 0.1],
                    diffuse: [46 / 255, 204 / 255, 113 / 255],
                    specular: [0.0, 0.0, 0.0]
                })
            ));
            lights.push(new PointLight(new Point3D(1.0, 1.2, 0.5), [1.0, 1.0, 1.0], 1.0));
            camera = new Camera({
                aspectRatio,
                lookfrom: new Point3D(0, 0, 0),
                lookat: new Point3D(0, 0, -1),
                vup: new Vec3(0, 1, 0),
                vfov: 90
            });
            break;
        }

        case 'twosphereswithpointlightreflective': {
            world.add(new Sphere(
                new Point3D(0.0, 0.0, -1.0),
                0.5,
                new Material({
                    // ambient: [0, 0, 0],
                    // diffuse: [52 / 255, 152 / 255, 219 / 255],
                    shininess: 128,
                    specular: [1, 1, 1],
                    reflectivity: 1,
                })
            ));
            world.add(new Sphere(
                new Point3D(0.0, -100.5, -1.0),
                100.0,
                new Material({
                    ambient: [0.1, 0.1, 0.1],
                    diffuse: [46 / 255, 204 / 255, 113 / 255],
                    specular: [0.0, 0.0, 0.0]
                })
            ));
            lights.push(new PointLight(new Point3D(1.0, 1.2, 0.5), [1.0, 1.0, 1.0], 1.0));
            camera = new Camera({
                aspectRatio,
                lookfrom: new Point3D(0, 0, 0),
                lookat: new Point3D(0, 0, -1),
                vup: new Vec3(0, 1, 0),
                vfov: 90
            });
            break;
        }

        case 'twosphereswithpointlightrefractive': {
            world.add(new Sphere(
                new Point3D(0.0, 0.0, -1.0),
                0.5,
                new Material({
                    // ambient: [0, 0, 0],
                    // diffuse: [52 / 255, 152 / 255, 219 / 255],
                    specular: [1, 1, 1],
                    transparency: 1,
                })
            ));
            world.add(new Sphere(
                new Point3D(0.0, -100.5, -1.0),
                100.0,
                new Material({
                    ambient: [0.1, 0.1, 0.1],
                    diffuse: [46 / 255, 204 / 255, 113 / 255],
                    specular: [0.0, 0.0, 0.0]
                })
            ));
            lights.push(new PointLight(new Point3D(1.0, 1.2, 0.5), [1.0, 1.0, 1.0], 1.0));
            camera = new Camera({
                aspectRatio,
                lookfrom: new Point3D(0, 0, 0),
                lookat: new Point3D(0, 0, -1),
                vup: new Vec3(0, 1, 0),
                vfov: 90
            });
            break;
        }

        case 'twosphereswithpointlightrefractive2': {
            world.add(new Sphere(
                new Point3D(0.0, 0.0, -1.0),
                0.5,
                new Material({
                    // ambient: [0, 0, 0],
                    // diffuse: [52 / 255, 152 / 255, 219 / 255],
                    specular: [1, 1, 1],
                    transparency: 1,
                    refractiveIndex: 0.8,
                })
            ));
            world.add(new Sphere(
                new Point3D(0.0, -100.5, -1.0),
                100.0,
                new Material({
                    ambient: [0.1, 0.1, 0.1],
                    diffuse: [46 / 255, 204 / 255, 113 / 255],
                    specular: [0.0, 0.0, 0.0]
                })
            ));
            lights.push(new PointLight(new Point3D(1.0, 1.2, 0.5), [1.0, 1.0, 1.0], 1.0));
            camera = new Camera({
                aspectRatio,
                lookfrom: new Point3D(0, 0, 0),
                lookat: new Point3D(0, 0, -1),
                vup: new Vec3(0, 1, 0),
                vfov: 90
            });
            break;
        }

        case 'manysphereswithpointlight': {
            world.add(new Sphere(
                new Point3D(-0.9, 0.0, -1.0),
                0.35,
                new Material({
                    ambient: [0.1, 0.1, 0.1],
                    diffuse: [155 / 255, 89 / 255, 182 / 255],
                    specular: [0.0, 0.0, 0.0]
                })
            ));
            world.add(new Sphere(
                new Point3D(0.0, 0.0, -1.0),
                0.5,
                new Material({
                    ambient: [0.1, 0.1, 0.1],
                    diffuse: [52 / 255, 152 / 255, 219 / 255],
                    specular: [0.0, 0.0, 0.0]
                })
            ));
            world.add(new Sphere(
                new Point3D(0.8, 0.0, -1.0),
                0.15,
                new Material({
                    ambient: [0.1, 0.1, 0.1],
                    diffuse: [241 / 255, 196 / 255, 15 / 255],
                    specular: [0.0, 0.0, 0.0]
                })
            ));
            world.add(new Sphere(
                new Point3D(0.0, -100.5, -1.0),
                100.0,
                new Material({
                    ambient: [0.1, 0.1, 0.1],
                    diffuse: [46 / 255, 204 / 255, 113 / 255],
                    specular: [0.0, 0.0, 0.0]
                })
            ));
            lights.push(new PointLight(new Point3D(1.0, 1.2, 0.5), [1.0, 1.0, 1.0], 1.0));
            camera = new Camera({
                aspectRatio,
                lookfrom: new Point3D(0, 0, 0),
                lookat: new Point3D(0, 0, -1),
                vup: new Vec3(0, 1, 0),
                vfov: 90
            });
            break;
        }

        case 'whitted':
        case 'whitted1980':
        default: {
            // Turner Whitted 1980 landmark scene:
            // Non-reflective Lambertian red sphere, specular reflective gold sphere, and transparent dielectric glass sphere
            // all over a very large ground sphere.
            world.add(new Sphere(
                new Point3D(0.0, -100.5, -1.0),
                100.0,
                new Material({
                    ambient: [0.2, 0.2, 0.2],
                    diffuse: [0.75, 0.75, 0.75],
                    specular: [0.0, 0.0, 0.0]
                })
            ));

            // Left non-reflective Lambertian sphere (k_d > 0, k_s = 0, reflectivity = 0)
            world.add(new Sphere(
                new Point3D(-0.7, 0.0, -1.0),
                0.5,
                new Material({
                    ambient: [0.1, 0.1, 0.1],
                    diffuse: [0.85, 0.18, 0.18],
                    specular: [0.0, 0.0, 0.0],
                    reflectivity: 0.0
                })
            ));

            // Right specular sphere (polished gold specular mirror reflection: k_s > 0, reflectivity = 0.85)
            world.add(new Sphere(
                new Point3D(0.7, 0.0, -1.0),
                0.5,
                new Material({
                    ambient: [0.05, 0.05, 0.05],
                    diffuse: [0.1, 0.1, 0.1],
                    specular: [0.85, 0.65, 0.2],
                    shininess: 64,
                    reflectivity: 0.85
                })
            ));

            // Center dielectric sphere (transparent glass: transparency = 0.9, refractive index = 1.5)
            world.add(new Sphere(
                new Point3D(0.0, -0.2, -0.45),
                0.25,
                new Material({
                    ambient: [0.0, 0.0, 0.0],
                    diffuse: [0.0, 0.0, 0.0],
                    specular: [1.0, 1.0, 1.0],
                    shininess: 128,
                    reflectivity: 0.1,
                    transparency: 0.9,
                    refractiveIndex: 1.5
                })
            ));

            lights.push(new PointLight(new Point3D(1.8, 2.5, 0.8), [1.0, 1.0, 1.0], 1.2));
            camera = new Camera({
                aspectRatio,
                lookfrom: new Point3D(0, 0.4, 1.2),
                lookat: new Point3D(0, -0.05, -1.0),
                vup: new Vec3(0, 1, 0),
                vfov: 50
            });
            break;
        }

        case 'manyspheresmanymaterials': {
            world.add(new Sphere(
                new Point3D(0.0, -100.5, -1.0),
                100.0,
                new Material({
                    ambient: [0.2, 0.2, 0.2],
                    diffuse: [0.4, 0.42, 0.44],
                    specular: [0.0, 0.0, 0.0]
                })
            ));

            // Center glass sphere
            world.add(new Sphere(
                new Point3D(0.0, 0.0, -1.2),
                0.5,
                new Material({
                    ambient: [0.0, 0.0, 0.0],
                    diffuse: [0.0, 0.0, 0.0],
                    specular: [1.0, 1.0, 1.0],
                    shininess: 128,
                    reflectivity: 0.1,
                    transparency: 0.9,
                    refractiveIndex: 1.5
                })
            ));

            // Left matte red sphere
            world.add(new Sphere(
                new Point3D(-1.15, 0.0, -1.0),
                0.5,
                new Material({
                    ambient: [0.1, 0.1, 0.1],
                    diffuse: [0.85, 0.2, 0.2],
                    specular: [0.0, 0.0, 0.0]
                })
            ));

            // Right polished gold mirror sphere
            world.add(new Sphere(
                new Point3D(1.15, 0.0, -1.0),
                0.5,
                new Material({
                    ambient: [0.05, 0.05, 0.05],
                    diffuse: [0.1, 0.1, 0.1],
                    specular: [0.85, 0.65, 0.2],
                    reflectivity: 0.85
                })
            ));

            // Front-left chrome mirror sphere
            world.add(new Sphere(
                new Point3D(-0.55, -0.28, -0.65),
                0.22,
                new Material({
                    ambient: [0.0, 0.0, 0.0],
                    diffuse: [0.0, 0.0, 0.0],
                    specular: [0.9, 0.9, 0.9],
                    reflectivity: 0.9
                })
            ));

            // Front-right cyan diffuse sphere
            world.add(new Sphere(
                new Point3D(0.55, -0.28, -0.65),
                0.22,
                new Material({
                    ambient: [0.1, 0.1, 0.1],
                    diffuse: [0.15, 0.75, 0.75],
                    specular: [0.0, 0.0, 0.0]
                })
            ));

            lights.push(new PointLight(new Point3D(2.0, 2.5, 0.5), [1.0, 1.0, 1.0], 1.2));
            camera = new Camera({
                aspectRatio,
                lookfrom: new Point3D(0, 0.2, 0.9),
                lookat: new Point3D(0, -0.05, -1.1),
                vup: new Vec3(0, 1, 0),
                vfov: 52
            });
            break;
        }

        case 'materialshowcase': {
            // Complex material showcase with dielectric, specular metals, and non-reflective Lambertian spheres
            world.add(new Sphere(
                new Point3D(0.0, -100.5, -1.0),
                100.0,
                new Material({
                    ambient: [0.15, 0.15, 0.18],
                    diffuse: [0.35, 0.38, 0.42],
                    specular: [0.0, 0.0, 0.0]
                })
            ));

            // Central glass dielectric sphere
            world.add(new Sphere(
                new Point3D(0.0, 0.05, -1.25),
                0.55,
                new Material({
                    ambient: [0.0, 0.0, 0.0],
                    diffuse: [0.0, 0.0, 0.0],
                    specular: [1.0, 1.0, 1.0],
                    shininess: 128,
                    reflectivity: 0.1,
                    transparency: 0.95,
                    refractiveIndex: 1.5
                })
            ));

            // Left chrome mirror sphere (pure specular)
            world.add(new Sphere(
                new Point3D(-1.25, 0.0, -1.1),
                0.5,
                new Material({
                    ambient: [0.0, 0.0, 0.0],
                    diffuse: [0.0, 0.0, 0.0],
                    specular: [0.95, 0.95, 0.95],
                    shininess: 128,
                    reflectivity: 0.95
                })
            ));

            // Right polished copper/bronze specular sphere
            world.add(new Sphere(
                new Point3D(1.25, 0.0, -1.1),
                0.5,
                new Material({
                    ambient: [0.05, 0.03, 0.02],
                    diffuse: [0.12, 0.06, 0.04],
                    specular: [0.9, 0.55, 0.3],
                    shininess: 64,
                    reflectivity: 0.85
                })
            ));

            // Front-left non-reflective Lambertian ruby red sphere
            world.add(new Sphere(
                new Point3D(-0.65, -0.24, -0.6),
                0.26,
                new Material({
                    ambient: [0.1, 0.02, 0.02],
                    diffuse: [0.9, 0.15, 0.15],
                    specular: [0.0, 0.0, 0.0],
                    reflectivity: 0.0
                })
            ));

            // Front-center small tinted glass dielectric sphere
            world.add(new Sphere(
                new Point3D(0.0, -0.27, -0.45),
                0.23,
                new Material({
                    ambient: [0.0, 0.0, 0.0],
                    diffuse: [0.02, 0.08, 0.04],
                    specular: [1.0, 1.0, 1.0],
                    shininess: 128,
                    reflectivity: 0.12,
                    transparency: 0.88,
                    refractiveIndex: 1.6
                })
            ));

            // Front-right non-reflective Lambertian golden-yellow sphere
            world.add(new Sphere(
                new Point3D(0.65, -0.24, -0.6),
                0.26,
                new Material({
                    ambient: [0.1, 0.08, 0.01],
                    diffuse: [0.95, 0.8, 0.1],
                    specular: [0.0, 0.0, 0.0],
                    reflectivity: 0.0
                })
            ));

            lights.push(new PointLight(new Point3D(2.5, 3.0, 0.8), [1.0, 1.0, 1.0], 1.1));
            lights.push(new PointLight(new Point3D(-2.0, 2.2, 0.3), [0.7, 0.7, 0.9], 0.6));
            camera = new Camera({
                aspectRatio,
                lookfrom: new Point3D(0, 0.35, 1.05),
                lookat: new Point3D(0, -0.05, -1.1),
                vup: new Vec3(0, 1, 0),
                vfov: 52
            });
            break;
        }
    }

    return { world, lights, camera };
}

// ----------------------------------------------------------------------------
// Core Shading & Ray Tracing Routine
// ----------------------------------------------------------------------------

/**
 * Traces a Whitted (1980) shadow feeler ray toward a point light source.
 * Transparent surfaces do not block feeler rays; they attenuate the transmitted
 * radiance by their transmission factor (k_t / transparency) and continue to the light.
 * 
 * @param {Point3D} origin Surface intersection point.
 * @param {Vec3} lightDir Unit vector pointing toward the point light source.
 * @param {number} distToLight Euclidean distance to the light source.
 * @param {Hittable} world Scene hittable geometry.
 * @param {{shadowRaysCast: number, shadowRaysReached: number, raysTraced: number} | null} [stats=null]
 * @returns {number} Visibility / transmission throughput in [0, 1] (0 = fully occluded).
 */
export function castShadowFeeler(origin, lightDir, distToLight, world, stats = null) {
    let curOrigin = origin;
    let remainingDist = distToLight;
    let visibility = 1.0;
    const maxPasses = 8;
    let passes = 0;

    while (remainingDist > 0.002 && passes < maxPasses) {
        const tMax = remainingDist - 0.001;
        if (tMax <= 0.001) break;
        if (stats) stats.raysTraced++;
        const shadowRay = new Ray(curOrigin, lightDir);
        const shadowRec = new HitRecord();
        const hit = world.hit(shadowRay, 0.001, tMax, shadowRec);
        if (!hit || !shadowRec.point || !shadowRec.normal || !shadowRec.material) {
            // Path to light is completely clear (V_j = 1)
            return visibility;
        }

        const trans = shadowRec.material.transparency;
        if (trans <= 0.001) {
            // Hit an opaque object: light is fully blocked (V_j = 0)
            return 0.0;
        }

        // Object is transparent: attenuate light throughput by transmission factor k_t when entering
        if (shadowRec.frontFace) {
            visibility *= trans;
        }
        remainingDist -= shadowRec.t;
        curOrigin = shadowRec.point;
        passes++;
    }

    return visibility > 0.0001 ? visibility : 0.0;
}

/**
 * Evaluates radiance along a ray using Turner Whitted's (1980) Illumination Model:
 * 
 *     I = I_a + k_d * sum(N . L_j) + k_s * S + k_t * T
 * 
 * @param {Ray} ray The incident ray.
 * @param {Hittable} world Scene geometry containing all hittable objects.
 * @param {number} depth Remaining recursion depth for ray bounces.
 * @param {ColorRGB} ambientLight Scene constant ambient illumination (defaults to black [0, 0, 0]).
 * @param {PointLight[]} lights Active point light sources.
 * @param {boolean} shadowRaysEnabled Whether direct shadow feeler rays are cast.
 * @param {{shadowRaysCast: number, shadowRaysReached: number, raysTraced: number} | null} [stats=null]
 * @param {{hit: boolean} | null} [hitInfo=null] Optional tracker recording whether the ray hit scene geometry.
 * @returns {ColorRGB} Reflected radiance [r, g, b].
 */
export function rayColor(ray, world, depth, ambientLight, lights, shadowRaysEnabled = true, stats = null, hitInfo = null) {
    if (stats) stats.raysTraced++;

    // Base Case: Maximum recursion depth reached
    if (depth <= 0) {
        return [0, 0, 0];
    }

    const hitRecord = new HitRecord();
    const hasHit = world.hit(ray, 0.00001, Infinity, hitRecord);

    if (hasHit && hitRecord.point && hitRecord.normal && hitRecord.material) {
        if (hitInfo) {
            hitInfo.hit = true;
        }

        const mat = hitRecord.material;
        const N = hitRecord.normal;
        const P = hitRecord.point;
        const V = ray.direction.unitVector();

        // ====================================================================
        // Whitted's Illumination Model (Turner Whitted 1980):
        // I = I_a + k_d * sum(N . L_j) + k_s * S + k_t * T
        // ====================================================================

        // --------------------------------------------------------------------
        // Term 1: I_a (Ambient Term)
        // I_a = k_a * I_ambient
        // Constant baseline ambient illumination across the scene.
        // --------------------------------------------------------------------
        const I_a = [
            mat.ambient[0] * ambientLight[0],
            mat.ambient[1] * ambientLight[1],
            mat.ambient[2] * ambientLight[2]
        ];

        // --------------------------------------------------------------------
        // Term 2: Direct Illumination from Point Light Sources (Diffuse + Specular Highlights)
        // Evaluates direct illumination from point light sources with shadow feeler rays.
        // For each light source j, a shadow feeler ray is cast along L_j.
        // If unobstructed (V_j = 1), the diffuse cosine contribution (N . L_j) and
        // the local Blinn-Phong specular highlight (N . H_j)^n are added.
        // --------------------------------------------------------------------
        let sum_N_dot_L = [0, 0, 0];
        let sum_specular_highlight = [0, 0, 0];
        const viewDir = V.negative(); // Unit vector from hit point toward camera/incident ray

        if (shadowRaysEnabled && lights && lights.length > 0) {
            for (const light of lights) {
                const toLight = light.position.minus(P);
                const distToLight = toLight.length();

                if (distToLight > 0.0001) {
                    const L_j = toLight.divByNum(distToLight);
                    const N_dot_L = N.dot(L_j);

                    if (N_dot_L > 0) {
                        if (stats) stats.shadowRaysCast++;
                        const visibility = castShadowFeeler(P, L_j, distToLight, world, stats);

                        if (visibility > 0) {
                            if (stats) stats.shadowRaysReached++;
                            const effIntensity = light.intensity * visibility;
                            sum_N_dot_L[0] += light.color[0] * effIntensity * N_dot_L;
                            sum_N_dot_L[1] += light.color[1] * effIntensity * N_dot_L;
                            sum_N_dot_L[2] += light.color[2] * effIntensity * N_dot_L;

                            // Local specular highlight from point light (Blinn-Phong)
                            if (mat.shininess > 0) {
                                const H = L_j.plus(viewDir).unitVector();
                                const N_dot_H = Math.max(0, N.dot(H));
                                if (N_dot_H > 0) {
                                    const specFactor = Math.pow(N_dot_H, mat.shininess) * effIntensity;
                                    sum_specular_highlight[0] += light.color[0] * specFactor;
                                    sum_specular_highlight[1] += light.color[1] * specFactor;
                                    sum_specular_highlight[2] += light.color[2] * specFactor;
                                }
                            }
                        }
                    }
                }
            }
        }

        // Diffuse contribution: k_d * sum(N . L_j)
        const kd_sum_N_dot_L = [
            mat.diffuse[0] * sum_N_dot_L[0],
            mat.diffuse[1] * sum_N_dot_L[1],
            mat.diffuse[2] * sum_N_dot_L[2]
        ];

        // Direct specular highlight contribution: k_s * sum(N . H_j)^n
        const ks_highlight = [
            mat.specular[0] * sum_specular_highlight[0],
            mat.specular[1] * sum_specular_highlight[1],
            mat.specular[2] * sum_specular_highlight[2]
        ];

        // Local Illumination: I_local = I_a + k_d * sum(N . L_j) + k_s * sum(N . H_j)^n
        const I_local = [
            I_a[0] + kd_sum_N_dot_L[0] + ks_highlight[0],
            I_a[1] + kd_sum_N_dot_L[1] + ks_highlight[1],
            I_a[2] + kd_sum_N_dot_L[2] + ks_highlight[2]
        ];

        // --------------------------------------------------------------------
        // Term 3: k_s * S (Specular Mirror Reflection Term)
        // S is the incoming radiance from the mirror reflection direction R.
        // Casts a recursive secondary ray along R = V - 2 * (V . N) * N.
        // --------------------------------------------------------------------
        let ks_S = [0, 0, 0];
        const ks = [
            mat.specular[0] * mat.reflectivity,
            mat.specular[1] * mat.reflectivity,
            mat.specular[2] * mat.reflectivity
        ];

        const hasSpecular = (ks[0] > 0.0001 || ks[1] > 0.0001 || ks[2] > 0.0001);
        let sharedReflColor = null;

        if (hasSpecular && depth > 0) {
            const reflectedDir = reflect(V, N);
            if (reflectedDir.dot(N) > 0) {
                const reflRay = new Ray(P, reflectedDir);
                sharedReflColor = rayColor(reflRay, world, depth - 1, ambientLight, lights, shadowRaysEnabled, stats);
                ks_S = [
                    ks[0] * sharedReflColor[0],
                    ks[1] * sharedReflColor[1],
                    ks[2] * sharedReflColor[2]
                ];
            }
        }

        // --------------------------------------------------------------------
        // Term 4: k_t * T (Transmission / Refraction Term)
        // T is the incoming radiance from the refraction direction computed via Snell's Law.
        // Automatically accounts for Total Internal Reflection (TIR) when light cannot escape.
        // --------------------------------------------------------------------
        let kt_T = [0, 0, 0];
        const kt = mat.transparency;

        if (kt > 0.0001 && depth > 0) {
            const eta = mat.refractiveIndex;
            const refractionRatio = hitRecord.frontFace ? (1.0 / eta) : eta;

            const cosTheta = Math.min(viewDir.dot(N), 1.0);
            const sinThetaSq = refractionRatio * refractionRatio * Math.max(0, 1.0 - (cosTheta * cosTheta));

            if (sinThetaSq >= 1.0) {
                // Total Internal Reflection (TIR): all transmitted energy reflects internally.
                // Reuse mirror reflection ray if already traced at this intersection.
                const S_tir = sharedReflColor !== null ? sharedReflColor : (() => {
                    const reflectedDir = reflect(V, N);
                    if (reflectedDir.dot(N) <= 0) return [0, 0, 0];
                    const reflRay = new Ray(P, reflectedDir);
                    return rayColor(reflRay, world, depth - 1, ambientLight, lights, shadowRaysEnabled, stats);
                })();
                const effKt = [
                    Math.max(0, Math.min(1.0, ks[0] + kt) - ks[0]),
                    Math.max(0, Math.min(1.0, ks[1] + kt) - ks[1]),
                    Math.max(0, Math.min(1.0, ks[2] + kt) - ks[2])
                ];
                kt_T = [
                    effKt[0] * S_tir[0],
                    effKt[1] * S_tir[1],
                    effKt[2] * S_tir[2]
                ];
            } else {
                // Snell's Law Refraction
                const refractedDir = refract(V, N, refractionRatio);
                if (refractedDir) {
                    const refrRay = new Ray(P, refractedDir);
                    const T = rayColor(refrRay, world, depth - 1, ambientLight, lights, shadowRaysEnabled, stats);
                    kt_T = [
                        kt * T[0],
                        kt * T[1],
                        kt * T[2]
                    ];
                }
            }
        }

        // Non-Local (Recursive) Illumination: I_non_local = k_s * S + k_t * T
        const I_non_local = [
            ks_S[0] + kt_T[0],
            ks_S[1] + kt_T[1],
            ks_S[2] + kt_T[2]
        ];

        // Total Radiance: I = I_local + I_non_local = I_a + k_d * sum(N . L_j) + k_s * S + k_t * T
        /** @type {ColorRGB} */
        const I = [
            I_local[0] + I_non_local[0],
            I_local[1] + I_non_local[1],
            I_local[2] + I_non_local[2]
        ];

        return I;
    }

    // ------------------------------------------------------------------------
    // NO-HIT Color
    // ------------------------------------------------------------------------
    // If the ray did not hit any object in the scene, return the no-hit color.
    // This is explicitly left here at the end so it does not cause confusion
    // as to whether it is part of Whitted's illumination model or not.
    // (It is the no-hit color, returned solely because the ray hit nothing in the void;
    // this color is NOT part of Whitted's illumination model.)
    /** @type {ColorRGB} */
    const noHitColor = [0, 0, 0];
    return noHitColor;
}

/**
 * Main execution function for the raytracer.
 * Iterates through pixels using Whitted's 4-corner adaptive subdivision antialiasing,
 * and streams batches via the onProgress callback.
 * 
 * @param {RaytracerOptions} [options={}]
 * @param {function(ProgressPayload): void} [onProgress]
 * @returns {Promise<void>}
 */
export async function render(options = {}, onProgress) {
    const ASPECT_RATIO = options.aspectRatio ?? (16.0 / 9.0);
    const IMAGE_WIDTH = Math.round(options.imageWidth ?? 400);
    const IMAGE_HEIGHT = Math.round(options.imageHeight ?? (IMAGE_WIDTH / ASPECT_RATIO));
    const MAX_DEPTH = Math.max(1, options.maxDepth ?? 10);
    const gamma = options.gamma ?? 2.0;
    const ambientLight = parseColorRGB(options.ambient ?? null, [0, 0, 0]);
    const updateInterval = (options.updateInterval ?? 0);
    const shadowRaysEnabled = options.shadowRaysForPointLights !== false;
    const adaptiveTolerance = Number(options.adaptiveTolerance ?? 0.1);

    // onHitAndBlack diagnostic parameter:
    // When specified, any pixel where primary rays hit scene geometry but the resulting computed
    // color turned out to be black (0, 0, 0) will have its display color set to this value.
    // NOTE: This is an educational visualization tool to clearly distinguish between rays that struck
    // an unlit surface versus rays that hit nothing in the void. It is explicitly NOT part of
    // Turner Whitted's 1980 illumination model or ray tracing algorithm.
    const onHitAndBlackRaw = options.onHitAndBlack ?? null;
    const onHitAndBlack = onHitAndBlackRaw ? parseColorRGB(onHitAndBlackRaw, [0, 0, 0]) : null;

    // Max Antialiasing Subdivisions parameter:
    // Defines the maximum number of times that a pixel is allowed to subdivide during adaptive antialiasing.
    // By default, there is no maximum (null).
    const maxAntialiasingSubdivisions = (options.maxAntialiasingSubdivisions !== undefined && options.maxAntialiasingSubdivisions !== null)
        ? Number(options.maxAntialiasingSubdivisions)
        : null;

    // Build World Scene & Camera from preset or specifications
    const sceneSpec = options.scene ?? 'whitted';
    const { world, lights, camera: presetCamera } = createWorld(sceneSpec, ASPECT_RATIO);

    // Explicit point lights can supplement preset lights
    if (Array.isArray(options.pointLights)) {
        for (const pl of /** @type {any[]} */ (options.pointLights)) {
            lights.push(pl instanceof PointLight ? pl : new PointLight(pl.position, pl.color, pl.intensity));
        }
    }

    // Camera: user options override preset camera
    const camera = (options.camera instanceof Camera)
        ? options.camera
        : (options.camera ? new Camera({ ...options.camera, aspectRatio: ASPECT_RATIO }) : (presetCamera || new Camera({ aspectRatio: ASPECT_RATIO })));

    /** @type {RenderedPixel[]} */
    const newlyRenderedPixels = [];

    /** Stats tracker */
    const stats = { shadowRaysCast: 0, shadowRaysReached: 0, raysTraced: 0, aaSubdivisions: 0 };

    // Shared top-level corner cache:
    // Whitted (1980) Section 4: Samples at pixel corners are shared between adjacent pixels,
    // so for an image of size IMAGE_WIDTH x IMAGE_HEIGHT, only (IMAGE_WIDTH + 1) * (IMAGE_HEIGHT + 1)
    // rays are traced at the top level (adding only one extra row and column of rays).
    const gridWidth = IMAGE_WIDTH + 1;
    const gridHeight = IMAGE_HEIGHT + 1;
    /** @type {Array<{col: ColorRGB, hit: boolean} | undefined>} */
    const cornerCache = new Array(gridWidth * gridHeight);

    /**
     * Retrieves or evaluates a shared top-level ray sample at corner grid coordinate (gx, gy).
     * @param {number} gx Grid X coordinate in [0, IMAGE_WIDTH]
     * @param {number} gy Grid Y coordinate in [0, IMAGE_HEIGHT]
     * @param {{hadHit: boolean}} [hitTracker]
     * @returns {ColorRGB}
     */
    function getTopLevelCorner(gx, gy, hitTracker) {
        const idx = gy * gridWidth + gx;
        const cached = cornerCache[idx];
        if (cached !== undefined) {
            if (cached.hit && hitTracker) {
                hitTracker.hadHit = true;
            }
            return cached.col;
        }
        const u = gx / IMAGE_WIDTH;
        const v = gy / IMAGE_HEIGHT;
        const r = camera.getRay(u, v);
        const hitInfo = { hit: false };
        const col = rayColor(r, world, MAX_DEPTH, ambientLight, lights, shadowRaysEnabled, stats, hitInfo);
        if (hitInfo.hit && hitTracker) {
            hitTracker.hadHit = true;
        }
        cornerCache[idx] = { col, hit: hitInfo.hit };
        return col;
    }

    /**
     * Whitted (1980) Section 4: 4-corner adaptive subdivision antialiasing.
     * Evaluates rays through the 4 corners of the pixel area.
     * If color contrast between corners exceeds adaptiveTolerance,
     * the pixel is recursively subdivided into 4 sub-quadrants (quadtree).
     * 
     * @param {number} px
     * @param {number} py
     * @param {{hadHit: boolean}} [hitTracker] Optional tracker recording whether any primary ray hit geometry.
     * @returns {ColorRGB}
     */
    function renderPixelAdaptive(px, py, hitTracker) {
        /**
         * @param {number} sx
         * @param {number} sy
         * @returns {ColorRGB}
         */
        function sampleAt(sx, sy) {
            const u = sx / IMAGE_WIDTH;
            const v = sy / IMAGE_HEIGHT;
            const r = camera.getRay(u, v);
            const hitInfo = { hit: false };
            const col = rayColor(r, world, MAX_DEPTH, ambientLight, lights, shadowRaysEnabled, stats, hitInfo);
            if (hitInfo.hit && hitTracker) {
                hitTracker.hadHit = true;
            }
            return col;
        }

        /**
         * Calculates maximum contrast across all RGB color channels between two samples.
         * @param {ColorRGB} c1
         * @param {ColorRGB} c2
         * @returns {number}
         */
        function contrast(c1, c2) {
            return Math.max(
                Math.abs(c1[0] - c2[0]),
                Math.abs(c1[1] - c2[1]),
                Math.abs(c1[2] - c2[2])
            );
        }

        /**
         * Recursively evaluates quadtree subdivision for antialiasing.
         * 
         * @param {number} x0
         * @param {number} y0
         * @param {number} x1
         * @param {number} y1
         * @param {ColorRGB} c00
         * @param {ColorRGB} c10
         * @param {ColorRGB} c01
         * @param {ColorRGB} c11
         * @param {number} level Current subdivision depth
         * @returns {ColorRGB}
         */
        function evaluateQuad(x0, y0, x1, y1, c00, c10, c01, c11, level) {
            const maxContrast = Math.max(
                contrast(c00, c10),
                contrast(c10, c11),
                contrast(c11, c01),
                contrast(c01, c00),
                contrast(c00, c11),
                contrast(c10, c01)
            );

            // ----------------------------------------------------------------
            // Stopping Criteria:
            // 1. Whitted's original criterion: Contrast is below tolerance threshold.
            // 2. Max Antialiasing Subdivisions:
            // Note: Limiting subdivisions to a maximum depth is a practical computational safeguard;
            // it is NOT part of Turner Whitted's normal 1980 antialiasing algorithm, which only tested contrast.
            // ----------------------------------------------------------------
            const reachedMax = (maxAntialiasingSubdivisions !== null && maxAntialiasingSubdivisions !== undefined)
                ? (level >= maxAntialiasingSubdivisions)
                : false;

            // Practical safeguard against call stack overflow when no maximum is configured on sharp step edges
            const reachedSafeguard = (maxAntialiasingSubdivisions === null || maxAntialiasingSubdivisions === undefined) && (level >= 10);

            if (maxContrast < adaptiveTolerance || reachedMax || reachedSafeguard) {
                return [
                    (c00[0] + c10[0] + c01[0] + c11[0]) * 0.25,
                    (c00[1] + c10[1] + c01[1] + c11[1]) * 0.25,
                    (c00[2] + c10[2] + c01[2] + c11[2]) * 0.25
                ];
            }

            // Contrast exceeds tolerance: record that a subdivision occurred
            stats.aaSubdivisions++;

            const midX = (x0 + x1) * 0.5;
            const midY = (y0 + y1) * 0.5;

            const cBottom = sampleAt(midX, y0);
            const cTop = sampleAt(midX, y1);
            const cLeft = sampleAt(x0, midY);
            const cRight = sampleAt(x1, midY);
            const cCenter = sampleAt(midX, midY);

            const q0 = evaluateQuad(x0, y0, midX, midY, c00, cBottom, cLeft, cCenter, level + 1);
            const q1 = evaluateQuad(midX, y0, x1, midY, cBottom, c10, cCenter, cRight, level + 1);
            const q2 = evaluateQuad(x0, midY, midX, y1, cLeft, cCenter, c01, cTop, level + 1);
            const q3 = evaluateQuad(midX, midY, x1, y1, cCenter, cRight, cTop, c11, level + 1);

            return [
                (q0[0] + q1[0] + q2[0] + q3[0]) * 0.25,
                (q0[1] + q1[1] + q2[1] + q3[1]) * 0.25,
                (q0[2] + q1[2] + q2[2] + q3[2]) * 0.25
            ];
        }

        const c00 = getTopLevelCorner(px, py, hitTracker);
        const c10 = getTopLevelCorner(px + 1, py, hitTracker);
        const c01 = getTopLevelCorner(px, py + 1, hitTracker);
        const c11 = getTopLevelCorner(px + 1, py + 1, hitTracker);

        return evaluateQuad(px, py, px + 1, py + 1, c00, c10, c01, c11, 0);
    }

    /**
     * Renders a single pixel using adaptive antialiasing and gamma correction.
     * @param {number} x
     * @param {number} y
     */
    function renderPixel(x, y) {
        const hitTracker = { hadHit: false };
        const rgb = renderPixelAdaptive(x, y, hitTracker);

        let r = rgb[0];
        let g = rgb[1];
        let b = rgb[2];

        // Gamma correction
        if (gamma === 2.0) {
            r = Math.sqrt(Math.max(0, r));
            g = Math.sqrt(Math.max(0, g));
            b = Math.sqrt(Math.max(0, b));
        } else if (gamma > 0) {
            const invGamma = 1.0 / gamma;
            r = Math.pow(Math.max(0, r), invGamma);
            g = Math.pow(Math.max(0, g), invGamma);
            b = Math.pow(Math.max(0, b), invGamma);
        }

        let outR = Math.floor(256 * clamp(r, 0.0, 0.999));
        let outG = Math.floor(256 * clamp(g, 0.0, 0.999));
        let outB = Math.floor(256 * clamp(b, 0.0, 0.999));

        // --------------------------------------------------------------------
        // onHitAndBlack Diagnostic Color Override
        // --------------------------------------------------------------------
        // If configured, overrides the pixel color when a ray struck geometry in the
        // scene, but the resulting illumination evaluated to black (0, 0, 0).
        // NOTE: This is purely a diagnostic and pedagogical visualization feature;
        // it is explicitly NOT part of Turner Whitted's (1980) ray tracing model.
        // --------------------------------------------------------------------
        if (onHitAndBlack && hitTracker.hadHit && outR === 0 && outG === 0 && outB === 0) {
            outR = Math.floor(256 * clamp(onHitAndBlack[0], 0.0, 0.999));
            outG = Math.floor(256 * clamp(onHitAndBlack[1], 0.0, 0.999));
            outB = Math.floor(256 * clamp(onHitAndBlack[2], 0.0, 0.999));
        }

        newlyRenderedPixels.push([x, y, [outR, outG, outB]]);
    }

    /**
     * Flushes buffered pixels to the onProgress callback / worker message.
     * @param {boolean} [isDone=false]
     */
    function flush(isDone = false) {
        if (typeof onProgress === 'function') {
            onProgress([
                [IMAGE_WIDTH, IMAGE_HEIGHT],
                [...newlyRenderedPixels],
                isDone,
                {
                    shadowRaysCast: stats.shadowRaysCast,
                    shadowRaysReached: stats.shadowRaysReached,
                    raysTraced: stats.raysTraced,
                    aaSubdivisions: stats.aaSubdivisions
                }
            ]);
        }
        newlyRenderedPixels.length = 0;
    }

    // Column-by-column progressive render loop (renders scene from left to right)
    if (updateInterval === 0) {
        for (let x = 0; x < IMAGE_WIDTH; x++) {
            for (let y = 0; y < IMAGE_HEIGHT; y++) {
                renderPixel(x, y);
                flush(false);
            }
            flush(false);
        }
    } else if (updateInterval < 0) {
        for (let x = 0; x < IMAGE_WIDTH; x++) {
            for (let y = 0; y < IMAGE_HEIGHT; y++) {
                renderPixel(x, y);
            }
        }
    } else {
        for (let x = 0; x < IMAGE_WIDTH; x++) {
            for (let y = 0; y < IMAGE_HEIGHT; y++) {
                renderPixel(x, y);
            }
            if (x % updateInterval === 0 || x === IMAGE_WIDTH - 1) {
                flush(false);
            }
        }
    }

    flush(true);
}

// ----------------------------------------------------------------------------
// Web Worker Environment Binding
// ----------------------------------------------------------------------------

if (typeof self !== 'undefined' && typeof window === 'undefined') {
    self.onmessage = (event) => {
        const options = (event && event.data) ? event.data : {};
        render(options, (progressData) => {
            self.postMessage(progressData);
        });
    };
}
